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
 * with progressive luminous starlight beams and traveling leading sparks, framed by
 * 4 composite procedural 3D symbolic artifacts:
 * 1. Illuminated Open Tome (intelligence & relentless growth)
 * 2. Obsidian Summit Peak & Golden Beacon (ambition & doing extraordinary things)
 * 3. Cinema Aperture & Harmonic Sound Bars (movies & music)
 * 4. Strategic Polyhedral Game Constellation (games, wit & playful spirit)
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
  private readonly artifacts: THREE.Group[] = [];
  private readonly soundBars: THREE.Mesh[] = [];
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

    // Shared PBR materials for the 4 composite 3D symbolic artifacts
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe6c175,
      metalness: 0.92,
      roughness: 0.2,
    });
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x14192e,
      metalness: 0.28,
      roughness: 0.72,
    });
    const parchmentMat = new THREE.MeshStandardMaterial({
      color: 0xd8ccb5,
      metalness: 0.05,
      roughness: 0.85,
    });
    const violetCrystalMat = new THREE.MeshStandardMaterial({
      color: 0x6f59b8,
      metalness: 0.65,
      roughness: 0.28,
      emissive: 0x24164f,
      emissiveIntensity: 0.42,
    });
    this.disposables.push(goldMat, obsidianMat, parchmentMat, violetCrystalMat);

    // Artifact 1: Illuminated Open Book (6 distinct parts)
    const bookGroup = new THREE.Group();
    const coverGeo = new THREE.BoxGeometry(1.5, 0.08, 2.0);
    const spineGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.02, 12);
    const pageGeo = new THREE.BoxGeometry(1.36, 0.14, 1.84);
    const ribbonGeo = new THREE.BoxGeometry(0.08, 0.02, 2.25);

    const leftCover = new THREE.Mesh(coverGeo, obsidianMat);
    leftCover.position.set(-0.76, -0.05, 0);
    leftCover.rotation.z = 0.22;
    const rightCover = new THREE.Mesh(coverGeo, obsidianMat);
    rightCover.position.set(0.76, -0.05, 0);
    rightCover.rotation.z = -0.22;
    const spine = new THREE.Mesh(spineGeo, goldMat);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, -0.18, 0);
    const leftPage = new THREE.Mesh(pageGeo, parchmentMat);
    leftPage.position.set(-0.72, 0.07, 0);
    leftPage.rotation.z = 0.26;
    const rightPage = new THREE.Mesh(pageGeo, parchmentMat);
    rightPage.position.set(0.72, 0.07, 0);
    rightPage.rotation.z = -0.26;
    const ribbon = new THREE.Mesh(ribbonGeo, goldMat);
    ribbon.position.set(0.14, 0.16, 0.15);
    ribbon.rotation.z = -0.22;

    bookGroup.add(leftCover, rightCover, spine, leftPage, rightPage, ribbon);
    bookGroup.position.set(-12.6, 3.6, -4.4);
    this.root.add(bookGroup);
    this.artifacts.push(bookGroup);
    this.disposables.push(coverGeo, spineGeo, pageGeo, ribbonGeo);

    // Artifact 2: Obsidian Mountain Peak + Winding Golden Trail + Tiny Summit Beacon (6 parts)
    const mountainGroup = new THREE.Group();
    const baseGeo = new THREE.CylinderGeometry(1.85, 2.2, 0.24, 7);
    const mainPeakGeo = new THREE.ConeGeometry(1.65, 2.8, 6);
    const sidePeakGeo = new THREE.ConeGeometry(1.05, 1.85, 5);
    const capGeo = new THREE.ConeGeometry(0.45, 0.72, 6);
    const ringTrackGeo = new THREE.TorusGeometry(1.05, 0.04, 8, 48);

    const mBase = new THREE.Mesh(baseGeo, obsidianMat);
    const mainPeak = new THREE.Mesh(mainPeakGeo, obsidianMat);
    mainPeak.position.set(0, 1.48, 0);
    const sidePeak = new THREE.Mesh(sidePeakGeo, violetCrystalMat);
    sidePeak.position.set(-0.95, 0.96, 0.35);
    const snowCap = new THREE.Mesh(capGeo, goldMat);
    snowCap.position.set(0, 2.54, 0);
    const track = new THREE.Mesh(ringTrackGeo, goldMat);
    track.position.set(0, 0.85, 0);
    track.rotation.set(Math.PI * 0.44, 0.22, 0.15);

    const beaconSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTex,
        color: 0xfff5d6,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    beaconSprite.position.set(0, 3.15, 0);
    beaconSprite.scale.set(0.85, 0.85, 1);

    mountainGroup.add(mBase, mainPeak, sidePeak, snowCap, track, beaconSprite);
    mountainGroup.position.set(12.8, -2.0, -4.6);
    this.root.add(mountainGroup);
    this.artifacts.push(mountainGroup);
    this.disposables.push(
      baseGeo,
      mainPeakGeo,
      sidePeakGeo,
      capGeo,
      ringTrackGeo,
      beaconSprite.material,
    );

    // Artifact 3: Cinema Aperture Ring + Harmonic Musical Waveform Bars (11 parts)
    const musicFilmGroup = new THREE.Group();
    const outerReelGeo = new THREE.TorusGeometry(1.65, 0.09, 12, 48);
    const innerReelGeo = new THREE.TorusGeometry(1.25, 0.035, 10, 48);
    const outerReel = new THREE.Mesh(outerReelGeo, goldMat);
    const innerReel = new THREE.Mesh(innerReelGeo, violetCrystalMat);
    musicFilmGroup.add(outerReel, innerReel);

    const barGeo = new THREE.BoxGeometry(0.11, 1.0, 0.11);
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(barGeo, i % 2 === 0 ? goldMat : parchmentMat);
      bar.position.set((i - 4) * 0.22, 0, 0.12);
      bar.userData.barIndex = i;
      musicFilmGroup.add(bar);
      this.soundBars.push(bar);
    }
    musicFilmGroup.position.set(12.2, 4.5, -5.6);
    this.root.add(musicFilmGroup);
    this.artifacts.push(musicFilmGroup);
    this.disposables.push(outerReelGeo, innerReelGeo, barGeo);

    // Artifact 4: Strategic Game Polyhedron & Orbital Gimbal (6 parts)
    const gameGroup = new THREE.Group();
    const coreGeo = new THREE.IcosahedronGeometry(0.95, 0);
    const wireGeo = new THREE.IcosahedronGeometry(1.18, 0);
    const gimbalGeo = new THREE.TorusGeometry(1.55, 0.045, 10, 56);
    const nodeGeo = new THREE.OctahedronGeometry(0.18, 0);

    const core = new THREE.Mesh(coreGeo, violetCrystalMat);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xe6c175,
      wireframe: true,
      transparent: true,
      opacity: 0.52,
    });
    const wire = new THREE.Mesh(wireGeo, wireMat);
    const gimbal1 = new THREE.Mesh(gimbalGeo, goldMat);
    gimbal1.rotation.x = Math.PI * 0.35;
    const gimbal2 = new THREE.Mesh(gimbalGeo, obsidianMat);
    gimbal2.rotation.y = Math.PI * 0.45;
    const nodeA = new THREE.Mesh(nodeGeo, goldMat);
    nodeA.position.set(1.55, 0, 0);
    const nodeB = new THREE.Mesh(nodeGeo, goldMat);
    nodeB.position.set(-1.55, 0, 0);

    gameGroup.add(core, wire, gimbal1, gimbal2, nodeA, nodeB);
    gameGroup.position.set(-12.4, -2.6, -5.4);
    this.root.add(gameGroup);
    this.artifacts.push(gameGroup);
    this.disposables.push(coreGeo, wireGeo, wireMat, gimbalGeo, nodeGeo);
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

    // 4. Orbit & animate the 4 symbolic artifacts as the narrator describes each facet
    const reveals = [
      smoothstep(124, 132, filmTime), // Book (mind & improvement)
      smoothstep(115, 123, filmTime), // Mountain (ambition)
      smoothstep(150, 157, filmTime), // Movies & music
      smoothstep(148, 155, filmTime), // Games & playful wit
    ];

    this.artifacts.forEach((art, idx) => {
      const localScale = (0.32 + 0.68 * reveals[idx]) * weight;
      art.scale.setScalar(Math.max(0.001, localScale));
      art.rotation.y = elapsed * (0.22 + idx * 0.045);
      art.position.y += Math.sin(elapsed * 0.85 + idx * 1.7) * 0.0025;
    });

    // Live harmonic sound-wave bar animation
    for (let i = 0; i < this.soundBars.length; i++) {
      const bar = this.soundBars[i];
      const idx = bar.userData.barIndex as number;
      const h = 0.35 + 0.95 * Math.abs(Math.sin(elapsed * 2.4 + idx * 0.62));
      bar.scale.y = h;
    }
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
