import * as THREE from 'three';
import {
  SHOOTING_STAR_TIME,
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  clamp,
  getChapterWeight,
  smoothstep,
} from '../../data/chapters';
import {
  BIG_BANG_FRAGMENT_SHADER,
  BIG_BANG_VERTEX_SHADER,
  GEODESIC_SINGULARITY_FRAGMENT_SHADER,
  GEODESIC_SINGULARITY_VERTEX_SHADER,
  createSoftGlowTexture,
} from '../shaders';

/**
 * Final Chapter: The Revelation (centered at 0, 0, -515).
 * 1. Converging celestial crown uniting golden network rings + Yin-Yang twin bands (335..364.5)
 * 2. Hard cosmic silence (365..370.5) — only one solitary golden star remains
 * 3. Radiant 3D golden particle burst expanding gracefully at 370.5..376
 * 4. Luminous 3D constellation lattice behind the monumental title reveal
 * 5. Subtle golden shooting star streaking across the upper sky at 387s
 */
export class TitleReveal {
  public readonly root = new THREE.Group();

  private readonly convergenceGroup = new THREE.Group();
  private readonly convergenceRings: THREE.Mesh[] = [];
  private readonly convergenceGeodesicMat: THREE.ShaderMaterial;
  private readonly convergenceGeodesicMesh: THREE.Mesh;
  private readonly burstMat: THREE.ShaderMaterial;
  private readonly burstPoints: THREE.Points;
  private readonly crownDust: THREE.Points;
  private readonly shootingStarGroup = new THREE.Group();
  private readonly shootingHead: THREE.Sprite;
  private readonly shootingTail: THREE.Line;
  private readonly shootingTailPositions: Float32Array;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(isMobile: boolean, pixelRatio: number) {
    this.root.position.set(0, 0, -515);

    const scaleFactor = isMobile ? 0.55 : 1.0;
    let s = 25112002;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    // 1. Converging celestial rings (echoing Earth astrolabe + Yin-Yang gold & violet)
    const ringSpecs = [
      { r: 10.5, tube: 0.055, col: 0xf1ce82, op: 0.72 },
      { r: 13.8, tube: 0.045, col: 0x8e72d8, op: 0.58 },
      { r: 17.2, tube: 0.04, col: 0xffe9b5, op: 0.62 },
      { r: 21.0, tube: 0.032, col: 0x5c80d4, op: 0.45 },
    ];
    ringSpecs.forEach((spec, idx) => {
      const geo = new THREE.TorusGeometry(spec.r, spec.tube, 12, 128);
      const mat = new THREE.MeshStandardMaterial({
        color: spec.col,
        emissive: spec.col,
        emissiveIntensity: 0.45,
        metalness: 0.9,
        roughness: 0.2,
        transparent: true,
        opacity: spec.op,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.set(idx * 0.45, idx * 0.65, idx * 0.25);
      mesh.userData.baseOp = spec.op;
      this.convergenceGroup.add(mesh);
      this.convergenceRings.push(mesh);
      this.disposables.push(geo, mat);
    });

    // True Geodesic Raymarched Convergence Portal bending 4K Milky Way starlight as it collapses into silence
    const fallbackTex = new THREE.DataTexture(new Uint8Array([1, 2, 6, 255]), 1, 1);
    fallbackTex.needsUpdate = true;
    const convGeo = new THREE.SphereGeometry(24.0, 42, 30);
    this.convergenceGeodesicMat = new THREE.ShaderMaterial({
      vertexShader: GEODESIC_SINGULARITY_VERTEX_SHADER,
      fragmentShader: GEODESIC_SINGULARITY_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, 0, -515) },
        uHorizonRadius: { value: 1.55 },
        uDiskOuterRadius: { value: 14.2 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSpin: { value: -0.92 },
        uInnerColor: { value: new THREE.Color('#fff6e0') },
        uOuterColor: { value: new THREE.Color('#8e64dc') },
        uMilkyWayMap: { value: fallbackTex },
        uHasMilkyWay: { value: 0.0 },
      },
    });
    this.convergenceGeodesicMesh = new THREE.Mesh(convGeo, this.convergenceGeodesicMat);
    this.convergenceGeodesicMesh.renderOrder = 2;
    this.root.add(this.convergenceGeodesicMesh);
    this.disposables.push(fallbackTex, convGeo, this.convergenceGeodesicMat);

    this.root.add(this.convergenceGroup);

    // 2. Golden Particle Supernova Burst (ignites from the single remaining star at 370.5s)
    const burstCount = Math.round(2800 * scaleFactor);
    const bGeo = new THREE.BufferGeometry();
    const bPos = new Float32Array(burstCount * 3);
    const bDir = new Float32Array(burstCount * 3);
    const bSpeed = new Float32Array(burstCount);
    const bSize = new Float32Array(burstCount);
    const bCol = new Float32Array(burstCount * 3);

    const goldPalette = [
      new THREE.Color('#fffaf0'),
      new THREE.Color('#f7d891'),
      new THREE.Color('#e3b45f'),
      new THREE.Color('#d2c0f0'),
    ];

    for (let i = 0; i < burstCount; i++) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const root1 = Math.sqrt(1 - u * u);
      bDir[i * 3] = root1 * Math.cos(phi);
      bDir[i * 3 + 1] = u * 0.68;
      bDir[i * 3 + 2] = root1 * Math.sin(phi) * 0.55;

      bSpeed[i] = 0.16 + Math.pow(rand(), 0.85) * 0.84;
      bSize[i] = 1.6 + rand() * 3.1;

      const c = goldPalette[Math.floor(rand() * goldPalette.length)];
      bCol[i * 3] = c.r;
      bCol[i * 3 + 1] = c.g;
      bCol[i * 3 + 2] = c.b;
    }

    bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    bGeo.setAttribute('aDirection', new THREE.BufferAttribute(bDir, 3));
    bGeo.setAttribute('aSpeed', new THREE.BufferAttribute(bSpeed, 1));
    bGeo.setAttribute('aSize', new THREE.BufferAttribute(bSize, 1));
    bGeo.setAttribute('aColor', new THREE.BufferAttribute(bCol, 3));

    this.burstMat = new THREE.ShaderMaterial({
      vertexShader: BIG_BANG_VERTEX_SHADER,
      fragmentShader: BIG_BANG_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uExpansion: { value: 0 },
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
      },
    });
    this.burstPoints = new THREE.Points(bGeo, this.burstMat);
    this.burstPoints.frustumCulled = false;
    this.root.add(this.burstPoints);
    this.disposables.push(bGeo, this.burstMat);

    // 3. Subtle constellation halo dust framing the final reveal
    const glowTex = createSoftGlowTexture('#fff8e6', '#ecc372');
    const haloCount = 140;
    const hGeo = new THREE.BufferGeometry();
    const hPos = new Float32Array(haloCount * 3);
    for (let i = 0; i < haloCount; i++) {
      const a = (i / haloCount) * Math.PI * 2;
      const rad = 11.5 + (rand() - 0.5) * 8.5;
      hPos[i * 3] = Math.cos(a) * rad * 1.45;
      hPos[i * 3 + 1] = Math.sin(a) * rad * 0.72;
      hPos[i * 3 + 2] = (rand() - 0.5) * 8;
    }
    hGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3));
    const hMat = new THREE.PointsMaterial({
      size: 0.78,
      map: glowTex,
      color: 0xf6d892,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.crownDust = new THREE.Points(hGeo, hMat);
    this.root.add(this.crownDust);
    this.disposables.push(glowTex, hGeo, hMat);

    // 4. Subtle Ending Golden Shooting Star (387s..393s)
    const headMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff8e2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shootingHead = new THREE.Sprite(headMat);
    this.shootingHead.scale.set(2.2, 2.2, 1);

    const tailCount = 24;
    this.shootingTailPositions = new Float32Array(tailCount * 3);
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(this.shootingTailPositions, 3));
    const tailMat = new THREE.LineBasicMaterial({
      color: 0xf7d894,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.shootingTail = new THREE.Line(tailGeo, tailMat);
    this.shootingStarGroup.add(this.shootingHead, this.shootingTail);
    this.root.add(this.shootingStarGroup);
    this.disposables.push(headMat, tailGeo, tailMat);
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 335, 415, 6.5, 4);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    // Phase 1: Convergence (335..364.5) then instant quiet collapse into silence (365)
    const preSilence = 1 - smoothstep(SILENCE_START - 2.2, SILENCE_START, filmTime);
    const convergeTight = smoothstep(336, 363.5, filmTime);
    const ringScale = THREE.MathUtils.lerp(1.45, 0.22, convergeTight);

    this.convergenceGroup.visible = preSilence > 0.005;
    this.convergenceGeodesicMesh.visible = preSilence > 0.005;
    if (this.convergenceGroup.visible) {
      this.convergenceGroup.scale.setScalar(ringScale);
      this.convergenceGroup.rotation.y = elapsed * 0.25;
      for (let i = 0; i < this.convergenceRings.length; i++) {
        const ring = this.convergenceRings[i];
        ring.rotation.x += 0.004 * (i + 1);
        ring.rotation.z -= 0.003 * (i + 1);
        const mat = ring.material as THREE.MeshStandardMaterial;
        mat.opacity = (ring.userData.baseOp as number) * weight * preSilence;
      }
      this.convergenceGeodesicMat.uniforms.uTime.value = elapsed * 1.25;
      this.convergenceGeodesicMat.uniforms.uOpacity.value = weight * preSilence * 0.94;
      this.convergenceGeodesicMat.uniforms.uHorizonRadius.value = 2.35 * ringScale;
      this.convergenceGeodesicMat.uniforms.uDiskOuterRadius.value = 12.6 * ringScale;
    }

    // Phase 2: Golden supernova particle burst right after hard silence (370.5 -> 382)
    const burstProgress = smoothstep(SILENCE_END, SILENCE_END + 10.5, filmTime);
    const burstOp = smoothstep(SILENCE_END - 0.1, SILENCE_END + 0.8, filmTime);
    this.burstMat.uniforms.uTime.value = elapsed;
    this.burstMat.uniforms.uExpansion.value = burstProgress * 0.82;
    this.burstMat.uniforms.uOpacity.value = burstOp * 0.68 * weight;

    // Gentle orbital framing dust behind the ISHA title
    const crownVis = smoothstep(TITLE_REVEAL_TIME, TITLE_REVEAL_TIME + 4.0, filmTime);
    (this.crownDust.material as THREE.PointsMaterial).opacity = crownVis * 0.65 * weight;
    this.crownDust.rotation.z = elapsed * 0.02;

    // Phase 3: Subtle Shooting Star gliding warmly across the upper sky (387s..392.5s)
    const shootP = clamp((filmTime - SHOOTING_STAR_TIME) / 5.2, 0, 1);
    const shootVis = shootP > 0 && shootP < 1 ? Math.sin(shootP * Math.PI) : 0;
    this.shootingHead.material.opacity = shootVis;
    (this.shootingTail.material as THREE.LineBasicMaterial).opacity = shootVis * 0.72;

    if (shootVis > 0.005) {
      const startX = -26;
      const endX = 28;
      const startY = 14.5;
      const endY = 4.2;
      const z = 4;

      const hx = THREE.MathUtils.lerp(startX, endX, shootP);
      const hy = THREE.MathUtils.lerp(startY, endY, shootP) - Math.sin(shootP * Math.PI) * 1.4;
      this.shootingHead.position.set(hx, hy, z);

      const count = this.shootingTailPositions.length / 3;
      for (let i = 0; i < count; i++) {
        const tp = clamp(shootP - (i / count) * 0.16, 0, 1);
        this.shootingTailPositions[i * 3] = THREE.MathUtils.lerp(startX, endX, tp);
        this.shootingTailPositions[i * 3 + 1] =
          THREE.MathUtils.lerp(startY, endY, tp) - Math.sin(tp * Math.PI) * 1.4;
        this.shootingTailPositions[i * 3 + 2] = z;
      }
      this.shootingTail.geometry.attributes.position.needsUpdate = true;
    }
  }

  public setMilkyWayTexture(tex: THREE.Texture | null): void {
    if (!tex) return;
    this.convergenceGeodesicMat.uniforms.uMilkyWayMap.value = tex;
    this.convergenceGeodesicMat.uniforms.uHasMilkyWay.value = 1.0;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
