import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import {
  type ChapterLutWeights,
  type FilmLutId,
  LUT_SIZE,
  bakeFilmPrintLutData,
} from './colorGrading';

const LUT_VERTEX_SHADER = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Chapter-Specific 32x32x32 3D Film-Print Color Grading Pass (WebGL2 GLSL3 sampler3D):
 * Smoothly cross-fades three baked ACEScg -> Kodak 2383 cinema print LUTs across chapters
 * with half-texel center alignment so pure obsidian blacks stay dead-zero black.
 */
const LUT_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  uniform sampler2D tDiffuse;
  uniform sampler3D uLutCool;
  uniform sampler3D uLutViolet;
  uniform sampler3D uLutWarm;
  uniform vec3 uWeights;
  uniform float uIntensity;

  in vec2 vUv;
  out vec4 fragColor;

  vec3 sampleLut(sampler3D lut, vec3 rgb) {
    float scale = (32.0 - 1.0) / 32.0;
    float offset = 0.5 / 32.0;
    vec3 uvw = clamp(rgb, 0.0, 1.0) * scale + offset;
    return texture(lut, uvw).rgb;
  }

  void main() {
    vec4 base = texture(tDiffuse, vUv);
    vec3 rgb = clamp(base.rgb, 0.0, 1.0);

    vec3 gradedCool = sampleLut(uLutCool, rgb);
    vec3 gradedViolet = sampleLut(uLutViolet, rgb);
    vec3 gradedWarm = sampleLut(uLutWarm, rgb);

    vec3 graded =
      gradedCool * uWeights.x +
      gradedViolet * uWeights.y +
      gradedWarm * uWeights.z;

    fragColor = vec4(mix(rgb, graded, uIntensity), base.a);
  }
`;

function createLut3DTexture(preset: FilmLutId): THREE.Data3DTexture {
  const data = bakeFilmPrintLutData(preset, LUT_SIZE);
  const tex = new THREE.Data3DTexture(data, LUT_SIZE, LUT_SIZE, LUT_SIZE);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Post-processing 3D Film-Print Color Grading Pass (ACEScg -> Kodak 2383).
 */
export class LutColorGradePass extends Pass {
  private readonly lutCool: THREE.Data3DTexture;
  private readonly lutViolet: THREE.Data3DTexture;
  private readonly lutWarm: THREE.Data3DTexture;
  private readonly mat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor() {
    super();
    this.lutCool = createLut3DTexture('cosmosCool');
    this.lutViolet = createLut3DTexture('etherealViolet');
    this.lutWarm = createLut3DTexture('kodak2383Warm');

    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LUT_VERTEX_SHADER,
      fragmentShader: LUT_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        uLutCool: { value: this.lutCool },
        uLutViolet: { value: this.lutViolet },
        uLutWarm: { value: this.lutWarm },
        uWeights: { value: new THREE.Vector3(1, 0, 0) },
        uIntensity: { value: 0.88 },
      },
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  public setWeights(w: ChapterLutWeights): void {
    (this.mat.uniforms.uWeights.value as THREE.Vector3).set(
      w.cosmosCool,
      w.etherealViolet,
      w.kodak2383Warm,
    );
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    this.mat.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  public override dispose(): void {
    this.lutCool.dispose();
    this.lutViolet.dispose();
    this.lutWarm.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
