import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  CHAPTERS,
  FILM_DURATION,
  SILENCE_END,
  SILENCE_START,
  clamp,
  getChapterAtTime,
  smoothstep,
} from '../data/chapters';
import { getActiveNarrationLine } from '../data/screenplay';
import { CameraDirector } from './CameraDirector';
import { CINEMA_OPTICS_SHADER, createLensDustTexture } from './cinemaPass';
import { computeCinemaPresentation } from './cinemaPresentation';
import { computeChapterLutWeights } from './colorGrading';
import {
  AdaptiveQualityController,
  type DeviceProfile,
  type QualityMode,
  type QualitySnapshot,
  type QualityTier,
  type QualityTierSettings,
  collectBrowserDeviceSignals,
  detectDeviceProfile,
  getQualitySettingsForTier,
  qualityModeToTier,
  resolveEffectiveDpr,
} from './deviceProfile';
import {
  computeInteractiveFieldInfluence,
  computeNarrationCosmicReactivity,
} from './dynamicNebulaField';
import { GpgpuCosmicFluid } from './gpgpuParticles';
import {
  type GravitationalLensState,
  computeChapterTransitionLens,
} from './gravitationalLens';
import { GravitationalLensPass } from './gravitationalLensPass';
import { LutColorGradePass } from './lutPass';
import {
  type ParallaxInput,
  type ParallaxOptions,
  computeBloomParams,
  computeCinemaOptics,
} from './parallax';
import {
  type RenderPipelineMode,
  probeGpuRenderCapabilities,
  selectRenderPipelinePlan,
} from './renderCapabilities';
import { CosmicYinYangFormation } from './scenes/CosmicYinYangFormation';
import { ConstellationFigure } from './scenes/ConstellationFigure';
import { ConstellationNetwork } from './scenes/ConstellationNetwork';
import { CosmicDriftField } from './scenes/CosmicDriftField';
import { CosmicEnvironment } from './scenes/CosmicEnvironment';
import { EarthSequence } from './scenes/EarthSequence';
import { QuietHoursSequence } from './scenes/QuietHoursSequence';
import { StellarNucleosynthesis } from './scenes/StellarNucleosynthesis';
import { TitleReveal } from './scenes/TitleReveal';

export interface EngineCallbacks {
  onTimeUpdate: (timeSec: number, connectionCount: number, birthStarLaunched: boolean) => void;
  onFilmComplete: () => void;
  onBirthStarTriggered: () => void;
  onNetworkImpulse: (connections: number, spatialPos?: readonly [number, number, number]) => void;
  onNucleosynthesisBurst?: (intensity: number) => void;
  onChapterTransition?: (chapterIndex: number) => void;
  onSpatialAnchor?: (relX: number, relY: number, relZ: number) => void;
  onQualityChange?: (snapshot: QualitySnapshot) => void;
  getAudioBass?: () => number;
  onContextLost: () => void;
}

const _guidingTarget = new THREE.Vector3();
const _targetFogColor = new THREE.Color();
const _nextFogColor = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _prevCameraPos = new THREE.Vector3();
const _instCameraVel = new THREE.Vector3();
const _smoothCameraVel = new THREE.Vector3();
const _smoothedPointer = new THREE.Vector2();
const _prevPointerNdc = new THREE.Vector2();
const _pointerVelNdc = new THREE.Vector2();
const _projWorldPos = new THREE.Vector3();
const _parallaxInput: ParallaxInput = {
  cameraPos: { x: 0, y: 0, z: 0 },
  cameraVelocity: { x: 0, y: 0, z: 0 },
  pointerOffset: { x: 0, y: 0 },
};
const _parallaxOptions: ParallaxOptions = {
  reducedMotion: true,
  silenceDamp: 1,
};


export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export class CosmicEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: EngineCallbacks;
  private readonly isSoftwareGl: boolean;
  private readonly isMobile: boolean;
  private deviceProfile: DeviceProfile;

  private readonly renderer: THREE.WebGLRenderer;
  private renderMode: RenderPipelineMode;
  private composerRT: THREE.WebGLRenderTarget | null = null;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private gravitationalLensPass: GravitationalLensPass | null = null;
  private cinemaPass: ShaderPass | null = null;
  private lensDustTex: THREE.CanvasTexture | null = null;
  private lutPass: LutColorGradePass | null = null;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly fog: THREE.FogExp2;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private readonly cameraDirector = new CameraDirector();
  private readonly cosmicEnv: CosmicEnvironment;
  private readonly cosmicDrift: CosmicDriftField;
  private readonly gpgpuFluid: GpgpuCosmicFluid;
  private readonly earthSeq: EarthSequence;
  private readonly figureSeq: ConstellationFigure;
  private readonly networkSeq: ConstellationNetwork;
  private readonly yinYangSeq: CosmicYinYangFormation;
  private readonly quietSeq: QuietHoursSequence;
  private readonly revealSeq: TitleReveal;
  private readonly nucleosynthesis: StellarNucleosynthesis;

  private qualityMode: QualityMode;
  private activeQualityTier: QualityTier;
  private qualitySettings: QualityTierSettings;
  private readonly adaptiveQuality: AdaptiveQualityController;
  private pixelRatio: number;
  private resizeObserver: ResizeObserver | null = null;
  private dprMediaQuery: MediaQueryList | null = null;
  private filmTime = 0;
  private elapsed = 0;
  private hasEntered = false;
  private isPlaying = false;
  private reducedMotion = true; // Project locked in serene, razor-sharp Calm Cinema Mode
  private cinemaMode = false;
  private completedFired = false;

  private frameId = 0;
  private lastPerfTime = 0;
  private lastHudSync = 0;
  private cadenceAccumulator = 0;
  private frameCounter = 0;
  private composerHealthChecksLeft = 4;
  private composerLumaVerified = false;
  private needsFirstFramePresent = true;
  private lastLutLabel = 'cosmosCool';
  private lastChapterIndex = 0;
  private chapterSeekWarpPulse = 0;
  private lastGravLensState: GravitationalLensState = computeChapterTransitionLens(0, 0);
  private syncedRevealMilkyWay = false;
  private pointerPulseEnergy = 0;
  private prefersReducedMotion = false;
  private disposed = false;

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialState?: { entered: boolean; timeSec: number; qualityMode?: QualityMode },
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.qualityMode = initialState?.qualityMode ?? 'auto';
    const signals = collectBrowserDeviceSignals();
    this.deviceProfile = detectDeviceProfile(signals, this.qualityMode);
    this.isMobile = this.deviceProfile.isMobile;
    this.prefersReducedMotion = this.deviceProfile.prefersReducedMotion;
    this.activeQualityTier = this.deviceProfile.initialTier;
    this.adaptiveQuality = new AdaptiveQualityController(
      this.activeQualityTier,
      this.qualityMode !== 'auto',
    );
    if (initialState) {
      this.hasEntered = initialState.entered;
      this.isPlaying = initialState.entered;
      this.filmTime = clamp(initialState.timeSec, 0, FILM_DURATION);
    }

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
    });

    // Probe real GPU capabilities directly from this renderer's own WebGL context
    // (zero wasted extra contexts; verifies HalfFloat FBO completeness before allocating)
    const gpuCaps = probeGpuRenderCapabilities(
      this.renderer,
      this.isMobile,
      this.deviceProfile.nativePixelRatio,
    );
    const plan = selectRenderPipelinePlan(gpuCaps);
    this.isSoftwareGl = gpuCaps.isSoftwareGl;
    this.renderMode = plan.mode;
    this.qualitySettings = getQualitySettingsForTier(
      this.activeQualityTier,
      this.deviceProfile,
      this.isSoftwareGl,
    );
    this.pixelRatio = resolveEffectiveDpr(
      this.deviceProfile.nativePixelRatio,
      this.qualitySettings,
    );

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'cosmic-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#010206');
    this.fog = new THREE.FogExp2('#010206', 0.0044);
    this.scene.fog = this.fog;

    // Restrained PBR environment map ONLY when HalfFloat FBOs are verified renderable
    if (plan.usePmremEnv) {
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
        this.scene.environment = this.envRT.texture;
        this.scene.environmentIntensity = 0.36;
        pmrem.dispose();
      } catch {
        this.envRT = null;
      }
    }

    this.camera = new THREE.PerspectiveCamera(48, width / Math.max(1, height), 0.1, 900);
    this.camera.position.set(0, 0.3, 18);

    // High-contrast 3-point celestial lighting rig (true dark-space key/fill ratio)
    this.keyLight = new THREE.DirectionalLight(0xffdca4, 1.55);
    this.keyLight.position.set(-40, 20, -45);
    this.scene.add(this.keyLight);

    this.hemiLight = new THREE.HemisphereLight(0x3a5596, 0x05070f, 0.32);
    this.scene.add(this.hemiLight);

    const rimLight = new THREE.DirectionalLight(0x6950b5, 0.42);
    rimLight.position.set(30, -10, -350);
    this.scene.add(rimLight);

    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const ambientPrecision = this.qualitySettings.ambientShaderPrecision;

    // Instantiate all continuous chapters in one shared cosmic world:
    // Non-critical ambient layers use the device-aware precision tier ('mediump' on mobile),
    // while central hero set pieces (Yin-Yang, Earth, Geodesic Singularity, Constellations) stay 'highp'.
    this.cosmicEnv = new CosmicEnvironment(
      this.isMobile,
      this.pixelRatio,
      maxAnisotropy,
      undefined,
      ambientPrecision,
    );
    this.cosmicDrift = new CosmicDriftField(this.isMobile, this.pixelRatio, ambientPrecision);
    this.gpgpuFluid = new GpgpuCosmicFluid(this.isMobile, plan.useGpgpuFluid, this.pixelRatio);
    this.gpgpuFluid.setEnabled(this.qualitySettings.gpgpuEnabled);
    this.earthSeq = new EarthSequence(maxAnisotropy);
    this.figureSeq = new ConstellationFigure();
    this.networkSeq = new ConstellationNetwork(this.isMobile);
    this.yinYangSeq = new CosmicYinYangFormation(
      this.isMobile,
      this.pixelRatio,
      this.qualitySettings.yinYangScaleFactor,
      ambientPrecision,
    );
    this.quietSeq = new QuietHoursSequence(maxAnisotropy);
    this.revealSeq = new TitleReveal(this.isMobile, this.pixelRatio);
    this.nucleosynthesis = new StellarNucleosynthesis(this.isMobile, this.pixelRatio);

    this.cosmicEnv.setParticleDrawRatio(this.qualitySettings.particleDrawRatio);
    this.yinYangSeq.setParticleDrawRatio(this.qualitySettings.yinYangDrawRatio);

    this.scene.add(
      this.cosmicEnv.root,
      this.cosmicDrift.root,
      this.gpgpuFluid.root,
      this.earthSeq.root,
      this.figureSeq.root,
      this.networkSeq.root,
      this.yinYangSeq.root,
      this.quietSeq.root,
      this.revealSeq.root,
      this.nucleosynthesis.root,
    );
    this.renderer.domElement.dataset.chapter4Visual = 'cosmic-entity-yinyang';
    this.renderer.domElement.dataset.yinyangStars = String(this.yinYangSeq.starCount);
    this.renderer.domElement.dataset.yinyangNebulae = String(this.yinYangSeq.nebulaCount);
    this.renderer.domElement.dataset.calmMode = 'true';
    this.renderer.domElement.dataset.cosmicDriftStars = String(this.cosmicDrift.starCount);
    this.renderer.domElement.dataset.nucleosynthesisParticles = String(
      this.nucleosynthesis.totalParticleCount,
    );

    // Capability-aware post-processing pipeline:
    // - hdr-composer: HalfFloat FBOs + UnrealBloom + GravitationalLens + 70mm Optics + ACES Output + 3D LUT
    // - ldr-composer: Guaranteed-complete UnsignedByte FBOs + GravitationalLens + 70mm Optics + ACES Output (+ 3D LUT on WebGL2)
    // - direct-renderer: Direct backbuffer draw (Software GL or runtime fallback)
    if (this.renderMode !== 'direct-renderer') {
      try {
        const initialBloom = computeBloomParams(this.filmTime);
        const aspect = width / Math.max(1, height);
        const rtW = Math.max(1, Math.floor(width * this.pixelRatio));
        const rtH = Math.max(1, Math.floor(height * this.pixelRatio));

        this.composerRT = new THREE.WebGLRenderTarget(rtW, rtH, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          type:
            plan.composerTextureType === 'half-float'
              ? THREE.HalfFloatType
              : THREE.UnsignedByteType,
        });
        this.composer = new EffectComposer(this.renderer, this.composerRT);
        this.composer.setPixelRatio(this.pixelRatio);
        this.composer.setSize(width, height);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        if (plan.useBloom) {
          const bloomW = Math.max(1, Math.floor(width * this.qualitySettings.bloomResolutionScale));
          const bloomH = Math.max(1, Math.floor(height * this.qualitySettings.bloomResolutionScale));
          this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(bloomW, bloomH),
            initialBloom.strength * 0.72,
            initialBloom.radius * 0.78,
            Math.max(0.72, initialBloom.threshold),
          );
          this.bloomPass.enabled = this.qualitySettings.bloomEnabled;
          this.composer.addPass(this.bloomPass);
        }

        this.gravitationalLensPass = new GravitationalLensPass(aspect);
        this.composer.addPass(this.gravitationalLensPass);

        this.lensDustTex = createLensDustTexture(512);
        this.cinemaPass = new ShaderPass(CINEMA_OPTICS_SHADER);
        this.cinemaPass.uniforms.uAspect!.value = aspect;
        this.cinemaPass.uniforms.tLensDust!.value = this.lensDustTex;
        this.cinemaPass.uniforms.uHasLensDust!.value = 1.0;
        this.composer.addPass(this.cinemaPass);

        this.composer.addPass(new OutputPass());

        if (plan.useLut3d) {
          this.lutPass = new LutColorGradePass();
          this.composer.addPass(this.lutPass);
        }
      } catch {
        this.fallbackToDirectRenderer();
      }
    }

    if (!this.isSoftwareGl) {
      try {
        this.renderer.compile(this.scene, this.camera);
      } catch {
        // Non-fatal pre-compile failure; shaders will still compile lazily on draw
      }
    }

    if (this.hasEntered) {
      this.cameraDirector.snapToTime(this.camera, this.filmTime);
    }
    _prevCameraPos.copy(this.camera.position);
    _smoothCameraVel.set(0, 0, 0);

    this.bindEvents();
    this.watchDisplayDensity();
    this.syncQualityDataset();
    this.callbacks.onQualityChange?.(this.getQualitySnapshot());
    this.lastPerfTime = performance.now();
    this.tick();
  }

  private fallbackToDirectRenderer(): void {
    this.renderMode = 'direct-renderer';
    this.composerHealthChecksLeft = 0;
    this.composerLumaVerified = true;
    this.renderer.setRenderTarget(null);
  }

  /**
   * One-time startup sanity check after EffectComposer draws to the default backbuffer.
   * Samples a small 16x16 patch at viewport center (where the luminous Guiding Star &
   * Singularity/Earth sit during t < 220s). If every sampled channel is <= 3/255,
   * the post-processing chain produced a driver-specific black frame and we immediately
   * self-heal to direct-renderer so the viewer never sees a black screen.
   */
  private samplePatchMaxRgb(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    x: number,
    y: number,
    size: number,
  ): number {
    const buf = new Uint8Array(size * size * 4);
    gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let maxRgb = 0;
    for (let i = 0; i < buf.length; i += 4) {
      const r = buf[i] ?? 0;
      const g = buf[i + 1] ?? 0;
      const b = buf[i + 2] ?? 0;
      if (r > maxRgb) maxRgb = r;
      if (g > maxRgb) maxRgb = g;
      if (b > maxRgb) maxRgb = b;
      if (maxRgb > 8) return maxRgb;
    }
    return maxRgb;
  }

  private verifyComposerProducedPixels(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
    const drawW = gl.drawingBufferWidth;
    const drawH = gl.drawingBufferHeight;
    if (drawW < 64 || drawH < 64) {
      return true;
    }
    try {
      const centerSize = 64;
      const cx = Math.max(0, Math.floor((drawW - centerSize) * 0.5));
      const cy = Math.max(0, Math.floor((drawH - centerSize) * 0.5));
      if (this.samplePatchMaxRgb(gl, cx, cy, centerSize) > 4) {
        return true;
      }
      const sideSize = 32;
      const sx = Math.max(0, Math.floor(drawW * 0.28));
      const sy = Math.max(0, Math.floor(drawH * 0.36));
      return this.samplePatchMaxRgb(gl, sx, sy, sideSize) > 4;
    } catch {
      return true;
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.handleResize();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost();
  };

  private handleContextRestored = (): void => {
    if (this.disposed) return;
    this.composerHealthChecksLeft = 3;
    this.needsFirstFramePresent = true;
    this.handleResize();
  };

  private handleDprChange = (): void => {
    if (this.disposed) return;
    this.watchDisplayDensity();
    this.applyQualityTier(this.activeQualityTier, true);
  };

  private watchDisplayDensity(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (this.dprMediaQuery) {
      this.dprMediaQuery.removeEventListener('change', this.handleDprChange);
      this.dprMediaQuery = null;
    }
    const dpr = window.devicePixelRatio || 1;
    try {
      const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
      mq.addEventListener('change', this.handleDprChange);
      this.dprMediaQuery = mq;
    } catch {
      this.dprMediaQuery = null;
    }
  }

  private syncQualityDataset(): void {
    const canvas = this.renderer.domElement;
    canvas.dataset.qualityMode = this.qualityMode;
    canvas.dataset.qualityTier = this.activeQualityTier;
    canvas.dataset.effectiveDpr = this.pixelRatio.toFixed(2);
    canvas.dataset.nativeDpr = this.deviceProfile.nativePixelRatio.toFixed(2);
    canvas.dataset.ambientPrecision = this.qualitySettings.ambientShaderPrecision;
    canvas.dataset.heroPrecision = this.qualitySettings.heroShaderPrecision;
  }

  public getQualitySnapshot(): QualitySnapshot {
    return {
      mode: this.qualityMode,
      activeTier: this.activeQualityTier,
      effectiveDpr: this.pixelRatio,
      nativeDpr: this.deviceProfile.nativePixelRatio,
      ambientShaderPrecision: this.qualitySettings.ambientShaderPrecision,
      heroShaderPrecision: this.qualitySettings.heroShaderPrecision,
      isMobile: this.deviceProfile.isMobile,
      isHighPpi: this.deviceProfile.isHighPpi,
      averageFps: this.adaptiveQuality.getAverageFps(),
    };
  }

  public setQualityMode(mode: QualityMode): void {
    if (this.disposed) return;
    this.qualityMode = mode;
    if (mode === 'auto') {
      const liveSignals = collectBrowserDeviceSignals();
      this.deviceProfile = detectDeviceProfile(liveSignals, 'auto');
      this.adaptiveQuality.setLocked(false);
      this.adaptiveQuality.setTier(this.deviceProfile.initialTier);
      this.applyQualityTier(this.deviceProfile.initialTier, true);
    } else {
      const targetTier = qualityModeToTier(mode);
      this.adaptiveQuality.setTier(targetTier);
      this.adaptiveQuality.setLocked(true);
      this.applyQualityTier(targetTier, true);
    }
  }

  private applyQualityTier(tier: QualityTier, force = false): void {
    if (this.disposed) return;

    const liveNativeDpr = clamp(
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      1,
      4,
    );
    if (Math.abs(liveNativeDpr - this.deviceProfile.nativePixelRatio) > 0.01) {
      this.deviceProfile = {
        ...this.deviceProfile,
        nativePixelRatio: liveNativeDpr,
        isHighPpi: liveNativeDpr >= 2.25,
      };
    }

    const nextSettings = getQualitySettingsForTier(tier, this.deviceProfile, this.isSoftwareGl);
    const nextDpr = resolveEffectiveDpr(this.deviceProfile.nativePixelRatio, nextSettings);
    const dprChanged = Math.abs(nextDpr - this.pixelRatio) > 0.005;
    const tierChanged = tier !== this.activeQualityTier;

    if (!force && !dprChanged && !tierChanged) return;

    this.activeQualityTier = tier;
    this.qualitySettings = nextSettings;
    this.pixelRatio = nextDpr;

    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = nextSettings.bloomEnabled;
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(w * nextSettings.bloomResolutionScale)),
        Math.max(1, Math.floor(h * nextSettings.bloomResolutionScale)),
      );
    }

    // Propagate updated DPR & particle budgets seamlessly without recreating WebGL resources
    this.cosmicEnv.setPixelRatio(this.pixelRatio);
    this.cosmicDrift.setPixelRatio(this.pixelRatio);
    this.gpgpuFluid.setPixelRatio(this.pixelRatio);
    this.yinYangSeq.setPixelRatio(this.pixelRatio);
    this.revealSeq.setPixelRatio(this.pixelRatio);
    this.nucleosynthesis.setPixelRatio(this.pixelRatio);

    this.cosmicEnv.setParticleDrawRatio(nextSettings.particleDrawRatio);
    this.yinYangSeq.setParticleDrawRatio(nextSettings.yinYangDrawRatio);
    this.gpgpuFluid.setEnabled(nextSettings.gpgpuEnabled);

    // Switch non-critical ambient shaders to mediump/highp while keeping hero set pieces permanently highp
    this.cosmicEnv.setAmbientShaderPrecision(nextSettings.ambientShaderPrecision);
    this.cosmicDrift.setShaderPrecision(nextSettings.ambientShaderPrecision);
    this.yinYangSeq.setBackdropShaderPrecision(nextSettings.ambientShaderPrecision);

    this.needsFirstFramePresent = true;
    this.syncQualityDataset();
    this.callbacks.onQualityChange?.(this.getQualitySnapshot());
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    const aspect = w / Math.max(1, h);

    // Re-evaluate DPR if window moved across screens or orientation changed
    const liveNativeDpr = clamp(window.devicePixelRatio || 1, 1, 4);
    if (Math.abs(liveNativeDpr - this.deviceProfile.nativePixelRatio) > 0.01) {
      this.deviceProfile = {
        ...this.deviceProfile,
        nativePixelRatio: liveNativeDpr,
        isHighPpi: liveNativeDpr >= 2.25,
      };
      this.qualitySettings = getQualitySettingsForTier(
        this.activeQualityTier,
        this.deviceProfile,
        this.isSoftwareGl,
      );
      this.pixelRatio = resolveEffectiveDpr(liveNativeDpr, this.qualitySettings);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.composer?.setPixelRatio(this.pixelRatio);
      this.cosmicEnv.setPixelRatio(this.pixelRatio);
      this.cosmicDrift.setPixelRatio(this.pixelRatio);
      this.gpgpuFluid.setPixelRatio(this.pixelRatio);
      this.yinYangSeq.setPixelRatio(this.pixelRatio);
      this.revealSeq.setPixelRatio(this.pixelRatio);
      this.nucleosynthesis.setPixelRatio(this.pixelRatio);
      this.syncQualityDataset();
      this.callbacks.onQualityChange?.(this.getQualitySnapshot());
    }

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(
        Math.max(1, Math.floor(w * this.qualitySettings.bloomResolutionScale)),
        Math.max(1, Math.floor(h * this.qualitySettings.bloomResolutionScale)),
      );
    }
    if (this.gravitationalLensPass) {
      this.gravitationalLensPass.setAspect(aspect);
    }
    if (this.cinemaPass?.uniforms.uAspect) {
      this.cinemaPass.uniforms.uAspect.value = aspect;
    }
    this.composerHealthChecksLeft = 2;
    this.needsFirstFramePresent = true;
  };

  private updatePointerNdc(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    _ndc.y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
  }

  private handlePointerMove = (e: PointerEvent): void => {
    this.updatePointerNdc(e.clientX, e.clientY);
    this.cameraDirector.setPointerOffset(_ndc.x, _ndc.y);

    // Chapter III persistent living star network interaction on pointer/touch glide
    if (this.hasEntered && this.filmTime >= 172 && this.filmTime <= 228) {
      const lit = this.networkSeq.handlePointerImpulse(_ndc.x, _ndc.y, this.camera, this.elapsed);
      if (lit > 0) {
        this.callbacks.onNetworkImpulse(this.networkSeq.getConnectionCount(), [
          _ndc.x * 6.0,
          _ndc.y * 3.5,
          -5.0,
        ]);
      }
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (!this.hasEntered) return;
    this.updatePointerNdc(e.clientX, e.clientY);
    this.cameraDirector.setPointerOffset(_ndc.x, _ndc.y);
    // Gentle luminous ripple through procedural nebulae & particle fields on click/tap
    this.pointerPulseEnergy = Math.min(1, this.pointerPulseEnergy + 0.72);

    // Chapter I interactive birth star particle click/tap -> ignite Stellar Nucleosynthesis burst
    if (this.filmTime >= 75 && this.filmTime <= 109) {
      _raycaster.setFromCamera(_ndc, this.camera);
      const hits = _raycaster.intersectObject(this.earthSeq.interactiveStarHitbox, false);
      if (hits.length > 0 && this.earthSeq.triggerBirthStar()) {
        this.earthSeq.getBirthStarWorldPosition(_projWorldPos);
        this.nucleosynthesis.spawnBurst(
          [_projWorldPos.x, _projWorldPos.y, _projWorldPos.z],
          0.76,
          6.8,
          5.2,
        );
        this.callbacks.onBirthStarTriggered();
      }
    }

    // Chapter III click/tap impulse -> localized Stellar Nucleosynthesis spark burst
    if (this.filmTime >= 172 && this.filmTime <= 228) {
      const lit = this.networkSeq.handlePointerImpulse(_ndc.x, _ndc.y, this.camera, this.elapsed);
      if (lit > 0) {
        this.nucleosynthesis.spawnBurst([_ndc.x * 9.0, _ndc.y * 5.0, -255], 0.82, 11.5, 4.2);
        this.callbacks.onNetworkImpulse(this.networkSeq.getConnectionCount(), [
          _ndc.x * 6.0,
          _ndc.y * 3.5,
          -5.0,
        ]);
      }
    }
  };

  private snapCameraClean(timeSec: number): void {
    this.cameraDirector.snapToTime(this.camera, timeSec);
    _prevCameraPos.copy(this.camera.position);
    _smoothCameraVel.set(0, 0, 0);
    this.needsFirstFramePresent = true;
  }

  public enterUniverse(startAtTime = 0): void {
    this.hasEntered = true;
    this.isPlaying = true;
    this.completedFired = false;
    this.filmTime = clamp(startAtTime, 0, FILM_DURATION);
    this.snapCameraClean(this.filmTime);
    this.syncHud(true);
  }

  public setPlaying(playing: boolean): void {
    this.isPlaying = playing;
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  public setCinemaMode(enabled: boolean): void {
    this.cinemaMode = enabled;
    this.cadenceAccumulator = 0;
    this.syncHud(true);
  }

  public seekTo(timeSec: number): void {
    const prevChapter = getChapterAtTime(this.filmTime).index;
    this.filmTime = clamp(timeSec, 0, FILM_DURATION);
    const nextChapter = getChapterAtTime(this.filmTime).index;
    if (nextChapter !== prevChapter) {
      this.chapterSeekWarpPulse = 0.92;
      this.lastChapterIndex = nextChapter;
      this.callbacks.onChapterTransition?.(nextChapter);
    }
    if (this.filmTime < FILM_DURATION - 0.5) {
      this.completedFired = false;
    }
    this.snapCameraClean(this.filmTime);
    this.syncHud(true);
  }

  public replay(): void {
    this.earthSeq.resetInteraction();
    this.completedFired = false;
    this.hasEntered = true;
    this.isPlaying = true;
    this.filmTime = 0;
    this.snapCameraClean(0);
    this.syncHud(true);
  }

  public triggerBirthStarAccessible(): boolean {
    const ok = this.earthSeq.triggerBirthStar();
    if (ok) {
      this.earthSeq.getBirthStarWorldPosition(_projWorldPos);
      this.nucleosynthesis.spawnBurst(
        [_projWorldPos.x, _projWorldPos.y, _projWorldPos.z],
        0.76,
        6.8,
        5.2,
      );
      this.callbacks.onBirthStarTriggered();
      this.syncHud(true);
    }
    return ok;
  }

  public triggerNetworkPulseAccessible(): number {
    const lit = this.networkSeq.triggerAccessiblePulse();
    if (lit > 0) {
      this.nucleosynthesis.spawnBurst([0, 0.5, -255], 0.88, 13.0, 4.6);
      this.callbacks.onNetworkImpulse(this.networkSeq.getConnectionCount());
      this.syncHud(true);
    }
    return lit;
  }

  private computeGuidingStarState(t: number): number {
    // One continuous luminous anchor star threading through every single act
    if (t < 55) {
      const p = smoothstep(8, 55, t);
      _guidingTarget.set(
        THREE.MathUtils.lerp(0, -14, p),
        THREE.MathUtils.lerp(0, 6, p),
        THREE.MathUtils.lerp(0, -68, p),
      );
      return 1.6;
    }
    if (t < 110) {
      const p = smoothstep(55, 110, t);
      _guidingTarget.set(
        THREE.MathUtils.lerp(-14, 0, p),
        THREE.MathUtils.lerp(6, 6.5, p),
        THREE.MathUtils.lerp(-68, -172, p * p),
      );
      return 1.35;
    }
    if (t < 175) {
      _guidingTarget.set(1.55, 4.75, -174.62);
      return 1.35;
    }
    if (t < 225) {
      _guidingTarget.set(0, 0, -255);
      return 2.1;
    }
    if (t < 285) {
      _guidingTarget.set(0, 0, -372);
      return 0.16;
    }
    if (t < 335) {
      _guidingTarget.set(3.2, 2.8, -428);
      return 1.25;
    }
    _guidingTarget.set(0, 0, -515);
    const silenceHold = smoothstep(SILENCE_START - 1.5, SILENCE_START + 0.5, t);
    const postBurst = smoothstep(SILENCE_END, SILENCE_END + 3.2, t);
    return 1.8 + silenceHold * 1.6 - postBurst * 1.1;
  }

  private renderCurrentFrame(): void {
    if (this.renderMode === 'direct-renderer' || !this.composer) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const gl = this.renderer.getContext();
    const checkHealth = this.composerHealthChecksLeft > 0;
    if (checkHealth) {
      // Clear any pre-existing GL error before inspecting composer.render()
      while (gl.getError() !== gl.NO_ERROR) {
        // drain
      }
    }

    try {
      this.composer.render();
    } catch {
      this.fallbackToDirectRenderer();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (checkHealth) {
      this.composerHealthChecksLeft--;
      let fatalGlError = false;
      let err = gl.getError();
      while (err !== gl.NO_ERROR) {
        fatalGlError = true;
        err = gl.getError();
      }
      if (fatalGlError) {
        this.fallbackToDirectRenderer();
        this.renderer.render(this.scene, this.camera);
        return;
      }

      // On the final startup health check (when Prologue/Ch I-III visuals must be visible),
      // confirm the post-processing chain actually emitted non-black pixels to the backbuffer.
      if (
        !this.composerLumaVerified &&
        this.composerHealthChecksLeft === 0 &&
        this.filmTime < 220
      ) {
        this.composerLumaVerified = true;
        if (!this.verifyComposerProducedPixels(gl)) {
          this.fallbackToDirectRenderer();
          this.renderer.render(this.scene, this.camera);
        }
      }
    }
  }

  private syncHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudSync < 120) return;
    this.lastHudSync = now;
    const canvas = this.renderer.domElement;
    canvas.dataset.renderMode = this.renderMode;
    this.syncQualityDataset();
    canvas.dataset.bloomStrength = this.bloomPass ? this.bloomPass.strength.toFixed(2) : '0.00';
    canvas.dataset.bloomThreshold = this.bloomPass ? this.bloomPass.threshold.toFixed(2) : '1.00';
    canvas.dataset.lutGrade = this.lutPass ? this.lastLutLabel : 'direct';
    canvas.dataset.hipparcosStars = String(this.cosmicEnv.getHipparcosStarCount());
    canvas.dataset.gpgpuParticles = String(this.gpgpuFluid.particleCount);
    canvas.dataset.cinemaMode = this.cinemaMode ? 'imax-24fps' : 'native';
    canvas.dataset.parallaxShift = this.cosmicEnv.getNearParallaxMagnitude().toFixed(2);
    canvas.dataset.debrisShift = this.cosmicEnv.getDebrisParallaxMagnitude().toFixed(2);
    const driftState = this.cosmicDrift.getState();
    canvas.dataset.cosmicDriftOpacity = driftState.opacity.toFixed(3);
    canvas.dataset.cosmicDriftScroll = Math.hypot(
      driftState.scrollX,
      driftState.scrollY,
      driftState.scrollZ,
    ).toFixed(2);
    canvas.dataset.nucleosynthesisBursts = String(this.nucleosynthesis.getTotalSpawnedBursts());
    canvas.dataset.nucleosynthesisActive = String(this.nucleosynthesis.getActiveBurstCount());
    canvas.dataset.gravLensStrength = this.lastGravLensState.strength.toFixed(3);
    canvas.dataset.gravLensTransition = String(this.lastGravLensState.transitionIndex);
    canvas.dataset.yinyangPhase = this.yinYangSeq.getPhaseLabel();
    canvas.dataset.exposure = this.renderer.toneMappingExposure.toFixed(2);
    const dynNeb = this.cosmicEnv.getDynamicNebulaDiagnostics();
    canvas.dataset.nebulaMode = dynNeb.mode;
    canvas.dataset.nebulaIntensity = dynNeb.intensity.toFixed(2);
    canvas.dataset.nebulaParticles = String(dynNeb.particleCount);
    canvas.dataset.nebulaLayers = String(dynNeb.nebulaCount);
    canvas.dataset.pointerInfluence = dynNeb.pointerInfluence.toFixed(2);
    canvas.dataset.sagittariusEdges = String(this.figureSeq.getCompletedEdgesCount());
    canvas.dataset.texturesLoaded = `${
      this.earthSeq.getLoadedTextureCount() + this.cosmicEnv.getLoadedTextureCount()
    }/7`;
    this.callbacks.onTimeUpdate(
      this.filmTime,
      this.networkSeq.getConnectionCount(),
      this.earthSeq.isBirthStarTriggered(),
    );
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDelta = (now - this.lastPerfTime) / 1000;
    this.lastPerfTime = now;
    const delta = clamp(rawDelta, 0.001, 0.2);

    // Calm Cinema Mode: serene, unhurried organic animation tempo
    const motionScale = 0.68;
    this.elapsed += delta * motionScale;

    if (this.hasEntered && this.isPlaying) {
      // Adaptive 60fps DPR & shader-budget controller in Auto mode (hysteresis-protected)
      if (this.qualityMode === 'auto' && !this.isSoftwareGl) {
        const nextTier = this.adaptiveQuality.recordFrame(rawDelta);
        if (nextTier) {
          this.applyQualityTier(nextTier);
        }
      }

      this.filmTime = Math.min(FILM_DURATION, this.filmTime + delta);
      if (this.filmTime >= FILM_DURATION && !this.completedFired) {
        this.completedFired = true;
        this.isPlaying = false;
        this.callbacks.onFilmComplete();
      }
    }

    // Smooth atmospheric fog & background tinting per chapter
    const activeChapter = getChapterAtTime(this.filmTime);
    if (this.hasEntered && activeChapter.index !== this.lastChapterIndex) {
      this.lastChapterIndex = activeChapter.index;
      this.callbacks.onChapterTransition?.(activeChapter.index);
    }
    const nextChapter = CHAPTERS[Math.min(activeChapter.index + 1, CHAPTERS.length - 1)]!;
    const blendToNext = smoothstep(activeChapter.end - 6, activeChapter.end, this.filmTime);

    _nextFogColor.set(nextChapter.fogColor);
    _targetFogColor.set(activeChapter.fogColor).lerp(_nextFogColor, blendToNext);
    const fogAlpha = 1 - Math.exp(-2.0 * delta);
    this.fog.color.lerp(_targetFogColor, fogAlpha);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(_targetFogColor, fogAlpha);
    }
    this.fog.density = THREE.MathUtils.lerp(
      this.fog.density,
      THREE.MathUtils.lerp(activeChapter.fogDensity, nextChapter.fogDensity, blendToNext),
      fogAlpha,
    );

    // Update continuous camera choreography
    this.cameraDirector.update(this.camera, this.filmTime, delta, this.reducedMotion);

    // Compute smooth camera velocity & apply depth-based parallax
    const invDelta = 1 / Math.max(delta, 0.008);
    _instCameraVel
      .copy(this.camera.position)
      .sub(_prevCameraPos)
      .multiplyScalar(invDelta);
    _prevCameraPos.copy(this.camera.position);
    const velAlpha = 1 - Math.exp(-5.0 * delta);
    _smoothCameraVel.lerp(_instCameraVel, velAlpha);

    this.cameraDirector.getSmoothedPointer(_smoothedPointer);
    const silenceDip =
      smoothstep(SILENCE_START - 1.5, SILENCE_START + 0.5, this.filmTime) *
      (1 - smoothstep(SILENCE_END, SILENCE_END + 2.0, this.filmTime));
    _parallaxInput.cameraPos.x = this.camera.position.x;
    _parallaxInput.cameraPos.y = this.camera.position.y;
    _parallaxInput.cameraPos.z = this.camera.position.z;
    _parallaxInput.cameraVelocity.x = _smoothCameraVel.x;
    _parallaxInput.cameraVelocity.y = _smoothCameraVel.y;
    _parallaxInput.cameraVelocity.z = _smoothCameraVel.z;
    _parallaxInput.pointerOffset.x = _smoothedPointer.x;
    _parallaxInput.pointerOffset.y = _smoothedPointer.y;
    _parallaxOptions.reducedMotion = this.reducedMotion;
    _parallaxOptions.silenceDamp = 1 - silenceDip * 0.85;

    // Track subtle pointer glide velocity & decaying ripple pulse for procedural nebulae/particles
    const ptrVx = clamp((_smoothedPointer.x - _prevPointerNdc.x) / Math.max(delta, 0.012), -3, 3);
    const ptrVy = clamp((_smoothedPointer.y - _prevPointerNdc.y) / Math.max(delta, 0.012), -3, 3);
    _prevPointerNdc.copy(_smoothedPointer);
    const ptrVelAlpha = 1 - Math.exp(-7.5 * delta);
    _pointerVelNdc.x = THREE.MathUtils.lerp(_pointerVelNdc.x, ptrVx, ptrVelAlpha);
    _pointerVelNdc.y = THREE.MathUtils.lerp(_pointerVelNdc.y, ptrVy, ptrVelAlpha);
    if (this.pointerPulseEnergy > 0.001) {
      this.pointerPulseEnergy = Math.max(0, this.pointerPulseEnergy - delta * 0.75);
    }

    const activeNarrationLine = this.hasEntered ? getActiveNarrationLine(this.filmTime) : null;
    const narrationReactivity = computeNarrationCosmicReactivity(
      this.filmTime,
      activeNarrationLine,
    );
    const interactiveField = computeInteractiveFieldInfluence(
      _smoothedPointer.x,
      _smoothedPointer.y,
      _pointerVelNdc.x,
      _pointerVelNdc.y,
      this.pointerPulseEnergy,
      this.prefersReducedMotion,
    );

    // Update Guiding Star & all 7 continuous scene layers
    const guidingScale = this.computeGuidingStarState(this.filmTime);
    this.cosmicEnv.update(
      this.filmTime,
      this.elapsed,
      delta,
      this.hasEntered,
      _guidingTarget,
      guidingScale,
      this.camera.quaternion,
      _smoothedPointer.x,
      _smoothedPointer.y,
      narrationReactivity,
      interactiveField,
    );
    this.cosmicEnv.applyParallax(_parallaxInput, delta, _parallaxOptions);
    this.cosmicDrift.update(
      this.filmTime,
      this.elapsed,
      delta,
      this.hasEntered,
      this.reducedMotion,
      _parallaxInput,
      _parallaxOptions,
    );
    this.earthSeq.update(this.filmTime, this.elapsed, delta);
    this.figureSeq.update(this.filmTime, this.elapsed);
    this.networkSeq.update(this.filmTime, this.elapsed);
    this.yinYangSeq.update(this.filmTime, this.elapsed);
    this.quietSeq.update(this.filmTime, this.elapsed);
    this.revealSeq.update(this.filmTime, this.elapsed);
    this.nucleosynthesis.update(
      this.filmTime,
      this.elapsed,
      delta,
      this.camera.quaternion,
      this.hasEntered,
      (intensity) => this.callbacks.onNucleosynthesisBurst?.(intensity),
    );

    // Share loaded 4K Milky Way texture with Final Convergence geodesic black hole
    if (!this.syncedRevealMilkyWay) {
      const mwTex = this.cosmicEnv.getMilkyWayTexture();
      if (mwTex) {
        this.revealSeq.setMilkyWayTexture(mwTex);
        this.syncedRevealMilkyWay = true;
      }
    }

    // Update GPGPU ping-pong fluid simulation when supported by hardware
    const audioBass = this.callbacks.getAudioBass ? this.callbacks.getAudioBass() : 0;
    this.gpgpuFluid.update(
      this.renderer,
      this.filmTime,
      this.elapsed,
      delta,
      this.hasEntered,
      _smoothedPointer,
      audioBass,
    );

    // Push live 3D Guiding Star camera-relative coordinates to HRTF binaural panner
    if (this.callbacks.onSpatialAnchor) {
      _projWorldPos.copy(this.cosmicEnv.guidingStar.position).sub(this.camera.position);
      this.callbacks.onSpatialAnchor(
        _projWorldPos.x * 0.25,
        _projWorldPos.y * 0.25,
        -Math.max(2.5, Math.abs(_projWorldPos.z) * 0.2),
      );
    }

    // Chapter-adaptive Unreal-style Gaussian bloom (when HalfFloat HDR pipeline is active)
    if (this.bloomPass) {
      const bloomTarget = computeBloomParams(this.filmTime);
      this.bloomPass.strength = THREE.MathUtils.damp(
        this.bloomPass.strength,
        bloomTarget.strength * 0.72,
        4.0,
        delta,
      );
      this.bloomPass.radius = THREE.MathUtils.damp(
        this.bloomPass.radius,
        bloomTarget.radius * 0.78,
        4.0,
        delta,
      );
      this.bloomPass.threshold = THREE.MathUtils.damp(
        this.bloomPass.threshold,
        Math.max(0.72, bloomTarget.threshold),
        4.0,
        delta,
      );
    }

    const camSpeed = _smoothCameraVel.length();
    const optics = computeCinemaOptics(this.filmTime, camSpeed, true);
    const presentation = computeCinemaPresentation(this.filmTime, this.cinemaMode, true);
    const lutWeights = computeChapterLutWeights(this.filmTime);
    this.lastLutLabel = lutWeights.activeLabel;
    this.lutPass?.setWeights(lutWeights);

    // Chapter-transition Gravitational Lens pass (whisper-subtle calm shimmer)
    if (this.chapterSeekWarpPulse > 0.001) {
      this.chapterSeekWarpPulse = Math.max(0, this.chapterSeekWarpPulse - delta * 0.52);
    }
    const gravLens = computeChapterTransitionLens(this.filmTime, this.chapterSeekWarpPulse);
    this.lastGravLensState = gravLens;
    this.gravitationalLensPass?.applyState(
      {
        ...gravLens,
        strength: gravLens.strength * 0.14,
        dispersion: 0,
        ringGlint: gravLens.ringGlint * 0.25,
      },
      this.elapsed,
    );

    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,
      optics.exposure,
      4.2,
      delta,
    );

    // Calm Cinema Optics: razor-sharp astrophotography (zero bokeh/focal-rack blur)
    this.camera.updateMatrixWorld();
    if (this.cinemaPass) {
      const uCinema = this.cinemaPass.uniforms;
      uCinema.uTime!.value = this.elapsed;
      uCinema.uFrameIndex!.value = this.frameCounter;
      uCinema.uFocalRack!.value = 0.0;
      uCinema.uLensStrength!.value = 0.0;
      uCinema.uAnamorphicIntensity!.value = THREE.MathUtils.damp(
        uCinema.uAnamorphicIntensity!.value as number,
        optics.anamorphicIntensity * 0.28,
        4.5,
        delta,
      );
      uCinema.uBokehStrength!.value = 0.0;
      uCinema.uHalationStrength!.value = 0.02;

      if (this.filmTime < 120) {
        _projWorldPos.set(0, 0, 0);
      } else {
        _projWorldPos.set(0, 0, -515);
      }
      _projWorldPos.project(this.camera);
      (uCinema.uLensCenter!.value as THREE.Vector2).set(
        _projWorldPos.x * 0.5 + 0.5,
        _projWorldPos.y * 0.5 + 0.5,
      );

      if (this.filmTime >= 52 && this.filmTime <= 106) {
        this.earthSeq.getSunWorldPosition(_projWorldPos);
      } else if (this.filmTime < 44) {
        _projWorldPos.set(0, 0, 0);
      } else {
        _projWorldPos.copy(this.cosmicEnv.guidingStar.position);
      }
      _projWorldPos.project(this.camera);
      const inFront = _projWorldPos.z < 1.0;
      (uCinema.uFlareCenter!.value as THREE.Vector2).set(
        inFront ? _projWorldPos.x * 0.5 + 0.5 : -2.0,
        inFront ? _projWorldPos.y * 0.5 + 0.5 : -2.0,
      );
    }

    this.frameCounter++;

    // Optional 24fps filmic shutter cadence pacing in Cinema Presentation mode (GPU only)
    let shouldPresent = true;
    if (!this.isSoftwareGl && presentation.cadenceFps > 0 && !this.needsFirstFramePresent) {
      this.cadenceAccumulator += delta;
      const frameStep = 1 / presentation.cadenceFps;
      if (this.cadenceAccumulator < frameStep) {
        shouldPresent = false;
      } else {
        this.cadenceAccumulator %= frameStep;
      }
    }

    if (shouldPresent) {
      this.renderCurrentFrame();
      this.needsFirstFramePresent = false;
    }
    this.syncHud(false);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.dprMediaQuery) {
      this.dprMediaQuery.removeEventListener('change', this.handleDprChange);
      this.dprMediaQuery = null;
    }
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    this.cosmicEnv.dispose();
    this.cosmicDrift.dispose();
    this.gpgpuFluid.dispose();
    this.earthSeq.dispose();
    this.figureSeq.dispose();
    this.networkSeq.dispose();
    this.yinYangSeq.dispose();
    this.quietSeq.dispose();
    this.revealSeq.dispose();
    this.nucleosynthesis.dispose();
    this.lutPass?.dispose();
    this.cinemaPass?.dispose();
    this.lensDustTex?.dispose();
    this.gravitationalLensPass?.dispose();
    this.bloomPass?.dispose();
    this.composer?.dispose();
    this.composerRT?.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
