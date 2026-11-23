import * as THREE from 'three';
import earthClouds4k from '@/assets/textures/earth_clouds_4k.jpg';
import earthDay4k from '@/assets/textures/earth_day_4k.jpg';
import earthNight4k from '@/assets/textures/earth_night_4k.jpg';
import earthNormal4k from '@/assets/textures/earth_normal_4k.jpg';
import earthSpecular4k from '@/assets/textures/earth_specular_4k.jpg';
import moon4k from '@/assets/textures/moon_4k.jpg';
import { clamp, getChapterWeight, smoothstep } from '@/data/chapters';
import {
  ASTROLABE_ECLIPSE_FRAGMENT_SHADER,
  ASTROLABE_ECLIPSE_VERTEX_SHADER,
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
  EARTH_SURFACE_FRAGMENT_SHADER,
  EARTH_SURFACE_VERTEX_SHADER,
  GOD_RAYS_FRAGMENT_SHADER,
  GOD_RAYS_VERTEX_SHADER,
  MOON_ECLIPSE_FRAGMENT_SHADER,
  MOON_ECLIPSE_VERTEX_SHADER,
  SUN_CORONA_FRAGMENT_SHADER,
  SUN_CORONA_VERTEX_SHADER,
  VOLUMETRIC_CLOUDS_FRAGMENT_SHADER,
  VOLUMETRIC_CLOUDS_VERTEX_SHADER,
  createSoftGlowTexture,
} from '@/engine/shaders';

function createNeutralNormalTexture(): THREE.DataTexture {
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new THREE.DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  return tex;
}

function createEarthTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  oceanMask: THREE.CanvasTexture;
  nightLights: THREE.CanvasTexture;
  cloudsLow: THREE.CanvasTexture;
  cloudsHigh: THREE.CanvasTexture;
  normalFallback: THREE.DataTexture;
} {
  const w = 512;
  const h = 256;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = w;
  albedoCanvas.height = h;
  const aCtx = albedoCanvas.getContext('2d')!;

  const oceanCanvas = document.createElement('canvas');
  oceanCanvas.width = w;
  oceanCanvas.height = h;
  const oCtx = oceanCanvas.getContext('2d')!;

  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = w;
  nightCanvas.height = h;
  const nCtx = nightCanvas.getContext('2d')!;

  const oceanGrad = aCtx.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0, '#0f2345');
  oceanGrad.addColorStop(0.5, '#072a59');
  oceanGrad.addColorStop(1, '#122848');
  aCtx.fillStyle = oceanGrad;
  aCtx.fillRect(0, 0, w, h);

  oCtx.fillStyle = '#ffffff';
  oCtx.fillRect(0, 0, w, h);

  nCtx.fillStyle = '#000000';
  nCtx.fillRect(0, 0, w, h);

  // Grayscale white-on-black procedural fallback clouds matching 4K cloud JPEG luminance layout
  const buildCloudFallback = (seedInit: number, count: number, brightness: number) => {
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = w;
    cloudCanvas.height = h;
    const cCtx = cloudCanvas.getContext('2d')!;
    cCtx.fillStyle = '#000000';
    cCtx.fillRect(0, 0, w, h);

    let s = seedInit;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    cCtx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const cx = rand() * w;
      const cy = 20 + rand() * (h - 40);
      const rx = 10 + rand() * 44;
      const ry = 3 + rand() * 11;
      const g = cCtx.createRadialGradient(cx, cy, 1, cx, cy, rx);
      const a0 = Math.min(1, (0.2 + rand() * 0.28) * brightness);
      g.addColorStop(0, `rgba(255, 255, 255, ${a0})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      cCtx.save();
      cCtx.translate(cx, cy);
      cCtx.scale(1, ry / rx);
      cCtx.fillStyle = g;
      cCtx.beginPath();
      cCtx.arc(0, 0, rx, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }
    const tex = new THREE.CanvasTexture(cloudCanvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;

  const oceanMask = new THREE.CanvasTexture(oceanCanvas);
  oceanMask.anisotropy = maxAnisotropy;

  const nightLights = new THREE.CanvasTexture(nightCanvas);
  nightLights.colorSpace = THREE.SRGBColorSpace;
  nightLights.anisotropy = maxAnisotropy;

  const cloudsLow = buildCloudFallback(481516, 140, 1.0);
  const cloudsHigh = buildCloudFallback(251102, 90, 0.7);
  const normalFallback = createNeutralNormalTexture();

  return { albedo, oceanMask, nightLights, cloudsLow, cloudsHigh, normalFallback };
}

function createMoonTexture(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#9aa0a8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let s = 200211;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 24; i++) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const r = 14 + rand() * 38;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(84, 89, 98, 0.55)');
    g.addColorStop(1, 'rgba(84, 89, 98, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 160; i++) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const r = 2 + rand() * 9;
    ctx.strokeStyle = 'rgba(210, 214, 222, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(65, 69, 76, 0.25)';
    ctx.fill();
  }

  const albedo = new THREE.CanvasTexture(canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;

  const bump = new THREE.CanvasTexture(canvas);
  bump.anisotropy = maxAnisotropy;

  return { albedo, bump };
}

/**
 * Chapter I: A Little Planet, a Big Story (centered at z = -90).
 * Volumetric Sun + Crepuscular God-Rays + Physically Based Earth (Rayleigh/Mie
 * dawn terminator, ocean sun-glint, golden India/world night-side city lights,
 * dual-layer drifting cloud deck with surface shadow projection) + Hyderabad
 * Sunrise Beacon + Astrolabe Rings + Waning Gibbous Moon + Interactive Birth Star.
 */
export class EarthSequence {
  public readonly root = new THREE.Group();
  public readonly interactiveStarHitbox: THREE.Mesh;

  private readonly earthGroup = new THREE.Group();
  private readonly earthMesh: THREE.Mesh;
  private readonly earthMat: THREE.ShaderMaterial;
  private readonly volumetricCloudsMesh: THREE.Mesh;
  private readonly volumetricCloudsMat: THREE.ShaderMaterial;
  private readonly atmosphereMat: THREE.ShaderMaterial;
  private readonly sunBillboard: THREE.Mesh;
  private readonly sunMat: THREE.ShaderMaterial;
  private readonly sunRaysMat: THREE.ShaderMaterial;
  private readonly astrolabeGroup = new THREE.Group();
  private readonly ringMatPrimary: THREE.ShaderMaterial;
  private readonly ringMatFine: THREE.ShaderMaterial;
  private readonly moonMesh: THREE.Mesh;
  private readonly moonMat: THREE.ShaderMaterial;
  private readonly hyderabadBeacon: THREE.Sprite;
  private readonly birthStarGroup = new THREE.Group();
  private readonly birthStarSprite: THREE.Sprite;
  private readonly birthStarTrail: THREE.Line;
  private readonly birthStarTrailPositions: Float32Array;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private starTriggered = false;
  private starLaunchProgress = 0;
  private loadedTextureCount = 0;
  private failedTextureCount = 0;
  private disposed = false;

  constructor(maxAnisotropy: number, onAssetSettled?: (loaded: boolean) => void) {
    this.root.position.set(0, 0, -90);

    const sunDir = new THREE.Vector3(-0.78, 0.28, 0.55).normalize();

    // 1. Distant Volumetric Sun + Crepuscular God-Rays
    const sunGeo = new THREE.PlaneGeometry(36, 36);
    this.sunMat = new THREE.ShaderMaterial({
      vertexShader: SUN_CORONA_VERTEX_SHADER,
      fragmentShader: SUN_CORONA_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
      },
    });
    this.sunBillboard = new THREE.Mesh(sunGeo, this.sunMat);
    this.sunBillboard.position.set(-40, 15, 22);
    this.sunBillboard.lookAt(0, 0, 0);
    this.root.add(this.sunBillboard);

    const raysGeo = new THREE.PlaneGeometry(74, 74);
    this.sunRaysMat = new THREE.ShaderMaterial({
      vertexShader: GOD_RAYS_VERTEX_SHADER,
      fragmentShader: GOD_RAYS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.45 },
        uColor: { value: new THREE.Color('#ffd38c') },
      },
    });
    const sunRays = new THREE.Mesh(raysGeo, this.sunRaysMat);
    sunRays.position.set(-40.5, 15.2, 21.2);
    sunRays.lookAt(0, 0, 0);
    this.root.add(sunRays);
    this.disposables.push(sunGeo, this.sunMat, raysGeo, this.sunRaysMat);

    // 2. Physically Based 4K Earth (NASA Blue Marble + 4K Normal Relief + Coastline Specular + Black Marble City Lights + Dual Cloud Deck)
    const { albedo, oceanMask, nightLights, cloudsLow, cloudsHigh, normalFallback } =
      createEarthTextures(maxAnisotropy);
    this.disposables.push(albedo, oceanMask, nightLights, cloudsLow, cloudsHigh, normalFallback);

    const earthGeo = new THREE.SphereGeometry(8.2, 96, 64);
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: EARTH_SURFACE_VERTEX_SHADER,
      fragmentShader: EARTH_SURFACE_FRAGMENT_SHADER,
      uniforms: {
        uAlbedoMap: { value: albedo },
        uOceanMaskMap: { value: oceanMask },
        uNightLightsMap: { value: nightLights },
        uCloudMap: { value: cloudsLow },
        uNormalMap: { value: normalFallback },
        uNormalScale: { value: 0.92 },
        uSunDir: { value: sunDir.clone() },
        uCloudOffset: { value: 0 },
        uOpacity: { value: 1.0 },
      },
    });
    this.earthMesh = new THREE.Mesh(earthGeo, this.earthMat);
    // Align India / Hyderabad (~78.5°E) right along the glowing dawn terminator
    this.earthMesh.rotation.y = -2.28;
    this.earthMesh.rotation.z = THREE.MathUtils.degToRad(23.44 * 0.45);
    this.earthGroup.add(this.earthMesh);

    // Volumetric 3D Raymarched Cumulus Cloud Deck (6-slice parallax thickness + self-shadowing + Henyey-Greenstein dawn scatter)
    const cloudVolGeo = new THREE.SphereGeometry(8.35, 84, 56);
    this.volumetricCloudsMat = new THREE.ShaderMaterial({
      vertexShader: VOLUMETRIC_CLOUDS_VERTEX_SHADER,
      fragmentShader: VOLUMETRIC_CLOUDS_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCloudMap: { value: cloudsLow },
        uSunDir: { value: sunDir.clone() },
        uCloudOffset: { value: 0 },
        uOpacity: { value: 0.92 },
      },
    });
    this.volumetricCloudsMesh = new THREE.Mesh(cloudVolGeo, this.volumetricCloudsMat);
    this.volumetricCloudsMesh.rotation.copy(this.earthMesh.rotation);
    this.earthGroup.add(this.volumetricCloudsMesh);

    const atmoGeo = new THREE.SphereGeometry(8.88, 64, 48);
    this.atmosphereMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uSunDir: { value: sunDir.clone() },
        uDayColor: { value: new THREE.Color('#4a8ef5') },
        uSunriseColor: { value: new THREE.Color('#f7ad54') },
        uIntensity: { value: 1.0 },
      },
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, this.atmosphereMat);
    this.earthGroup.add(atmoMesh);

    // Hyderabad surface golden sunrise beacon (17.385°N, 78.4867°E mapped on sphere)
    const lat = THREE.MathUtils.degToRad(17.385);
    const lon = THREE.MathUtils.degToRad(78.4867);
    const r = 8.42;
    const phi = Math.PI / 2 - lat;
    const theta = lon + Math.PI;
    const hx = -r * Math.sin(phi) * Math.cos(theta);
    const hy = r * Math.cos(phi);
    const hz = r * Math.sin(phi) * Math.sin(theta);

    const glowTex = createSoftGlowTexture('#fff8e4', '#f7c16a');
    const beaconMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffd788,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.hyderabadBeacon = new THREE.Sprite(beaconMat);
    this.hyderabadBeacon.position.set(hx, hy, hz);
    this.hyderabadBeacon.scale.set(1.05, 1.05, 1);
    this.earthMesh.add(this.hyderabadBeacon);

    this.root.add(this.earthGroup);
    this.disposables.push(
      earthGeo,
      this.earthMat,
      cloudVolGeo,
      this.volumetricCloudsMat,
      atmoGeo,
      this.atmosphereMat,
      glowTex,
      beaconMat,
    );

    const earthWorldCenter = new THREE.Vector3(0, 0, -90);

    // 3. Precision Celestial Astrolabe Rings with Dynamic Earth Umbra/Penumbra Eclipse Shadows
    this.ringMatPrimary = new THREE.ShaderMaterial({
      vertexShader: ASTROLABE_ECLIPSE_VERTEX_SHADER,
      fragmentShader: ASTROLABE_ECLIPSE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color('#d9b56f') },
        uSunDir: { value: sunDir.clone() },
        uEarthCenter: { value: earthWorldCenter.clone() },
        uEarthRadius: { value: 8.2 },
        uOpacity: { value: 0.56 },
      },
    });
    this.ringMatFine = new THREE.ShaderMaterial({
      vertexShader: ASTROLABE_ECLIPSE_VERTEX_SHADER,
      fragmentShader: ASTROLABE_ECLIPSE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color('#8ea7db') },
        uSunDir: { value: sunDir.clone() },
        uEarthCenter: { value: earthWorldCenter.clone() },
        uEarthRadius: { value: 8.2 },
        uOpacity: { value: 0.34 },
      },
    });

    const ringGeo1 = new THREE.TorusGeometry(11.4, 0.044, 12, 128);
    const ring1 = new THREE.Mesh(ringGeo1, this.ringMatPrimary);
    ring1.rotation.set(Math.PI * 0.42, 0.2, 0);

    const ringGeo2 = new THREE.TorusGeometry(13.2, 0.024, 10, 128);
    const ring2 = new THREE.Mesh(ringGeo2, this.ringMatFine);
    ring2.rotation.set(Math.PI * 0.56, -0.35, 0.25);

    const ringGeo3 = new THREE.TorusGeometry(14.8, 0.030, 10, 96);
    const ring3 = new THREE.Mesh(ringGeo3, this.ringMatPrimary);
    ring3.rotation.set(Math.PI * 0.32, 0.45, -0.2);

    this.astrolabeGroup.add(ring1, ring2, ring3);
    this.root.add(this.astrolabeGroup);
    this.disposables.push(ringGeo1, ringGeo2, ringGeo3, this.ringMatPrimary, this.ringMatFine);

    // 4. 4K Waning Gibbous Moon with Dynamic Earth Eclipse Shadow + Copper Penumbra + Blue Earthshine
    const moonTex = createMoonTexture(maxAnisotropy);
    const moonGeo = new THREE.SphereGeometry(2.05, 64, 48);
    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: MOON_ECLIPSE_VERTEX_SHADER,
      fragmentShader: MOON_ECLIPSE_FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: moonTex.albedo },
        uSunDir: { value: sunDir.clone() },
        uEarthCenter: { value: earthWorldCenter.clone() },
        uEarthRadius: { value: 8.2 },
        uOpacity: { value: 1.0 },
      },
    });
    this.moonMesh = new THREE.Mesh(moonGeo, this.moonMat);
    this.moonMesh.position.set(15.2, 4.4, -7.0);
    this.root.add(this.moonMesh);
    this.disposables.push(moonTex.albedo, moonTex.bump, moonGeo, this.moonMat);

    // Seamlessly upgrade procedural fallbacks with Vite-bundled 4K NASA/Solar System Scope textures
    const loader = new THREE.TextureLoader();
    const load4k = (
      url: string,
      opts: { srgb?: boolean; repeatS?: boolean },
      apply: (tex: THREE.Texture) => void,
    ) => {
      loader.load(
        url,
        (tex) => {
          if (this.disposed) {
            tex.dispose();
            return;
          }
          if (opts.srgb) tex.colorSpace = THREE.SRGBColorSpace;
          if (opts.repeatS) tex.wrapS = THREE.RepeatWrapping;
          tex.anisotropy = maxAnisotropy;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          tex.needsUpdate = true;
          this.disposables.push(tex);
          this.loadedTextureCount++;
          apply(tex);
          onAssetSettled?.(true);
        },
        undefined,
        () => {
          // Procedural CanvasTexture fallback remains active on network/decode error
          if (!this.disposed) {
            this.failedTextureCount++;
            onAssetSettled?.(false);
          }
        },
      );
    };

    load4k(earthDay4k, { srgb: true }, (tex) => {
      this.earthMat.uniforms.uAlbedoMap!.value = tex;
    });
    load4k(earthNight4k, { srgb: true }, (tex) => {
      this.earthMat.uniforms.uNightLightsMap!.value = tex;
    });
    load4k(earthSpecular4k, { srgb: false }, (tex) => {
      this.earthMat.uniforms.uOceanMaskMap!.value = tex;
    });
    load4k(earthNormal4k, { srgb: false }, (tex) => {
      this.earthMat.uniforms.uNormalMap!.value = tex;
    });
    load4k(earthClouds4k, { srgb: false, repeatS: true }, (tex) => {
      this.earthMat.uniforms.uCloudMap!.value = tex;
      this.volumetricCloudsMat.uniforms.uCloudMap!.value = tex;
    });
    load4k(moon4k, { srgb: true }, (tex) => {
      this.moonMat.uniforms.uMap!.value = tex;
    });

    // 5. Interactive Birth Star Particle above Earth's upper atmosphere
    const starMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff3cf,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.birthStarSprite = new THREE.Sprite(starMat);
    this.birthStarSprite.scale.set(2.3, 2.3, 1);

    const hitGeo = new THREE.SphereGeometry(2.2, 12, 12);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.interactiveStarHitbox = new THREE.Mesh(hitGeo, hitMat);
    this.birthStarGroup.add(this.birthStarSprite, this.interactiveStarHitbox);
    this.birthStarGroup.position.set(6.8, 4.2, 7.6);
    this.root.add(this.birthStarGroup);

    const trailSegments = 36;
    this.birthStarTrailPositions = new Float32Array(trailSegments * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.birthStarTrailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xf7d387,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.birthStarTrail = new THREE.Line(trailGeo, trailMat);
    this.root.add(this.birthStarTrail);

    this.disposables.push(starMat, hitGeo, hitMat, trailGeo, trailMat);
  }

  public getSunWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.sunBillboard.getWorldPosition(out);
  }

  public getBirthStarWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.birthStarGroup.getWorldPosition(out);
  }

  public triggerBirthStar(): boolean {
    if (this.starTriggered) return false;
    this.starTriggered = true;
    return true;
  }

  public resetInteraction(): void {
    this.starTriggered = false;
    this.starLaunchProgress = 0;
  }

  public isBirthStarTriggered(): boolean {
    return this.starTriggered;
  }

  public update(filmTime: number, elapsed: number, delta: number): void {
    const weight = getChapterWeight(filmTime, 55, 110, 7, 7);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    if (this.sunMat.uniforms.uTime) this.sunMat.uniforms.uTime.value = elapsed;
    if (this.sunMat.uniforms.uIntensity) this.sunMat.uniforms.uIntensity.value = weight * 0.92;
    if (this.sunRaysMat.uniforms.uTime) this.sunRaysMat.uniforms.uTime.value = elapsed;
    if (this.sunRaysMat.uniforms.uIntensity) this.sunRaysMat.uniforms.uIntensity.value = weight * 0.24;
    if (this.atmosphereMat.uniforms.uIntensity) {
      this.atmosphereMat.uniforms.uIntensity.value = weight * 0.85;
    }

    // Gentle sidereal rotation + volumetric 3D cloud wind drift + surface cloud-shadow sync
    const earthRotY = -2.35 + (filmTime - 55) * 0.008;
    const cloudDrift = elapsed * 0.006;
    const cloudUvOffset = (cloudDrift / (Math.PI * 2)) % 1;
    this.earthMesh.rotation.y = earthRotY;
    this.volumetricCloudsMesh.rotation.y = earthRotY;
    if (this.volumetricCloudsMat.uniforms.uCloudOffset) {
      this.volumetricCloudsMat.uniforms.uCloudOffset.value = cloudUvOffset;
    }
    if (this.volumetricCloudsMat.uniforms.uOpacity) {
      this.volumetricCloudsMat.uniforms.uOpacity.value = weight * 0.94;
    }
    if (this.earthMat.uniforms.uCloudOffset) {
      this.earthMat.uniforms.uCloudOffset.value = cloudUvOffset;
    }
    if (this.earthMat.uniforms.uOpacity) this.earthMat.uniforms.uOpacity.value = weight;
    if (this.moonMat.uniforms.uOpacity) this.moonMat.uniforms.uOpacity.value = weight;
    if (this.ringMatPrimary.uniforms.uOpacity) {
      this.ringMatPrimary.uniforms.uOpacity.value = weight * 0.58;
    }
    if (this.ringMatFine.uniforms.uOpacity) {
      this.ringMatFine.uniforms.uOpacity.value = weight * 0.36;
    }
    this.moonMesh.rotation.y = elapsed * 0.03;

    this.astrolabeGroup.rotation.y = elapsed * 0.04;
    this.astrolabeGroup.rotation.x = Math.sin(elapsed * 0.12) * 0.06;

    const beaconPulse = 1.2 + 0.35 * Math.sin(elapsed * 2.6);
    this.hyderabadBeacon.scale.set(beaconPulse, beaconPulse, 1);

    // Interactive birth star animation
    const starAppear = smoothstep(80, 86, filmTime) * weight;
    if (this.starTriggered) {
      this.starLaunchProgress = clamp(this.starLaunchProgress + delta * 0.36, 0, 1);
    } else if (filmTime > 103.5) {
      this.starLaunchProgress = smoothstep(103.5, 110, filmTime);
    }

    const p = this.starLaunchProgress;
    const x = THREE.MathUtils.lerp(6.8, 0.0, p) - Math.sin(p * Math.PI) * 2.2;
    const y = THREE.MathUtils.lerp(4.2, 4.0, p) - Math.sin(p * Math.PI) * 2.0;
    const z = THREE.MathUtils.lerp(7.6, -26.0, p * p);
    this.birthStarGroup.position.set(x, y, z);

    const starSize = (2.1 + 0.4 * Math.sin(elapsed * 3.1)) * (1 + Math.sin(p * Math.PI) * 0.7);
    this.birthStarSprite.scale.set(starSize, starSize, 1);
    this.birthStarSprite.material.opacity = starAppear;

    const trailMat = this.birthStarTrail.material as THREE.LineBasicMaterial;
    trailMat.opacity = p > 0.01 ? Math.sin(p * Math.PI) * 0.78 * weight : 0;
    if (trailMat.opacity > 0.01) {
      const count = this.birthStarTrailPositions.length / 3;
      for (let i = 0; i < count; i++) {
        const sp = clamp(p - (i / count) * 0.28, 0, 1);
        this.birthStarTrailPositions[i * 3] =
          THREE.MathUtils.lerp(6.8, 0.0, sp) - Math.sin(sp * Math.PI) * 2.2;
        this.birthStarTrailPositions[i * 3 + 1] =
          THREE.MathUtils.lerp(4.2, 4.0, sp) - Math.sin(sp * Math.PI) * 2.0;
        this.birthStarTrailPositions[i * 3 + 2] = THREE.MathUtils.lerp(7.6, -26.0, sp * sp);
      }
      if (this.birthStarTrail.geometry.attributes.position) {
        if (this.birthStarTrail.geometry.attributes.position) {
        this.birthStarTrail.geometry.attributes.position.needsUpdate = true;
      }
      }
    }
  }

  public getLoadedTextureCount(): number {
    return this.loadedTextureCount;
  }

  public getFailedTextureCount(): number {
    return this.failedTextureCount;
  }

  public dispose(): void {
    this.disposed = true;
    this.disposables.forEach((d) => d.dispose());
  }
}
