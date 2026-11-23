import * as THREE from 'three';

/**
 * Dedicated Screen-Space Chromatic Aberration Post-Processing Pass.
 * Simulates high-end anamorphic cinema glass (Panavision / IMAX 70mm):
 * - Center focal zone (inner ~45% radius) stays optically razor-sharp with zero color fringing.
 * - Peripheral edges exhibit smooth cubic radial RGB spectral dispersion (red pushed slightly
 *   outward, blue pulled subtly inward, green anchored) plus delicate tangential prism falloff,
 *   adding genuine physical lens depth without washing out or over-brightening the frame.
 */
export const CHROMATIC_ABERRATION_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uAspect: { value: 16 / 9 },
    uIntensity: { value: 0.0042 },
    uRadialFalloff: { value: 2.35 },
    uPeripheralDepth: { value: 0.16 },
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
    uniform float uIntensity;
    uniform float uRadialFalloff;
    uniform float uPeripheralDepth;

    varying vec2 vUv;

    void main() {
      vec2 centered = vUv - vec2(0.5);
      // Aspect-corrected radial distance from optical center
      vec2 aspectVec = vec2(centered.x * uAspect, centered.y);
      float r = length(aspectVec);

      // Keep the central focal sweet-spot pristine; ramp lateral chromatic dispersion toward edges
      float edgeMask = pow(smoothstep(0.18, 0.92, r), uRadialFalloff);
      vec2 dir = r > 0.0001 ? normalize(aspectVec) : vec2(0.0);
      vec2 uvDir = vec2(dir.x / max(uAspect, 0.001), dir.y);

      float shift = uIntensity * edgeMask;

      // 5-tap spectral lens dispersion (R, warm-RG, G, cool-GB, B) for smooth cinema glass fringing
      // rather than harsh 3-channel RGB splitting
      vec2 uvR  = clamp(vUv + uvDir * (shift * 1.15), vec2(0.001), vec2(0.999));
      vec2 uvRG = clamp(vUv + uvDir * (shift * 0.55), vec2(0.001), vec2(0.999));
      vec2 uvG  = vUv;
      vec2 uvGB = clamp(vUv - uvDir * (shift * 0.55), vec2(0.001), vec2(0.999));
      vec2 uvB  = clamp(vUv - uvDir * (shift * 1.15), vec2(0.001), vec2(0.999));

      vec3 sR  = texture2D(tDiffuse, uvR).rgb;
      vec3 sRG = texture2D(tDiffuse, uvRG).rgb;
      vec3 sG  = texture2D(tDiffuse, uvG).rgb;
      vec3 sGB = texture2D(tDiffuse, uvGB).rgb;
      vec3 sB  = texture2D(tDiffuse, uvB).rgb;

      vec3 col;
      col.r = sR.r * 0.65 + sRG.r * 0.35;
      col.g = sRG.g * 0.2 + sG.g * 0.6 + sGB.g * 0.2;
      col.b = sGB.b * 0.35 + sB.b * 0.65;

      // Subtle peripheral lens shading (adds optical depth without crushing stars)
      float edgeShade = 1.0 - edgeMask * uPeripheralDepth;
      col *= edgeShade;

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};
