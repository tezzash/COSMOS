import * as THREE from 'three';

export type RenderPipelineMode = 'hdr-composer' | 'ldr-composer' | 'direct-renderer';

export interface GpuRenderCapabilities {
  isWebGL2: boolean;
  isSoftwareGl: boolean;
  halfFloatRenderable: boolean;
  floatTextureReadable: boolean;
  maxTextureSize: number;
  isMobile: boolean;
  devicePixelRatio: number;
}

export interface RenderPipelinePlan {
  mode: RenderPipelineMode;
  composerTextureType: 'half-float' | 'unsigned-byte';
  useBloom: boolean;
  useLut3d: boolean;
  useGpgpuFluid: boolean;
  usePmremEnv: boolean;
  pixelRatio: number;
}

const SOFTWARE_GL_PATTERN = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

/**
 * Pure capability-to-pipeline decision function (unit-tested in Node).
 * Ensures GPUs or browsers without renderable HalfFloat FBOs (e.g. WebGL2 without
 * EXT_color_buffer_float / EXT_color_buffer_half_float, or WebGL1 mobile drivers)
 * NEVER allocate incomplete HalfFloat framebuffers that produce a black screen.
 */
export function selectRenderPipelinePlan(caps: GpuRenderCapabilities): RenderPipelinePlan {
  const safeDpr = Number.isFinite(caps.devicePixelRatio) && caps.devicePixelRatio > 0
    ? caps.devicePixelRatio
    : 1;

  if (caps.isSoftwareGl) {
    return {
      mode: 'direct-renderer',
      composerTextureType: 'unsigned-byte',
      useBloom: false,
      useLut3d: false,
      useGpgpuFluid: false,
      usePmremEnv: false,
      pixelRatio: 1,
    };
  }

  const maxDpr = caps.isMobile ? 1.5 : 2;
  const pixelRatio = Math.min(safeDpr, maxDpr);

  if (caps.halfFloatRenderable) {
    return {
      mode: 'hdr-composer',
      composerTextureType: 'half-float',
      useBloom: true,
      useLut3d: caps.isWebGL2,
      useGpgpuFluid: caps.floatTextureReadable,
      usePmremEnv: true,
      pixelRatio,
    };
  }

  // Fallback for real GPUs that lack renderable HalfFloat color attachments:
  // Use UnsignedByteType composer targets and skip UnrealBloomPass (which hardcodes HalfFloatType)
  // and GPGPU ping-pong FBOs so every pass writes to a guaranteed-complete framebuffer.
  return {
    mode: 'ldr-composer',
    composerTextureType: 'unsigned-byte',
    useBloom: false,
    useLut3d: caps.isWebGL2,
    useGpgpuFluid: false,
    usePmremEnv: false,
    pixelRatio,
  };
}

/**
 * Detects software WebGL renderers (SwiftShader, llvmpipe, etc.) using an already-created
 * WebGL context, avoiding extra context creation and premature loseContext() churn.
 */
export function detectSoftwareGlFromContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null,
): boolean {
  if (!gl) return true;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    return SOFTWARE_GL_PATTERN.test(gpu);
  } catch {
    return false;
  }
}

/**
 * Actively probes whether the GPU supports rendering to a HalfFloat RGBA color attachment
 * with linear filtering, verifying real framebuffer completeness via gl.checkFramebufferStatus.
 */
export function probeHalfFloatRenderTargetSupport(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  isWebGL2: boolean,
): boolean {
  const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;

  let fb: WebGLFramebuffer | null = null;
  let tex: WebGLTexture | null = null;

  try {
    if (isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      const hasColorFloat =
        Boolean(gl2.getExtension('EXT_color_buffer_float')) ||
        Boolean(gl2.getExtension('EXT_color_buffer_half_float'));
      if (!hasColorFloat) return false;

      tex = gl2.createTexture();
      fb = gl2.createFramebuffer();
      if (!tex || !fb) return false;

      gl2.bindTexture(gl2.TEXTURE_2D, tex);
      gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MIN_FILTER, gl2.LINEAR);
      gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_MAG_FILTER, gl2.LINEAR);
      gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_S, gl2.CLAMP_TO_EDGE);
      gl2.texParameteri(gl2.TEXTURE_2D, gl2.TEXTURE_WRAP_T, gl2.CLAMP_TO_EDGE);
      gl2.texImage2D(
        gl2.TEXTURE_2D,
        0,
        gl2.RGBA16F,
        4,
        4,
        0,
        gl2.RGBA,
        gl2.HALF_FLOAT,
        null,
      );

      gl2.bindFramebuffer(gl2.FRAMEBUFFER, fb);
      gl2.framebufferTexture2D(
        gl2.FRAMEBUFFER,
        gl2.COLOR_ATTACHMENT0,
        gl2.TEXTURE_2D,
        tex,
        0,
      );
      const status = gl2.checkFramebufferStatus(gl2.FRAMEBUFFER);
      return status === gl2.FRAMEBUFFER_COMPLETE;
    }

    // WebGL1 probe
    const halfFloatExt = gl.getExtension('OES_texture_half_float');
    const halfFloatLinear = gl.getExtension('OES_texture_half_float_linear');
    const colorBufHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    if (!halfFloatExt || !halfFloatLinear || !colorBufHalfFloat) {
      return false;
    }

    tex = gl.createTexture();
    fb = gl.createFramebuffer();
    if (!tex || !fb) return false;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      4,
      4,
      0,
      gl.RGBA,
      halfFloatExt.HALF_FLOAT_OES,
      null,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    if (fb) gl.deleteFramebuffer(fb);
    if (tex) gl.deleteTexture(tex);
    // Drain any GL error triggered during capability probing
    while (gl.getError() !== gl.NO_ERROR) {
      // intentional drain
    }
  }
}

/**
 * Probes live GPU capabilities directly from a THREE.WebGLRenderer instance.
 */
export function probeGpuRenderCapabilities(
  renderer: THREE.WebGLRenderer,
  isMobile: boolean,
  devicePixelRatio: number,
): GpuRenderCapabilities {
  const gl = renderer.getContext();
  const isWebGL2 = renderer.capabilities.isWebGL2;
  const isSoftwareGl = detectSoftwareGlFromContext(gl);
  const halfFloatRenderable = isSoftwareGl
    ? false
    : probeHalfFloatRenderTargetSupport(gl, isWebGL2);
  const floatTextureReadable = isWebGL2 || Boolean(gl.getExtension('OES_texture_float'));
  const maxTextureSize = renderer.capabilities.maxTextureSize || 2048;

  return {
    isWebGL2,
    isSoftwareGl,
    halfFloatRenderable,
    floatTextureReadable,
    maxTextureSize,
    isMobile,
    devicePixelRatio,
  };
}
