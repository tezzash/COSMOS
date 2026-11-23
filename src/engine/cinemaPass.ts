import * as THREE from 'three';

/**
 * Procedurally generates a subtle optical lens micro-dust & ultra-fine coating
 * scratch texture (512x512). Completely invisible in dark space and illuminated
 * exclusively when a high-intensity HDR light source (Sun, singularity photon
 * ring, or supernova) crosses the camera optical axis.
 */
export function createLensDustTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    let s = 70702002;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    ctx.globalCompositeOperation = 'lighter';

    // Subtle defocused optical bokeh dust specks across lens elements
    for (let i = 0; i < 95; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const r = 2.5 + Math.pow(rand(), 2.2) * 18.0;
      const alpha = 0.04 + rand() * 0.12;
      const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 246, 232, ${alpha * 0.5})`);
      grad.addColorStop(0.72, `rgba(255, 244, 224, ${alpha})`);
      grad.addColorStop(0.92, `rgba(210, 224, 255, ${alpha * 0.55})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ultra-fine anamorphic lens coating micro-scratches
    for (let i = 0; i < 18; i++) {
      const x1 = rand() * size;
      const y1 = rand() * size;
      const len = 18 + rand() * 58;
      const ang = (rand() - 0.5) * Math.PI;
      const x2 = x1 + Math.cos(ang) * len;
      const y2 = y1 + Math.sin(ang) * len;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      const a = 0.04 + rand() * 0.08;
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(245, 238, 224, ${a})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.65 + rand() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Hollywood Studio 70mm IMAX Cinema Optics Post-Processing Pass:
 * 1. Relativistic gravitational lensing (Einstein-ring starlight warp & subtle photon glint)
 * 2. Shallow-focus 70mm peripheral bokeh + silky S-curve optical focal rack transitions
 * 3. Restrained Kodak 70mm highlight halation (strictly gated above specular threshold)
 * 4. Anamorphic 70mm horizontal streak flares + flare-triggered physical optical lens
 *    micro-dust & inverted multi-element hexagonal aperture ghosts
 * 5. Shadow-only temporal blue-noise-dithered 35mm celluloid grain & theatrical vignette
 */
export const CINEMA_OPTICS_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tLensDust: { value: null as THREE.Texture | null },
    uHasLensDust: { value: 0.0 },
    uTime: { value: 0 },
    uFrameIndex: { value: 0 },
    uAspect: { value: 16 / 9 },
    uLensCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uLensStrength: { value: 0.0 },
    uFlareCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uFlareColor: { value: new THREE.Color('#f2cd86') },
    uAnamorphicIntensity: { value: 0.16 },
    uBokehStrength: { value: 0.22 },
    uFocalRack: { value: 0.0 },
    uHalationStrength: { value: 0.10 },
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
    uniform sampler2D tLensDust;
    uniform float uHasLensDust;
    uniform float uTime;
    uniform float uFrameIndex;
    uniform float uAspect;
    uniform vec2 uLensCenter;
    uniform float uLensStrength;
    uniform vec2 uFlareCenter;
    uniform vec3 uFlareColor;
    uniform float uAnamorphicIntensity;
    uniform float uBokehStrength;
    uniform float uFocalRack;
    uniform float uHalationStrength;

    varying vec2 vUv;

    // Temporal Blue-Noise / Interleaved Gradient Noise (Jimenez 2014) for organic 35mm shadow grain
    float interleavedGradientNoise(vec2 fragCoord, float frameIdx) {
      vec2 p = fragCoord + vec2(5.588238 * mod(frameIdx, 64.0), 7.129412 * mod(frameIdx, 64.0));
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }

    // Soft 6-blade hexagonal optical aperture disc for inverted multi-element lens ghosts
    float hexAperture(vec2 p, float radius) {
      vec2 q = abs(p);
      float hex = max(q.x * 0.866025 + q.y * 0.5, q.y);
      float fill = smoothstep(radius, radius * 0.28, hex);
      float rimDelta = (hex - radius * 0.84) / max(0.004, radius * 0.16);
      float rim = exp(-(rimDelta * rimDelta)) * 0.65;
      return fill * 0.45 + rim;
    }

    void main() {
      vec2 uv = vUv;

      // 1. Relativistic Gravitational Lensing (Einstein-ring radial light bending)
      float photonGlint = 0.0;
      if (uLensStrength > 0.005) {
        vec2 delta = uv - uLensCenter;
        vec2 aspectDelta = vec2(delta.x * uAspect, delta.y);
        float dist = length(aspectDelta);
        float rEinstein = 0.135;
        float warp = (uLensStrength * 0.022) / (dist * dist + 0.018);
        warp *= smoothstep(0.025, 0.12, dist) * (1.0 - smoothstep(0.32, 0.72, dist));
        vec2 dir = dist > 0.0001 ? normalize(aspectDelta) : vec2(0.0);
        uv -= vec2(dir.x / uAspect, dir.y) * warp;

        float ringDiff = abs(dist - rEinstein);
        photonGlint = exp(-ringDiff * ringDiff * 1100.0) * uLensStrength * 0.14;
      }

      vec2 safeUv = clamp(uv, vec2(0.001), vec2(0.999));
      vec3 col = texture2D(tDiffuse, safeUv).rgb;

      // 2. 70mm Shallow-Focus Peripheral Bokeh + Silky S-Curve Optical Focal Rack
      vec2 fromCenter = safeUv - vec2(0.5);
      float edgeDist = length(fromCenter);
      float rackBlur = uFocalRack * 0.0024 * smoothstep(0.08, 0.72, edgeDist);
      float edgeBlur = smoothstep(0.40, 0.85, edgeDist) * uBokehStrength * 0.0032 + rackBlur;
      if (edgeBlur > 0.0002) {
        vec3 bokehSum = col * 0.48;
        bokehSum += texture2D(tDiffuse, clamp(safeUv + vec2(edgeBlur / uAspect, edgeBlur * 0.5), 0.001, 0.999)).rgb * 0.13;
        bokehSum += texture2D(tDiffuse, clamp(safeUv + vec2(-edgeBlur / uAspect, edgeBlur * 0.5), 0.001, 0.999)).rgb * 0.13;
        bokehSum += texture2D(tDiffuse, clamp(safeUv + vec2(0.0, -edgeBlur), 0.001, 0.999)).rgb * 0.13;
        bokehSum += texture2D(tDiffuse, clamp(safeUv + vec2(0.0, edgeBlur), 0.001, 0.999)).rgb * 0.13;
        col = mix(col, bokehSum, 0.65);
      }

      // 3. Restrained Kodak 70mm Highlight Halation (strictly gated for genuine specular peaks > 0.85)
      if (uHalationStrength > 0.01) {
        vec2 hStep = vec2(0.005 / uAspect, 0.005);
        vec3 s1 = texture2D(tDiffuse, clamp(safeUv + vec2(hStep.x, 0.0), 0.001, 0.999)).rgb;
        vec3 s2 = texture2D(tDiffuse, clamp(safeUv - vec2(hStep.x, 0.0), 0.001, 0.999)).rgb;
        vec3 s3 = texture2D(tDiffuse, clamp(safeUv + vec2(0.0, hStep.y), 0.001, 0.999)).rgb;
        vec3 s4 = texture2D(tDiffuse, clamp(safeUv - vec2(0.0, hStep.y), 0.001, 0.999)).rgb;
        vec3 avg = (s1 + s2 + s3 + s4) * 0.25;
        float hiLum = max(0.0, dot(avg, vec3(0.299, 0.587, 0.114)) - 0.85);
        col += vec3(1.0, 0.44, 0.16) * hiLum * uHalationStrength * 0.26;
      }

      // 4. Anamorphic Streak Flare + Flare-Triggered Optical Lens Dust & Inverted Hexagonal Ghosts
      if (uAnamorphicIntensity > 0.01) {
        vec2 fDelta = safeUv - uFlareCenter;
        float inFrame = smoothstep(-0.20, 0.08, uFlareCenter.x) *
                        smoothstep(1.20, 0.92, uFlareCenter.x) *
                        smoothstep(-0.20, 0.08, uFlareCenter.y) *
                        smoothstep(1.20, 0.92, uFlareCenter.y);

        float streakY = exp(-abs(fDelta.y) * 130.0);
        float streakX = exp(-abs(fDelta.x) * 4.2);
        float coreStreak = exp(-abs(fDelta.y) * 320.0) * exp(-abs(fDelta.x) * 8.5);
        vec3 streakCol = mix(vec3(0.54, 0.74, 1.0), uFlareColor, 0.65);
        col += streakCol * (streakX * streakY * 0.11 + coreStreak * 0.15) * uAnamorphicIntensity * inFrame;

        // Strictly gated above high optical flare threshold (Sun limb, photon ring, supernova)
        float highFlareGate = smoothstep(0.22, 0.62, uAnamorphicIntensity) * inFrame;
        if (highFlareGate > 0.005) {
          // Physically inverted multi-element hexagonal lens ghosts opposite optical axis
          vec2 axis = uFlareCenter - vec2(0.5);
          vec2 g1Pos = vec2(0.5) - axis * 0.55;
          vec2 g2Pos = vec2(0.5) - axis * 1.12;
          vec2 g3Pos = vec2(0.5) - axis * 1.68;

          vec2 d1 = (safeUv - g1Pos) * vec2(uAspect, 1.0);
          vec2 d2 = (safeUv - g2Pos) * vec2(uAspect, 1.0);
          vec2 d3 = (safeUv - g3Pos) * vec2(uAspect, 1.0);

          float gh1 = hexAperture(d1, 0.042);
          float gh2 = hexAperture(d2, 0.074);
          float gh3 = hexAperture(d3, 0.032);

          vec3 ghostCol =
            vec3(0.48, 0.76, 1.0) * gh1 * 0.055 +
            uFlareColor * gh2 * 0.045 +
            vec3(0.76, 0.56, 1.0) * gh3 * 0.038;
          col += ghostCol * highFlareGate;

          // Flare-triggered micro-dust & fine coating scratches illuminated near high-energy source
          if (uHasLensDust > 0.5) {
            float flareDist = length(fDelta * vec2(uAspect, 1.0));
            float dustFalloff = exp(-flareDist * flareDist * 2.4);
            vec3 dustTex = texture2D(tLensDust, safeUv).rgb;
            col += dustTex * mix(uFlareColor, vec3(0.85, 0.90, 1.0), 0.35) * dustFalloff * highFlareGate * 0.16;
          }
        }
      }

      // Subtle Einstein photon-ring shimmer
      col += vec3(0.96, 0.80, 0.52) * photonGlint;

      // 5. Theatrical deep-space vignette & temporal blue-noise 35mm celluloid grain (shadows only!)
      float vignette = smoothstep(0.94, 0.30, edgeDist);
      col *= mix(0.72, 1.0, vignette);

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Strictly shadow-only film grain: present in low-mid shadows, zero in pure black & zero on bright stars
      float shadowGrainMask = smoothstep(0.008, 0.06, luma) * (1.0 - smoothstep(0.18, 0.42, luma));
      float blueNoise = interleavedGradientNoise(gl_FragCoord.xy, uFrameIndex) - 0.5;
      col += vec3(blueNoise * 0.022 * shadowGrainMask);

      col = vec3(
        col.r >= 0.0 ? min(col.r, 64.0) : 0.0,
        col.g >= 0.0 ? min(col.g, 64.0) : 0.0,
        col.b >= 0.0 ? min(col.b, 64.0) : 0.0
      );
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
