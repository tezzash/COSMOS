import * as THREE from 'three';
import { getChapterWeight, smoothstep } from '../../data/chapters';
import { FigureEightCurlBuffer, evaluateLemniscate3D } from '../figureEightCurl';
import {
  BINARY_STAR_FRAGMENT_SHADER,
  BINARY_STAR_VERTEX_SHADER,
  GRAV_WAVE_DISK_FRAGMENT_SHADER,
  GRAV_WAVE_DISK_VERTEX_SHADER,
  STARFIELD_FRAGMENT_SHADER,
  STARFIELD_VERTEX_SHADER,
  TIDAL_BRIDGE_FRAGMENT_SHADER,
  TIDAL_BRIDGE_VERTEX_SHADER,
  createSoftGlowTexture,
  createStarDiffractionTexture,
} from '../shaders';

/**
 * Chapter IV: Celestial Equilibrium (centered at 0, 0, -340).
 *
 * A binary star system locked in a gravitational dance where magnetized plasma
 * streams flow continuously between both stars in a true 3D figure-eight (∞)
 * Bernoulli lemniscate pattern driven by a divergence-free curl-noise buffer:
 * - Star I (Golden Sovereign — Precision, Structure, Purpose): Procedural 3D convective
 *   solar photosphere framed by whisper-thin brushed-gold precision gyroscope astrolabe rings.
 * - Star II (Sapphire-Violet Dreamer — Spontaneity, Playfulness, Warmth): Opalescent
 *   indigo-violet plasma star orbited by eccentric crystalline companion moons.
 * - Figure-Eight Curl-Noise Plasma Buffer (3,600 live curl-advected motes) + 3 closed
 *   volumetric figure-eight lemniscate plasma ribbons crossing through the Lagrange L1 spark.
 * - Quadrupole relativistic gravitational-wave harmonic disk in deep obsidian space.
 */
export class CelestialEquilibrium {
  public readonly root = new THREE.Group();
  public readonly curlParticleCount: number;

  private readonly binarySystem = new THREE.Group();
  private readonly figureEightFrame = new THREE.Group();
  private readonly ribbonsGroup = new THREE.Group();
  private readonly goldStarGroup = new THREE.Group();
  private readonly violetStarGroup = new THREE.Group();

  private readonly goldStarMat: THREE.ShaderMaterial;
  private readonly violetStarMat: THREE.ShaderMaterial;
  private readonly goldCoronaMat: THREE.SpriteMaterial;
  private readonly violetCoronaMat: THREE.SpriteMaterial;
  private readonly l1SparkMat: THREE.SpriteMaterial;
  private readonly l1Spark: THREE.Sprite;

  private readonly curlBuffer: FigureEightCurlBuffer;
  private readonly curlPosAttr: THREE.BufferAttribute;
  private readonly curlColAttr: THREE.BufferAttribute;
  private readonly curlPointsMat: THREE.ShaderMaterial;

  private readonly gravWaveMat: THREE.ShaderMaterial;
  private readonly lemniscateRibbonMats: THREE.ShaderMaterial[] = [];
  private readonly goldGyroRings: THREE.Mesh[] = [];
  private readonly violetMoons: Array<{
    pivot: THREE.Group;
    speed: number;
    phase: number;
  }> = [];

  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(isMobile: boolean, pixelRatio: number) {
    this.root.position.set(0, 0, -340);

    const goldGlowTex = createSoftGlowTexture('#fff8e6', '#e4a948');
    const violetGlowTex = createSoftGlowTexture('#eef4ff', '#6a58e8');
    const starDiffTex = createStarDiffractionTexture(192);
    this.disposables.push(goldGlowTex, violetGlowTex, starDiffTex);

    // 1. Star I — The Golden Sovereign Star (Precision, Structure, Purpose)
    const starGeo = new THREE.SphereGeometry(2.35, 48, 36);
    this.goldStarMat = new THREE.ShaderMaterial({
      vertexShader: BINARY_STAR_VERTEX_SHADER,
      fragmentShader: BINARY_STAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uCoreColor: { value: new THREE.Color('#fff9ea') },
        uMidColor: { value: new THREE.Color('#e3a745') },
        uRimColor: { value: new THREE.Color('#ffda8c') },
        uSeed: { value: 1.7 },
      },
    });
    this.goldStarGroup.add(new THREE.Mesh(starGeo, this.goldStarMat));

    this.goldCoronaMat = new THREE.SpriteMaterial({
      map: goldGlowTex,
      color: 0xf4c870,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const goldCorona = new THREE.Sprite(this.goldCoronaMat);
    goldCorona.scale.set(11.0, 11.0, 1);
    this.goldStarGroup.add(goldCorona);

    const brushedGoldMat = new THREE.MeshStandardMaterial({
      color: 0xf2d492,
      emissive: 0x70501b,
      emissiveIntensity: 0.42,
      metalness: 0.92,
      roughness: 0.18,
      transparent: true,
      opacity: 0.78,
    });
    const whiteGoldMat = new THREE.MeshStandardMaterial({
      color: 0xfaf2df,
      emissive: 0x524426,
      emissiveIntensity: 0.3,
      metalness: 0.88,
      roughness: 0.22,
      transparent: true,
      opacity: 0.62,
    });
    this.disposables.push(starGeo, this.goldStarMat, this.goldCoronaMat, brushedGoldMat, whiteGoldMat);

    // Delicate precision brushed-gold gyroscope rings orbiting Star I
    const gyroSpecs = [
      { r: 3.35, tube: 0.03, tiltX: 1.18, tiltY: 0.28 },
      { r: 4.3, tube: 0.023, tiltX: 0.52, tiltY: -0.64 },
      { r: 5.2, tube: 0.018, tiltX: -0.82, tiltY: 0.42 },
    ];
    gyroSpecs.forEach((spec, idx) => {
      const rGeo = new THREE.TorusGeometry(spec.r, spec.tube, 14, 112);
      const mesh = new THREE.Mesh(rGeo, idx % 2 === 0 ? brushedGoldMat : whiteGoldMat);
      mesh.rotation.set(spec.tiltX, spec.tiltY, idx * 0.4);
      this.goldStarGroup.add(mesh);
      this.goldGyroRings.push(mesh);
      this.disposables.push(rGeo);
    });

    // 2. Star II — The Sapphire-Violet Dreamer Star (Spontaneity, Playfulness, Warmth)
    const violetStarGeo = new THREE.SphereGeometry(2.15, 48, 36);
    this.violetStarMat = new THREE.ShaderMaterial({
      vertexShader: BINARY_STAR_VERTEX_SHADER,
      fragmentShader: BINARY_STAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uCoreColor: { value: new THREE.Color('#e9f0ff') },
        uMidColor: { value: new THREE.Color('#5a5ee0') },
        uRimColor: { value: new THREE.Color('#a688ff') },
        uSeed: { value: 7.3 },
      },
    });
    this.violetStarGroup.add(new THREE.Mesh(violetStarGeo, this.violetStarMat));

    this.violetCoronaMat = new THREE.SpriteMaterial({
      map: violetGlowTex,
      color: 0x8678ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const violetCorona = new THREE.Sprite(this.violetCoronaMat);
    violetCorona.scale.set(10.5, 10.5, 1);
    this.violetStarGroup.add(violetCorona);
    this.disposables.push(violetStarGeo, this.violetStarMat, this.violetCoronaMat);

    // 3 eccentric crystalline companion moons & gossamer comet tracks around Star II
    const moonGeo = new THREE.SphereGeometry(0.17, 16, 12);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xdce6ff,
      emissive: 0x7c72f0,
      emissiveIntensity: 0.78,
      roughness: 0.25,
      metalness: 0.4,
    });
    const cometTrackMat = new THREE.MeshBasicMaterial({
      color: 0x7a88e8,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(moonGeo, moonMat, cometTrackMat);

    const moonOrbits = [
      { r: 3.2, tiltX: 0.72, tiltZ: 0.35, speed: 0.85, phase: 0.4 },
      { r: 4.1, tiltX: -0.95, tiltZ: 0.6, speed: -0.62, phase: 2.3 },
      { r: 4.95, tiltX: 0.35, tiltZ: -0.82, speed: 0.48, phase: 4.5 },
    ];
    moonOrbits.forEach((mo) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(mo.tiltX, 0, mo.tiltZ);
      const trackGeo = new THREE.TorusGeometry(mo.r, 0.012, 8, 96);
      pivot.add(new THREE.Mesh(trackGeo, cometTrackMat));

      const moonMesh = new THREE.Mesh(moonGeo, moonMat);
      moonMesh.position.set(mo.r, 0, 0);
      const moonHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: starDiffTex,
          color: 0xc2d0ff,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      moonHalo.position.set(mo.r, 0, 0);
      moonHalo.scale.set(1.2, 1.2, 1);
      pivot.add(moonMesh, moonHalo);

      this.violetStarGroup.add(pivot);
      this.violetMoons.push({ pivot, speed: mo.speed, phase: mo.phase });
      this.disposables.push(trackGeo, moonHalo.material);
    });

    // 3. Dedicated Dynamic Figure-Eight (∞) Curl-Noise Plasma Stream Buffer
    const streamCount = isMobile ? 1900 : 3600;
    this.curlParticleCount = streamCount;
    this.curlBuffer = new FigureEightCurlBuffer(streamCount, 25112002);

    const curlGeo = new THREE.BufferGeometry();
    this.curlPosAttr = new THREE.BufferAttribute(this.curlBuffer.positions, 3);
    this.curlPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.curlColAttr = new THREE.BufferAttribute(this.curlBuffer.colors, 3);
    this.curlColAttr.setUsage(THREE.DynamicDrawUsage);
    curlGeo.setAttribute('position', this.curlPosAttr);
    curlGeo.setAttribute('aColor', this.curlColAttr);
    curlGeo.setAttribute('aScale', new THREE.BufferAttribute(this.curlBuffer.scales, 1));
    curlGeo.setAttribute('aPhase', new THREE.BufferAttribute(this.curlBuffer.phases, 1));

    this.curlPointsMat = new THREE.ShaderMaterial({
      vertexShader: STARFIELD_VERTEX_SHADER,
      fragmentShader: STARFIELD_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uBurst: { value: 0 },
        uParallaxOffset: { value: new THREE.Vector3() },
        uVelocityStretch: { value: 0 },
      },
    });
    const curlPoints = new THREE.Points(curlGeo, this.curlPointsMat);
    curlPoints.frustumCulled = false;
    this.figureEightFrame.add(curlPoints);
    this.disposables.push(curlGeo, this.curlPointsMat);

    // 4. Sculpted Closed 3D Volumetric Figure-Eight (∞) Lemniscate Plasma Ribbons
    //    Looping continuously around BOTH stars and crossing cleanly through Lagrange L1
    const ribbonSpecs = [
      { halfSpan: 12.6, loopRatio: 0.94, zAmp: 1.55, radius: 0.26, flowDir: 1.0, offsetY: 0 },
      { halfSpan: 13.4, loopRatio: 1.08, zAmp: -1.75, radius: 0.18, flowDir: -1.0, offsetY: 0.22 },
      { halfSpan: 11.8, loopRatio: 0.82, zAmp: 1.15, radius: 0.14, flowDir: 1.0, offsetY: -0.22 },
    ];
    ribbonSpecs.forEach((spec) => {
      const pts: THREE.Vector3[] = [];
      const steps = 96;
      const tmp = { x: 0, y: 0, z: 0 };
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        evaluateLemniscate3D(theta, spec.halfSpan, spec.loopRatio, spec.zAmp, tmp);
        pts.push(new THREE.Vector3(tmp.x, tmp.y + spec.offsetY * Math.sin(theta * 3), tmp.z));
      }
      const closedCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const tubeGeo = new THREE.TubeGeometry(closedCurve, 160, spec.radius, 10, true);
      const mat = new THREE.ShaderMaterial({
        vertexShader: TIDAL_BRIDGE_VERTEX_SHADER,
        fragmentShader: TIDAL_BRIDGE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uFlowDir: { value: spec.flowDir },
          uGoldColor: { value: new THREE.Color('#f6cb78') },
          uVioletColor: { value: new THREE.Color('#7382f8') },
        },
      });
      this.ribbonsGroup.add(new THREE.Mesh(tubeGeo, mat));
      this.lemniscateRibbonMats.push(mat);
      this.disposables.push(tubeGeo, mat);
    });
    this.figureEightFrame.add(this.ribbonsGroup);

    // Radiant Lagrange L1 equilibrium spark pulsing at the exact figure-eight crossover (0, 0, 0)
    this.l1SparkMat = new THREE.SpriteMaterial({
      map: starDiffTex,
      color: 0xfff8ec,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.l1Spark = new THREE.Sprite(this.l1SparkMat);
    this.l1Spark.scale.set(3.4, 3.4, 1);
    this.figureEightFrame.add(this.l1Spark);
    this.disposables.push(this.l1SparkMat);

    // 5. Quadrupole Relativistic Gravitational-Wave Harmonic Spacetime Disk
    //    Lies directly in the binary orbital plane behind the stars, phase-locked to the orbit
    const diskGeo = new THREE.PlaneGeometry(46, 46);
    this.gravWaveMat = new THREE.ShaderMaterial({
      vertexShader: GRAV_WAVE_DISK_VERTEX_SHADER,
      fragmentShader: GRAV_WAVE_DISK_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uConverge: { value: 0 },
      },
    });
    const gravDisk = new THREE.Mesh(diskGeo, this.gravWaveMat);
    gravDisk.position.z = -1.4;
    this.figureEightFrame.add(gravDisk);
    this.disposables.push(diskGeo, this.gravWaveMat);

    // Lock both stars inside figureEightFrame so they remain strictly centered in the twin ∞ lobes
    this.figureEightFrame.add(this.goldStarGroup, this.violetStarGroup);
    this.binarySystem.add(this.figureEightFrame);
    this.root.add(this.binarySystem);
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 225, 285, 6.5, 6.5);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    // 225..248: Twin stars approach from opposite horizons into binary capture
    // 248..278: Locked gravitational dance with figure-eight curl-noise plasma streams
    // 278..285: Serene harmonic release into Chapter V Quiet Hours
    const converge = smoothstep(227, 248, filmTime);
    const dissolve = smoothstep(279, 285, filmTime);
    const activeOp = weight * (1 - dissolve * 0.85);

    // Binary star orbital radius eases from wide capture (13.2) into figure-eight foci (7.6)
    const starFocusRadius = THREE.MathUtils.lerp(13.2, 7.6, converge) + dissolve * 3.5;
    const orbitalAngle = (filmTime - 225) * 0.125;

    // Gentle 3D orbital plane inclination so the figure-eight infinity dance reads clearly at every instant
    this.binarySystem.rotation.x = 0.24 + Math.sin(elapsed * 0.16) * 0.07;
    this.binarySystem.rotation.y = Math.sin(elapsed * 0.13) * 0.22;
    this.binarySystem.rotation.z = -0.06;

    // Orbit continuously in the tilted celestial plane (never collapses edge-on to camera)
    this.figureEightFrame.rotation.z = orbitalAngle;

    // Stars stay 100% locked at the exact twin foci (±starFocusRadius, 0, 0) of the figure-eight loops
    this.goldStarGroup.position.set(starFocusRadius, 0, 0);
    this.violetStarGroup.position.set(-starFocusRadius, 0, 0);

    // Scale ribbons uniformly to match the twin foci without distorting the spherical stars
    const lemniscateScale = starFocusRadius / 7.6;
    this.ribbonsGroup.scale.setScalar(lemniscateScale);

    // Step the divergence-free 3D curl-noise figure-eight plasma stream buffer around the active span
    this.curlBuffer.update(elapsed, starFocusRadius * 1.66, converge, dissolve);
    this.curlPosAttr.needsUpdate = true;
    this.curlColAttr.needsUpdate = true;
    this.curlPointsMat.uniforms.uTime.value = elapsed;
    this.curlPointsMat.uniforms.uOpacity.value = activeOp * (0.45 + 0.55 * converge);

    // Precision gyroscope astrolabe rings spin smoothly around Star I
    for (let i = 0; i < this.goldGyroRings.length; i++) {
      this.goldGyroRings[i].rotation.z = elapsed * (0.24 + i * 0.11) * (i % 2 === 0 ? 1 : -1);
    }

    // Playful eccentric moons dance around Star II
    for (let i = 0; i < this.violetMoons.length; i++) {
      const m = this.violetMoons[i];
      m.pivot.rotation.y = elapsed * m.speed + m.phase;
    }

    // Update procedural binary star photospheres & coronas
    this.goldStarMat.uniforms.uTime.value = elapsed;
    this.goldStarMat.uniforms.uOpacity.value = activeOp;
    this.violetStarMat.uniforms.uTime.value = elapsed;
    this.violetStarMat.uniforms.uOpacity.value = activeOp;

    const coronaPulse = 0.92 + 0.08 * Math.sin(elapsed * 1.6);
    this.goldCoronaMat.opacity = activeOp * 0.44 * coronaPulse;
    this.violetCoronaMat.opacity = activeOp * 0.46 * (1.0 - 0.08 * Math.sin(elapsed * 1.6));

    // Volumetric figure-eight lemniscate ribbons ignite warmly as the stars lock into orbit
    const ribbonIntensity = smoothstep(0.22, 0.95, converge) * activeOp;
    for (let i = 0; i < this.lemniscateRibbonMats.length; i++) {
      this.lemniscateRibbonMats[i].uniforms.uTime.value = elapsed + i * 0.9;
      this.lemniscateRibbonMats[i].uniforms.uOpacity.value = ribbonIntensity * (0.56 - i * 0.1);
    }

    // Lagrange L1 central crossover spark pulses softly at the exact center of balance
    const sparkPulse = 2.8 + Math.sin(elapsed * 2.2) * 0.45;
    this.l1Spark.scale.set(sparkPulse, sparkPulse, 1);
    this.l1SparkMat.opacity = ribbonIntensity * 0.85;

    // Gravitational-wave spacetime spiral disk radiates subtly beneath the binary pair
    this.gravWaveMat.uniforms.uTime.value = elapsed;
    this.gravWaveMat.uniforms.uOpacity.value = activeOp * 0.68;
    this.gravWaveMat.uniforms.uConverge.value = converge;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
