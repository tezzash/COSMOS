import * as THREE from 'three';
import { type CosmicDriftState, computeCosmicDriftState } from '../cosmicDrift';
import { type ShaderPrecision } from '../deviceProfile';
import { type ParallaxInput, type ParallaxOptions, writeParallaxOffset } from '../parallax';

const COSMIC_DRIFT_VERTEX_SHADER = /* glsl */ `
  precision highp float;
  attribute float aDepth;
  attribute float aScale;
  attribute float aPhase;
  attribute vec3 aColor;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  uniform float uWarmth;
  uniform vec3 uCameraPos;
  uniform vec3 uScrollOffset;
  uniform vec3 uParallaxOffset;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Wrap seamlessly inside a wide 3D volume centered on the moving camera so the
    // slow parallax-scrolling drift persists continuously across all 7 chapters
    vec3 boxSize = vec3(148.0, 88.0, 140.0);
    float parallaxWeight = mix(0.24, 1.0, aDepth);
    vec3 shifted = position + uScrollOffset * parallaxWeight + uParallaxOffset * parallaxWeight - uCameraPos;
    vec3 wrapped = mod(shifted + boxSize * 0.5, boxSize) - boxSize * 0.5;
    vec3 worldPos = wrapped + uCameraPos;

    // Gentle volume-boundary fade so wrapping stars materialize & vanish invisibly
    vec3 normEdge = abs(wrapped) / (boxSize * 0.5);
    float edgeFade =
      (1.0 - smoothstep(0.76, 1.0, normEdge.x)) *
      (1.0 - smoothstep(0.76, 1.0, normEdge.y)) *
      (1.0 - smoothstep(0.76, 1.0, normEdge.z));

    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    float dist = -mvPosition.z;
    float nearFade = smoothstep(8.0, 22.0, dist);
    float farFade = 1.0 - smoothstep(56.0, 74.0, dist);

    // Subtle astronomical breath scintillation
    float twinkle = 0.72 + 0.28 * sin(uTime * 0.9 + aPhase * 6.283185);

    // Subtle chapter color-temperature shift (cool cosmic silver <-> warm golden-ivory)
    vec3 coolTint = vec3(0.84, 0.91, 1.0);
    vec3 warmTint = vec3(1.0, 0.93, 0.80);
    vColor = aColor * mix(coolTint, warmTint, uWarmth);
    vAlpha = twinkle * edgeFade * nearFade * farFade * uOpacity * mix(0.45, 0.92, aDepth);

    float safeDist = max(10.0, dist);
    gl_PointSize = clamp(aScale * uPixelRatio * (88.0 / safeDist), 1.1, 6.4);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const COSMIC_DRIFT_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    if (vAlpha < 0.004) discard;
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;

    // Razor-sharp astronomical pinpoint core with ultra-restrained halo (preserves obsidian void)
    float core = exp(-d * d * 112.0);
    float halo = pow(max(0.0001, 1.0 - d * 2.0), 4.8) * 0.16;
    float intensity = core + halo;

    vec3 col = mix(vColor, vec3(1.0, 0.985, 0.96), clamp(core * 0.65, 0.0, 1.0));
    gl_FragColor = vec4(col * intensity * 0.78, clamp(intensity * vAlpha, 0.0, 0.74));
  }
`;

const _driftParallaxTarget = new THREE.Vector3();

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Subtle 'Cosmic Drift' background layer:
 * A slow, multi-depth parallax-scrolling starfield wrapping smoothly around the camera
 * whose opacity and color warmth breathe dynamically with `filmTime`.
 */
export class CosmicDriftField {
  public readonly root = new THREE.Group();
  public readonly starCount: number;

  private readonly mat: THREE.ShaderMaterial;
  private readonly geometry: THREE.BufferGeometry;
  private shaderPrecision: ShaderPrecision;
  private lastState: CosmicDriftState = {
    opacity: 0,
    scrollX: 0,
    scrollY: 0,
    scrollZ: 0,
    warmth: 0.2,
  };

  constructor(isMobile: boolean, pixelRatio: number, shaderPrecision: ShaderPrecision = 'highp') {
    this.shaderPrecision = shaderPrecision;
    const count = isMobile ? 600 : 1100;
    this.starCount = count;
    const rand = seededRandom(11252026);

    const positions = new Float32Array(count * 3);
    const depths = new Float32Array(count);
    const scales = new Float32Array(count);
    const phases = new Float32Array(count);
    const colors = new Float32Array(count * 3);

    const palette = [
      new THREE.Color('#dbe8ff'),
      new THREE.Color('#b6ceff'),
      new THREE.Color('#fff5e4'),
      new THREE.Color('#e8d4ad'),
      new THREE.Color('#c7beff'),
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 148.0;
      positions[i * 3 + 1] = (rand() - 0.5) * 88.0;
      positions[i * 3 + 2] = (rand() - 0.5) * 140.0;

      // Stratified depth distribution for clear parallax layering
      depths[i] = 0.2 + Math.pow(rand(), 1.15) * 0.8;
      scales[i] = 0.95 + Math.pow(rand(), 2.4) * 1.95;
      phases[i] = rand();

      const c = palette[Math.floor(rand() * palette.length)];
      if (c) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
    this.geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    this.mat = new THREE.ShaderMaterial({
      vertexShader: COSMIC_DRIFT_VERTEX_SHADER,
      fragmentShader: COSMIC_DRIFT_FRAGMENT_SHADER,
      precision: shaderPrecision,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uWarmth: { value: 0.2 },
        uCameraPos: { value: new THREE.Vector3(0, 0.3, 18) },
        uScrollOffset: { value: new THREE.Vector3() },
        uParallaxOffset: { value: new THREE.Vector3() },
      },
    });

    const points = new THREE.Points(this.geometry, this.mat);
    points.frustumCulled = false;
    points.renderOrder = -6;
    this.root.add(points);
  }

  public update(
    filmTime: number,
    elapsed: number,
    delta: number,
    hasEntered: boolean,
    reducedMotion: boolean,
    parallaxInput: ParallaxInput,
    parallaxOptions: ParallaxOptions,
  ): void {
    const state = computeCosmicDriftState(filmTime, elapsed, hasEntered, reducedMotion);
    this.lastState = state;

    const damp = 1 - Math.exp(-4.5 * Math.min(delta, 0.1));
    const u = this.mat.uniforms;
    if (u.uTime) u.uTime.value = elapsed % 628.3185;
    if (u.uOpacity) {
      u.uOpacity.value = THREE.MathUtils.lerp(u.uOpacity.value as number, state.opacity, damp);
    }
    if (u.uWarmth) {
      u.uWarmth.value = THREE.MathUtils.lerp(u.uWarmth.value as number, state.warmth, damp);
    }

    if (u.uCameraPos) {
      (u.uCameraPos.value as THREE.Vector3).set(
        parallaxInput.cameraPos.x,
        parallaxInput.cameraPos.y,
        parallaxInput.cameraPos.z,
      );
    }
    if (u.uScrollOffset) {
      (u.uScrollOffset.value as THREE.Vector3).set(state.scrollX, state.scrollY, state.scrollZ);
    }

    writeParallaxOffset(_driftParallaxTarget, parallaxInput, 0.42, parallaxOptions);
    if (u.uParallaxOffset) {
      (u.uParallaxOffset.value as THREE.Vector3).lerp(_driftParallaxTarget, damp);
    }
  }

  public setPixelRatio(pixelRatio: number): void {
    if (this.mat.uniforms.uPixelRatio) {
      this.mat.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  public setShaderPrecision(precision: ShaderPrecision): void {
    if (this.shaderPrecision === precision) return;
    this.shaderPrecision = precision;
    this.mat.precision = precision;
    this.mat.needsUpdate = true;
  }

  public getState(): CosmicDriftState {
    return this.lastState;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.mat.dispose();
  }
}
