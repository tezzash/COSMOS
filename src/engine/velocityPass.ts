import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

const VELOCITY_VERTEX_SHADER = /* glsl */ `
  uniform mat4 uPrevViewProj;
  uniform mat4 uPrevModelMatrix;

  varying vec4 vCurrClip;
  varying vec4 vPrevClip;

  void main() {
    vec4 worldCurr = modelMatrix * vec4(position, 1.0);
    vec4 worldPrev = uPrevModelMatrix * vec4(position, 1.0);
    vCurrClip = projectionMatrix * viewMatrix * worldCurr;
    vPrevClip = uPrevViewProj * worldPrev;
    gl_Position = vCurrClip;
  }
`;

const VELOCITY_FRAGMENT_SHADER = /* glsl */ `
  varying vec4 vCurrClip;
  varying vec4 vPrevClip;

  void main() {
    vec2 currNdc = vCurrClip.xy / max(abs(vCurrClip.w), 0.0001);
    vec2 prevNdc = vPrevClip.xy / max(abs(vPrevClip.w), 0.0001);
    // Screen-space UV velocity (currUv - prevUv)
    vec2 vel = (currNdc - prevNdc) * 0.5;
    gl_FragColor = vec4(vel, 0.0, 1.0);
  }
`;

const SKY_VELOCITY_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const SKY_VELOCITY_FRAGMENT_SHADER = /* glsl */ `
  uniform mat4 uCurrInvViewProj;
  uniform mat4 uPrevViewProj;
  varying vec2 vUv;

  void main() {
    vec2 currNdc = vUv * 2.0 - 1.0;
    // Far-plane world point reprojected into previous camera frame for starfield/sky velocity
    vec4 farWorld = uCurrInvViewProj * vec4(currNdc, 0.999, 1.0);
    farWorld /= max(abs(farWorld.w), 0.0001);
    vec4 prevClip = uPrevViewProj * farWorld;
    vec2 prevNdc = prevClip.xy / max(abs(prevClip.w), 0.0001);
    vec2 vel = (currNdc - prevNdc) * 0.5;
    gl_FragColor = vec4(clamp(vel, vec2(-0.25), vec2(0.25)), 0.0, 1.0);
  }
`;

const SHUTTER_BLUR_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * 180-Degree Cinema Shutter Motion Blur Shader:
 * Samples along the half-res per-object + camera screen-space velocity buffer
 * with subtle studio gating so static stars stay razor-sharp while rapid orbital
 * sweeps gain organic 70mm shutter streak smoothness.
 */
const SHUTTER_BLUR_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tVelocity;
  uniform float uShutterScale;

  varying vec2 vUv;

  void main() {
    vec3 center = texture2D(tDiffuse, vUv).rgb;
    if (uShutterScale <= 0.001) {
      gl_FragColor = vec4(center, 1.0);
      return;
    }

    vec2 vel = texture2D(tVelocity, vUv).xy * uShutterScale;
    float speed = length(vel);
    // Deadzone tiny sub-pixel jitter so resting detail remains tack-sharp
    if (speed < 0.0009) {
      gl_FragColor = vec4(center, 1.0);
      return;
    }

    // Clamp max blur streak to preserve legibility during fast cuts
    vec2 clampedVel = vel * min(1.0, 0.028 / speed);

    vec3 accum = center * 0.24;
    accum += texture2D(tDiffuse, clamp(vUv + clampedVel * 0.17, 0.001, 0.999)).rgb * 0.16;
    accum += texture2D(tDiffuse, clamp(vUv - clampedVel * 0.17, 0.001, 0.999)).rgb * 0.16;
    accum += texture2D(tDiffuse, clamp(vUv + clampedVel * 0.34, 0.001, 0.999)).rgb * 0.12;
    accum += texture2D(tDiffuse, clamp(vUv - clampedVel * 0.34, 0.001, 0.999)).rgb * 0.12;
    accum += texture2D(tDiffuse, clamp(vUv + clampedVel * 0.50, 0.001, 0.999)).rgb * 0.10;
    accum += texture2D(tDiffuse, clamp(vUv - clampedVel * 0.50, 0.001, 0.999)).rgb * 0.10;

    gl_FragColor = vec4(accum, 1.0);
  }
`;

const _currViewProj = new THREE.Matrix4();
const _currInvViewProj = new THREE.Matrix4();

/**
 * Lightweight Half-Resolution Per-Object + Camera Motion-Vector (Velocity) Buffer.
 * Tracks per-mesh previous world matrices via WeakMap so rotating planets, rings,
 * and orbital structures emit true object-space screen velocities for reprojected
 * TAA and 180-degree shutter motion blur.
 */
export class VelocityBufferRenderer {
  public readonly renderTarget: THREE.WebGLRenderTarget;

  private readonly prevViewProj = new THREE.Matrix4();
  private readonly prevModelMap = new WeakMap<THREE.Object3D, THREE.Matrix4>();
  private readonly velocityMat: THREE.ShaderMaterial;
  private readonly skyVelMat: THREE.ShaderMaterial;
  private readonly skyVelQuad: FullScreenQuad;
  private readonly trackedMeshes: THREE.Mesh[] = [];

  private hasPrevFrame = false;

  constructor(width: number, height: number, pixelRatio: number) {
    const rtW = Math.max(1, Math.floor((width * pixelRatio) * 0.5));
    const rtH = Math.max(1, Math.floor((height * pixelRatio) * 0.5));

    this.renderTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.velocityMat = new THREE.ShaderMaterial({
      vertexShader: VELOCITY_VERTEX_SHADER,
      fragmentShader: VELOCITY_FRAGMENT_SHADER,
      depthTest: true,
      depthWrite: true,
      uniforms: {
        uPrevViewProj: { value: new THREE.Matrix4() },
        uPrevModelMatrix: { value: new THREE.Matrix4() },
      },
    });

    this.skyVelMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VELOCITY_VERTEX_SHADER,
      fragmentShader: SKY_VELOCITY_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uCurrInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
      },
    });
    this.skyVelQuad = new FullScreenQuad(this.skyVelMat);
  }

  public get texture(): THREE.Texture {
    return this.renderTarget.texture;
  }

  public resetHistory(): void {
    this.hasPrevFrame = false;
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    const rtW = Math.max(1, Math.floor((width * pixelRatio) * 0.5));
    const rtH = Math.max(1, Math.floor((height * pixelRatio) * 0.5));
    this.renderTarget.setSize(rtW, rtH);
    this.resetHistory();
  }

  public render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ): void {
    camera.updateMatrixWorld();
    _currViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    if (!this.hasPrevFrame) {
      this.prevViewProj.copy(_currViewProj);
    }

    _currInvViewProj.copy(_currViewProj).invert();
    (this.skyVelMat.uniforms.uCurrInvViewProj.value as THREE.Matrix4).copy(_currInvViewProj);
    (this.skyVelMat.uniforms.uPrevViewProj.value as THREE.Matrix4).copy(this.prevViewProj);
    (this.velocityMat.uniforms.uPrevViewProj.value as THREE.Matrix4).copy(this.prevViewProj);

    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderTarget);
    renderer.clear(true, true, false);

    // 1. Background / starfield camera-reprojection velocity pass
    this.skyVelQuad.render(renderer);

    // 2. Per-object opaque mesh velocity pass (planets, Moon, astrolabe rings, Yin-Yang, sanctuary)
    this.trackedMeshes.length = 0;
    const savedVis: Array<{ obj: THREE.Object3D; vis: boolean }> = [];
    const savedHandlers: Array<{
      mesh: THREE.Mesh;
      prevHandler: THREE.Object3D['onBeforeRender'];
    }> = [];

    scene.traverse((obj) => {
      if (!obj.visible) return;
      if (obj instanceof THREE.Points || obj instanceof THREE.Sprite || obj instanceof THREE.Line) {
        savedVis.push({ obj, vis: obj.visible });
        obj.visible = false;
        return;
      }
      if (obj instanceof THREE.Mesh) {
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const isSkybox = obj.renderOrder < 0 || (mat && mat.side === THREE.BackSide);
        const isAdditive = mat && mat.blending === THREE.AdditiveBlending;
        if (isSkybox || isAdditive || (mat && !mat.visible)) {
          savedVis.push({ obj, vis: obj.visible });
          obj.visible = false;
          return;
        }
        this.trackedMeshes.push(obj);
        const prevMat = this.prevModelMap.get(obj);
        if (!prevMat) {
          this.prevModelMap.set(obj, obj.matrixWorld.clone());
        } else if (!this.hasPrevFrame) {
          prevMat.copy(obj.matrixWorld);
        }
        const prevHandler = obj.onBeforeRender;
        savedHandlers.push({ mesh: obj, prevHandler });
        obj.onBeforeRender = () => {
          const pm = this.prevModelMap.get(obj);
          if (pm) {
            (this.velocityMat.uniforms.uPrevModelMatrix.value as THREE.Matrix4).copy(pm);
          } else {
            (this.velocityMat.uniforms.uPrevModelMatrix.value as THREE.Matrix4).copy(obj.matrixWorld);
          }
        };
      }
    });

    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    scene.overrideMaterial = this.velocityMat;
    scene.background = null;
    renderer.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;

    // Restore visibility & handlers, then snapshot current matrices as next frame's previous state
    for (let i = 0; i < savedHandlers.length; i++) {
      savedHandlers[i].mesh.onBeforeRender = savedHandlers[i].prevHandler;
    }
    for (let i = 0; i < savedVis.length; i++) {
      savedVis[i].obj.visible = savedVis[i].vis;
    }
    for (let i = 0; i < this.trackedMeshes.length; i++) {
      const mesh = this.trackedMeshes[i];
      const pm = this.prevModelMap.get(mesh);
      if (pm) pm.copy(mesh.matrixWorld);
    }

    this.prevViewProj.copy(_currViewProj);
    this.hasPrevFrame = true;

    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevRT);
  }

  public dispose(): void {
    this.renderTarget.dispose();
    this.velocityMat.dispose();
    this.skyVelMat.dispose();
    this.skyVelQuad.dispose();
  }
}

/**
 * Subtle 180-Degree Cinema Shutter Motion Blur Post-Processing Pass.
 */
export class ShutterMotionBlurPass extends Pass {
  private readonly mat: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(velocityTexture: THREE.Texture) {
    super();
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SHUTTER_BLUR_VERTEX_SHADER,
      fragmentShader: SHUTTER_BLUR_FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null },
        tVelocity: { value: velocityTexture },
        uShutterScale: { value: 0.45 },
      },
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  public setShutterScale(scale: number): void {
    this.mat.uniforms.uShutterScale.value = scale;
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
    this.mat.dispose();
    this.quad.dispose();
  }
}
