import * as THREE from 'three';
import { getChapterWeight, smoothstep } from '../../data/chapters';
import {
  SAGITTARIUS_EDGES,
  SAGITTARIUS_STARS,
  evaluateSagittariusState,
} from '../sagittarius';
import {
  FILAMENT_FRAGMENT_SHADER,
  FILAMENT_VERTEX_SHADER,
  createSoftGlowTexture,
  createStarDiffractionTexture,
} from '../shaders';

const SEGMENTS_PER_EDGE = 6;

const _colStart = new THREE.Color();
const _colEnd = new THREE.Color();

/**
 * Chapter II: An Unusual Form of Existence (centered at 0, 4, -175).
 * Sequential star-by-star Sagittarius constellation (Archer's drawn bow, skyward arrow,
 * Teapot asterism core, and celestial crown/stance) connecting one star after another
 * with progressive luminous starlight beams and traveling leading sparks. The figure
 * itself carries the portrait: each trait is written in light by the narration overlay.
 */
export class ConstellationFigure {
  public readonly root = new THREE.Group();

  private readonly figureGroup = new THREE.Group();
  private readonly linePositions: Float32Array;
  private readonly lineGeometry: THREE.BufferGeometry;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly starSprites: THREE.Sprite[] = [];
  private readonly starHaloSprites: THREE.Sprite[] = [];
  private readonly leadingSpark: THREE.Sprite;
  private readonly auraRing: THREE.Mesh;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private completedEdges = 0;

  constructor() {
    this.root.position.set(0, 4, -175);

    const glowTex = createSoftGlowTexture('#fff8e6', '#e8be6c');
    const starTex = createStarDiffractionTexture(192);
    this.disposables.push(glowTex, starTex);

    // 1. Dynamic sequential Sagittarius constellation filament geometry
    const totalEdges = SAGITTARIUS_EDGES.length;
    const totalVerts = totalEdges * SEGMENTS_PER_EDGE * 2;
    this.linePositions = new Float32Array(totalVerts * 3);
    const lineColors = new Float32Array(totalVerts * 3);
    const lineProgress = new Float32Array(totalVerts);
    const linePhases = new Float32Array(totalVerts);

    for (let e = 0; e < totalEdges; e++) {
      const edge = SAGITTARIUS_EDGES[e];
      const phase = ((e * 37) % 100) / 100;

      // Palette per Sagittarius asterism group (bow/arrow warm gold, bowstring pale sapphire-violet)
      if (edge.group === 'arrow') {
        _colStart.set('#fff3cc');
        _colEnd.set('#f5c96e');
      } else if (edge.group === 'bow') {
        _colStart.set('#f8d58a');
        _colEnd.set('#cfa3ff');
      } else if (edge.group === 'string') {
        _colStart.set('#9bbcff');
        _colEnd.set('#967ae0');
      } else if (edge.group === 'teapot') {
        _colStart.set('#f0c878');
        _colEnd.set('#a8c4ff');
      } else {
        _colStart.set('#d8c08e');
        _colEnd.set('#8ca6e8');
      }

      const edgeVertStart = e * SEGMENTS_PER_EDGE * 2;
      for (let s = 0; s < SEGMENTS_PER_EDGE; s++) {
        const t0 = s / SEGMENTS_PER_EDGE;
        const t1 = (s + 1) / SEGMENTS_PER_EDGE;
        const v0 = edgeVertStart + s * 2;
        const v1 = v0 + 1;

        lineColors[v0 * 3] = THREE.MathUtils.lerp(_colStart.r, _colEnd.r, t0);
        lineColors[v0 * 3 + 1] = THREE.MathUtils.lerp(_colStart.g, _colEnd.g, t0);
        lineColors[v0 * 3 + 2] = THREE.MathUtils.lerp(_colStart.b, _colEnd.b, t0);

        lineColors[v1 * 3] = THREE.MathUtils.lerp(_colStart.r, _colEnd.r, t1);
        lineColors[v1 * 3 + 1] = THREE.MathUtils.lerp(_colStart.g, _colEnd.g, t1);
        lineColors[v1 * 3 + 2] = THREE.MathUtils.lerp(_colStart.b, _colEnd.b, t1);

        lineProgress[v0] = t0;
        lineProgress[v1] = t1;
        linePhases[v0] = phase;
        linePhases[v1] = phase;
      }
    }

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.lineGeometry.setAttribute('aColor', new THREE.BufferAttribute(lineColors, 3));
    this.lineGeometry.setAttribute('aProgress', new THREE.BufferAttribute(lineProgress, 1));
    this.lineGeometry.setAttribute('aPhase', new THREE.BufferAttribute(linePhases, 1));
    this.lineGeometry.setDrawRange(0, 0);

    this.lineMaterial = new THREE.ShaderMaterial({
      vertexShader: FILAMENT_VERTEX_SHADER,
      fragmentShader: FILAMENT_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
    });
    const figureLines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    figureLines.frustumCulled = false;
    this.figureGroup.add(figureLines);
    this.disposables.push(this.lineGeometry, this.lineMaterial);

    // 2. Authentic Sagittarius stars (crisp 4-point diffraction stars + subtle ignition flash halos)
    SAGITTARIUS_STARS.forEach((star, idx) => {
      const sMat = new THREE.SpriteMaterial({
        map: starTex,
        color: star.colorHex,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(sMat);
      sprite.position.set(star.pos[0], star.pos[1], star.pos[2]);
      sprite.userData.magnitude = star.magnitude;
      sprite.userData.phase = idx * 0.63;
      this.figureGroup.add(sprite);
      this.starSprites.push(sprite);

      const hMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: star.colorHex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(hMat);
      halo.position.set(star.pos[0], star.pos[1], star.pos[2]);
      this.figureGroup.add(halo);
      this.starHaloSprites.push(halo);

      this.disposables.push(sMat, hMat);
    });

    // Leading starlight spark traveling along each edge as it connects star-by-star
    const sparkMat = new THREE.SpriteMaterial({
      map: starTex,
      color: 0xfff8e6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.leadingSpark = new THREE.Sprite(sparkMat);
    this.leadingSpark.visible = false;
    this.figureGroup.add(this.leadingSpark);
    this.disposables.push(sparkMat);

    // Subtle celestial ecliptic framing ring behind Sagittarius
    const haloGeo = new THREE.TorusGeometry(7.6, 0.024, 12, 128);
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xd9b56e,
      metalness: 0.92,
      roughness: 0.2,
      transparent: true,
      opacity: 0.34,
    });
    this.auraRing = new THREE.Mesh(haloGeo, haloMat);
    this.auraRing.rotation.x = 0.28;
    this.figureGroup.add(this.auraRing);
    this.root.add(this.figureGroup);
    this.disposables.push(haloGeo, haloMat);
  }

  public getCompletedEdgesCount(): number {
    return this.completedEdges;
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 110, 175, 6.5, 6.5);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    const state = evaluateSagittariusState(filmTime);
    this.completedEdges = state.completedEdges;

    // 1. Update progressive star-by-star constellation lines
    let activeVerts = 0;
    for (let e = 0; e < state.edges.length; e++) {
      const edgeState = state.edges[e];
      if (edgeState.progress <= 0.0005) continue;

      const a = SAGITTARIUS_STARS[edgeState.from].pos;
      const b = SAGITTARIUS_STARS[edgeState.to].pos;
      const p = edgeState.progress;

      const edgeVertStart = activeVerts;
      for (let s = 0; s < SEGMENTS_PER_EDGE; s++) {
        const t0 = (s / SEGMENTS_PER_EDGE) * p;
        const t1 = ((s + 1) / SEGMENTS_PER_EDGE) * p;

        const v0 = edgeVertStart + s * 2;
        const v1 = v0 + 1;

        this.linePositions[v0 * 3] = a[0] + (b[0] - a[0]) * t0;
        this.linePositions[v0 * 3 + 1] = a[1] + (b[1] - a[1]) * t0;
        this.linePositions[v0 * 3 + 2] = a[2] + (b[2] - a[2]) * t0;

        this.linePositions[v1 * 3] = a[0] + (b[0] - a[0]) * t1;
        this.linePositions[v1 * 3 + 1] = a[1] + (b[1] - a[1]) * t1;
        this.linePositions[v1 * 3 + 2] = a[2] + (b[2] - a[2]) * t1;
      }
      activeVerts += SEGMENTS_PER_EDGE * 2;
    }

    this.lineGeometry.setDrawRange(0, activeVerts);
    this.lineGeometry.attributes.position.needsUpdate = true;
    this.lineMaterial.uniforms.uTime.value = elapsed;
    this.lineMaterial.uniforms.uOpacity.value = 0.96 * weight;

    // 2. Update leading star-spark traveling along the active connecting beam
    if (state.sparkPos) {
      this.leadingSpark.visible = true;
      this.leadingSpark.position.set(state.sparkPos[0], state.sparkPos[1], state.sparkPos[2]);
      const sparkScale = 1.25 + 0.25 * Math.sin(elapsed * 14.0);
      this.leadingSpark.scale.set(sparkScale, sparkScale, 1);
      this.leadingSpark.material.opacity = 0.94 * weight;
    } else {
      this.leadingSpark.visible = false;
    }

    // 3. Update each Sagittarius star's ignition, diffraction twinkle & birth flash halo
    for (let i = 0; i < this.starSprites.length; i++) {
      const sprite = this.starSprites[i];
      const halo = this.starHaloSprites[i];
      const starState = state.stars[i];
      const mag = sprite.userData.magnitude as number;
      const phase = sprite.userData.phase as number;

      const twinkle = 0.9 + 0.12 * Math.sin(elapsed * 2.1 + phase);
      const dormantScale = 0.34 * mag;
      const litScale = (0.78 + mag * 0.56) * twinkle + starState.flash * 0.95;
      const finalScale = THREE.MathUtils.lerp(dormantScale, litScale, starState.lit);

      sprite.scale.set(finalScale, finalScale, 1);
      sprite.material.opacity =
        THREE.MathUtils.lerp(0.18, 0.94, starState.lit) * weight;

      const haloAlpha = (starState.flash * 0.72 + starState.lit * 0.16) * weight;
      halo.visible = haloAlpha > 0.01;
      if (halo.visible) {
        const haloScale = finalScale * (1.7 + starState.flash * 1.4);
        halo.scale.set(haloScale, haloScale, 1);
        halo.material.opacity = haloAlpha;
      }
    }

    // Subtle ecliptic ring rises softly as Sagittarius nears completion
    (this.auraRing.material as THREE.MeshStandardMaterial).opacity =
      (0.12 + 0.24 * state.overallProgress) * weight;
    this.auraRing.rotation.z = elapsed * 0.055;

    // Gentle orbital breathing of the Sagittarius constellation lifted cleanly above subtitles
    this.figureGroup.rotation.y = Math.sin(elapsed * 0.2) * 0.12;
    this.figureGroup.position.y = 0.75 + Math.sin(elapsed * 0.55) * 0.18;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
