import * as THREE from 'three';
import { clamp, getChapterWeight, smoothstep } from '../../data/chapters';
import {
  FILAMENT_FRAGMENT_SHADER,
  FILAMENT_VERTEX_SHADER,
  createSoftGlowTexture,
} from '../shaders';

interface NetworkNode {
  pos: THREE.Vector3;
  distFromCenter: number;
  activated: number; // 0..1 persistent illumination
  phase: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  active: boolean;
  age: number;
}

const MAX_CONNECTIONS = 520;
const SEGMENTS_PER_EDGE = 7;

const _mid = new THREE.Vector3();
const _ctrl = new THREE.Vector3();
const _arcA = new THREE.Vector3();
const _arcB = new THREE.Vector3();
const _ndcVec = new THREE.Vector2();
const _localHit = new THREE.Vector3();

/**
 * Chapter III: The Invisible Gravity (centered at 0, 0, -255).
 * Living 3D star network with curved quadratic Bézier energy filaments carrying
 * traveling luminous pulse packets, interactive point-of-touch gravitational
 * shockwave ripples, and cascading chain-reaction cluster illumination.
 */
export class ConstellationNetwork {
  public readonly root = new THREE.Group();

  private readonly nodes: NetworkNode[] = [];
  private readonly nodePositions: Float32Array;
  private readonly nodeColors: Float32Array;
  private readonly nodeGeometry: THREE.BufferGeometry;
  private readonly nodeMaterial: THREE.PointsMaterial;

  private readonly linePositions: Float32Array;
  private readonly lineColors: Float32Array;
  private readonly lineProgress: Float32Array;
  private readonly linePhases: Float32Array;
  private readonly lineGeometry: THREE.BufferGeometry;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly connectionSet = new Set<string>();
  private connectionCount = 0;

  private readonly rippleRings: THREE.Mesh[] = [];
  private readonly touchShockwaves: Shockwave[] = [];
  private nextShockwaveIdx = 0;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private readonly raycaster = new THREE.Raycaster();
  private readonly interactPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 255);
  private readonly hitPoint = new THREE.Vector3();
  private lastImpulseTime = 0;
  private lastElapsed = 0;

  constructor(isMobile: boolean) {
    this.root.position.set(0, 0, -255);

    const count = isMobile ? 110 : 165;
    let s = 20261125;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    // Anchor node at center (0,0,0)
    this.nodes.push({
      pos: new THREE.Vector3(0, 0, 0),
      distFromCenter: 0,
      activated: 1,
      phase: 0,
    });

    for (let i = 1; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const r = 4.2 + Math.pow(rand(), 0.78) * 26.0;
      const x = Math.cos(theta) * r;
      const y = (rand() - 0.5) * 24.0;
      const z = (rand() - 0.5) * 20.0;
      const pos = new THREE.Vector3(x, y, z);
      this.nodes.push({
        pos,
        distFromCenter: pos.length(),
        activated: 0,
        phase: rand() * Math.PI * 2,
      });
    }

    this.nodePositions = new Float32Array(count * 3);
    this.nodeColors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const node = this.nodes[i];
      if (!node) continue;
      this.nodePositions[i * 3] = node.pos.x;
      this.nodePositions[i * 3 + 1] = node.pos.y;
      this.nodePositions[i * 3 + 2] = node.pos.z;
    }

    this.nodeGeometry = new THREE.BufferGeometry();
    this.nodeGeometry.setAttribute('position', new THREE.BufferAttribute(this.nodePositions, 3));
    this.nodeGeometry.setAttribute('color', new THREE.BufferAttribute(this.nodeColors, 3));

    const glowTex = createSoftGlowTexture('#fff8e6', '#ecc26f');
    this.nodeMaterial = new THREE.PointsMaterial({
      size: 1.65,
      map: glowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(this.nodeGeometry, this.nodeMaterial);
    this.root.add(points);
    this.disposables.push(this.nodeGeometry, this.nodeMaterial, glowTex);

    // Persistent curved 3D Bézier energy filament buffer (each connection = SEGMENTS_PER_EDGE line segments)
    const totalVerts = MAX_CONNECTIONS * SEGMENTS_PER_EDGE * 2;
    this.linePositions = new Float32Array(totalVerts * 3);
    this.lineColors = new Float32Array(totalVerts * 3);
    this.lineProgress = new Float32Array(totalVerts);
    this.linePhases = new Float32Array(totalVerts);

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.lineGeometry.setAttribute('aColor', new THREE.BufferAttribute(this.lineColors, 3));
    this.lineGeometry.setAttribute('aProgress', new THREE.BufferAttribute(this.lineProgress, 1));
    this.lineGeometry.setAttribute('aPhase', new THREE.BufferAttribute(this.linePhases, 1));
    this.lineGeometry.setDrawRange(0, 0);

    this.lineMaterial = new THREE.ShaderMaterial({
      vertexShader: FILAMENT_VERTEX_SHADER,
      fragmentShader: FILAMENT_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.78 },
      },
    });
    const lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    lines.frustumCulled = false;
    this.root.add(lines);
    this.disposables.push(this.lineGeometry, this.lineMaterial);

    // 3 ambient volumetric expanding golden gravitational ripple rings from center
    const ringGeo = new THREE.TorusGeometry(1, 0.0045, 8, 128);
    this.disposables.push(ringGeo);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf7d892,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = Math.PI * 0.12 * (i - 1);
      mesh.rotation.y = Math.PI * 0.08 * i;
      this.root.add(mesh);
      this.rippleRings.push(mesh);
      this.disposables.push(mat);
    }

    // 3 interactive shockwave ripples spawned directly at user impulse coordinates
    const shockGeo = new THREE.TorusGeometry(1, 0.008, 8, 96);
    this.disposables.push(shockGeo);
    for (let i = 0; i < 3; i++) {
      const sMat = new THREE.MeshBasicMaterial({
        color: 0xffe9b5,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sMesh = new THREE.Mesh(shockGeo, sMat);
      sMesh.visible = false;
      this.root.add(sMesh);
      this.touchShockwaves.push({ mesh: sMesh, active: false, age: 0 });
      this.disposables.push(sMat);
    }
  }

  public getConnectionCount(): number {
    return this.connectionCount;
  }

  private spawnShockwave(localPoint: THREE.Vector3): void {
    const sw = this.touchShockwaves[this.nextShockwaveIdx];
    this.nextShockwaveIdx = (this.nextShockwaveIdx + 1) % this.touchShockwaves.length;
    if (!sw) return;
    sw.active = true;
    sw.age = 0;
    sw.mesh.position.copy(localPoint);
    sw.mesh.scale.setScalar(0.6);
    sw.mesh.visible = true;
  }

  private addConnection(aIdx: number, bIdx: number): void {
    if (this.connectionCount >= MAX_CONNECTIONS) return;
    const min = Math.min(aIdx, bIdx);
    const max = Math.max(aIdx, bIdx);
    const key = `${min}-${max}`;
    if (this.connectionSet.has(key)) return;

    const nodeA = this.nodes[min];
    const nodeB = this.nodes[max];
    if (!nodeA || !nodeB) return;
    this.connectionSet.add(key);

    const a = nodeA.pos;
    const b = nodeB.pos;

    // Sculpt a graceful outward gravitational arc (quadratic Bézier control point)
    _mid.addVectors(a, b).multiplyScalar(0.5);
    const edgeLen = a.distanceTo(b);
    const archFactor = 0.22 * edgeLen;
    const midLen = _mid.length();
    if (midLen > 0.01) {
      _ctrl.copy(_mid).normalize().multiplyScalar(archFactor).add(_mid);
    } else {
      _ctrl.set(_mid.x, _mid.y + archFactor, _mid.z);
    }

    const phase = ((min * 37 + max * 17) % 100) / 100;
    const edgeVertStart = this.connectionCount * SEGMENTS_PER_EDGE * 2;

    for (let s = 0; s < SEGMENTS_PER_EDGE; s++) {
      const t0 = s / SEGMENTS_PER_EDGE;
      const t1 = (s + 1) / SEGMENTS_PER_EDGE;

      // Quadratic Bézier evaluation: (1-t)^2*A + 2(1-t)t*Ctrl + t^2*B
      const evalQuad = (t: number, out: THREE.Vector3) => {
        const omt = 1 - t;
        const w0 = omt * omt;
        const w1 = 2 * omt * t;
        const w2 = t * t;
        out.set(
          w0 * a.x + w1 * _ctrl.x + w2 * b.x,
          w0 * a.y + w1 * _ctrl.y + w2 * b.y,
          w0 * a.z + w1 * _ctrl.z + w2 * b.z,
        );
      };

      evalQuad(t0, _arcA);
      evalQuad(t1, _arcB);

      const v0 = edgeVertStart + s * 2;
      const v1 = v0 + 1;

      this.linePositions[v0 * 3] = _arcA.x;
      this.linePositions[v0 * 3 + 1] = _arcA.y;
      this.linePositions[v0 * 3 + 2] = _arcA.z;
      this.linePositions[v1 * 3] = _arcB.x;
      this.linePositions[v1 * 3 + 1] = _arcB.y;
      this.linePositions[v1 * 3 + 2] = _arcB.z;

      // Warm gold-to-celestial-violet color gradient along each curved filament
      const setColor = (vIdx: number, t: number) => {
        this.lineColors[vIdx * 3] = THREE.MathUtils.lerp(0.98, 0.72, t);
        this.lineColors[vIdx * 3 + 1] = THREE.MathUtils.lerp(0.84, 0.66, t);
        this.lineColors[vIdx * 3 + 2] = THREE.MathUtils.lerp(0.52, 0.96, t);
      };
      setColor(v0, t0);
      setColor(v1, t1);

      this.lineProgress[v0] = t0;
      this.lineProgress[v1] = t1;
      this.linePhases[v0] = phase;
      this.linePhases[v1] = phase;
    }

    this.connectionCount += 1;
    this.lineGeometry.setDrawRange(0, this.connectionCount * SEGMENTS_PER_EDGE * 2);
    if (this.lineGeometry.attributes.position) {
      this.lineGeometry.attributes.position.needsUpdate = true;
    }
    if (this.lineGeometry.attributes.aColor) {
      this.lineGeometry.attributes.aColor.needsUpdate = true;
    }
    if (this.lineGeometry.attributes.aProgress) {
      this.lineGeometry.attributes.aProgress.needsUpdate = true;
    }
    if (this.lineGeometry.attributes.aPhase) {
      this.lineGeometry.attributes.aPhase.needsUpdate = true;
    }
  }

  private igniteAroundPoint(localPoint: THREE.Vector3, radius: number): number {
    this.spawnShockwave(localPoint);
    const activatedIndices: number[] = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (!node) continue;
      const d = node.pos.distanceTo(localPoint);
      if (d <= radius) {
        const boost = 1 - d / radius;
        node.activated = Math.max(
          node.activated,
          clamp(0.68 + boost * 0.32, 0, 1),
        );
        activatedIndices.push(i);
      }
    }

    // Connect newly illuminated stars + trigger subtle secondary chain-reaction hops
    for (const idxA of activatedIndices) {
      const nodeA = this.nodes[idxA];
      if (!nodeA) continue;
      let linked = 0;
      for (let j = 0; j < this.nodes.length && linked < 3; j++) {
        if (j === idxA) continue;
        const nodeJ = this.nodes[j];
        if (!nodeJ) continue;
        const dist = nodeA.pos.distanceTo(nodeJ.pos);
        if (dist < 8.0 && nodeJ.activated >= 0.32) {
          this.addConnection(idxA, j);
          linked++;
        } else if (dist < 6.2 && nodeJ.activated < 0.32 && linked < 2) {
          // Cascading chain-reaction light wave into neighboring dormant star
          nodeJ.activated = 0.52;
          this.addConnection(idxA, j);
          linked++;
        }
      }
    }
    return activatedIndices.length;
  }

  public handlePointerImpulse(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    nowSec: number,
  ): number {
    if (!this.root.visible || nowSec - this.lastImpulseTime < 0.09) return 0;
    this.lastImpulseTime = nowSec;
    _ndcVec.set(ndcX, ndcY);
    this.raycaster.setFromCamera(_ndcVec, camera);
    if (this.raycaster.ray.intersectPlane(this.interactPlane, this.hitPoint)) {
      _localHit.copy(this.hitPoint);
      this.root.worldToLocal(_localHit);
      return this.igniteAroundPoint(_localHit, 9.8);
    }
    return 0;
  }

  public triggerAccessiblePulse(): number {
    const unlit = this.nodes.filter((n) => n.activated < 0.5);
    const seed =
      unlit[Math.floor(unlit.length * 0.35)]?.pos ?? new THREE.Vector3(0, 0, 0);
    return this.igniteAroundPoint(seed, 11.5);
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 175, 225, 6, 7);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    const dt = clamp(elapsed - this.lastElapsed, 0.001, 0.1);
    this.lastElapsed = elapsed;

    const localProgress = smoothstep(176, 220, filmTime);
    const waveRadius = localProgress * 32.0;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      if (!node) continue;
      if (node.distFromCenter <= waveRadius && node.activated < 0.9) {
        node.activated = Math.min(1, node.activated + 0.06);
        if (node.activated > 0.55) {
          let nearest = -1;
          let bestDist = 7.6;
          for (let j = 0; j < this.nodes.length; j++) {
            const nodeJ = this.nodes[j];
            if (j === i || !nodeJ || nodeJ.activated < 0.5) continue;
            const d = node.pos.distanceTo(nodeJ.pos);
            if (d < bestDist) {
              bestDist = d;
              nearest = j;
            }
          }
          if (nearest >= 0) {
            this.addConnection(i, nearest);
          }
        }
      }

      const shimmer = 0.85 + 0.15 * Math.sin(elapsed * 2.0 + node.phase);
      const a = node.activated;
      this.nodeColors[i * 3] = THREE.MathUtils.lerp(0.28, 1.0, a) * shimmer;
      this.nodeColors[i * 3 + 1] = THREE.MathUtils.lerp(0.38, 0.88, a) * shimmer;
      this.nodeColors[i * 3 + 2] = THREE.MathUtils.lerp(0.68, 0.56, a) * shimmer;
    }

    if (this.nodeGeometry.attributes.color) {
      this.nodeGeometry.attributes.color.needsUpdate = true;
    }
    this.nodeMaterial.opacity = 0.84 * weight;
    if (this.lineMaterial.uniforms.uTime) {
      this.lineMaterial.uniforms.uTime.value = elapsed;
    }
    if (this.lineMaterial.uniforms.uOpacity) {
      this.lineMaterial.uniforms.uOpacity.value = 0.64 * weight;
    }

    this.root.rotation.y = (filmTime - 175) * 0.018;

    // Ambient expanding central ripple rings
    for (let i = 0; i < this.rippleRings.length; i++) {
      const ring = this.rippleRings[i];
      if (!ring) continue;
      const cycle = (elapsed * 0.24 + i / this.rippleRings.length) % 1;
      const scale = 1.0 + cycle * 28.0;
      ring.scale.setScalar(scale);
      (ring.material as THREE.MeshBasicMaterial).opacity =
        Math.sin(cycle * Math.PI) * 0.28 * weight * smoothstep(175, 182, filmTime);
    }

    // Interactive touch shockwave ripples
    for (const sw of this.touchShockwaves) {
      if (!sw.active) continue;
      sw.age += dt;
      const life = sw.age / 1.45;
      if (life >= 1) {
        sw.active = false;
        sw.mesh.visible = false;
        continue;
      }
      sw.mesh.scale.setScalar(0.8 + life * 13.5);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity =
        (1 - life) * (1 - life) * 0.72 * weight;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
