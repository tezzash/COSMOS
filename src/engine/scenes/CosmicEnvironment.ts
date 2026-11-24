import * as THREE from 'three';
import milkyWay4k from '@/assets/textures/milky_way_4k.jpg';
import { SILENCE_END, SILENCE_START, clamp, smoothstep } from '@/data/chapters';
import { type ShaderPrecision } from '@/engine/deviceProfile';
import { buildHyderabadHipparcosStarfield } from '@/engine/hipparcos';
import { type ParallaxInput, type ParallaxOptions, writeParallaxOffset } from '@/engine/parallax';
import {
  BIG_BANG_FRAGMENT_SHADER,
  BIG_BANG_VERTEX_SHADER,
  GEODESIC_SINGULARITY_FRAGMENT_SHADER,
  GEODESIC_SINGULARITY_VERTEX_SHADER,
  GOD_RAYS_FRAGMENT_SHADER,
  GOD_RAYS_VERTEX_SHADER,
  MILKY_WAY_SKY_FRAGMENT_SHADER,
  MILKY_WAY_SKY_VERTEX_SHADER,
  NEAR_DEBRIS_FRAGMENT_SHADER,
  NEAR_DEBRIS_VERTEX_SHADER,
  NEBULA_FRAGMENT_SHADER,
  NEBULA_VERTEX_SHADER,
  STARFIELD_FRAGMENT_SHADER,
  STARFIELD_VERTEX_SHADER,
  createNebulaCloudTexture,
  createSoftGlowTexture,
} from '@/engine/shaders';
import {
  type InteractiveFieldInfluence,
  type NarrationCosmicReactivity,
  computeInteractiveFieldInfluence,
  computeNarrationCosmicReactivity,
} from '@/engine/dynamicNebulaField';
import { DynamicNebulaParticles } from './DynamicNebulaParticles';
import { ProceduralGalaxySystem } from './ProceduralGalaxySystem';

const _parallaxTarget = new THREE.Vector3();

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Global deep-space environment shared continuously across all chapters:
 * - Three parallax blackbody starfield layers with 4-point telescope diffraction spikes
 * - Ultra-near spatial micro-dust & bokeh debris layer (highest parallax depth factor)
 * - Volumetric self-shadowed nebula clouds tinted deep midnight blue, violet & ancient gold
 * - Three distant inclined spiral galaxies
 * - Opening Prologue Gargantua-inspired relativistic accretion disk & curl-noise Big Bang
 * - Persistent Guiding Star anchor with crepuscular god-rays weaving through every chapter
 */
export class CosmicEnvironment {
  public readonly root = new THREE.Group();
  public readonly guidingStar = new THREE.Group();

  private readonly starMaterials: THREE.ShaderMaterial[] = [];
  private readonly starfieldLayers: Array<{
    mat: THREE.ShaderMaterial;
    geo: THREE.BufferGeometry;
    fullCount: number;
    depthFactor: number;
  }> = [];
  private readonly hipparcosPoints: THREE.Points;
  private readonly hipparcosGeo: THREE.BufferGeometry;
  private readonly hipparcosMat: THREE.ShaderMaterial;
  private readonly hipparcosCount: number;
  private readonly nearDebrisMat: THREE.ShaderMaterial;
  private readonly nearDebrisDepthFactor = 0.92;
  private readonly nebulaMeshes: THREE.Mesh[] = [];
  private readonly nebulaMaterials: THREE.ShaderMaterial[] = [];
  public readonly dynamicNebulae: DynamicNebulaParticles;
  public readonly galaxySystem: ProceduralGalaxySystem;
  private readonly bigBangGroup = new THREE.Group();
  private readonly bigBangMat: THREE.ShaderMaterial;
  private readonly singularityGeodesicMat: THREE.ShaderMaterial;
  private readonly singularitySphere: THREE.Mesh;
  private readonly singularityCore: THREE.Sprite;
  private readonly singularityHalo: THREE.Sprite;
  private readonly guidingCore: THREE.Sprite;
  private readonly guidingHalo: THREE.Sprite;
  private readonly guidingRaysMesh: THREE.Mesh;
  private readonly guidingRaysMat: THREE.ShaderMaterial;
  private readonly guidingLight: THREE.PointLight;
  private readonly milkyWaySphere: THREE.Mesh;
  private readonly milkyWayMat: THREE.ShaderMaterial;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private milkyWayTexture: THREE.Texture | null = null;
  private milkyWayLoaded = false;
  private ambientPrecision: ShaderPrecision;
  private disposed = false;

  constructor(
    isMobile: boolean,
    pixelRatio: number,
    maxAnisotropy = 4,
    onAssetSettled?: (loaded: boolean) => void,
    ambientShaderPrecision: ShaderPrecision = 'highp',
  ) {
    this.ambientPrecision = ambientShaderPrecision;
    const rand = seededRandom(20021125);
    const scaleFactor = isMobile ? 0.55 : 1.0;

    // 0. Deep-space 4K Milky Way Celestial Sphere (follows camera; dark-cinema contrast-crushed)
    const skyFallbackData = new Uint8Array([1, 2, 6, 255]);
    const skyFallbackTex = new THREE.DataTexture(skyFallbackData, 1, 1);
    skyFallbackTex.needsUpdate = true;

    const skyGeo = new THREE.SphereGeometry(460, 48, 32);
    this.milkyWayMat = new THREE.ShaderMaterial({
      vertexShader: MILKY_WAY_SKY_VERTEX_SHADER,
      fragmentShader: MILKY_WAY_SKY_FRAGMENT_SHADER,
      precision: ambientShaderPrecision,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uMap: { value: skyFallbackTex },
        uOpacity: { value: 0 },
      },
    });
    this.milkyWaySphere = new THREE.Mesh(skyGeo, this.milkyWayMat);
    this.milkyWaySphere.renderOrder = -10;
    this.milkyWaySphere.frustumCulled = false;
    this.milkyWaySphere.rotation.set(0.38, -0.65, 0.24);
    this.root.add(this.milkyWaySphere);
    this.disposables.push(skyFallbackTex, skyGeo, this.milkyWayMat);

    const skyLoader = new THREE.TextureLoader();
    skyLoader.load(
      milkyWay4k,
      (tex) => {
        if (this.disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAnisotropy;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        this.milkyWayMat.uniforms.uMap!.value = tex;
        this.singularityGeodesicMat.uniforms.uMilkyWayMap!.value = tex;
        this.singularityGeodesicMat.uniforms.uHasMilkyWay!.value = 1.0;
        this.milkyWayTexture = tex;
        this.disposables.push(tex);
        this.milkyWayLoaded = true;
        onAssetSettled?.(true);
      },
      undefined,
      () => {
        if (!this.disposed) {
          onAssetSettled?.(false);
        }
      },
    );

    // 0b. Real Astronomical Hipparcos / Gaia Star Catalog Vault (~9,000 stars on desktop,
    //     4,800 on mobile) oriented precisely to the Hyderabad sky on 25 November 2002
    const hipCount = isMobile ? 4800 : 9000;
    const hipData = buildHyderabadHipparcosStarfield(hipCount, 385);
    this.hipparcosCount = hipData.count;
    const hipGeo = new THREE.BufferGeometry();
    this.hipparcosGeo = hipGeo;
    hipGeo.setAttribute('position', new THREE.BufferAttribute(hipData.positions, 3));
    hipGeo.setAttribute('aScale', new THREE.BufferAttribute(hipData.scales, 1));
    hipGeo.setAttribute('aPhase', new THREE.BufferAttribute(hipData.phases, 1));
    hipGeo.setAttribute('aColor', new THREE.BufferAttribute(hipData.colors, 3));

    this.hipparcosMat = new THREE.ShaderMaterial({
      vertexShader: STARFIELD_VERTEX_SHADER,
      fragmentShader: STARFIELD_FRAGMENT_SHADER,
      precision: 'highp',
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
    this.hipparcosPoints = new THREE.Points(hipGeo, this.hipparcosMat);
    this.hipparcosPoints.frustumCulled = false;
    this.hipparcosPoints.renderOrder = -8;
    this.root.add(this.hipparcosPoints);
    this.starMaterials.push(this.hipparcosMat);
    this.disposables.push(hipGeo, this.hipparcosMat);

    // 1. Multi-layer parallax corridor starfields spanning the entire Z corridor (+60 to -620)
    // Ordered far -> mid -> near with increasing depthFactor so distant stars move slower
    const layers = [
      { count: Math.round(1400 * scaleFactor), radiusMin: 85, radiusMax: 240, sizeMin: 1.0, sizeMax: 2.9, depthFactor: 0.1 },
      { count: Math.round(1200 * scaleFactor), radiusMin: 40, radiusMax: 130, sizeMin: 1.4, sizeMax: 3.7, depthFactor: 0.28 },
      { count: Math.round(480 * scaleFactor), radiusMin: 18, radiusMax: 72, sizeMin: 2.1, sizeMax: 4.8, depthFactor: 0.56 },
    ];

    // True Planckian blackbody spectral star palette (O -> B -> A/F -> G -> K -> M)
    const palette = [
      new THREE.Color('#9bb8ff'), // O-type deep sapphire blue
      new THREE.Color('#cadcff'), // B/A-type luminous blue-white
      new THREE.Color('#f7f9ff'), // F-type crisp astronomical white
      new THREE.Color('#fff2d6'), // G-type warm solar cream
      new THREE.Color('#ffd194'), // K-type restrained amber gold
      new THREE.Color('#ffae68'), // M-type subtle ember gold
      new THREE.Color('#cbbcff'), // Pale celestial violet star
    ];

    layers.forEach((layer) => {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(layer.count * 3);
      const scales = new Float32Array(layer.count);
      const phases = new Float32Array(layer.count);
      const colors = new Float32Array(layer.count * 3);

      for (let i = 0; i < layer.count; i++) {
        const theta = rand() * Math.PI * 2;
        const r = layer.radiusMin + Math.pow(rand(), 0.72) * (layer.radiusMax - layer.radiusMin);
        const z = 75 - rand() * 720;
        positions[i * 3] = Math.cos(theta) * r;
        positions[i * 3 + 1] = Math.sin(theta) * r * 0.72;
        positions[i * 3 + 2] = z;

        // Power-law stellar magnitude distribution: most pinpoint, rare bright diffraction stars
        scales[i] = layer.sizeMin + Math.pow(rand(), 2.65) * (layer.sizeMax - layer.sizeMin);
        phases[i] = rand();

        const col = palette[Math.floor(rand() * palette.length)];
        if (col) {
          colors[i * 3] = col.r;
          colors[i * 3 + 1] = col.g;
          colors[i * 3 + 2] = col.b;
        }
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.ShaderMaterial({
        vertexShader: STARFIELD_VERTEX_SHADER,
        fragmentShader: STARFIELD_FRAGMENT_SHADER,
        precision: ambientShaderPrecision,
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

      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.root.add(pts);
      this.starMaterials.push(mat);
      this.starfieldLayers.push({
        mat,
        geo,
        fullCount: layer.count,
        depthFactor: layer.depthFactor,
      });
      this.disposables.push(geo, mat);
    });

    // 1b. Ultra-near spatial micro-dust & ice-crystal debris layer (highest parallax factor 0.92)
    // Wraps seamlessly around the camera so foreground bokeh scale cues persist across every chapter
    const debrisCount = Math.round(210 * scaleFactor);
    const debrisGeo = new THREE.BufferGeometry();
    const dPos = new Float32Array(debrisCount * 3);
    const dScale = new Float32Array(debrisCount);
    const dPhase = new Float32Array(debrisCount);
    const dCol = new Float32Array(debrisCount * 3);
    const debrisPalette = [
      new THREE.Color('#fff1d4'),
      new THREE.Color('#c8dcff'),
      new THREE.Color('#e8c78a'),
      new THREE.Color('#b6a8e8'),
    ];
    for (let i = 0; i < debrisCount; i++) {
      dPos[i * 3] = (rand() - 0.5) * 34.0;
      dPos[i * 3 + 1] = (rand() - 0.5) * 22.0;
      dPos[i * 3 + 2] = (rand() - 0.5) * 36.0;
      dScale[i] = 1.2 + Math.pow(rand(), 1.8) * 3.4;
      dPhase[i] = rand();
      const c = debrisPalette[Math.floor(rand() * debrisPalette.length)];
      if (c) {
        dCol[i * 3] = c.r;
        dCol[i * 3 + 1] = c.g;
        dCol[i * 3 + 2] = c.b;
      }
    }
    debrisGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    debrisGeo.setAttribute('aScale', new THREE.BufferAttribute(dScale, 1));
    debrisGeo.setAttribute('aPhase', new THREE.BufferAttribute(dPhase, 1));
    debrisGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3));

    this.nearDebrisMat = new THREE.ShaderMaterial({
      vertexShader: NEAR_DEBRIS_VERTEX_SHADER,
      fragmentShader: NEAR_DEBRIS_FRAGMENT_SHADER,
      precision: ambientShaderPrecision,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uOpacity: { value: 0 },
        uCameraPos: { value: new THREE.Vector3(0, 0.3, 18) },
        uParallaxOffset: { value: new THREE.Vector3() },
        uEarthCenter: { value: new THREE.Vector3(0, 0, -90) },
        uEarthRadius: { value: 8.2 },
        uSunDir: { value: new THREE.Vector3(-0.78, 0.28, 0.55).normalize() },
        uEclipseActive: { value: 0 },
      },
    });
    const debrisPoints = new THREE.Points(debrisGeo, this.nearDebrisMat);
    debrisPoints.frustumCulled = false;
    this.root.add(debrisPoints);
    this.disposables.push(debrisGeo, this.nearDebrisMat);

    // 2. Volumetric self-shadowed nebula clouds distributed along the journey (restrained, moody deep-space density)
    const nebulaConfigs: Array<{
      pos: [number, number, number];
      scale: number;
      seed: number;
      cA: string;
      cB: string;
      cG: string;
      op: number;
      depth: number;
    }> = [
      { pos: [-22, 10, -28], scale: 98, seed: 1.3, cA: '#0f2559', cB: '#382068', cG: '#a87d3c', op: 0.36, depth: 0.24 },
      { pos: [30, -12, -125], scale: 118, seed: 3.7, cA: '#0d2659', cB: '#2f1e5c', cG: '#ad8240', op: 0.30, depth: 0.34 },
      { pos: [-28, 14, -210], scale: 124, seed: 6.2, cA: '#101f52', cB: '#3b216b', cG: '#ad8848', op: 0.28, depth: 0.28 },
      { pos: [26, 8, -310], scale: 128, seed: 9.4, cA: '#0f2257', cB: '#402475', cG: '#b5904f', op: 0.32, depth: 0.38 },
      { pos: [-20, -8, -455], scale: 135, seed: 12.1, cA: '#0e224a', cB: '#311f5c', cG: '#b08b4c', op: 0.26, depth: 0.22 },
      { pos: [0, 4, -565], scale: 168, seed: 15.8, cA: '#0e2048', cB: '#362266', cG: '#bf9c5a', op: 0.34, depth: 0.3 },
    ];

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(planeGeo);

    nebulaConfigs.forEach((cfg) => {
      const tex = createNebulaCloudTexture(cfg.seed, cfg.cA, cfg.cB, cfg.cG, 512);
      const mat = new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERTEX_SHADER,
        fragmentShader: NEBULA_FRAGMENT_SHADER,
        precision: ambientShaderPrecision,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uOpacity: { value: 0 },
          uMap: { value: tex },
          uLightDir: { value: new THREE.Vector2(-0.6, 0.5).normalize() },
          uTime: { value: 0 },
        },
      });
      mat.userData.baseOpacity = cfg.op;
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      mesh.scale.set(cfg.scale, cfg.scale * 0.72, 1);
      mesh.rotation.z = cfg.seed * 0.4;
      mesh.userData.basePos = new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      mesh.userData.depthFactor = cfg.depth;
      this.root.add(mesh);
      this.nebulaMeshes.push(mesh);
      this.nebulaMaterials.push(mat);
      this.disposables.push(tex, mat);
    });

    // 2b. Dynamic real-time procedural FBM nebulae & curl-advected particle field
    //     reacting to narration intensity and subtle user pointer interaction
    this.dynamicNebulae = new DynamicNebulaParticles(isMobile, pixelRatio, ambientShaderPrecision);
    this.root.add(this.dynamicNebulae.root);
    this.disposables.push(this.dynamicNebulae);

    // 3. Procedural Galaxy System (5 distinct cohesive corridor galaxies + interactive Hero Galaxy)
    this.galaxySystem = new ProceduralGalaxySystem(isMobile, pixelRatio, ambientShaderPrecision);
    this.root.add(this.galaxySystem.root);
    this.disposables.push(this.galaxySystem);

    // 4. Prologue: Gargantua-inspired Relativistic Accretion Portal + Curl-Noise Big Bang
    const bbCount = Math.round(2400 * scaleFactor);
    const bbGeo = new THREE.BufferGeometry();
    const bbPos = new Float32Array(bbCount * 3);
    const bbDir = new Float32Array(bbCount * 3);
    const bbSpeed = new Float32Array(bbCount);
    const bbSize = new Float32Array(bbCount);
    const bbCol = new Float32Array(bbCount * 3);

    const bbColors = [
      new THREE.Color('#fff7e6'),
      new THREE.Color('#f0c878'),
      new THREE.Color('#8bb4ff'),
      new THREE.Color('#7a5cc7'),
    ];

    for (let i = 0; i < bbCount; i++) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const sqrtOneMinusU2 = Math.sqrt(1 - u * u);
      bbDir[i * 3] = sqrtOneMinusU2 * Math.cos(phi);
      bbDir[i * 3 + 1] = u * 0.58;
      bbDir[i * 3 + 2] = sqrtOneMinusU2 * Math.sin(phi);

      bbSpeed[i] = 0.25 + Math.pow(rand(), 0.9) * 0.95;
      bbSize[i] = 1.4 + rand() * 3.0;

      const c = bbColors[Math.floor(rand() * bbColors.length)];
      if (c) {
        bbCol[i * 3] = c.r;
        bbCol[i * 3 + 1] = c.g;
        bbCol[i * 3 + 2] = c.b;
      }
    }

    bbGeo.setAttribute('position', new THREE.BufferAttribute(bbPos, 3));
    bbGeo.setAttribute('aDirection', new THREE.BufferAttribute(bbDir, 3));
    bbGeo.setAttribute('aSpeed', new THREE.BufferAttribute(bbSpeed, 1));
    bbGeo.setAttribute('aSize', new THREE.BufferAttribute(bbSize, 1));
    bbGeo.setAttribute('aColor', new THREE.BufferAttribute(bbCol, 3));

    this.bigBangMat = new THREE.ShaderMaterial({
      vertexShader: BIG_BANG_VERTEX_SHADER,
      fragmentShader: BIG_BANG_FRAGMENT_SHADER,
      precision: 'highp',
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
    const bbPoints = new THREE.Points(bbGeo, this.bigBangMat);
    bbPoints.frustumCulled = false;
    this.bigBangGroup.add(bbPoints);

    // True Geodesic Raymarched Schwarzschild/Kerr Singularity & Volumetric Accretion Disk (Hero: always highp)
    const geodesicGeo = new THREE.SphereGeometry(18.0, 42, 30);
    this.singularityGeodesicMat = new THREE.ShaderMaterial({
      vertexShader: GEODESIC_SINGULARITY_VERTEX_SHADER,
      fragmentShader: GEODESIC_SINGULARITY_FRAGMENT_SHADER,
      precision: 'highp',
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        uCenter: { value: new THREE.Vector3(0, 0, 0) },
        uHorizonRadius: { value: 1.25 },
        uDiskOuterRadius: { value: 11.4 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uSpin: { value: 0.85 },
        uInnerColor: { value: new THREE.Color('#fff5dc') },
        uOuterColor: { value: new THREE.Color('#c8762e') },
        uMilkyWayMap: { value: skyFallbackTex },
        uHasMilkyWay: { value: 0.0 },
      },
    });
    this.singularitySphere = new THREE.Mesh(geodesicGeo, this.singularityGeodesicMat);
    this.singularitySphere.renderOrder = 2;
    this.bigBangGroup.add(this.singularitySphere);
    this.disposables.push(geodesicGeo, this.singularityGeodesicMat);

    const glowTex = createSoftGlowTexture('#ffffff', '#f5d288');
    const haloTex = createSoftGlowTexture('#ffe8b5', '#8763c7');
    this.disposables.push(bbGeo, this.bigBangMat, glowTex, haloTex);

    const coreMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff5db,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.singularityCore = new THREE.Sprite(coreMat);
    this.bigBangGroup.add(this.singularityCore);

    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0xd9b3ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.singularityHalo = new THREE.Sprite(haloMat);
    this.bigBangGroup.add(this.singularityHalo);
    this.root.add(this.bigBangGroup);
    this.disposables.push(coreMat, haloMat);

    // 5. Persistent Guiding Star thread with volumetric crepuscular god-rays
    const gCoreMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff4d6,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const gHaloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0xe8c070,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.guidingCore = new THREE.Sprite(gCoreMat);
    this.guidingHalo = new THREE.Sprite(gHaloMat);

    const raysGeo = new THREE.PlaneGeometry(1, 1);
    this.guidingRaysMat = new THREE.ShaderMaterial({
      vertexShader: GOD_RAYS_VERTEX_SHADER,
      fragmentShader: GOD_RAYS_FRAGMENT_SHADER,
      precision: ambientShaderPrecision,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor: { value: new THREE.Color('#f7d594') },
      },
    });
    this.guidingRaysMesh = new THREE.Mesh(raysGeo, this.guidingRaysMat);
    this.guidingLight = new THREE.PointLight(0xf6d58f, 2.2, 42, 1.8);
    this.guidingStar.add(this.guidingCore, this.guidingHalo, this.guidingRaysMesh, this.guidingLight);
    this.root.add(this.guidingStar);
    this.disposables.push(gCoreMat, gHaloMat, raysGeo, this.guidingRaysMat);
  }

  public update(
    filmTime: number,
    elapsed: number,
    delta: number,
    hasEntered: boolean,
    guidingTarget: THREE.Vector3,
    guidingScale: number,
    cameraQuaternion?: THREE.Quaternion,
    pointerX = 0,
    pointerY = 0,
    reactivity?: NarrationCosmicReactivity,
    interaction?: InteractiveFieldInfluence,
  ): void {
    const effReactivity = reactivity ?? computeNarrationCosmicReactivity(filmTime, null);
    const effInteraction =
      interaction ?? computeInteractiveFieldInfluence(pointerX, pointerY, 0, 0, 0, false);
    const entryReveal = hasEntered ? 1 : 0.42;

    const firstLight = 0.36 + 0.64 * smoothstep(0.0, 6.5, filmTime);
    const expansion = smoothstep(7.5, 42.0, filmTime);
    const starsWake = hasEntered ? 0.52 + 0.48 * smoothstep(0.0, 14.0, filmTime) : 0.48;

    const silenceDip =
      smoothstep(SILENCE_START - 1.5, SILENCE_START + 0.6, filmTime) *
      (1 - smoothstep(SILENCE_END, SILENCE_END + 2.8, filmTime));
    // Chapter IV opens in an almost completely dark universe before the Yin-Yang stars ignite
    const ch4DarkOpening =
      smoothstep(223.5, 226.2, filmTime) * (1 - smoothstep(235.5, 248.0, filmTime));
    const ch4CleanStage =
      smoothstep(224.0, 229.0, filmTime) * (1 - smoothstep(280.0, 286.0, filmTime));

    const cosmosVisibility = clamp(
      (starsWake * 0.92 + 0.08 * entryReveal) *
        (1 - silenceDip * 0.92) *
        (1 - ch4DarkOpening * 0.84) *
        (1 - ch4CleanStage * 0.25),
      0.03,
      1,
    );

    const galaxyFocusBoost = this.galaxySystem.getHeroFocusWeight();
    const starVisBoost = Math.max(cosmosVisibility, galaxyFocusBoost * 0.85);

    for (let i = 0; i < this.starMaterials.length; i++) {
      const mat = this.starMaterials[i];
      if (!mat) continue;
      if (mat.uniforms.uTime) mat.uniforms.uTime.value = elapsed;
      if (mat.uniforms.uOpacity) mat.uniforms.uOpacity.value = starVisBoost;
      if (mat.uniforms.uBurst) {
        mat.uniforms.uBurst.value = smoothstep(370.2, 375.5, filmTime) * 0.25;
      }
    }

    // Restrained dark-cinema 4K Milky Way backdrop (keeps obsidian black floor; dips during silence & Ch4 dark opening)
    const skyReveal = hasEntered ? 0.42 + 0.58 * smoothstep(0.0, 18.0, filmTime) : 0.32;
    this.milkyWayMat.uniforms.uOpacity!.value =
      (this.milkyWayLoaded ? 0.38 : 0.0) *
      Math.max(skyReveal * (1 - ch4DarkOpening * 0.92) * (1 - ch4CleanStage * 0.42), galaxyFocusBoost * 0.78) *
      (1 - silenceDip * 0.94);

    // Update ultra-near spatial dust motes + Earth eclipse cone during Chapter I
    const earthPresence =
      smoothstep(54, 62, filmTime) * (1 - smoothstep(104, 112, filmTime));
    const earthQuiet =
      1 -
      smoothstep(65, 76, filmTime) * (1 - smoothstep(102, 110, filmTime)) * 0.65;
    this.nearDebrisMat.uniforms.uTime!.value = elapsed;
    this.nearDebrisMat.uniforms.uOpacity!.value =
      (hasEntered ? 0.28 : 0.16) *
      cosmosVisibility *
      earthQuiet *
      (1 - ch4CleanStage * 0.82) *
      (1 - galaxyFocusBoost * 0.75);
    this.nearDebrisMat.uniforms.uEclipseActive!.value = earthPresence;

    // Volumetric self-shadowed nebulae (dimmed gently during Ch4 so Yin-Yang nebulae hold center stage
    // and modulated by narration reactivity so gas clouds intensify on creation and hush on rest)
    const lightAngle = elapsed * 0.05 + filmTime * 0.01;
    const lx = Math.cos(lightAngle);
    const ly = Math.sin(lightAngle);
    const nebulaReactScale = clamp(0.58 + effReactivity.intensity * 0.44, 0.14, 1.28);
    for (let i = 0; i < this.nebulaMaterials.length; i++) {
      const mat = this.nebulaMaterials[i];
      if (!mat) continue;
      const baseOp = mat.userData.baseOpacity as number;
      if (mat.uniforms.uOpacity) {
        mat.uniforms.uOpacity.value =
          baseOp *
          nebulaReactScale *
          cosmosVisibility *
          (1 - ch4CleanStage * 0.78) *
          (0.45 + 0.55 * smoothstep(0.0, 14.0, filmTime + (hasEntered ? 0 : 12)));
      }
      if (mat.uniforms.uTime) {
        mat.uniforms.uTime.value = elapsed;
      }
      if (mat.uniforms.uLightDir) {
        (mat.uniforms.uLightDir.value as THREE.Vector2).set(lx, ly);
      }
    }

    // Dynamic real-time procedural FBM nebulae & curl-advected particle field
    const dynamicVis = clamp(
      (hasEntered ? 0.52 + 0.48 * smoothstep(0.0, 10.0, filmTime) : 0.45) *
        (1 - silenceDip * 0.94) *
        (1 - ch4DarkOpening * 0.88) *
        (1 - ch4CleanStage * 0.68) *
        (1 - galaxyFocusBoost * 0.72),
      0.02,
      1,
    );
    this.dynamicNebulae.update(elapsed, delta, dynamicVis, effReactivity, effInteraction);

    this.galaxySystem.update(
      elapsed,
      delta,
      cosmosVisibility * (1 - ch4CleanStage * 0.92),
      pointerX,
      pointerY,
    );

    // Update Prologue Geodesic Raymarched Singularity & Curl-Noise Big Bang
    const prologueFadeOut = 1 - smoothstep(46.0, 62.0, filmTime);
    this.bigBangGroup.visible = prologueFadeOut > 0.005 || !hasEntered;
    if (this.bigBangGroup.visible) {
      const idleBreath = !hasEntered ? 0.36 + 0.08 * Math.sin(elapsed * 0.9) : 0;
      // Keep central singularity visibly glowing from t=0 and swell smoothly into the Big Bang
      const diskEnvelope = hasEntered
        ? (0.42 + 0.58 * smoothstep(0.0, 7.5, filmTime)) * (1 - smoothstep(28.0, 44.0, filmTime))
        : 0.48;
      const coreOp = hasEntered
        ? firstLight * prologueFadeOut * (1 - expansion * 0.72) * (1 - diskEnvelope * 0.55) * 0.58
        : idleBreath * 0.38;
      const coreScale = hasEntered
        ? 0.65 + firstLight * 1.45 + Math.sin(expansion * Math.PI) * 2.1
        : 1.2 + 0.14 * Math.sin(elapsed * 0.8);

      this.singularityCore.material.opacity = coreOp;
      this.singularityCore.scale.set(coreScale, coreScale, 1);

      this.singularityHalo.material.opacity = coreOp * 0.32;
      this.singularityHalo.scale.set(coreScale * 2.6, coreScale * 2.6, 1);

      this.singularitySphere.visible = diskEnvelope > 0.01;
      if (this.singularitySphere.visible) {
        const radiusScale = hasEntered ? 0.62 + smoothstep(0.0, 16.0, filmTime) * 0.52 : 0.72;
        this.singularityGeodesicMat.uniforms.uTime!.value = elapsed;
        this.singularityGeodesicMat.uniforms.uOpacity!.value = diskEnvelope * 0.96;
        this.singularityGeodesicMat.uniforms.uHorizonRadius!.value = 1.85 * radiusScale;
        this.singularityGeodesicMat.uniforms.uDiskOuterRadius!.value = 9.8 * radiusScale;
      }

      this.bigBangMat.uniforms.uTime!.value = elapsed;
      this.bigBangMat.uniforms.uExpansion!.value = hasEntered ? Math.max(0.12, expansion) : 0.14;
      this.bigBangMat.uniforms.uOpacity!.value = hasEntered
        ? (0.28 + 0.72 * smoothstep(5.5, 12.0, filmTime)) * prologueFadeOut * 0.72
        : 0.18;
    }

    // Smoothly guide the recurring anchor star across scenes (snap on large timeline seeks)
    if (this.guidingStar.position.distanceToSquared(guidingTarget) > 900) {
      this.guidingStar.position.copy(guidingTarget);
    } else {
      this.guidingStar.position.lerp(guidingTarget, 1 - Math.exp(-3.4 * Math.min(delta, 0.1)));
    }
    const pulse = 1 + 0.08 * Math.sin(elapsed * 2.3);
    const s = guidingScale * pulse;
    this.guidingCore.scale.set(s, s, 1);
    this.guidingHalo.scale.set(s * 2.7, s * 2.7, 1);

    const starVis = hasEntered ? smoothstep(5.5, 11.0, filmTime) : 0;
    this.guidingCore.material.opacity = starVis * 0.85;
    this.guidingHalo.material.opacity = starVis * 0.34;
    this.guidingLight.intensity = starVis * 1.25;

    // Delicate crepuscular volumetric god-rays radiating subtly behind the Guiding Star
    if (cameraQuaternion) {
      this.guidingRaysMesh.quaternion.copy(cameraQuaternion);
    }
    const rayScale = s * 4.8;
    this.guidingRaysMesh.scale.set(rayScale, rayScale, 1);
    if (this.guidingRaysMat.uniforms.uTime) {
      this.guidingRaysMat.uniforms.uTime.value = elapsed;
    }
    if (this.guidingRaysMat.uniforms.uIntensity) {
      this.guidingRaysMat.uniforms.uIntensity.value = starVis * (0.14 + silenceDip * 0.16);
    }
  }

  /**
   * Shifts distant stars, mid-field stars, near stars, nebulae, spiral galaxies,
   * and ultra-near foreground micro-debris proportionally to their depthFactor
   * based on camera movement and pointer drift.
   */
  public applyParallax(
    input: ParallaxInput,
    delta: number,
    options: ParallaxOptions,
  ): void {
    const damp = 1 - Math.exp(-4.8 * Math.min(delta, 0.1));
    const speed = Math.hypot(
      input.cameraVelocity.x,
      input.cameraVelocity.y,
      input.cameraVelocity.z,
    );
    const velocityStretch = options.reducedMotion ? 0 : clamp((speed - 2.5) / 14.0, 0, 1);

    // 1. GPU-driven starfield layers (far 0.10 -> mid 0.28 -> near 0.56)
    for (const layer of this.starfieldLayers) {
      writeParallaxOffset(_parallaxTarget, input, layer.depthFactor, options);
      if (layer.mat.uniforms.uParallaxOffset) {
        const current = layer.mat.uniforms.uParallaxOffset.value as THREE.Vector3;
        current.lerp(_parallaxTarget, damp);
      }
      if (layer.mat.uniforms.uVelocityStretch) {
        layer.mat.uniforms.uVelocityStretch.value = THREE.MathUtils.lerp(
          layer.mat.uniforms.uVelocityStretch.value as number,
          velocityStretch * (0.35 + layer.depthFactor),
          damp,
        );
      }
    }

    // 2. Ultra-near spatial micro-dust & bokeh debris layer (depthFactor 0.92 — fastest parallax)
    writeParallaxOffset(_parallaxTarget, input, this.nearDebrisDepthFactor, options);
    if (this.nearDebrisMat.uniforms.uParallaxOffset) {
      const debrisCurrent = this.nearDebrisMat.uniforms.uParallaxOffset.value as THREE.Vector3;
      debrisCurrent.lerp(_parallaxTarget, damp);
    }
    if (this.nearDebrisMat.uniforms.uCameraPos) {
      (this.nearDebrisMat.uniforms.uCameraPos.value as THREE.Vector3).set(
        input.cameraPos.x,
        input.cameraPos.y,
        input.cameraPos.z,
      );
    }

    // Keep the 4K Milky Way sphere & Hyderabad 25 Nov 2002 Hipparcos Vault centered on the camera
    this.milkyWaySphere.position.set(
      input.cameraPos.x,
      input.cameraPos.y,
      input.cameraPos.z,
    );
    this.hipparcosPoints.position.set(
      input.cameraPos.x,
      input.cameraPos.y,
      input.cameraPos.z,
    );
    const ptrAtten = options.reducedMotion ? 0 : 0.028 * options.silenceDamp;
    this.milkyWaySphere.rotation.y = THREE.MathUtils.lerp(
      this.milkyWaySphere.rotation.y,
      -0.65 - input.pointerOffset.x * ptrAtten,
      damp,
    );
    this.milkyWaySphere.rotation.x = THREE.MathUtils.lerp(
      this.milkyWaySphere.rotation.x,
      0.38 + input.pointerOffset.y * ptrAtten * 0.7,
      damp,
    );
    this.hipparcosPoints.rotation.y = THREE.MathUtils.lerp(
      this.hipparcosPoints.rotation.y,
      -input.pointerOffset.x * ptrAtten,
      damp,
    );
    this.hipparcosPoints.rotation.x = THREE.MathUtils.lerp(
      this.hipparcosPoints.rotation.x,
      input.pointerOffset.y * ptrAtten * 0.7,
      damp,
    );

    // 3. Volumetric self-shadowed nebula planes shifted relative to corridor base positions
    for (const mesh of this.nebulaMeshes) {
      const basePos = mesh.userData.basePos as THREE.Vector3;
      const depth = mesh.userData.depthFactor as number;
      writeParallaxOffset(_parallaxTarget, input, depth, options);
      _parallaxTarget.add(basePos);
      mesh.position.lerp(_parallaxTarget, damp);
    }

    // 3b. Dynamic procedural FBM nebulae & particle field parallax
    this.dynamicNebulae.applyParallax(input, damp, options);

    // 4. Distant procedural galaxies shift subtly to anchor monumental background scale
    this.galaxySystem.applyParallax(input, damp, options);
  }

  public getNearParallaxMagnitude(): number {
    const near = this.starfieldLayers[this.starfieldLayers.length - 1];
    if (!near || !near.mat.uniforms.uParallaxOffset) return 0;
    return (near.mat.uniforms.uParallaxOffset.value as THREE.Vector3).length();
  }

  public getDebrisParallaxMagnitude(): number {
    if (!this.nearDebrisMat.uniforms.uParallaxOffset) return 0;
    return (this.nearDebrisMat.uniforms.uParallaxOffset.value as THREE.Vector3).length();
  }

  public getLoadedTextureCount(): number {
    return this.milkyWayLoaded ? 1 : 0;
  }

  public getMilkyWayTexture(): THREE.Texture | null {
    return this.milkyWayTexture;
  }

  public getHipparcosStarCount(): number {
    return this.hipparcosCount;
  }

  public setPixelRatio(pixelRatio: number): void {
    for (let i = 0; i < this.starMaterials.length; i++) {
      const m = this.starMaterials[i];
      if (m?.uniforms.uPixelRatio) {
        m.uniforms.uPixelRatio.value = pixelRatio;
      }
    }
    if (this.nearDebrisMat.uniforms.uPixelRatio) {
      this.nearDebrisMat.uniforms.uPixelRatio.value = pixelRatio;
    }
    if (this.bigBangMat.uniforms.uPixelRatio) {
      this.bigBangMat.uniforms.uPixelRatio.value = pixelRatio;
    }
    this.dynamicNebulae.setPixelRatio(pixelRatio);
    this.galaxySystem.setPixelRatio(pixelRatio);
  }

  public setAmbientShaderPrecision(precision: ShaderPrecision): void {
    if (this.ambientPrecision === precision) return;
    this.ambientPrecision = precision;

    // Non-critical ambient cosmic layers switch cleanly to mediump on mobile/balanced;
    // hero Singularity, Hipparcos Vault, and Big Bang stay permanently highp.
    this.milkyWayMat.precision = precision;
    this.milkyWayMat.needsUpdate = true;

    this.nearDebrisMat.precision = precision;
    this.nearDebrisMat.needsUpdate = true;

    this.guidingRaysMat.precision = precision;
    this.guidingRaysMat.needsUpdate = true;

    for (let i = 0; i < this.starfieldLayers.length; i++) {
      const layer = this.starfieldLayers[i];
      if (!layer) continue;
      layer.mat.precision = precision;
      layer.mat.needsUpdate = true;
    }
    for (let i = 0; i < this.nebulaMaterials.length; i++) {
      const mat = this.nebulaMaterials[i];
      if (!mat) continue;
      mat.precision = precision;
      mat.needsUpdate = true;
    }

    this.dynamicNebulae.setShaderPrecision(precision);
    this.galaxySystem.setShaderPrecision(precision);
  }

  public setParticleDrawRatio(ratio: number): void {
    const r = clamp(ratio, 0.35, 1.0);
    this.hipparcosGeo.setDrawRange(0, Math.floor(this.hipparcosCount * r));
    for (let i = 0; i < this.starfieldLayers.length; i++) {
      const layer = this.starfieldLayers[i];
      if (layer) {
        layer.geo.setDrawRange(0, Math.floor(layer.fullCount * r));
      }
    }
    this.dynamicNebulae.setParticleDrawRatio(r);
  }

  public getDynamicNebulaDiagnostics() {
    return this.dynamicNebulae.getDiagnostics();
  }

  public dispose(): void {
    this.disposed = true;
    this.disposables.forEach((d) => d.dispose());
  }
}
