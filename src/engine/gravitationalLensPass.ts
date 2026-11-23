import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { GravitationalLensState } from './gravitationalLens';

/**
 * Dedicated 'Gravitational Lens' Post-Processing Shader Pass.
 * Simulates Schwarzschild thin-lens light deflection around a transiting massive
 * object during chapter transitions:
 * - Radially bends surrounding starlight around a smooth Einstein radius
 * - Applies delicate tangential gravitational shear & micro-dispersion along the warp ring
 * - Paints an ultra-subtle golden-sapphire Einstein caustic shimmer strictly during transitions
 * - Zero-cost fast bypass when mid-chapter (`uStrength < 0.002`)
 */
export const GRAVITATIONAL_LENS_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAspect: { value: 16 / 9 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0.0 },
    uEinsteinRadius: { value: 0.18 },
    uDispersion: { value: 0.0 },
    uRingGlint: { value: 0.0 },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAspect;
    uniform vec2 uCenter;
    uniform float uStrength;
    uniform float uEinsteinRadius;
    uniform float uDispersion;
    uniform float uRingGlint;
    uniform float uTime;

    varying vec2 vUv;

    void main() {
      if (uStrength < 0.002) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }

      vec2 delta = vUv - uCenter;
      vec2 aspectDelta = vec2(delta.x * uAspect, delta.y);
      float r = length(aspectDelta);
      vec2 dir = r > 0.0001 ? aspectDelta / r : vec2(0.0);
      vec2 tangent = vec2(-dir.y, dir.x);

      // Smooth Schwarzschild thin-lens deflection profile peaking near Einstein radius
      float re = max(0.06, uEinsteinRadius);
      float coreGuard = smoothstep(0.015, re * 0.65, r);
      float outerFalloff = 1.0 - smoothstep(re * 1.65, 0.96, r);
      float deflection =
        (uStrength * 0.048 * re * re) / (r * r + re * re * 0.36) * coreGuard * outerFalloff;

      // Delicate rotational frame-dragging (Kerr swirl) along the Einstein ring
      float ringDelta = (r - re) / max(0.04, re * 0.42);
      float ringBand = exp(-(ringDelta * ringDelta));
      float frameDrag = uStrength * 0.0075 * ringBand;

      vec2 radialUvOffset = vec2(dir.x / max(uAspect, 0.001), dir.y) * deflection;
      vec2 swirlUvOffset = vec2(tangent.x / max(uAspect, 0.001), tangent.y) * frameDrag;
      vec2 warpedUv = vUv - radialUvOffset + swirlUvOffset;

      // Subtle gravitational micro-dispersion along the deflected light path
      vec2 dispVec = vec2(dir.x / max(uAspect, 0.001), dir.y) * (uDispersion * (0.4 + ringBand * 1.4));
      vec2 uvR = clamp(warpedUv + dispVec, vec2(0.001), vec2(0.999));
      vec2 uvG = clamp(warpedUv, vec2(0.001), vec2(0.999));
      vec2 uvB = clamp(warpedUv - dispVec, vec2(0.001), vec2(0.999));

      vec3 col = vec3(
        texture2D(tDiffuse, uvR).r,
        texture2D(tDiffuse, uvG).g,
        texture2D(tDiffuse, uvB).b
      );

      // Subtle animated Einstein-ring gravitational caustic shimmer
      float angle = atan(aspectDelta.y, aspectDelta.x);
      float causticArc = 0.65 + 0.35 * sin(angle * 2.0 + uTime * 0.85);
      float sharpDelta = (r - re) / 0.014;
      float softDelta = (r - re) / 0.055;
      float sharpRing = exp(-(sharpDelta * sharpDelta));
      float softHalo = exp(-(softDelta * softDelta)) * 0.32;
      vec3 causticColor = mix(vec3(0.55, 0.78, 1.0), vec3(0.98, 0.82, 0.50), causticArc);
      col += causticColor * (sharpRing + softHalo) * uRingGlint * causticArc;

      col = vec3(
        col.r >= 0.0 ? col.r : 0.0,
        col.g >= 0.0 ? col.g : 0.0,
        col.b >= 0.0 ? col.b : 0.0
      );
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class GravitationalLensPass extends ShaderPass {
  constructor(aspect = 16 / 9) {
    super(GRAVITATIONAL_LENS_SHADER);
    if (this.uniforms.uAspect) {
      this.uniforms.uAspect.value = aspect;
    }
  }

  public setAspect(aspect: number): void {
    if (this.uniforms.uAspect) {
      this.uniforms.uAspect.value = aspect;
    }
  }

  public applyState(state: GravitationalLensState, elapsed: number): void {
    if (this.uniforms.uStrength) this.uniforms.uStrength.value = state.strength;
    if (this.uniforms.uEinsteinRadius) this.uniforms.uEinsteinRadius.value = state.einsteinRadius;
    if (this.uniforms.uCenter) {
      (this.uniforms.uCenter.value as THREE.Vector2).set(state.centerX, state.centerY);
    }
    if (this.uniforms.uDispersion) this.uniforms.uDispersion.value = state.dispersion;
    if (this.uniforms.uRingGlint) this.uniforms.uRingGlint.value = state.ringGlint;
    if (this.uniforms.uTime) this.uniforms.uTime.value = elapsed;
  }
}
