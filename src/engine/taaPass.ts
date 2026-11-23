import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

const TAA_RESOLVE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Film-Grade Real-Time Temporal Anti-Aliasing (TAA) Resolve Shader:
 * - Converts the 3x3 neighborhood of the current jittered HDR frame into perceptual YCoCg space
 * - Computes variance-clipped color bounds (mu +/- gamma * sigma, Karis 2014) to clamp history
 *   tightly, eliminating ghosting trails on moving stars, rings, and Sagittarius sparks
 * - Uses Karis luminance weighting during resolve to prevent bright sub-pixel star fireflies
 * - Applies subtle 5-tap Contrast-Adaptive micro-sharpening (CAS) to restore tack-sharp 4K detail
 */
const TAA_RESOLVE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tHistory;
  uniform sampler2D tVelocity;
  uniform float uHasVelocity;
  uniform vec2 uTexelSize;
  uniform float uBlendFactor;
  uniform float uSharpness;

  varying vec2 vUv;

  vec3 rgbToYCoCg(vec3 c) {
    float y  = dot(c, vec3( 0.25, 0.50,  0.25));
    float co = dot(c, vec3( 0.50, 0.00, -0.50));
    float cg = dot(c, vec3(-0.25, 0.50, -0.25));
    return vec3(y, co, cg);
  }

  vec3 yCoCgToRgb(vec3 c) {
    float r = c.x + c.y - c.z;
    float g = c.x + c.z;
    float b = c.x - c.y - c.z;
    return max(vec3(r, g, b), vec3(0.0));
  }

  float karisWeight(vec3 rgb) {
    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
    return 1.0 / (1.0 + luma);
  }

  void main() {
    vec3 curr = texture2D(tDiffuse, vUv).rgb;

    if (uBlendFactor <= 0.001) {
      gl_FragColor = vec4(curr, 1.0);
      return;
    }

    // Reproject history UV using per-object + camera screen-space velocity vector
    vec2 vel = uHasVelocity > 0.5 ? texture2D(tVelocity, vUv).xy : vec2(0.0);
    vec2 histUv = vUv - vel;
    bool offscreen = histUv.x < 0.001 || histUv.x > 0.999 || histUv.y < 0.001 || histUv.y > 0.999;

    if (offscreen) {
      gl_FragColor = vec4(curr, 1.0);
      return;
    }

    // 3x3 neighborhood variance statistics in perceptual YCoCg space
    vec3 m1 = vec3(0.0);
    vec3 m2 = vec3(0.0);
    vec3 minYcc = vec3(1e5);
    vec3 maxYcc = vec3(-1e5);

    vec3 nN = texture2D(tDiffuse, clamp(vUv + vec2(0.0, uTexelSize.y), 0.0005, 0.9995)).rgb;
    vec3 nS = texture2D(tDiffuse, clamp(vUv - vec2(0.0, uTexelSize.y), 0.0005, 0.9995)).rgb;
    vec3 nE = texture2D(tDiffuse, clamp(vUv + vec2(uTexelSize.x, 0.0), 0.0005, 0.9995)).rgb;
    vec3 nW = texture2D(tDiffuse, clamp(vUv - vec2(uTexelSize.x, 0.0), 0.0005, 0.9995)).rgb;
    vec3 nNE = texture2D(tDiffuse, clamp(vUv + vec2(uTexelSize.x, uTexelSize.y), 0.0005, 0.9995)).rgb;
    vec3 nNW = texture2D(tDiffuse, clamp(vUv + vec2(-uTexelSize.x, uTexelSize.y), 0.0005, 0.9995)).rgb;
    vec3 nSE = texture2D(tDiffuse, clamp(vUv + vec2(uTexelSize.x, -uTexelSize.y), 0.0005, 0.9995)).rgb;
    vec3 nSW = texture2D(tDiffuse, clamp(vUv + vec2(-uTexelSize.x, -uTexelSize.y), 0.0005, 0.9995)).rgb;

    vec3 samples[9];
    samples[0] = curr;
    samples[1] = nN;
    samples[2] = nS;
    samples[3] = nE;
    samples[4] = nW;
    samples[5] = nNE;
    samples[6] = nNW;
    samples[7] = nSE;
    samples[8] = nSW;

    for (int i = 0; i < 9; i++) {
      vec3 ycc = rgbToYCoCg(samples[i]);
      m1 += ycc;
      m2 += ycc * ycc;
      minYcc = min(minYcc, ycc);
      maxYcc = max(maxYcc, ycc);
    }

    vec3 mu = m1 / 9.0;
    vec3 sigma = sqrt(max(m2 / 9.0 - mu * mu, vec3(0.0)));
    // Slightly tighter clamping on fast-moving reprojected pixels prevents any trailing
    float speed = length(vel);
    float gamma = mix(1.18, 0.92, clamp(speed * 28.0, 0.0, 1.0));
    vec3 boxMin = max(minYcc, mu - gamma * sigma);
    vec3 boxMax = min(maxYcc, mu + gamma * sigma);

    // Sample velocity-reprojected history and clamp tightly inside variance AABB
    vec3 histRgb = texture2D(tHistory, histUv).rgb;
    vec3 histYcc = clamp(rgbToYCoCg(histRgb), boxMin, boxMax);
    vec3 clampedHist = yCoCgToRgb(histYcc);

    // Karis luminance-weighted temporal resolve (prevents sub-pixel star fireflies)
    float effBlend = uBlendFactor * (1.0 - clamp(speed * 8.0, 0.0, 0.25));
    float wCurr = (1.0 - effBlend) * karisWeight(curr);
    float wHist = effBlend * karisWeight(clampedHist);
    vec3 resolved = (curr * wCurr + clampedHist * wHist) / max(wCurr + wHist, 0.0001);

    // Subtle Contrast-Adaptive micro-sharpening (CAS) to preserve razor-sharp 4K & star edges
    if (uSharpness > 0.001) {
      vec3 crossAvg = (nN + nS + nE + nW) * 0.25;
      vec3 detail = curr - crossAvg;
      float contrast = length(detail);
      float adaptive = uSharpness * (1.0 / (1.0 + contrast * 2.5));
      resolved = max(resolved + detail * adaptive, vec3(0.0));
    }

    gl_FragColor = vec4(resolved, 1.0);
  }
`;

/**
 * Real-time Velocity-Reprojected Temporal Anti-Aliasing (TAA) post-processing pass
 * with HDR HalfFloat history accumulation, YCoCg variance clamping, and CAS sharpening.
 */
export class TaaResolvePass extends Pass {
  private readonly resolveMat: THREE.ShaderMaterial;
  private readonly resolveQuad: FullScreenQuad;
  private readonly copyMat: THREE.ShaderMaterial;
  private readonly copyQuad: FullScreenQuad;
  private readonly historyRT: THREE.WebGLRenderTarget;

  private historyValid = false;

  constructor(width: number, height: number, pixelRatio: number, velocityTexture?: THREE.Texture) {
    super();

    const rtW = Math.max(1, Math.floor(width * pixelRatio));
    const rtH = Math.max(1, Math.floor(height * pixelRatio));

    this.historyRT = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    });

    this.resolveMat = new THREE.ShaderMaterial({
      vertexShader: TAA_RESOLVE_VERTEX_SHADER,
      fragmentShader: TAA_RESOLVE_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tHistory: { value: this.historyRT.texture },
        tVelocity: { value: velocityTexture ?? null },
        uHasVelocity: { value: velocityTexture ? 1.0 : 0.0 },
        uTexelSize: { value: new THREE.Vector2(1 / rtW, 1 / rtH) },
        uBlendFactor: { value: 0.0 },
        uSharpness: { value: 0.22 },
      },
    });
    this.resolveQuad = new FullScreenQuad(this.resolveMat);

    this.copyMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.copyQuad = new FullScreenQuad(this.copyMat);
  }

  public setVelocityTexture(tex: THREE.Texture | null): void {
    if (this.resolveMat.uniforms.tVelocity) {
      this.resolveMat.uniforms.tVelocity.value = tex;
    }
    if (this.resolveMat.uniforms.uHasVelocity) {
      this.resolveMat.uniforms.uHasVelocity.value = tex ? 1.0 : 0.0;
    }
  }

  public setBlendFactor(blend: number): void {
    if (this.resolveMat.uniforms.uBlendFactor) {
      this.resolveMat.uniforms.uBlendFactor.value = this.historyValid ? blend : 0.0;
    }
  }

  public getBlendFactor(): number {
    return (this.resolveMat.uniforms.uBlendFactor?.value as number | undefined) ?? 0;
  }

  public resetHistory(): void {
    this.historyValid = false;
    if (this.resolveMat.uniforms.uBlendFactor) {
      this.resolveMat.uniforms.uBlendFactor.value = 0.0;
    }
  }

  public override setSize(width: number, height: number): void {
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    this.historyRT.setSize(safeW, safeH);
    if (this.resolveMat.uniforms.uTexelSize) {
      (this.resolveMat.uniforms.uTexelSize.value as THREE.Vector2).set(1 / safeW, 1 / safeH);
    }
    this.resetHistory();
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    if (this.resolveMat.uniforms.tDiffuse) {
      this.resolveMat.uniforms.tDiffuse.value = readBuffer.texture;
    }
    if (this.resolveMat.uniforms.tHistory) {
      this.resolveMat.uniforms.tHistory.value = this.historyRT.texture;
    }
    if (!this.historyValid && this.resolveMat.uniforms.uBlendFactor) {
      this.resolveMat.uniforms.uBlendFactor.value = 0.0;
    }

    // 1. Resolve current jittered HDR frame against clamped history into writeBuffer
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.resolveQuad.render(renderer);

    // 2. Store resolved output into historyRT for the next frame
    if (!this.renderToScreen) {
      if (this.copyMat.uniforms.tDiffuse) {
        this.copyMat.uniforms.tDiffuse.value = writeBuffer.texture;
      }
      renderer.setRenderTarget(this.historyRT);
      this.copyQuad.render(renderer);
      this.historyValid = true;
    }
  }

  public override dispose(): void {
    this.historyRT.dispose();
    this.resolveMat.dispose();
    this.resolveQuad.dispose();
    this.copyMat.dispose();
    this.copyQuad.dispose();
  }
}
