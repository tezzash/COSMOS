import * as THREE from 'three';
import { clamp } from '../../data/chapters';
import {
  type InteractiveFieldInfluence,
  type NarrationCosmicReactivity,
  generateProceduralNebulaLayers,
  generateProceduralParticleFieldData,
} from '../dynamicNebulaField';
import { type ParallaxInput, type ParallaxOptions, writeParallaxOffset } from '../parallax';

const _parallaxVec = new THREE.Vector3();
const _targetPrimary = new THREE.Color();
const _targetSecondary = new THREE.Color();
const _targetAccent = new THREE.Color();

/**
 * Real-time procedural domain-warped FBM volumetric nebula shader.
 * Generates multi-layered ionized cosmic gas, sculpted dark dust lanes,
 * narration-driven intensity/turbulence, and subtle pointer-proximity light scattering.
 */
const DYNAMIC_NEBULA_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vScreenNdc;

  void main() {
    vUv = uv;
    vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vScreenNdc = clipPos.xy / max(0.0001, clipPos.w);
    gl_Position = clipPos;
  }
`;

const DYNAMIC_NEBULA_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uFbmScale;
  uniform float uRidgeWeight;
  uniform float uHueBias;
  uniform float uTurbulence;
  uniform float uDensity;
  uniform float uCreationPulse;
  uniform vec3 uColorPrimary;
  uniform vec3 uColorSecondary;
  uniform vec3 uColorAccent;
  uniform vec2 uPointerNdc;
  uniform vec2 uPointerFlow;
  uniform float uColorShift;
  uniform float uLuminanceBoost;
  uniform float uPulseEnergy;

  varying vec2 vUv;
  varying vec2 vScreenNdc;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.52;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += amp * valueNoise(p);
      p = rot * p * 2.03 + vec2(11.7, 7.3);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 centered = vUv * 2.0 - 1.0;
    float radial = length(centered * vec2(1.0, 1.18));
    if (radial > 1.0) discard;

    // Soft organic radial mask so nebula planes never show rectangular edges
    float edgeFade = pow(max(0.0001, 1.0 - radial), 2.15);

    // Subtle pointer-proximity refraction & luminance warmth
    float ptrDist = length(vScreenNdc - uPointerNdc);
    float ptrHalo = exp(-ptrDist * ptrDist * 3.4);

    // Slow domain-warped FBM advection reacting to narration turbulence & subtle user flow
    float t = uTime * (0.045 + uTurbulence * 0.05);
    vec2 flowWarp = uPointerFlow * ptrHalo * 0.32;
    vec2 p = centered * uFbmScale + vec2(uSeed * 1.7, uSeed * 0.9) + flowWarp;

    vec2 q = vec2(
      fbm(p + vec2(t * 0.65, -t * 0.42)),
      fbm(p + vec2(-t * 0.38 + 4.2, t * 0.55 + 1.9))
    );
    float cloud = fbm(p + q * (1.1 + uTurbulence * 0.55) + vec2(t * 0.25, -t * 0.18));
    float ridge = 1.0 - abs(fbm(p * 1.55 - q * 1.35 + vec2(-t * 0.3, t * 0.24)) * 2.0 - 1.0);
    ridge = pow(clamp(ridge, 0.0001, 1.0), 2.4);

    float gas = mix(cloud, max(cloud * 0.72, ridge), uRidgeWeight);
    float densityMask = smoothstep(0.28, 0.86, gas) * edgeFade * uDensity;
    if (densityMask < 0.004) discard;

    // Subtle internal dark dust lane carving for astrophotography depth
    float dustLane = smoothstep(0.46, 0.78, fbm(p * 1.9 + vec2(3.1, -2.4)));
    float shadowFactor = mix(1.0, 0.42, dustLane * 0.65);

    // Subtle user color-temperature harmonic shift (cool sapphire <-> warm starlight gold)
    vec3 coolShift = vec3(0.18, 0.44, 0.92);
    vec3 warmShift = vec3(1.0, 0.78, 0.42);
    vec3 userTint = uColorShift >= 0.0 ? warmShift : coolShift;
    float shiftAmt = abs(uColorShift) * (0.14 + ptrHalo * 0.28);

    float filamentCore = smoothstep(0.55, 0.94, ridge) * (0.55 + uCreationPulse * 0.55);
    vec3 baseCol = mix(uColorPrimary, uColorSecondary, clamp(q.x + uHueBias, 0.0, 1.0));
    baseCol = mix(baseCol, uColorAccent, clamp(filamentCore * 0.72 + ptrHalo * 0.18, 0.0, 0.85));
    baseCol = mix(baseCol, userTint, clamp(shiftAmt, 0.0, 0.34));

    // Gentle radial ripple glow from subtle click/tap interaction
    float rippleDelta = (ptrDist - (1.0 - uPulseEnergy) * 0.95) * 9.0;
    float rippleRing = uPulseEnergy > 0.001 ? exp(-(rippleDelta * rippleDelta)) * uPulseEnergy * 0.32 : 0.0;
    float lum = (0.68 + uCreationPulse * 0.34 + uLuminanceBoost * (0.45 + ptrHalo) + rippleRing) * shadowFactor;

    float alpha = clamp(densityMask * uOpacity * (0.85 + ptrHalo * 0.22 + rippleRing * 0.5), 0.0, 0.55);
    gl_FragColor = vec4(baseCol * lum, alpha);
  }
`;

/**
 * Dynamic procedural cosmic particle field shader:
 * Advects filament dust & luminous stardust knots via divergence-free trigonometric curl
 * modulated by narration reactivity (intense during creation, hushed during rest)
 * and subtle screen-space pointer eddy flow & chromatic iridescence.
 */
const DYNAMIC_PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aScale;
  attribute float aPhase;
  attribute float aBand;
  attribute float aTemp;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uTurbulence;
  uniform float uFlowSpeed;
  uniform float uCreationPulse;
  uniform vec3 uParallaxOffset;
  uniform vec3 uColorPrimary;
  uniform vec3 uColorSecondary;
  uniform vec3 uColorAccent;
  uniform vec2 uPointerNdc;
  uniform vec2 uPointerFlow;
  uniform float uSwirlStrength;
  uniform float uColorShift;
  uniform float uLuminanceBoost;
  uniform float uPulseEnergy;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vBand;

  vec3 smoothCurl(vec3 p, float t) {
    vec3 q = p * 0.048 + vec3(t * 0.16, -t * 0.12, t * 0.09);
    return vec3(
      sin(q.y * 2.2 + cos(q.z * 1.8 + t * 0.28)),
      cos(q.z * 2.1 - sin(q.x * 1.9 - t * 0.24)),
      sin(q.x * 1.7 + cos(q.y * 2.0 + t * 0.21))
    );
  }

  void main() {
    float t = uTime * (0.28 + uFlowSpeed * 0.65);
    vec3 pos = position + uParallaxOffset;

    // Divergence-free curl displacement reacting smoothly to narration turbulence
    vec3 curlOffset = smoothCurl(position, t + aPhase * 6.2831);
    float bandAmp = aBand < 0.5 ? 1.65 : (aBand < 1.5 ? 2.35 : 1.1);
    pos += curlOffset * bandAmp * (0.35 + uTurbulence * 0.95);

    // Subtle radial bloom expansion during cosmic creation & revelation beats
    pos.xy *= (1.0 + uCreationPulse * (0.045 + 0.03 * sin(aPhase * 6.2831 + uTime)));

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vec4 clipPos = projectionMatrix * mvPosition;
    vec2 ndc = clipPos.xy / max(0.001, clipPos.w);

    // Subtle cursor-proximity tangential eddy & gentle drift in view space
    vec2 toPtr = ndc - uPointerNdc;
    float ptrDist = length(toPtr);
    float ptrInfluence = exp(-ptrDist * ptrDist * 4.5);
    vec2 tangent = vec2(-toPtr.y, toPtr.x) / max(0.18, ptrDist);
    vec2 eddy = (tangent * 0.55 + uPointerFlow * 1.65) * ptrInfluence * uSwirlStrength * 2.4;

    // Gentle expanding ripple wave on click/tap
    float rippleDelta = (ptrDist - (1.0 - uPulseEnergy) * 0.85) * 8.0;
    float rippleWave = uPulseEnergy > 0.001 ? exp(-(rippleDelta * rippleDelta)) * uPulseEnergy : 0.0;
    vec2 radialPush = (toPtr / max(0.12, ptrDist)) * rippleWave * 0.65 * uSwirlStrength;

    mvPosition.xy += eddy + radialPush;
    gl_Position = projectionMatrix * mvPosition;

    // Spectral palette blending driven by narration chapter + subtle user color shift
    vec3 baseCol = mix(uColorPrimary, uColorSecondary, aTemp);
    if (aBand < 0.5) {
      baseCol = mix(baseCol, uColorAccent, 0.58 + aTemp * 0.32);
    } else if (aBand < 1.5) {
      baseCol = mix(baseCol, uColorAccent, 0.24 + uCreationPulse * 0.35);
    } else {
      baseCol = mix(baseCol, vec3(0.92, 0.95, 1.0), 0.32);
    }

    vec3 coolTint = vec3(0.42, 0.72, 1.0);
    vec3 warmTint = vec3(1.0, 0.84, 0.52);
    vec3 interactiveTint = uColorShift >= 0.0 ? warmTint : coolTint;
    float tintMix = clamp(abs(uColorShift) * (0.12 + ptrInfluence * 0.42) + rippleWave * 0.35, 0.0, 0.52);
    vColor = mix(baseCol, interactiveTint, tintMix);

    float twinkle = 0.68 + 0.32 * sin(uTime * (0.75 + uFlowSpeed * 0.85) + aPhase * 6.2831);
    float dist = max(6.0, -mvPosition.z);
    float nearFade = smoothstep(5.0, 18.0, dist);
    float farFade = 1.0 - smoothstep(135.0, 240.0, dist);
    float boost = 1.0 + uCreationPulse * 0.38 + ptrInfluence * (0.32 + uLuminanceBoost) + rippleWave * 0.45;

    vAlpha = clamp(twinkle * nearFade * farFade * uOpacity * boost, 0.0, 0.92);
    vBand = aBand;

    float sizePulse = 1.0 + uCreationPulse * 0.22 + ptrInfluence * 0.18 + rippleWave * 0.24;
    gl_PointSize = clamp(aScale * sizePulse * uPixelRatio * (84.0 / dist), 1.4, 22.0);
  }
`;

const DYNAMIC_PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vBand;

  void main() {
    if (vAlpha < 0.006) discard;
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;

    // Band 1 renders as soft volumetric ionized dust motes; bands 0 & 2 have crisp luminous cores
    float softCloud = pow(max(0.0001, 1.0 - d), 2.1);
    float crispCore = exp(-d * d * 14.0);
    float shape = vBand > 0.5 && vBand < 1.5
      ? softCloud * 0.52 + crispCore * 0.36
      : crispCore * 0.85 + softCloud * 0.32;

    vec3 col = mix(vColor, vec3(1.0, 0.97, 0.91), crispCore * 0.42);
    gl_FragColor = vec4(col * (0.82 + crispCore * 0.38), clamp(shape * vAlpha, 0.0, 0.86));
  }
`;

interface DynamicNebulaEntry {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  basePos: THREE.Vector3;
  baseOpacity: number;
  depthFactor: number;
}

/**
 * Dynamic Procedural Nebula & Particle Field System integrated into CosmicEnvironment.
 * - Real-time GLSL domain-warped FBM nebulae + curl-advected particle filaments.
 * - Smoothly damped narration reactivity (intensifies during creation/climax, quiets during rest).
 * - Subtle interactive pointer eddy & spectral color shift that respects Calm Cinema Mode.
 */
export class DynamicNebulaParticles {
  public readonly root = new THREE.Group();
  public readonly particleCount: number;
  public readonly nebulaCount: number;

  private readonly nebulae: DynamicNebulaEntry[] = [];
  private readonly particleGeo: THREE.BufferGeometry;
  private readonly particleMat: THREE.ShaderMaterial;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  // Smoothly damped runtime scalars (zero snapping between narration cues)
  private curIntensity = 0.72;
  private curTurbulence = 0.62;
  private curDensity = 0.72;
  private curFlowSpeed = 0.66;
  private curCreationPulse = 0;
  private readonly curPrimary = new THREE.Color(0.12, 0.25, 0.58);
  private readonly curSecondary = new THREE.Color(0.36, 0.22, 0.64);
  private readonly curAccent = new THREE.Color(0.88, 0.69, 0.40);
  private readonly curPointer = new THREE.Vector2(0, 0);
  private readonly curFlow = new THREE.Vector2(0, 0);
  private curSwirl = 0;
  private curColorShift = 0;
  private curLumBoost = 0;
  private curPulseEnergy = 0;
  private lastMode = 'expansion';

  constructor(isMobile: boolean, pixelRatio: number) {
    const layerSpecs = generateProceduralNebulaLayers(25112002, isMobile ? 6 : 8);
    this.nebulaCount = layerSpecs.length;

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(planeGeo);

    for (let i = 0; i < layerSpecs.length; i++) {
      const spec = layerSpecs[i];
      if (!spec) continue;
      const mat = new THREE.ShaderMaterial({
        vertexShader: DYNAMIC_NEBULA_VERTEX_SHADER,
        fragmentShader: DYNAMIC_NEBULA_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uSeed: { value: spec.seed },
          uFbmScale: { value: spec.fbmScale },
          uRidgeWeight: { value: spec.ridgeWeight },
          uHueBias: { value: spec.hueBias },
          uTurbulence: { value: this.curTurbulence },
          uDensity: { value: this.curDensity },
          uCreationPulse: { value: 0 },
          uColorPrimary: { value: this.curPrimary.clone() },
          uColorSecondary: { value: this.curSecondary.clone() },
          uColorAccent: { value: this.curAccent.clone() },
          uPointerNdc: { value: new THREE.Vector2(0, 0) },
          uPointerFlow: { value: new THREE.Vector2(0, 0) },
          uColorShift: { value: 0 },
          uLuminanceBoost: { value: 0 },
          uPulseEnergy: { value: 0 },
        },
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.set(spec.x, spec.y, spec.z);
      mesh.scale.set(spec.scaleX, spec.scaleY, 1);
      mesh.rotation.z = spec.rotationZ;
      mesh.frustumCulled = false;
      mesh.renderOrder = -4;
      this.root.add(mesh);

      this.nebulae.push({
        mesh,
        mat,
        basePos: new THREE.Vector3(spec.x, spec.y, spec.z),
        baseOpacity: spec.baseOpacity,
        depthFactor: spec.depthFactor,
      });
      this.disposables.push(mat);
    }

    // Procedural curl-advected reactive cosmic particle field
    const fieldData = generateProceduralParticleFieldData(20021125, isMobile ? 1100 : 2200);
    this.particleCount = fieldData.count;
    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(fieldData.positions, 3));
    this.particleGeo.setAttribute('aScale', new THREE.BufferAttribute(fieldData.scales, 1));
    this.particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(fieldData.phases, 1));
    this.particleGeo.setAttribute('aBand', new THREE.BufferAttribute(fieldData.bands, 1));
    this.particleGeo.setAttribute('aTemp', new THREE.BufferAttribute(fieldData.temperatures, 1));

    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: DYNAMIC_PARTICLE_VERTEX_SHADER,
      fragmentShader: DYNAMIC_PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uTurbulence: { value: this.curTurbulence },
        uFlowSpeed: { value: this.curFlowSpeed },
        uCreationPulse: { value: 0 },
        uParallaxOffset: { value: new THREE.Vector3() },
        uColorPrimary: { value: this.curPrimary.clone() },
        uColorSecondary: { value: this.curSecondary.clone() },
        uColorAccent: { value: this.curAccent.clone() },
        uPointerNdc: { value: new THREE.Vector2(0, 0) },
        uPointerFlow: { value: new THREE.Vector2(0, 0) },
        uSwirlStrength: { value: 0 },
        uColorShift: { value: 0 },
        uLuminanceBoost: { value: 0 },
        uPulseEnergy: { value: 0 },
      },
    });

    const points = new THREE.Points(this.particleGeo, this.particleMat);
    points.frustumCulled = false;
    points.renderOrder = -3;
    this.root.add(points);
    this.disposables.push(this.particleGeo, this.particleMat);
  }

  public update(
    elapsed: number,
    delta: number,
    visibility: number,
    reactivity: NarrationCosmicReactivity,
    interaction: InteractiveFieldInfluence,
  ): void {
    const dt = clamp(delta, 0.001, 0.12);
    const reactDamp = 1 - Math.exp(-2.1 * dt);
    const ptrDamp = 1 - Math.exp(-5.5 * dt);

    this.lastMode = reactivity.mode;
    this.curIntensity = THREE.MathUtils.lerp(this.curIntensity, reactivity.intensity, reactDamp);
    this.curTurbulence = THREE.MathUtils.lerp(this.curTurbulence, reactivity.turbulence, reactDamp);
    this.curDensity = THREE.MathUtils.lerp(this.curDensity, reactivity.nebulaDensity, reactDamp);
    this.curFlowSpeed = THREE.MathUtils.lerp(this.curFlowSpeed, reactivity.flowSpeed, reactDamp);
    this.curCreationPulse = THREE.MathUtils.lerp(
      this.curCreationPulse,
      reactivity.creationPulse,
      reactDamp,
    );

    _targetPrimary.setRGB(reactivity.primary.r, reactivity.primary.g, reactivity.primary.b);
    _targetSecondary.setRGB(reactivity.secondary.r, reactivity.secondary.g, reactivity.secondary.b);
    _targetAccent.setRGB(reactivity.accent.r, reactivity.accent.g, reactivity.accent.b);
    this.curPrimary.lerp(_targetPrimary, reactDamp);
    this.curSecondary.lerp(_targetSecondary, reactDamp);
    this.curAccent.lerp(_targetAccent, reactDamp);

    this.curPointer.x = THREE.MathUtils.lerp(this.curPointer.x, interaction.pointerX, ptrDamp);
    this.curPointer.y = THREE.MathUtils.lerp(this.curPointer.y, interaction.pointerY, ptrDamp);
    this.curFlow.x = THREE.MathUtils.lerp(this.curFlow.x, interaction.flowX, ptrDamp);
    this.curFlow.y = THREE.MathUtils.lerp(this.curFlow.y, interaction.flowY, ptrDamp);
    this.curSwirl = THREE.MathUtils.lerp(this.curSwirl, interaction.swirlStrength, ptrDamp);
    this.curColorShift = THREE.MathUtils.lerp(
      this.curColorShift,
      interaction.colorShift,
      ptrDamp * 0.75,
    );
    this.curLumBoost = THREE.MathUtils.lerp(
      this.curLumBoost,
      interaction.luminanceBoost,
      ptrDamp,
    );
    this.curPulseEnergy = THREE.MathUtils.lerp(
      this.curPulseEnergy,
      interaction.pulseEnergy,
      ptrDamp,
    );

    const safeVis = clamp(visibility, 0, 1);

    for (let i = 0; i < this.nebulae.length; i++) {
      const entry = this.nebulae[i];
      if (!entry) continue;
      const u = entry.mat.uniforms;
      if (u.uTime) u.uTime.value = elapsed;
      if (u.uOpacity) u.uOpacity.value = entry.baseOpacity * safeVis * this.curIntensity;
      if (u.uTurbulence) u.uTurbulence.value = this.curTurbulence;
      if (u.uDensity) u.uDensity.value = this.curDensity;
      if (u.uCreationPulse) u.uCreationPulse.value = this.curCreationPulse;
      if (u.uColorPrimary) (u.uColorPrimary.value as THREE.Color).copy(this.curPrimary);
      if (u.uColorSecondary) (u.uColorSecondary.value as THREE.Color).copy(this.curSecondary);
      if (u.uColorAccent) (u.uColorAccent.value as THREE.Color).copy(this.curAccent);
      if (u.uPointerNdc) (u.uPointerNdc.value as THREE.Vector2).copy(this.curPointer);
      if (u.uPointerFlow) (u.uPointerFlow.value as THREE.Vector2).copy(this.curFlow);
      if (u.uColorShift) u.uColorShift.value = this.curColorShift;
      if (u.uLuminanceBoost) u.uLuminanceBoost.value = this.curLumBoost;
      if (u.uPulseEnergy) u.uPulseEnergy.value = this.curPulseEnergy;
    }

    const pu = this.particleMat.uniforms;
    if (pu.uTime) pu.uTime.value = elapsed;
    if (pu.uOpacity) pu.uOpacity.value = safeVis * clamp(this.curIntensity * 0.68, 0.03, 0.92);
    if (pu.uTurbulence) pu.uTurbulence.value = this.curTurbulence;
    if (pu.uFlowSpeed) pu.uFlowSpeed.value = this.curFlowSpeed;
    if (pu.uCreationPulse) pu.uCreationPulse.value = this.curCreationPulse;
    if (pu.uColorPrimary) (pu.uColorPrimary.value as THREE.Color).copy(this.curPrimary);
    if (pu.uColorSecondary) (pu.uColorSecondary.value as THREE.Color).copy(this.curSecondary);
    if (pu.uColorAccent) (pu.uColorAccent.value as THREE.Color).copy(this.curAccent);
    if (pu.uPointerNdc) (pu.uPointerNdc.value as THREE.Vector2).copy(this.curPointer);
    if (pu.uPointerFlow) (pu.uPointerFlow.value as THREE.Vector2).copy(this.curFlow);
    if (pu.uSwirlStrength) pu.uSwirlStrength.value = this.curSwirl;
    if (pu.uColorShift) pu.uColorShift.value = this.curColorShift;
    if (pu.uLuminanceBoost) pu.uLuminanceBoost.value = this.curLumBoost;
    if (pu.uPulseEnergy) pu.uPulseEnergy.value = this.curPulseEnergy;
  }

  public applyParallax(input: ParallaxInput, damp: number, options: ParallaxOptions): void {
    for (let i = 0; i < this.nebulae.length; i++) {
      const entry = this.nebulae[i];
      if (!entry) continue;
      writeParallaxOffset(_parallaxVec, input, entry.depthFactor, options);
      _parallaxVec.add(entry.basePos);
      entry.mesh.position.lerp(_parallaxVec, damp);
    }

    writeParallaxOffset(_parallaxVec, input, 0.36, options);
    const current = this.particleMat.uniforms.uParallaxOffset?.value as THREE.Vector3 | undefined;
    if (current) {
      current.lerp(_parallaxVec, damp);
    }
  }

  public setPixelRatio(pixelRatio: number): void {
    if (this.particleMat.uniforms.uPixelRatio) {
      this.particleMat.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  public setParticleDrawRatio(ratio: number): void {
    const r = clamp(ratio, 0.35, 1.0);
    this.particleGeo.setDrawRange(0, Math.floor(this.particleCount * r));
  }

  public getDiagnostics(): {
    mode: string;
    intensity: number;
    pointerInfluence: number;
    particleCount: number;
    nebulaCount: number;
  } {
    return {
      mode: this.lastMode,
      intensity: this.curIntensity,
      pointerInfluence: clamp(this.curSwirl + Math.abs(this.curColorShift) * 0.25, 0, 1),
      particleCount: this.particleCount,
      nebulaCount: this.nebulaCount,
    };
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
