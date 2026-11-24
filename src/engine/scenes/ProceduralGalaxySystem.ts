import * as THREE from 'three';
import {
  DEFAULT_HERO_GALAXY_PARAMS,
  GALAXY_COLOR_PALETTES,
  type GalaxyParams,
  type GalaxyType,
  generateGalaxyBuffers,
  sanitizeGalaxyParams,
} from '../proceduralGalaxy';
import { type ShaderPrecision } from '../deviceProfile';
import { type ParallaxInput, type ParallaxOptions, writeParallaxOffset } from '../parallax';

const _parallaxTarget = new THREE.Vector3();
const _tmpColor = new THREE.Color();

export const HERO_GALAXY_POSITION = new THREE.Vector3(0, 130, -40);

const GALAXY_DISK_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vLocalPos;

  void main() {
    vUv = uv;
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GALAXY_DISK_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uGalaxyType;      // 0.0 = spiral, 1.0 = barred-spiral, 2.0 = elliptical
  uniform float uArms;
  uniform float uArmTightness;
  uniform float uArmSpread;
  uniform float uCoreSize;
  uniform float uEllipticity;
  uniform float uNebulaIntensity;
  uniform float uStarDistribution;
  uniform float uSeed;
  uniform vec3 uCoreColor;
  uniform vec3 uArmColor;
  uniform vec3 uOuterColor;
  uniform vec3 uNebulaColor;

  varying vec2 vUv;

  // mediump-safe hash keeping intermediate values well within float16 dynamic range
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031 + uSeed * 0.0017);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float vnoise(vec2 p) {
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
    float amp = 0.5;
    mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
    for (int i = 0; i < 4; i++) {
      v += amp * vnoise(p);
      p = rot * p * 2.04 + vec2(3.7, 1.9);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    // Centered disk coordinates in [-1.25, 1.25]
    vec2 p = (vUv - 0.5) * 2.5;
    float r = length(p);
    if (r > 1.24 || uOpacity < 0.004) discard;

    // Gentle living rotation
    float rotAng = uTime * (uGalaxyType > 1.5 ? 0.015 : 0.042);
    float ca = cos(rotAng);
    float sa = sin(rotAng);
    vec2 pr = mat2(ca, -sa, sa, ca) * p;

    float edgeFade = 1.0 - smoothstep(0.68, 1.18, r);
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Domain-warped cosmic gas turbulence
    vec2 warp = vec2(
      fbm(pr * 2.8 + vec2(1.4, -0.8) + uTime * 0.01),
      fbm(pr * 2.8 + vec2(-2.1, 2.6) - uTime * 0.008)
    ) - 0.5;
    float gasNoise = fbm(pr * 3.6 + warp * 1.15);
    float fineDust = fbm(pr * 7.8 - warp * 1.45);

    if (uGalaxyType > 1.5) {
      // === ELLIPTICAL GALAXY: smooth triaxial de Vaucouleurs profile ===
      float ax = 1.0 + uEllipticity * 0.24;
      float ay = max(0.32, 1.0 - uEllipticity * 0.44);
      vec2 pe = vec2(pr.x / ax, pr.y / ay);
      float re = length(pe);

      float sersicExp = 0.58 + uStarDistribution * 0.22;
      float coreGlow = exp(-pow(max(0.0001, re / max(0.08, uCoreSize * 0.95)), 1.45));
      float haloGlow = exp(-pow(max(0.0001, re / 0.46), sersicExp)) * 0.62;
      float nebulaVeil = exp(-re * 2.3) * (0.55 + 0.65 * gasNoise) * uNebulaIntensity;

      col += uCoreColor * coreGlow * 0.54;
      col += mix(uArmColor, uOuterColor, smoothstep(0.08, 0.78, re)) * haloGlow * 0.44;
      col += mix(uNebulaColor, uArmColor, 0.35) * nebulaVeil * 0.28;
      alpha = clamp((coreGlow * 0.68 + haloGlow * 0.38 + nebulaVeil * 0.22) * edgeFade, 0.0, 0.82);
    } else {
      // === SPIRAL & BARRED-SPIRAL GALAXY ===
      float theta = atan(pr.y, pr.x);
      float winding = 2.6 + uArmTightness * 4.4;
      float rNorm = clamp(r, 0.0001, 1.2);

      // Subtle bar modulation for barred-spiral morphology (type == 1.0)
      float isBarred = smoothstep(0.4, 0.6, uGalaxyType);
      float barHalfLen = clamp(uCoreSize * 1.45, 0.24, 0.42);
      float barAlong = abs(pr.x) / max(0.08, barHalfLen);
      float barAcross = abs(pr.y) / max(0.04, barHalfLen * (0.24 + 0.1 * (1.0 - min(barAlong, 1.0))));
      float barMask = isBarred * exp(-(barAlong * barAlong * 1.35 + barAcross * barAcross * 2.8));

      // Logarithmic arm phase with bar-tip launch offset for barred spirals
      float rForArm = mix(rNorm, max(0.0, (rNorm - barHalfLen * 0.78) / max(0.2, 1.0 - barHalfLen * 0.78)), isBarred);
      float spiralAngle = theta - pow(max(0.0001, rForArm), 0.84) * winding * mix(1.0, 0.85, isBarred);
      float armPhase = spiralAngle * uArms + warp.x * 1.35;
      float armCos = max(0.0001, 0.5 + 0.5 * cos(armPhase));

      float sharpness = mix(5.8, 1.65, clamp((uArmSpread - 0.08) / 0.57, 0.0, 1.0));
      float armRidge = pow(armCos, sharpness);

      // Concave inner-edge dark dust lane carving crisp separation between spiral arms
      float dustPhase = max(0.0001, 0.5 + 0.5 * cos(armPhase + 0.62));
      float dustLane = pow(dustPhase, 4.2) * (0.45 + 0.55 * fineDust) * smoothstep(0.12, 0.42, rNorm);
      float dustAtten = 1.0 - clamp(dustLane * 0.58 * (0.65 + 0.35 * uNebulaIntensity), 0.0, 0.68);

      // Radial disk envelope controlled by starDistribution
      float radialFalloff = exp(-pow(max(0.0001, rNorm * (1.15 + uStarDistribution * 0.45)), 1.28));
      float outerArmReach = smoothstep(0.07, 0.26, rNorm) * (1.0 - smoothstep(0.62, 1.12, rNorm));
      float barGate = mix(1.0, smoothstep(barHalfLen * 0.65, barHalfLen * 1.05, rNorm), isBarred);

      // Warm central bulge
      float bulgeR = max(0.08, uCoreSize * 0.82);
      float bulgeGlow = exp(-pow(max(0.0001, rNorm / bulgeR), 1.48)) * (1.0 - isBarred * 0.22);

      // Luminous spiral arm plasma + patchy H-II nebula knots along ridge
      float armBody = armRidge * outerArmReach * barGate * (0.45 + 0.82 * gasNoise);
      float h2Knots = pow(max(0.0001, armRidge), 2.2) * smoothstep(0.56, 0.88, fineDust) * outerArmReach * barGate * uNebulaIntensity;

      // Ambient inter-arm nebular mist
      float mist = radialFalloff * (0.28 + 0.72 * gasNoise) * (0.32 + 0.68 * uNebulaIntensity);

      vec3 radialCol = mix(uArmColor, uOuterColor, smoothstep(uCoreSize * 0.9, 0.88, rNorm));
      col += uCoreColor * (bulgeGlow * 0.95 + barMask * 0.82);
      col += radialCol * (armBody * 0.78 + mist * 0.24) * dustAtten;
      col += uNebulaColor * (mist * 0.48 + armBody * 0.32 * uNebulaIntensity) * dustAtten;
      col += mix(uCoreColor, uArmColor, 0.4) * h2Knots * 0.42;

      alpha = clamp(
        (bulgeGlow * 0.82 + barMask * 0.74 + armBody * 0.62 + mist * 0.3 + h2Knots * 0.28) *
          edgeFade *
          mix(0.72, 1.0, dustAtten),
        0.0,
        0.92
      );
    }

    // Soft HDR shoulder so galactic cores stay luminous and cinematic without clipping flat white
    col = col / (1.0 + col * 0.42);
    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`;

const GALAXY_STAR_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute float aScale;
  attribute float aPhase;
  attribute vec3 aColor;
  attribute float aRadius;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uSpinSpeed;
  uniform float uIsElliptical;
  uniform vec3 uParallaxOffset;

  varying vec3 vColor;
  varying float vPhase;
  varying float vScale;
  varying float vOpacity;

  void main() {
    vColor = aColor;
    vPhase = aPhase;
    vScale = aScale;
    vOpacity = uOpacity;

    vec3 pos = position;

    // Differential Keplerian-inspired orbital drift around local galactic Y-axis
    float omega = uSpinSpeed / (0.42 + aRadius * 1.25);
    float angle = uTime * omega * mix(1.0, 0.25, uIsElliptical);
    float ca = cos(angle);
    float sa = sin(angle);
    pos.xz = mat2(ca, -sa, sa, ca) * pos.xz;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    worldPosition.xyz += uParallaxOffset;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    float twinkle = 0.84 + 0.16 * sin(uTime * (1.2 + aPhase * 2.4) + aPhase * 6.2831);
    float dist = max(12.0, -mvPosition.z);
    float sizeScale = mix(104.0, 74.0, uIsElliptical);
    float pointSize = aScale * uPixelRatio * (sizeScale / dist) * twinkle;
    gl_PointSize = clamp(pointSize, 1.05, 14.5);
  }
`;

const GALAXY_STAR_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vPhase;
  varying float vScale;
  varying float vOpacity;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5 || vOpacity < 0.004) discard;

    // Crisp pinpoint Airy core + subtle radial halo
    float core = exp(-d * d * 50.0);
    float halo = exp(-d * d * 11.5) * 0.32;

    // Delicate 4-point telescope diffraction spikes on bright OB supergiants only
    float brightFactor = smoothstep(3.4, 5.4, vScale);
    float spikeH = exp(-abs(uv.y) * 38.0) * exp(-abs(uv.x) * 7.0);
    float spikeV = exp(-abs(uv.x) * 38.0) * exp(-abs(uv.y) * 7.0);
    float spikes = (spikeH + spikeV) * brightFactor * 0.28;

    float intensity = core + halo + spikes;
    vec3 col = mix(vColor, vec3(1.0, 0.97, 0.91), core * 0.36);
    float alpha = clamp(intensity * vOpacity * 0.78, 0.0, 0.92);
    gl_FragColor = vec4(col * intensity * 0.78, alpha);
  }
`;

const GALAXY_NEBULA_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute float aScale;
  attribute float aPhase;
  attribute vec3 aColor;
  attribute float aOpacity;
  attribute float aRadius;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uSpinSpeed;
  uniform float uIsElliptical;
  uniform vec3 uParallaxOffset;

  varying vec3 vColor;
  varying float vPhase;
  varying float vAlpha;
  varying float vCloudRot;

  void main() {
    vColor = aColor;
    vPhase = aPhase;
    vAlpha = aOpacity * uOpacity;
    vCloudRot = aPhase * 6.2831 + uTime * 0.025;

    vec3 pos = position;
    float omega = uSpinSpeed / (0.46 + aRadius * 1.25);
    float angle = uTime * omega * mix(1.0, 0.25, uIsElliptical);
    float ca = cos(angle);
    float sa = sin(angle);
    pos.xz = mat2(ca, -sa, sa, ca) * pos.xz;

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    worldPosition.xyz += uParallaxOffset;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;

    float dist = max(10.0, -mvPosition.z);
    gl_PointSize = clamp(aScale * uPixelRatio * (185.0 / dist), 4.0, 118.0);
  }
`;

const GALAXY_NEBULA_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vPhase;
  varying float vAlpha;
  varying float vCloudRot;

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
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

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5 || vAlpha < 0.003) discard;

    float ca = cos(vCloudRot);
    float sa = sin(vCloudRot);
    vec2 ruv = mat2(ca, -sa, sa, ca) * uv;

    // 3-octave wispy FBM gas texture inside each volumetric cloud puff
    vec2 np = ruv * 4.2 + vec2(vPhase * 11.3, vPhase * 7.1);
    float n = vnoise(np) * 0.56 + vnoise(np * 2.1 + 3.4) * 0.30 + vnoise(np * 4.3 - 1.7) * 0.14;

    float radialFalloff = smoothstep(0.5, 0.06, d);
    float wisp = radialFalloff * radialFalloff * (0.45 + 0.85 * n);
    float alpha = clamp(wisp * vAlpha, 0.0, 0.65);

    vec3 col = vColor * (0.78 + 0.45 * n);
    gl_FragColor = vec4(col, alpha);
  }
`;

function galaxyTypeToFloat(type: GalaxyType): number {
  if (type === 'barred-spiral') return 1.0;
  if (type === 'elliptical') return 2.0;
  return 0.0;
}

/**
 * Single composite procedural galaxy (3 synchronized GPU layers):
 * 1. Analytical FBM volumetric galactic disk & dust-lane core shader mesh
 * 2. 3D Keplerian-orbiting procedural starfield with spectral magnitudes
 * 3. 3D volumetric FBM nebula & H-II star-forming cloud puffs
 */
export class ProceduralGalaxyInstance {
  public readonly root = new THREE.Group();
  public readonly basePos = new THREE.Vector3();
  public readonly depthFactor: number;

  private readonly baseStarCount: number;
  private readonly baseNebulaCount: number;
  private readonly diskGeo: THREE.PlaneGeometry;
  private readonly diskMat: THREE.ShaderMaterial;
  private readonly diskMesh: THREE.Mesh;
  private readonly haloMesh: THREE.Mesh;
  private readonly starMat: THREE.ShaderMaterial;
  private readonly starPoints: THREE.Points;
  private readonly nebulaMat: THREE.ShaderMaterial;
  private readonly nebulaPoints: THREE.Points;

  private currentParams: GalaxyParams;
  private currentStarCount = 0;
  private currentNebulaCount = 0;
  private shaderPrecision: ShaderPrecision;

  constructor(
    params: Partial<GalaxyParams>,
    options: {
      position: readonly [number, number, number];
      tilt: readonly [number, number, number];
      baseStarCount: number;
      baseNebulaCount: number;
      pixelRatio: number;
      depthFactor: number;
      spinSpeed: number;
      shaderPrecision?: ShaderPrecision;
    },
  ) {
    this.shaderPrecision = options.shaderPrecision ?? 'highp';
    this.baseStarCount = options.baseStarCount;
    this.baseNebulaCount = options.baseNebulaCount;
    this.depthFactor = options.depthFactor;
    this.basePos.set(options.position[0], options.position[1], options.position[2]);
    this.root.position.copy(this.basePos);
    this.root.rotation.set(options.tilt[0], options.tilt[1], options.tilt[2]);

    this.currentParams = sanitizeGalaxyParams(params);

    // Layer 1: Analytical volumetric disk + dust lanes + galactic core shader
    this.diskGeo = new THREE.PlaneGeometry(2.55, 2.55);
    this.diskMat = new THREE.ShaderMaterial({
      vertexShader: GALAXY_DISK_VERTEX_SHADER,
      fragmentShader: GALAXY_DISK_FRAGMENT_SHADER,
      precision: this.shaderPrecision,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uGalaxyType: { value: 0 },
        uArms: { value: 4 },
        uArmTightness: { value: 0.72 },
        uArmSpread: { value: 0.24 },
        uCoreSize: { value: 0.22 },
        uEllipticity: { value: 0.42 },
        uNebulaIntensity: { value: 0.92 },
        uStarDistribution: { value: 1.45 },
        uSeed: { value: 1 },
        uCoreColor: { value: new THREE.Color('#fff3d8') },
        uArmColor: { value: new THREE.Color('#e6be78') },
        uOuterColor: { value: new THREE.Color('#5b86e5') },
        uNebulaColor: { value: new THREE.Color('#2d357c') },
      },
    });
    this.diskMesh = new THREE.Mesh(this.diskGeo, this.diskMat);
    this.diskMesh.rotation.x = -Math.PI / 2;
    this.diskMesh.renderOrder = -2;
    this.root.add(this.diskMesh);

    // Cross-plane volumetric halo visible strictly for 3D elliptical spheroids viewed near edge-on
    this.haloMesh = new THREE.Mesh(this.diskGeo, this.diskMat);
    this.haloMesh.renderOrder = -2;
    this.root.add(this.haloMesh);

    // Layer 2: 3D Procedural Starfield with Keplerian differential rotation
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: GALAXY_STAR_VERTEX_SHADER,
      fragmentShader: GALAXY_STAR_FRAGMENT_SHADER,
      precision: this.shaderPrecision,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: options.pixelRatio },
        uOpacity: { value: 0 },
        uSpinSpeed: { value: options.spinSpeed },
        uIsElliptical: { value: 0 },
        uParallaxOffset: { value: new THREE.Vector3() },
      },
    });
    this.starPoints = new THREE.Points(new THREE.BufferGeometry(), this.starMat);
    this.starPoints.frustumCulled = false;
    this.root.add(this.starPoints);

    // Layer 3: 3D Volumetric FBM Nebula Clouds & H-II Emission Knots
    this.nebulaMat = new THREE.ShaderMaterial({
      vertexShader: GALAXY_NEBULA_VERTEX_SHADER,
      fragmentShader: GALAXY_NEBULA_FRAGMENT_SHADER,
      precision: this.shaderPrecision,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: options.pixelRatio },
        uOpacity: { value: 0 },
        uSpinSpeed: { value: options.spinSpeed },
        uIsElliptical: { value: 0 },
        uParallaxOffset: { value: new THREE.Vector3() },
      },
    });
    this.nebulaPoints = new THREE.Points(new THREE.BufferGeometry(), this.nebulaMat);
    this.nebulaPoints.frustumCulled = false;
    this.nebulaPoints.renderOrder = -1;
    this.root.add(this.nebulaPoints);

    this.rebuild(this.currentParams);
  }

  public rebuild(rawParams: Partial<GalaxyParams>): void {
    const params = sanitizeGalaxyParams(rawParams);
    this.currentParams = params;

    const buffers = generateGalaxyBuffers(params, this.baseStarCount, this.baseNebulaCount);
    this.currentStarCount = buffers.starCount;
    this.currentNebulaCount = buffers.nebulaCount;

    // Replace star geometry cleanly
    const prevStarGeo = this.starPoints.geometry;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(buffers.starPositions, 3));
    starGeo.setAttribute('aScale', new THREE.BufferAttribute(buffers.starScales, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(buffers.starPhases, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(buffers.starColors, 3));
    starGeo.setAttribute('aRadius', new THREE.BufferAttribute(buffers.starRadii, 1));
    this.starPoints.geometry = starGeo;
    prevStarGeo.dispose();

    // Replace nebula puff geometry cleanly
    const prevNebGeo = this.nebulaPoints.geometry;
    const nebGeo = new THREE.BufferGeometry();
    nebGeo.setAttribute('position', new THREE.BufferAttribute(buffers.nebulaPositions, 3));
    nebGeo.setAttribute('aScale', new THREE.BufferAttribute(buffers.nebulaScales, 1));
    nebGeo.setAttribute('aPhase', new THREE.BufferAttribute(buffers.nebulaPhases, 1));
    nebGeo.setAttribute('aColor', new THREE.BufferAttribute(buffers.nebulaColors, 3));
    nebGeo.setAttribute('aOpacity', new THREE.BufferAttribute(buffers.nebulaOpacities, 1));
    nebGeo.setAttribute('aRadius', new THREE.BufferAttribute(buffers.nebulaRadii, 1));
    this.nebulaPoints.geometry = nebGeo;
    this.nebulaPoints.visible = buffers.nebulaCount > 0;
    prevNebGeo.dispose();

    // Update analytical disk shader uniforms & scale
    const uDisk = this.diskMat.uniforms;
    if (uDisk.uGalaxyType) uDisk.uGalaxyType.value = galaxyTypeToFloat(params.type);
    if (uDisk.uArms) uDisk.uArms.value = params.arms;
    if (uDisk.uArmTightness) uDisk.uArmTightness.value = params.armTightness;
    if (uDisk.uArmSpread) uDisk.uArmSpread.value = params.armSpread;
    if (uDisk.uCoreSize) uDisk.uCoreSize.value = params.coreSize;
    if (uDisk.uEllipticity) uDisk.uEllipticity.value = params.ellipticity;
    if (uDisk.uNebulaIntensity) uDisk.uNebulaIntensity.value = params.nebulaIntensity;
    if (uDisk.uStarDistribution) uDisk.uStarDistribution.value = params.starDistribution;
    if (uDisk.uSeed) uDisk.uSeed.value = params.seed % 997;

    if (uDisk.uCoreColor) (uDisk.uCoreColor.value as THREE.Color).set(params.coreColor);
    if (uDisk.uArmColor) (uDisk.uArmColor.value as THREE.Color).set(params.armColor);
    if (uDisk.uOuterColor) (uDisk.uOuterColor.value as THREE.Color).set(params.outerColor);
    if (uDisk.uNebulaColor) (uDisk.uNebulaColor.value as THREE.Color).set(params.nebulaColor);

    this.diskMesh.scale.set(params.size, params.size, 1);

    const isElliptical = params.type === 'elliptical';
    this.haloMesh.visible = isElliptical;
    if (isElliptical) {
      this.haloMesh.scale.set(params.size * 0.94, params.size * (0.92 - params.ellipticity * 0.32), 1);
    }

    const ellFlag = isElliptical ? 1.0 : 0.0;
    if (this.starMat.uniforms.uIsElliptical) this.starMat.uniforms.uIsElliptical.value = ellFlag;
    if (this.nebulaMat.uniforms.uIsElliptical) this.nebulaMat.uniforms.uIsElliptical.value = ellFlag;
  }

  public update(elapsed: number, opacity: number): void {
    const isEll = this.currentParams.type === 'elliptical';
    const wrappedTime = elapsed % 600;
    if (this.diskMat.uniforms.uTime) this.diskMat.uniforms.uTime.value = wrappedTime;
    if (this.diskMat.uniforms.uOpacity) this.diskMat.uniforms.uOpacity.value = opacity * (isEll ? 0.54 : 0.78);
    if (this.starMat.uniforms.uTime) this.starMat.uniforms.uTime.value = wrappedTime;
    if (this.starMat.uniforms.uOpacity) this.starMat.uniforms.uOpacity.value = opacity * (isEll ? 0.78 : 0.96);
    if (this.nebulaMat.uniforms.uTime) this.nebulaMat.uniforms.uTime.value = wrappedTime;
    if (this.nebulaMat.uniforms.uOpacity) this.nebulaMat.uniforms.uOpacity.value = opacity * (isEll ? 0.55 : 0.82);
  }

  public setPixelRatio(pixelRatio: number): void {
    if (this.starMat.uniforms.uPixelRatio) {
      this.starMat.uniforms.uPixelRatio.value = pixelRatio;
    }
    if (this.nebulaMat.uniforms.uPixelRatio) {
      this.nebulaMat.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  public setShaderPrecision(precision: ShaderPrecision): void {
    if (this.shaderPrecision === precision) return;
    this.shaderPrecision = precision;
    this.diskMat.precision = precision;
    this.diskMat.needsUpdate = true;
    this.starMat.precision = precision;
    this.starMat.needsUpdate = true;
    this.nebulaMat.precision = precision;
    this.nebulaMat.needsUpdate = true;
  }

  public applyParallax(input: ParallaxInput, damp: number, options: ParallaxOptions): void {
    if (this.depthFactor <= 0) return;
    writeParallaxOffset(_parallaxTarget, input, this.depthFactor, options);
    _parallaxTarget.add(this.basePos);
    this.root.position.lerp(_parallaxTarget, damp);
  }

  public getParams(): GalaxyParams {
    return this.currentParams;
  }

  public getStarCount(): number {
    return this.currentStarCount;
  }

  public getNebulaCount(): number {
    return this.currentNebulaCount;
  }

  public dispose(): void {
    this.diskGeo.dispose();
    this.diskMat.dispose();
    this.starPoints.geometry.dispose();
    this.starMat.dispose();
    this.nebulaPoints.geometry.dispose();
    this.nebulaMat.dispose();
  }
}

/**
 * Orchestrates both:
 * 1. Five distinct, cohesive procedural galaxies (grand spiral, barred spiral,
 *    giant elliptical) integrated continuously along the film's cosmic corridor.
 * 2. A dedicated live-editable Hero Showcase Galaxy in an unobstructed deep-space
 *    sanctuary for real-time inspection of type, size, color, density, distribution,
 *    and volumetric nebulae.
 */
export class ProceduralGalaxySystem {
  public readonly root = new THREE.Group();
  public readonly corridorGalaxies: ProceduralGalaxyInstance[] = [];
  public readonly heroGalaxy: ProceduralGalaxyInstance;

  private heroFocusWeight = 0;
  private heroFocusTarget = false;
  private heroParams: GalaxyParams;

  constructor(isMobile: boolean, pixelRatio: number, shaderPrecision: ShaderPrecision = 'highp') {
    const scaleFactor = isMobile ? 0.6 : 1.0;

    // Curated 5-galaxy ensemble across the film corridor (distinct morphologies, cohesive palette)
    const corridorSpecs: Array<{
      params: Partial<GalaxyParams>;
      position: [number, number, number];
      tilt: [number, number, number];
      depth: number;
      spin: number;
    }> = [
      {
        // Prologue upper-left: Grand-Design Champagne & Sapphire 3-arm Spiral
        params: {
          ...DEFAULT_HERO_GALAXY_PARAMS,
          type: 'spiral',
          size: 24,
          arms: 3,
          armTightness: 0.78,
          armSpread: 0.22,
          starDensity: 1.0,
          starDistribution: 1.45,
          nebulaIntensity: 0.9,
          colorPreset: 'champagne-sapphire',
          seed: 1001,
        },
        position: [-44, 21, -50],
        tilt: [0.66, 0.24, -0.32],
        depth: 0.12,
        spin: 0.055,
      },
      {
        // Chapter I / II right flank: Barred Amethyst & Ember Spiral
        params: {
          ...DEFAULT_HERO_GALAXY_PARAMS,
          type: 'barred-spiral',
          size: 26,
          arms: 2,
          armTightness: 0.68,
          armSpread: 0.24,
          coreSize: 0.27,
          nebulaIntensity: 0.95,
          colorPreset: 'amethyst-ember',
          coreColor: GALAXY_COLOR_PALETTES['amethyst-ember'].coreColor,
          armColor: GALAXY_COLOR_PALETTES['amethyst-ember'].armColor,
          outerColor: GALAXY_COLOR_PALETTES['amethyst-ember'].outerColor,
          nebulaColor: GALAXY_COLOR_PALETTES['amethyst-ember'].nebulaColor,
          seed: 2002,
        },
        position: [52, -16, -188],
        tilt: [0.88, -0.38, 0.34],
        depth: 0.17,
        spin: -0.048,
      },
      {
        // Chapter III deep background: Giant Ancient-Gold Triaxial Elliptical
        params: {
          ...DEFAULT_HERO_GALAXY_PARAMS,
          type: 'elliptical',
          size: 23,
          ellipticity: 0.44,
          starDensity: 0.95,
          starDistribution: 1.72,
          coreSize: 0.28,
          nebulaIntensity: 0.82,
          colorPreset: 'ancient-gold',
          coreColor: GALAXY_COLOR_PALETTES['ancient-gold'].coreColor,
          armColor: GALAXY_COLOR_PALETTES['ancient-gold'].armColor,
          outerColor: GALAXY_COLOR_PALETTES['ancient-gold'].outerColor,
          nebulaColor: GALAXY_COLOR_PALETTES['ancient-gold'].nebulaColor,
          seed: 3003,
        },
        position: [-50, -14, -298],
        tilt: [0.42, 0.32, 0.28],
        depth: 0.14,
        spin: 0.02,
      },
      {
        // Chapter IV / V distant horizon: Celestial-Azure 4-Arm Tight Spiral
        params: {
          ...DEFAULT_HERO_GALAXY_PARAMS,
          type: 'spiral',
          size: 28,
          arms: 4,
          armTightness: 0.96,
          armSpread: 0.19,
          nebulaIntensity: 0.88,
          colorPreset: 'celestial-azure',
          coreColor: GALAXY_COLOR_PALETTES['celestial-azure'].coreColor,
          armColor: GALAXY_COLOR_PALETTES['celestial-azure'].armColor,
          outerColor: GALAXY_COLOR_PALETTES['celestial-azure'].outerColor,
          nebulaColor: GALAXY_COLOR_PALETTES['celestial-azure'].nebulaColor,
          seed: 4004,
        },
        position: [48, 22, -412],
        tilt: [0.74, -0.22, -0.35],
        depth: 0.15,
        spin: 0.05,
      },
      {
        // Final Chapter deep space: Monumental Champagne-Sapphire Grand Spiral
        params: {
          ...DEFAULT_HERO_GALAXY_PARAMS,
          type: 'spiral',
          size: 35,
          arms: 4,
          armTightness: 0.72,
          armSpread: 0.25,
          nebulaIntensity: 0.92,
          colorPreset: 'champagne-sapphire',
          seed: 5005,
        },
        position: [-46, 26, -548],
        tilt: [0.72, 0.34, 0.22],
        depth: 0.13,
        spin: -0.042,
      },
    ];

    const corridorStarBase = Math.round(1600 * scaleFactor);
    const corridorNebulaBase = Math.round(64 * scaleFactor);

    corridorSpecs.forEach((spec) => {
      const inst = new ProceduralGalaxyInstance(spec.params, {
        position: spec.position,
        tilt: spec.tilt,
        baseStarCount: corridorStarBase,
        baseNebulaCount: corridorNebulaBase,
        pixelRatio,
        depthFactor: spec.depth,
        spinSpeed: spec.spin,
        shaderPrecision,
      });
      this.corridorGalaxies.push(inst);
      this.root.add(inst.root);
    });

    // Dedicated Hero Interactive Showcase Galaxy in unobstructed deep-space sanctuary
    this.heroParams = sanitizeGalaxyParams(DEFAULT_HERO_GALAXY_PARAMS);
    this.heroGalaxy = new ProceduralGalaxyInstance(this.heroParams, {
      position: [HERO_GALAXY_POSITION.x, HERO_GALAXY_POSITION.y, HERO_GALAXY_POSITION.z],
      tilt: [0.64, 0.18, -0.14],
      baseStarCount: Math.round(6200 * scaleFactor),
      baseNebulaCount: Math.round(240 * scaleFactor),
      pixelRatio,
      depthFactor: 0,
      spinSpeed: 0.068,
      shaderPrecision: 'highp',
    });
    this.heroGalaxy.root.visible = false;
    this.root.add(this.heroGalaxy.root);
  }

  public setHeroParams(rawParams: Partial<GalaxyParams>): void {
    const next = sanitizeGalaxyParams(rawParams);
    this.heroParams = next;
    this.heroGalaxy.rebuild(next);

    // Also mirror the user's custom parameters onto the opening Prologue corridor galaxy
    // (scaled gracefully to fit the corridor) so their creation lives organically in the film!
    const firstCorridor = this.corridorGalaxies[0];
    if (firstCorridor) {
      firstCorridor.rebuild({
        ...next,
        size: Math.min(34, Math.max(16, next.size * 0.85)),
      });
    }
  }

  public setHeroFocus(active: boolean): void {
    this.heroFocusTarget = active;
    if (active) {
      // Snap focus weight immediately when entering inspection so Hero Galaxy appears crisply at full framing
      this.heroFocusWeight = 1;
    }
  }

  public isHeroFocusActive(): boolean {
    return this.heroFocusTarget;
  }

  public getHeroFocusWeight(): number {
    return this.heroFocusWeight;
  }

  public getHeroParams(): GalaxyParams {
    return this.heroParams;
  }

  public getTotalStarCount(): number {
    let total = this.heroGalaxy.getStarCount();
    for (const g of this.corridorGalaxies) {
      total += g.getStarCount();
    }
    return total;
  }

  public update(
    elapsed: number,
    delta: number,
    corridorVisibility: number,
    pointerX: number,
    pointerY: number,
  ): void {
    const focusAlpha = 1 - Math.exp(-5.0 * Math.min(delta, 0.1));
    this.heroFocusWeight = THREE.MathUtils.lerp(
      this.heroFocusWeight,
      this.heroFocusTarget ? 1 : 0,
      focusAlpha,
    );

    // Corridor galaxies remain softly visible during the film and dim gracefully during isolated inspection
    const corridorOp = corridorVisibility * (1 - this.heroFocusWeight * 0.85);
    for (const g of this.corridorGalaxies) {
      g.root.visible = corridorOp > 0.01;
      if (g.root.visible) {
        g.update(elapsed, corridorOp);
      }
    }

    // Hero Showcase Galaxy: gentle interactive 3D tilt + living Keplerian rotation
    this.heroGalaxy.root.visible = this.heroFocusWeight > 0.01;
    if (this.heroGalaxy.root.visible) {
      const targetTiltX =
        (this.heroParams.type === 'elliptical' ? 0.34 : 0.64) + pointerY * 0.36;
      const targetTiltZ = -0.14 - pointerX * 0.28;
      this.heroGalaxy.root.rotation.x = THREE.MathUtils.lerp(
        this.heroGalaxy.root.rotation.x,
        targetTiltX,
        focusAlpha,
      );
      this.heroGalaxy.root.rotation.z = THREE.MathUtils.lerp(
        this.heroGalaxy.root.rotation.z,
        targetTiltZ,
        focusAlpha,
      );
      this.heroGalaxy.root.rotation.y += delta * 0.032;
      this.heroGalaxy.update(elapsed, this.heroFocusWeight);
    }
  }

  public applyParallax(input: ParallaxInput, damp: number, options: ParallaxOptions): void {
    for (const g of this.corridorGalaxies) {
      g.applyParallax(input, damp, options);
    }
  }

  public setPixelRatio(pixelRatio: number): void {
    for (const g of this.corridorGalaxies) {
      g.setPixelRatio(pixelRatio);
    }
    this.heroGalaxy.setPixelRatio(pixelRatio);
  }

  public setShaderPrecision(precision: ShaderPrecision): void {
    for (const g of this.corridorGalaxies) {
      g.setShaderPrecision(precision);
    }
  }

  public getHeroDominantColor(out: THREE.Color): THREE.Color {
    return out.copy(_tmpColor.set(this.heroParams.armColor));
  }

  public dispose(): void {
    for (const g of this.corridorGalaxies) {
      g.dispose();
    }
    this.heroGalaxy.dispose();
  }
}
