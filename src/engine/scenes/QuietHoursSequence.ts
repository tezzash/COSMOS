import * as THREE from 'three';
import { getChapterWeight, smoothstep } from '../../data/chapters';
import {
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
  createSoftGlowTexture,
} from '../shaders';

function createQuietPlanetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#131d33');
  grad.addColorStop(0.5, '#0f1729');
  grad.addColorStop(1, '#090e1c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  let s = 918273;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 120; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const rx = 18 + rand() * 54;
    const ry = 8 + rand() * 20;
    const g = ctx.createRadialGradient(x, y, 2, x, y, rx);
    g.addColorStop(0, 'rgba(72, 95, 138, 0.16)');
    g.addColorStop(1, 'rgba(15, 23, 41, 0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Chapter V: Even Stars Have Quiet Hours (centered at 0, -2, -425).
 * Peaceful moonlit planetary horizon with a composite 8-part observatory sanctuary,
 * softly lit warm amber window, calm seated silhouette gazing out peacefully,
 * and a gentle golden sunrise wash at the close of the chapter.
 */
export class QuietHoursSequence {
  public readonly root = new THREE.Group();

  private readonly planetAtmoMat: THREE.ShaderMaterial;
  private readonly windowGlowMat: THREE.MeshStandardMaterial;
  private readonly windowLight: THREE.PointLight;
  private readonly sunriseGlow: THREE.Sprite;
  private readonly silhouetteGroup = new THREE.Group();
  private readonly quietMotes: THREE.Points;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(maxAnisotropy: number) {
    this.root.position.set(0, -2, -425);

    // 1. Peaceful Moonlit Planet Curving Horizon Below
    const planetRadius = 26;
    const planetTex = createQuietPlanetTexture(maxAnisotropy);
    const planetGeo = new THREE.SphereGeometry(planetRadius, 56, 40);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: planetTex,
      roughness: 0.88,
      metalness: 0.08,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.position.set(0, -planetRadius - 2.2, 0);
    this.root.add(planet);

    const atmoGeo = new THREE.SphereGeometry(planetRadius + 0.9, 48, 36);
    this.planetAtmoMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.4, 0.55, -0.7).normalize() },
        uDayColor: { value: new THREE.Color('#6f93c9') },
        uSunriseColor: { value: new THREE.Color('#f4ba6a') },
        uIntensity: { value: 0.85 },
      },
    });
    const planetAtmo = new THREE.Mesh(atmoGeo, this.planetAtmoMat);
    planetAtmo.position.copy(planet.position);
    this.root.add(planetAtmo);
    this.disposables.push(planetTex, planetGeo, planetMat, atmoGeo, this.planetAtmoMat);

    // 2. Composite Sanctuary Terrace & Softly Illuminated Arched Window (resting flush on planet crown)
    const sanctuary = new THREE.Group();
    sanctuary.position.set(0, -2.28, 0);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x1a2236,
      roughness: 0.86,
      metalness: 0.08,
    });
    const woodTrimMat = new THREE.MeshStandardMaterial({
      color: 0x2e2624,
      roughness: 0.62,
      metalness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd7b272,
      roughness: 0.28,
      metalness: 0.88,
    });
    this.windowGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffd799,
      emissive: 0xf2b562,
      emissiveIntensity: 1.45,
      roughness: 0.25,
      metalness: 0.05,
    });

    // Grounded stone terrace plinth
    const plinthGeo = new THREE.CylinderGeometry(4.4, 4.9, 0.45, 32);
    const plinth = new THREE.Mesh(plinthGeo, stoneMat);
    plinth.position.set(0, 0.12, 0);

    // Warm spilled floor light pool (offset +0.02 on Y to prevent Z-fighting)
    const glowTex = createSoftGlowTexture('#ffe2ad', '#e8aa54');
    const spillGeo = new THREE.CircleGeometry(3.2, 32);
    const spillMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xffcf87,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const floorSpill = new THREE.Mesh(spillGeo, spillMat);
    floorSpill.rotation.x = -Math.PI / 2;
    floorSpill.position.set(0, 0.37, 1.0);

    // Sanctuary wall with framed recessed window
    const leftWallGeo = new THREE.BoxGeometry(2.1, 4.6, 0.55);
    const leftWall = new THREE.Mesh(leftWallGeo, stoneMat);
    leftWall.position.set(-2.35, 2.55, -0.45);
    const rightWall = new THREE.Mesh(leftWallGeo, stoneMat);
    rightWall.position.set(2.35, 2.55, -0.45);

    const sillGeo = new THREE.BoxGeometry(2.85, 0.85, 0.72);
    const sill = new THREE.Mesh(sillGeo, stoneMat);
    sill.position.set(0, 0.76, -0.42);

    const lintelGeo = new THREE.BoxGeometry(6.8, 0.65, 0.65);
    const lintel = new THREE.Mesh(lintelGeo, stoneMat);
    lintel.position.set(0, 4.95, -0.45);

    // Warm illuminated window pane
    const paneGeo = new THREE.PlaneGeometry(2.6, 3.45);
    const pane = new THREE.Mesh(paneGeo, this.windowGlowMat);
    pane.position.set(0, 2.9, -0.58);

    // Fine mullions dividing the warm window softly
    const vMullionGeo = new THREE.BoxGeometry(0.08, 3.5, 0.14);
    const vMullion = new THREE.Mesh(vMullionGeo, woodTrimMat);
    vMullion.position.set(0, 2.9, -0.5);
    const hMullionGeo = new THREE.BoxGeometry(2.65, 0.08, 0.14);
    const hMullion1 = new THREE.Mesh(hMullionGeo, woodTrimMat);
    hMullion1.position.set(0, 3.4, -0.5);
    const hMullion2 = new THREE.Mesh(hMullionGeo, woodTrimMat);
    hMullion2.position.set(0, 2.25, -0.5);

    // Small resting warm lantern on the window sill
    const lanternBaseGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.08, 12);
    const lanternBodyGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.28, 12);
    const lanternBase = new THREE.Mesh(lanternBaseGeo, brassMat);
    lanternBase.position.set(0.95, 1.24, -0.2);
    const lanternBody = new THREE.Mesh(lanternBodyGeo, this.windowGlowMat);
    lanternBody.position.set(0.95, 1.4, -0.2);

    sanctuary.add(
      plinth,
      floorSpill,
      leftWall,
      rightWall,
      sill,
      lintel,
      pane,
      vMullion,
      hMullion1,
      hMullion2,
      lanternBase,
      lanternBody,
    );

    // 3. Calm, Peaceful Seated Silhouette on the Window Bench (graceful, safe, unhurried)
    const silMat = new THREE.MeshStandardMaterial({
      color: 0x0b0f1b,
      roughness: 0.78,
      metalness: 0.06,
    });
    const headGeo = new THREE.SphereGeometry(0.24, 18, 16);
    const torsoGeo = new THREE.CapsuleGeometry(0.22, 0.62, 8, 14);
    const kneeGeo = new THREE.CapsuleGeometry(0.13, 0.48, 8, 12);

    const head = new THREE.Mesh(headGeo, silMat);
    head.position.set(-0.36, 2.38, -0.18);
    const torso = new THREE.Mesh(torsoGeo, silMat);
    torso.position.set(-0.42, 1.72, -0.22);
    torso.rotation.z = -0.1;
    const legs = new THREE.Mesh(kneeGeo, silMat);
    legs.position.set(-0.08, 1.44, -0.14);
    legs.rotation.z = Math.PI * 0.42;

    this.silhouetteGroup.add(head, torso, legs);
    sanctuary.add(this.silhouetteGroup);

    // Soft warm interior point light
    this.windowLight = new THREE.PointLight(0xf6be73, 3.2, 22, 1.7);
    this.windowLight.position.set(0, 2.7, 0.8);
    sanctuary.add(this.windowLight);

    this.root.add(sanctuary);

    // 4. Warm Golden Sunrise Bloom (rises gently behind the sanctuary at the close of Chapter V)
    const sunriseTex = createSoftGlowTexture('#fff3d4', '#f4b55c');
    const sunriseMat = new THREE.SpriteMaterial({
      map: sunriseTex,
      color: 0xffd185,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sunriseGlow = new THREE.Sprite(sunriseMat);
    this.sunriseGlow.position.set(2.5, 2.2, -10.0);
    this.sunriseGlow.scale.set(24, 18, 1);
    this.root.add(this.sunriseGlow);

    // 5. Minimal calm drifting moonlight dust motes (very sparse for tranquility)
    const moteCount = 48;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (Math.sin(i * 12.7) * 0.5) * 16;
      motePos[i * 3 + 1] = (Math.cos(i * 7.3) * 0.5 + 0.35) * 8;
      motePos[i * 3 + 2] = Math.sin(i * 3.1) * 7;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const moteMat = new THREE.PointsMaterial({
      size: 0.35,
      map: glowTex,
      color: 0xe6d9bf,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.quietMotes = new THREE.Points(moteGeo, moteMat);
    this.root.add(this.quietMotes);

    this.disposables.push(
      stoneMat,
      woodTrimMat,
      brassMat,
      this.windowGlowMat,
      plinthGeo,
      glowTex,
      spillGeo,
      spillMat,
      leftWallGeo,
      sillGeo,
      lintelGeo,
      paneGeo,
      vMullionGeo,
      hMullionGeo,
      lanternBaseGeo,
      lanternBodyGeo,
      silMat,
      headGeo,
      torsoGeo,
      kneeGeo,
      sunriseTex,
      sunriseMat,
      moteGeo,
      moteMat,
    );
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 285, 335, 6.5, 6.5);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    // Gentle sunrise warmth emerges during the closing 12 seconds of Chapter V (322..335)
    const dawn = smoothstep(321, 334, filmTime);

    this.windowLight.intensity = (2.8 + dawn * 2.4 + Math.sin(elapsed * 0.7) * 0.12) * weight;
    this.windowGlowMat.emissiveIntensity = 1.3 + dawn * 0.8;
    this.planetAtmoMat.uniforms.uIntensity.value = (0.75 + dawn * 0.65) * weight;

    this.sunriseGlow.material.opacity = dawn * 0.85 * weight;
    const sunScale = 18 + dawn * 18;
    this.sunriseGlow.scale.set(sunScale * 1.35, sunScale, 1);

    // Almost still, restful breathing
    this.silhouetteGroup.position.y = Math.sin(elapsed * 0.55) * 0.025;
    this.quietMotes.rotation.y = elapsed * 0.012;
    (this.quietMotes.material as THREE.PointsMaterial).opacity = 0.42 * weight;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
