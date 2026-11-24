import * as THREE from 'three';
import { getChapterWeight, smoothstep } from '../../data/chapters';
import {
  DEFAULT_COSMIC_YINYANG_CONFIG,
  generateCosmicYinYangEntities,
} from '../cosmicYinYang';
import { type ShaderPrecision } from '../deviceProfile';
import { GALAXY_COLOR_PALETTES } from '../proceduralGalaxy';
import { ProceduralGalaxyInstance } from './ProceduralGalaxySystem';

const YINYANG_STAR_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aTargetPos;
  attribute vec3 aFlowTangent;
  attribute vec3 aColor;
  attribute float aScale;
  attribute float aPhase;
  attribute float aIgnition;
  attribute float aHalfSign;
  attribute float aSeedFlag;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uIgnition;
  uniform float uConverge;
  uniform float uRadius;

  varying vec3 vColor;
  varying float vScale;
  varying float vAlpha;
  varying float vHalfSign;
  varying float vPhase;

  void main() {
    // Organic staggered starlight ignition from deep darkness
    float ignite = smoothstep(aIgnition * 0.72, aIgnition * 0.72 + 0.28, uIgnition);

    // Individual curved convergence arc from dispersed deep-space position -> Yin-Yang target
    float localC = clamp((uConverge - aPhase * 0.16) / 0.84, 0.0, 1.0);
    float easeC = localC * localC * (3.0 - 2.0 * localC);

    // Graceful logarithmic spiral sweep during convergence (zero linear robotic snapping)
    float swirlAngle = (1.0 - easeC) * (1.0 - easeC) * 1.45 * (aHalfSign >= 0.0 ? 1.0 : -1.0);
    float cs = cos(swirlAngle);
    float ss = sin(swirlAngle);
    vec3 startSwirled = position;
    startSwirled.xy = mat2(cs, -ss, ss, cs) * position.xy;

    vec3 pos = mix(startSwirled, aTargetPos, easeC);

    // === OPPOSING COUNTER-ROTATION WHILE PRESERVING EXACT YIN-YANG SILHOUETTE ===
    if (aSeedFlag > 0.5) {
      // The two contrasting circular dots are miniature spiral galaxies spinning in opposite directions
      float cy = aHalfSign > 0.0 ? -uRadius * 0.5 : uRadius * 0.5;
      vec2 rel = pos.xy - vec2(0.0, cy);
      float rSeed = length(rel);
      float seedOmega = (0.34 / (0.28 + rSeed * 0.55)) * (aHalfSign > 0.0 ? -1.0 : 1.0);
      float ang = uTime * seedOmega * easeC;
      float ca = cos(ang);
      float sa = sin(ang);
      pos.xy = vec2(0.0, cy) + mat2(ca, -sa, sa, ca) * rel;
    } else {
      // Main Yang (+1 clockwise) & Yin (-1 counter-clockwise) cosmic streams glide continuously
      // along closed local teardrop streamlines & circular micro-eddies, keeping silhouette crisp
      float streamPhase = uTime * 0.36 + aPhase * 6.283185;
      float driftAlong = sin(streamPhase) * 0.38 * easeC;
      float microEddyX = cos(streamPhase * 1.35 + aPhase * 12.0) * 0.14 * easeC;
      float microEddyY = sin(streamPhase * 1.35 + aPhase * 12.0) * 0.14 * easeC;
      pos.xy += aFlowTangent.xy * driftAlong + vec2(microEddyX, microEddyY);
      pos.z += sin(uTime * 0.45 + aPhase * 9.4) * 0.18 * easeC;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float twinkle = 0.82 + 0.18 * sin(uTime * (1.4 + aPhase * 2.8) + aPhase * 6.283185);
    float dist = max(12.0, -mvPosition.z);
    float convergeSpark = 1.0 + sin(localC * 3.14159) * 0.22;
    gl_PointSize = clamp(aScale * uPixelRatio * (112.0 / dist) * twinkle * convergeSpark, 1.05, 18.0);

    vColor = aColor;
    vScale = aScale;
    vHalfSign = aHalfSign;
    vPhase = aPhase;
    vAlpha = uOpacity * ignite;
  }
`;

const YINYANG_STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vScale;
  varying float vAlpha;
  varying float vHalfSign;
  varying float vPhase;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5 || vAlpha < 0.004) discard;

    // Razor-sharp astrophotography Airy star core + controlled soft halo
    float core = exp(-d * d * 54.0);
    float halo = exp(-d * d * 11.5) * (vHalfSign > 0.0 ? 0.38 : 0.28);

    // Delicate 4-point JWST/Hubble diffraction spikes strictly on luminous supergiants
    float brightFactor = smoothstep(2.9, 4.8, vScale);
    float spikeH = exp(-abs(uv.y) * 40.0) * exp(-abs(uv.x) * 7.0);
    float spikeV = exp(-abs(uv.x) * 40.0) * exp(-abs(uv.y) * 7.0);
    float spikes = (spikeH + spikeV) * brightFactor * 0.34;

    float intensity = core + halo + spikes;
    vec3 coreWhite = vHalfSign > 0.0 ? vec3(1.0, 0.96, 0.84) : vec3(0.84, 0.78, 1.0);
    vec3 col = mix(vColor, coreWhite, core * (vHalfSign > 0.0 ? 0.34 : 0.22));

    // Preserve deep contrast between luminous golden Yang and rich dark violet/crimson Yin
    float gain = vHalfSign > 0.0 ? 0.98 : 0.88;
    float alpha = clamp(intensity * vAlpha * gain, 0.0, 1.0);
    gl_FragColor = vec4(col * intensity * gain, alpha);
  }
`;

const YINYANG_NEBULA_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aTargetPos;
  attribute vec3 aFlowTangent;
  attribute vec3 aColor;
  attribute float aScale;
  attribute float aPhase;
  attribute float aOpacity;
  attribute float aIgnition;
  attribute float aHalfSign;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uIgnition;
  uniform float uConverge;

  varying vec3 vColor;
  varying float vPhase;
  varying float vAlpha;
  varying float vHalfSign;

  void main() {
    float ignite = smoothstep(aIgnition * 0.65, aIgnition * 0.65 + 0.35, uIgnition);
    float localC = clamp((uConverge - aPhase * 0.14) / 0.86, 0.0, 1.0);
    float easeC = localC * localC * (3.0 - 2.0 * localC);

    float swirlAngle = (1.0 - easeC) * (1.0 - easeC) * 1.15 * (aHalfSign >= 0.0 ? 1.0 : -1.0);
    float cs = cos(swirlAngle);
    float ss = sin(swirlAngle);
    vec3 startSwirled = position;
    startSwirled.xy = mat2(cs, -ss, ss, cs) * position.xy;

    vec3 pos = mix(startSwirled, aTargetPos, easeC);

    // Gentle opposing volumetric nebula flow along Yin-Yang streamlines
    float streamPhase = uTime * 0.28 + aPhase * 6.283185;
    pos.xy += aFlowTangent.xy * (sin(streamPhase) * 0.42 * easeC);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = max(14.0, -mvPosition.z);
    gl_PointSize = clamp(aScale * uPixelRatio * (185.0 / dist), 12.0, 156.0);

    vColor = aColor;
    vPhase = aPhase;
    vHalfSign = aHalfSign;
    vAlpha = aOpacity * uOpacity * ignite * (0.28 + 0.72 * easeC);
  }
`;

const YINYANG_NEBULA_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;

  varying vec3 vColor;
  varying float vPhase;
  varying float vAlpha;
  varying float vHalfSign;

  float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm3(vec2 p) {
    float v = 0.0;
    float a = 0.55;
    mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 3; i++) {
      v += a * vnoise(p);
      p = m * p * 2.08 + vec2(2.3, 1.7);
      a *= 0.48;
    }
    return v;
  }

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5 || vAlpha < 0.002) discard;

    // Opposing slow gas turbulence spin inside each volumetric nebula cloud
    float rot = vPhase * 6.283185 + uTime * (vHalfSign > 0.0 ? -0.022 : 0.022);
    float ca = cos(rot);
    float sa = sin(rot);
    vec2 ruv = mat2(ca, -sa, sa, ca) * uv;

    vec2 np = ruv * 4.2 + vec2(vPhase * 13.7, vPhase * 8.9);
    float n1 = fbm3(np);
    float n2 = fbm3(np + vec2(0.18, -0.14)); // directional volumetric self-shadow sample
    float rimLit = clamp((n1 - n2) * 2.6 + 0.62, 0.25, 1.45);

    float falloff = smoothstep(0.5, 0.05, d);
    float density = pow(max(0.0001, falloff), 1.65) * (0.48 + 0.92 * n1);
    float alpha = clamp(density * vAlpha * 1.25, 0.0, 0.58);

    vec3 litCol = vColor * (0.85 + 0.52 * rimLit);
    gl_FragColor = vec4(litCol, alpha);
  }
`;

/**
 * Chapter IV: Pure-Cosmic-Entity Yin-Yang Formation (centered at 0, 0, -340).
 *
 * ZERO geometric shapes, ZERO solid outlines, ZERO flat symbol textures.
 * Constructed 100% organically out of:
 * - ~27,000+ individual pinpoint stars & dense star clusters (desktop) arranged
 *   into intertwined golden-white/blue Yang and deep violet/crimson/electric-blue Yin spirals
 * - ~980 volumetric self-illuminated FBM nebula clouds
 * - Two concentrated miniature counter-rotating spiral galaxies forming the iconic dots
 * - 8 embedded companion spiral galaxies + 6 distant procedural background galaxies
 *   revealed during the grand IMAX pullback
 * - Delicate shimmering perimeter star stream (no solid ring or outline)
 */
export class CosmicYinYangFormation {
  public readonly root = new THREE.Group();
  public readonly starCount: number;
  public readonly nebulaCount: number;

  private readonly formationGroup = new THREE.Group();
  private readonly starGeo: THREE.BufferGeometry;
  private readonly nebulaGeo: THREE.BufferGeometry;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly nebulaMat: THREE.ShaderMaterial;
  private readonly backdropGalaxies: ProceduralGalaxyInstance[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private lastPhaseLabel = 'dark-ignition';

  constructor(
    isMobile: boolean,
    pixelRatio: number,
    scaleFactorOverride?: number,
    backdropShaderPrecision: ShaderPrecision = 'highp',
  ) {
    this.root.position.set(0, 0, -340);

    // Preserve visual parity on central Yin-Yang set piece (high-PPI mobile runs ~86% density at full highp)
    const scaleFactor = scaleFactorOverride ?? (isMobile ? 0.72 : 1.0);
    const entities = generateCosmicYinYangEntities({
      ...DEFAULT_COSMIC_YINYANG_CONFIG,
      starCount: Math.round(DEFAULT_COSMIC_YINYANG_CONFIG.starCount * scaleFactor),
      nebulaCount: Math.round(DEFAULT_COSMIC_YINYANG_CONFIG.nebulaCount * scaleFactor),
      seedGalaxyStars: Math.round(DEFAULT_COSMIC_YINYANG_CONFIG.seedGalaxyStars * scaleFactor),
      seedGalaxyNebulae: Math.round(DEFAULT_COSMIC_YINYANG_CONFIG.seedGalaxyNebulae * scaleFactor),
      boundaryStarCount: Math.round(DEFAULT_COSMIC_YINYANG_CONFIG.boundaryStarCount * scaleFactor),
    });

    this.starCount = entities.stars.count;
    this.nebulaCount = entities.nebulae.count;

    // 1. Volumetric FBM Nebula Clouds (rendered beneath crisp pinpoint stars)
    const nebGeo = new THREE.BufferGeometry();
    this.nebulaGeo = nebGeo;
    nebGeo.setAttribute('position', new THREE.BufferAttribute(entities.nebulae.startPositions, 3));
    nebGeo.setAttribute('aTargetPos', new THREE.BufferAttribute(entities.nebulae.targetPositions, 3));
    nebGeo.setAttribute('aFlowTangent', new THREE.BufferAttribute(entities.nebulae.flowTangents, 3));
    nebGeo.setAttribute('aColor', new THREE.BufferAttribute(entities.nebulae.colors, 3));
    nebGeo.setAttribute('aScale', new THREE.BufferAttribute(entities.nebulae.scales, 1));
    nebGeo.setAttribute('aPhase', new THREE.BufferAttribute(entities.nebulae.phases, 1));
    nebGeo.setAttribute('aOpacity', new THREE.BufferAttribute(entities.nebulae.opacities, 1));
    nebGeo.setAttribute('aIgnition', new THREE.BufferAttribute(entities.nebulae.ignitionTimes, 1));
    nebGeo.setAttribute('aHalfSign', new THREE.BufferAttribute(entities.nebulae.halfSigns, 1));

    this.nebulaMat = new THREE.ShaderMaterial({
      vertexShader: YINYANG_NEBULA_VERTEX_SHADER,
      fragmentShader: YINYANG_NEBULA_FRAGMENT_SHADER,
      precision: 'highp',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uIgnition: { value: 0 },
        uConverge: { value: 0 },
      },
    });
    const nebPoints = new THREE.Points(nebGeo, this.nebulaMat);
    nebPoints.frustumCulled = false;
    nebPoints.renderOrder = 1;
    this.formationGroup.add(nebPoints);
    this.disposables.push(nebGeo, this.nebulaMat);

    // 2. Crisp Astrophotography Star Rivers, Dense Clusters, Seed Spiral Galaxies & Boundary Stream
    const starGeo = new THREE.BufferGeometry();
    this.starGeo = starGeo;
    starGeo.setAttribute('position', new THREE.BufferAttribute(entities.stars.startPositions, 3));
    starGeo.setAttribute('aTargetPos', new THREE.BufferAttribute(entities.stars.targetPositions, 3));
    starGeo.setAttribute('aFlowTangent', new THREE.BufferAttribute(entities.stars.flowTangents, 3));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(entities.stars.colors, 3));
    starGeo.setAttribute('aScale', new THREE.BufferAttribute(entities.stars.scales, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(entities.stars.phases, 1));
    starGeo.setAttribute('aIgnition', new THREE.BufferAttribute(entities.stars.ignitionTimes, 1));
    starGeo.setAttribute('aHalfSign', new THREE.BufferAttribute(entities.stars.halfSigns, 1));
    starGeo.setAttribute('aSeedFlag', new THREE.BufferAttribute(entities.stars.seedFlags, 1));

    this.starMat = new THREE.ShaderMaterial({
      vertexShader: YINYANG_STAR_VERTEX_SHADER,
      fragmentShader: YINYANG_STAR_FRAGMENT_SHADER,
      precision: 'highp',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uIgnition: { value: 0 },
        uConverge: { value: 0 },
        uRadius: { value: DEFAULT_COSMIC_YINYANG_CONFIG.radius },
      },
    });
    const starPoints = new THREE.Points(starGeo, this.starMat);
    starPoints.frustumCulled = false;
    starPoints.renderOrder = 2;
    this.formationGroup.add(starPoints);
    this.disposables.push(starGeo, this.starMat);

    this.root.add(this.formationGroup);

    // 3. Six Distant Procedural Background Galaxies Framing the Immense Dark Pullback Void
    //    Positioned strictly outside the Yin-Yang silhouette perimeter so zero overlap occurs
    const bgSpecs = [
      {
        pos: [-52, 24, -68] as const,
        tilt: [0.85, 0.3, -0.4] as const,
        type: 'spiral' as const,
        palette: 'champagne-sapphire' as const,
        size: 10.5,
        arms: 3,
        seed: 8101,
      },
      {
        pos: [54, 21, -72] as const,
        tilt: [1.05, -0.35, 0.32] as const,
        type: 'barred-spiral' as const,
        palette: 'celestial-azure' as const,
        size: 10.0,
        arms: 2,
        seed: 8102,
      },
      {
        pos: [-54, -22, -70] as const,
        tilt: [0.62, 0.24, 0.45] as const,
        type: 'spiral' as const,
        palette: 'amethyst-ember' as const,
        size: 9.8,
        arms: 4,
        seed: 8103,
      },
      {
        pos: [50, -24, -64] as const,
        tilt: [0.44, -0.2, 0.25] as const,
        type: 'elliptical' as const,
        palette: 'ancient-gold' as const,
        size: 8.4,
        arms: 2,
        seed: 8104,
      },
      {
        pos: [-34, 34, -88] as const,
        tilt: [1.18, 0.4, -0.25] as const,
        type: 'spiral' as const,
        palette: 'celestial-azure' as const,
        size: 8.5,
        arms: 3,
        seed: 8105,
      },
      {
        pos: [38, -32, -84] as const,
        tilt: [0.92, -0.3, -0.38] as const,
        type: 'barred-spiral' as const,
        palette: 'amethyst-ember' as const,
        size: 8.6,
        arms: 2,
        seed: 8106,
      },
    ];

    const bgStarBase = Math.round(520 * scaleFactor);
    const bgNebBase = Math.round(24 * scaleFactor);

    for (let i = 0; i < bgSpecs.length; i++) {
      const s = bgSpecs[i];
      if (!s) continue;
      const pal = GALAXY_COLOR_PALETTES[s.palette];
      const gal = new ProceduralGalaxyInstance(
        {
          type: s.type,
          size: s.size,
          arms: s.arms,
          armTightness: 0.78,
          armSpread: 0.22,
          starDensity: 1.0,
          starDistribution: 1.5,
          nebulaIntensity: 0.85,
          colorPreset: s.palette,
          coreColor: pal.coreColor,
          armColor: pal.armColor,
          outerColor: pal.outerColor,
          nebulaColor: pal.nebulaColor,
          seed: s.seed,
        },
        {
          position: s.pos,
          tilt: s.tilt,
          baseStarCount: bgStarBase,
          baseNebulaCount: bgNebBase,
          pixelRatio,
          depthFactor: 0,
          spinSpeed: i % 2 === 0 ? 0.045 : -0.04,
          shaderPrecision: backdropShaderPrecision,
        },
      );
      this.backdropGalaxies.push(gal);
      this.root.add(gal.root);
      this.disposables.push(gal);
    }
  }

  public getPhaseLabel(): string {
    return this.lastPhaseLabel;
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 225, 285, 5.5, 5.5);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    // 4-Phase Cinematic Direction:
    // 225..235: Almost completely dark universe -> tiny individual stars gradually ignite
    // 234..254: Cosmic dust, nebulae & miniature galaxies converge organically into Yin-Yang
    // 254..272: Counter-rotating symmetrical equilibrium
    // 270..285: Grand pullback reveal suspended among distant galaxies
    const ignition = smoothstep(225.2, 237.5, filmTime);
    const converge = smoothstep(232.0, 254.0, filmTime);
    const pullbackReveal = smoothstep(262.0, 276.0, filmTime);
    const dissolve = smoothstep(280.5, 285.5, filmTime);
    const activeOp = weight * (1 - dissolve * 0.88);

    if (filmTime < 234) {
      this.lastPhaseLabel = 'dark-ignition';
    } else if (filmTime < 254) {
      this.lastPhaseLabel = 'organic-convergence';
    } else if (filmTime < 270) {
      this.lastPhaseLabel = 'counter-rotating-equilibrium';
    } else {
      this.lastPhaseLabel = 'grand-pullback-reveal';
    }

    // Subtle, calm 3D perspective breath (stays nearly face-on so Yin-Yang silhouette is crystal-clear)
    this.formationGroup.rotation.x = Math.sin(elapsed * 0.1) * 0.045 * (1 - pullbackReveal * 0.65);
    this.formationGroup.rotation.y = Math.cos(elapsed * 0.08) * 0.055 * (1 - pullbackReveal * 0.65);
    this.formationGroup.rotation.z = Math.sin(elapsed * 0.045) * 0.03;

    if (this.starMat.uniforms.uTime) this.starMat.uniforms.uTime.value = elapsed;
    if (this.starMat.uniforms.uOpacity) this.starMat.uniforms.uOpacity.value = activeOp;
    if (this.starMat.uniforms.uIgnition) this.starMat.uniforms.uIgnition.value = ignition;
    if (this.starMat.uniforms.uConverge) this.starMat.uniforms.uConverge.value = converge;

    if (this.nebulaMat.uniforms.uTime) this.nebulaMat.uniforms.uTime.value = elapsed;
    if (this.nebulaMat.uniforms.uOpacity) this.nebulaMat.uniforms.uOpacity.value = activeOp;
    if (this.nebulaMat.uniforms.uIgnition) this.nebulaMat.uniforms.uIgnition.value = ignition;
    if (this.nebulaMat.uniforms.uConverge) this.nebulaMat.uniforms.uConverge.value = converge;

    // Distant procedural galaxies emerge softly in the immense dark universe as formation completes
    const bgOp = activeOp * smoothstep(238.0, 270.0, filmTime) * 0.85;
    for (const g of this.backdropGalaxies) {
      g.root.visible = bgOp > 0.01;
      if (g.root.visible) {
        g.update(elapsed, bgOp);
      }
    }
  }

  public setPixelRatio(pixelRatio: number): void {
    if (this.starMat.uniforms.uPixelRatio) {
      this.starMat.uniforms.uPixelRatio.value = pixelRatio;
    }
    if (this.nebulaMat.uniforms.uPixelRatio) {
      this.nebulaMat.uniforms.uPixelRatio.value = pixelRatio;
    }
    for (const g of this.backdropGalaxies) {
      g.setPixelRatio(pixelRatio);
    }
  }

  public setBackdropShaderPrecision(precision: ShaderPrecision): void {
    // Only non-critical distant backdrop galaxies switch to mediump;
    // central Yin-Yang starMat & nebulaMat remain permanently highp.
    for (const g of this.backdropGalaxies) {
      g.setShaderPrecision(precision);
    }
  }

  public setParticleDrawRatio(ratio: number): void {
    const r = Math.max(0.45, Math.min(1.0, ratio));
    this.starGeo.setDrawRange(0, Math.floor(this.starCount * r));
    this.nebulaGeo.setDrawRange(0, Math.floor(this.nebulaCount * r));
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
