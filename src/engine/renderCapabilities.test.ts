import { describe, expect, it } from 'vitest';
import { selectRenderPipelinePlan } from './renderCapabilities';

describe('selectRenderPipelinePlan', () => {
  it('enables full HDR composer, bloom, 3D LUT, GPGPU fluid, and PMREM on capable WebGL2 desktop GPUs', () => {
    const plan = selectRenderPipelinePlan({
      isWebGL2: true,
      isSoftwareGl: false,
      halfFloatRenderable: true,
      floatTextureReadable: true,
      maxTextureSize: 8192,
      isMobile: false,
      devicePixelRatio: 2,
    });

    expect(plan.mode).toBe('hdr-composer');
    expect(plan.composerTextureType).toBe('half-float');
    expect(plan.useBloom).toBe(true);
    expect(plan.useLut3d).toBe(true);
    expect(plan.useGpgpuFluid).toBe(true);
    expect(plan.usePmremEnv).toBe(true);
    expect(plan.pixelRatio).toBe(2);
  });

  it('caps pixelRatio to 1.5 on high-DPI mobile GPUs while keeping HDR when HalfFloat FBOs are renderable', () => {
    const plan = selectRenderPipelinePlan({
      isWebGL2: true,
      isSoftwareGl: false,
      halfFloatRenderable: true,
      floatTextureReadable: true,
      maxTextureSize: 4096,
      isMobile: true,
      devicePixelRatio: 3,
    });

    expect(plan.mode).toBe('hdr-composer');
    expect(plan.pixelRatio).toBe(1.5);
  });

  it('falls back to UnsignedByte LDR composer without HalfFloat bloom/GPGPU/PMREM when EXT_color_buffer_float is absent', () => {
    const plan = selectRenderPipelinePlan({
      isWebGL2: true,
      isSoftwareGl: false,
      halfFloatRenderable: false,
      floatTextureReadable: true,
      maxTextureSize: 4096,
      isMobile: true,
      devicePixelRatio: 3,
    });

    expect(plan.mode).toBe('ldr-composer');
    expect(plan.composerTextureType).toBe('unsigned-byte');
    expect(plan.useBloom).toBe(false);
    expect(plan.useGpgpuFluid).toBe(false);
    expect(plan.usePmremEnv).toBe(false);
    expect(plan.useLut3d).toBe(true);
  });

  it('disables GLSL3 3D LUT on WebGL1 contexts so the final pass never outputs black', () => {
    const plan = selectRenderPipelinePlan({
      isWebGL2: false,
      isSoftwareGl: false,
      halfFloatRenderable: false,
      floatTextureReadable: false,
      maxTextureSize: 2048,
      isMobile: false,
      devicePixelRatio: 1,
    });

    expect(plan.mode).toBe('ldr-composer');
    expect(plan.useLut3d).toBe(false);
    expect(plan.useBloom).toBe(false);
    expect(plan.useGpgpuFluid).toBe(false);
  });

  it('uses direct-renderer mode at 1x pixelRatio on software WebGL renderers', () => {
    const plan = selectRenderPipelinePlan({
      isWebGL2: true,
      isSoftwareGl: true,
      halfFloatRenderable: false,
      floatTextureReadable: true,
      maxTextureSize: 4096,
      isMobile: false,
      devicePixelRatio: 2,
    });

    expect(plan.mode).toBe('direct-renderer');
    expect(plan.pixelRatio).toBe(1);
    expect(plan.useBloom).toBe(false);
    expect(plan.useLut3d).toBe(false);
    expect(plan.useGpgpuFluid).toBe(false);
  });
});
