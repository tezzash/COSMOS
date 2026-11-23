import * as THREE from 'three';
import { getChapterWeight, smoothstep } from '@/data/chapters';
import {
  ATMOSPHERE_FRAGMENT_SHADER,
  ATMOSPHERE_VERTEX_SHADER,
  createSoftGlowTexture,
} from '@/engine/shaders';

/**
 * High-resolution procedural GLSL Twilight Sanctuary Planet shader:
 * Replaces the legacy 512x256 canvas surface with infinite-resolution multi-octave
 * 3D FBM mountain ranges, tranquil moonlit valleys, specular night ocean reflections,
 * drifting silver-indigo cloud wisps, warm lantern bounce near the sanctuary crown,
 * and a rising golden sunrise terminator — zero extra VRAM textures on iPhone 17 Pro Max.
 */
const QUIET_PLANET_VERTEX_SHADER = /* glsl */ `
  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  void main() {
    vLocalPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const QUIET_PLANET_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDawn;
  uniform float uOpacity;
  uniform vec3 uSunDir;
  uniform vec3 uSanctuaryWorldPos;

  varying vec3 vLocalPos;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), u.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x),
        u.y
      ),
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x),
        u.y
      ),
      u.z
    );
  }

  float fbm5(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p = p * 2.06 + vec3(13.1, 7.7, 5.3);
      a *= 0.48;
    }
    return v;
  }

  void main() {
    vec3 nDir = normalize(vLocalPos);
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(uSunDir);

    // Multi-scale procedural topography & derivative micro-relief normal perturbation
    vec3 p = nDir * 6.2;
    float h0 = fbm5(p);
    float hx = fbm5(p + vec3(0.06, 0.0, 0.0));
    float hy = fbm5(p + vec3(0.0, 0.06, 0.0));
    float ridge = 1.0 - abs(fbm5(p * 1.9 + vec3(3.4)) * 2.0 - 1.0);
    float elevation = h0 * 0.72 + ridge * ridge * 0.28;

    vec3 grad = vec3(hx - h0, hy - h0, 0.0) * 3.8;
    vec3 perturbedN = normalize(N - grad * 0.45);

    // Separate tranquil moonlit oceans from soft alpine highlands
    float landMask = smoothstep(0.47, 0.55, elevation);
    vec3 seaCol = mix(vec3(0.028, 0.052, 0.115), vec3(0.055, 0.095, 0.175), smoothstep(0.25, 0.48, elevation));
    vec3 highlandCol = mix(vec3(0.068, 0.088, 0.145), vec3(0.145, 0.165, 0.235), smoothstep(0.54, 0.82, elevation));
    vec3 surfaceAlbedo = mix(seaCol, highlandCol, landMask);

    // Gentle moonlit zenith key + warm sunrise horizon wrap
    float sunDot = dot(perturbedN, L);
    float moonLight = clamp(dot(perturbedN, normalize(vec3(-0.35, 0.85, 0.4))) * 0.65 + 0.35, 0.0, 1.0);
    float dawnWrap = smoothstep(-0.28, 0.52, sunDot) * (0.28 + uDawn * 0.95);
    float termDelta = (sunDot + 0.05) * 4.5;
    float terminatorBand = exp(-(termDelta * termDelta)) * (0.35 + uDawn * 0.85);

    vec3 col = surfaceAlbedo * (0.42 + moonLight * 0.72);
    col += surfaceAlbedo * vec3(1.0, 0.72, 0.44) * dawnWrap * 0.85;
    col += vec3(0.95, 0.56, 0.26) * terminatorBand * 0.26;

    // Silvery-gold ocean moonlight specular glint
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(perturbedN, H), 0.0001), 48.0) * (1.0 - landMask);
    col += mix(vec3(0.55, 0.72, 0.98), vec3(1.0, 0.82, 0.54), uDawn) * spec * (0.38 + uDawn * 0.45);

    // Soft drifting high-altitude twilight mist wisps
    vec3 cloudP = nDir * 5.2 + vec3(uTime * 0.014, 0.0, -uTime * 0.009);
    float cloud = smoothstep(0.50, 0.78, fbm5(cloudP));
    vec3 cloudTint = mix(vec3(0.32, 0.44, 0.68), vec3(0.98, 0.76, 0.50), dawnWrap * 0.85);
    col = mix(col, cloudTint, cloud * 0.32);

    // Warm sanctuary hearth bounce illuminating the rocky crown beneath the terrace
    float distSanctuary = length(vWorldPos - uSanctuaryWorldPos);
    float hearthFalloff = exp(-distSanctuary * 0.26);
    col += vec3(1.0, 0.74, 0.42) * hearthFalloff * (0.42 + uDawn * 0.22);

    // Atmospheric Fresnel twilight limb glow
    float fresnel = pow(max(0.0001, 1.0 - clamp(dot(N, V), 0.0, 1.0)), 3.4);
    vec3 limbCol = mix(vec3(0.36, 0.56, 0.92), vec3(0.98, 0.72, 0.42), uDawn * 0.78);
    col += limbCol * fresnel * (0.48 + uDawn * 0.45);

    gl_FragColor = vec4(col, uOpacity);
  }
`;

const WARM_WINDOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WARM_WINDOW_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDawn;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    // Rich candlelit honey-amber interior gradient (brighter warm hearth below, soft dusk gold above)
    float hearth = smoothstep(1.0, 0.0, vUv.y);
    float winDelta = (vUv.x - 0.5) * 2.1;
    float centerGlow = exp(-(winDelta * winDelta));
    float flicker = 0.96 + 0.04 * sin(uTime * 1.4) * cos(uTime * 0.9);
    vec3 topCol = mix(vec3(0.76, 0.48, 0.24), vec3(0.96, 0.74, 0.46), uDawn);
    vec3 bottomCol = vec3(1.0, 0.86, 0.58);
    vec3 col = mix(topCol, bottomCol, hearth * 0.78 + centerGlow * 0.22) * (1.05 + uDawn * 0.35) * flicker;
    // Soft vignette inside the stone recess
    float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
    col *= 0.72 + 0.28 * edge;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

/**
 * Chapter V: Even Stars Have Quiet Hours (centered at 0, -2, -425).
 * High-resolution procedural GLSL moonlit twilight planet horizon with an intimate
 * composite observatory sanctuary, candlelit warm amber hearth window, volumetric
 * window light shafts, tranquil reflecting pool, resting lantern, calm seated
 * silhouette, and a gentle golden dawn bloom.
 */
export class QuietHoursSequence {
  public readonly root = new THREE.Group();

  private readonly planetMat: THREE.ShaderMaterial;
  private readonly planetAtmoMat: THREE.ShaderMaterial;
  private readonly windowPaneMat: THREE.ShaderMaterial;
  private readonly windowGlowMat: THREE.MeshStandardMaterial;
  private readonly lightShaftMat: THREE.MeshBasicMaterial;
  private readonly windowLight: THREE.PointLight;
  private readonly sunriseGlow: THREE.Sprite;
  private readonly silhouetteGroup = new THREE.Group();
  private readonly quietMotes: THREE.Points;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(_maxAnisotropy: number) {
    this.root.position.set(0, -2, -425);

    const sunDir = new THREE.Vector3(0.42, 0.38, -0.82).normalize();

    // 1. High-Resolution Procedural GLSL Twilight Planet Horizon
    const planetRadius = 26;
    const planetGeo = new THREE.SphereGeometry(planetRadius, 72, 48);
    this.planetMat = new THREE.ShaderMaterial({
      vertexShader: QUIET_PLANET_VERTEX_SHADER,
      fragmentShader: QUIET_PLANET_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDawn: { value: 0 },
        uOpacity: { value: 1 },
        uSunDir: { value: sunDir.clone() },
        uSanctuaryWorldPos: { value: new THREE.Vector3(0, -4.1, -425) },
      },
    });
    const planet = new THREE.Mesh(planetGeo, this.planetMat);
    planet.position.set(0, -planetRadius - 2.2, 0);
    this.root.add(planet);

    const atmoGeo = new THREE.SphereGeometry(planetRadius + 1.05, 56, 40);
    this.planetAtmoMat = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX_SHADER,
      fragmentShader: ATMOSPHERE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uSunDir: { value: sunDir.clone() },
        uDayColor: { value: new THREE.Color('#6b92cc') },
        uSunriseColor: { value: new THREE.Color('#f7bc6c') },
        uIntensity: { value: 0.85 },
      },
    });
    const planetAtmo = new THREE.Mesh(atmoGeo, this.planetAtmoMat);
    planetAtmo.position.copy(planet.position);
    this.root.add(planetAtmo);
    this.disposables.push(planetGeo, this.planetMat, atmoGeo, this.planetAtmoMat);

    // 2. Composite Sanctuary Terrace, Reflecting Pool & Candlelit Arched Window
    const sanctuary = new THREE.Group();
    sanctuary.position.set(0, -2.28, 0);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x1a2236,
      roughness: 0.86,
      metalness: 0.08,
    });
    const woodTrimMat = new THREE.MeshStandardMaterial({
      color: 0x332722,
      roughness: 0.58,
      metalness: 0.14,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xdcb878,
      roughness: 0.26,
      metalness: 0.9,
    });
    const poolMat = new THREE.MeshStandardMaterial({
      color: 0x17243d,
      roughness: 0.12,
      metalness: 0.65,
    });
    this.windowGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffd799,
      emissive: 0xf4b660,
      emissiveIntensity: 1.5,
      roughness: 0.24,
      metalness: 0.05,
    });
    this.windowPaneMat = new THREE.ShaderMaterial({
      vertexShader: WARM_WINDOW_VERTEX_SHADER,
      fragmentShader: WARM_WINDOW_FRAGMENT_SHADER,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uDawn: { value: 0 },
        uOpacity: { value: 1 },
      },
    });

    // Grounded stone terrace plinth + serene reflective water basin
    const plinthGeo = new THREE.CylinderGeometry(4.6, 5.15, 0.46, 40);
    const plinth = new THREE.Mesh(plinthGeo, stoneMat);
    plinth.position.set(0, 0.12, 0);

    const poolGeo = new THREE.CircleGeometry(2.65, 36);
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(0, 0.365, 1.35);

    // Warm spilled floor light pool (offset >= 0.02 on Y to prevent Z-fighting)
    const glowTex = createSoftGlowTexture('#ffe2ad', '#e8aa54');
    const spillGeo = new THREE.CircleGeometry(3.4, 32);
    const spillMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xffcf87,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const floorSpill = new THREE.Mesh(spillGeo, spillMat);
    floorSpill.rotation.x = -Math.PI / 2;
    floorSpill.position.set(0, 0.39, 1.05);

    // Sanctuary wall with framed recessed window
    const leftWallGeo = new THREE.BoxGeometry(2.1, 4.6, 0.56);
    const leftWall = new THREE.Mesh(leftWallGeo, stoneMat);
    leftWall.position.set(-2.35, 2.55, -0.45);
    const rightWall = new THREE.Mesh(leftWallGeo, stoneMat);
    rightWall.position.set(2.35, 2.55, -0.45);

    const sillGeo = new THREE.BoxGeometry(2.88, 0.86, 0.74);
    const sill = new THREE.Mesh(sillGeo, stoneMat);
    sill.position.set(0, 0.76, -0.42);

    const lintelGeo = new THREE.BoxGeometry(6.85, 0.65, 0.66);
    const lintel = new THREE.Mesh(lintelGeo, stoneMat);
    lintel.position.set(0, 4.95, -0.45);

    // Subtle brass cornice inlay along the top lintel
    const brassTrimGeo = new THREE.BoxGeometry(6.6, 0.07, 0.7);
    const brassTrim = new THREE.Mesh(brassTrimGeo, brassMat);
    brassTrim.position.set(0, 4.64, -0.45);

    // Warm candlelit shader window pane
    const paneGeo = new THREE.PlaneGeometry(2.6, 3.45);
    const pane = new THREE.Mesh(paneGeo, this.windowPaneMat);
    pane.position.set(0, 2.9, -0.58);

    // Soft slanted volumetric hearth light beam spilling forward from window
    const shaftGeo = new THREE.PlaneGeometry(2.8, 3.8);
    this.lightShaftMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xffd592,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const lightShaft = new THREE.Mesh(shaftGeo, this.lightShaftMat);
    lightShaft.position.set(0, 2.0, 0.85);
    lightShaft.rotation.x = -0.62;

    // Fine mullions dividing the warm window softly
    const vMullionGeo = new THREE.BoxGeometry(0.08, 3.5, 0.14);
    const vMullion = new THREE.Mesh(vMullionGeo, woodTrimMat);
    vMullion.position.set(0, 2.9, -0.5);
    const hMullionGeo = new THREE.BoxGeometry(2.65, 0.08, 0.14);
    const hMullion1 = new THREE.Mesh(hMullionGeo, woodTrimMat);
    hMullion1.position.set(0, 3.4, -0.5);
    const hMullion2 = new THREE.Mesh(hMullionGeo, woodTrimMat);
    hMullion2.position.set(0, 2.25, -0.5);

    // Small resting warm brass lantern on the window sill
    const lanternBaseGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.08, 12);
    const lanternBodyGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.28, 12);
    const lanternCapGeo = new THREE.ConeGeometry(0.16, 0.1, 12);
    const lanternBase = new THREE.Mesh(lanternBaseGeo, brassMat);
    lanternBase.position.set(0.95, 1.24, -0.2);
    const lanternBody = new THREE.Mesh(lanternBodyGeo, this.windowGlowMat);
    lanternBody.position.set(0.95, 1.4, -0.2);
    const lanternCap = new THREE.Mesh(lanternCapGeo, brassMat);
    lanternCap.position.set(0.95, 1.59, -0.2);

    sanctuary.add(
      plinth,
      poolMesh,
      floorSpill,
      leftWall,
      rightWall,
      sill,
      lintel,
      brassTrim,
      pane,
      lightShaft,
      vMullion,
      hMullion1,
      hMullion2,
      lanternBase,
      lanternBody,
      lanternCap,
    );

    // 3. Calm, Peaceful Seated Silhouette on the Window Bench
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
    this.windowLight = new THREE.PointLight(0xf6be73, 3.4, 24, 1.65);
    this.windowLight.position.set(0, 2.7, 0.9);
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
    this.sunriseGlow.position.set(2.8, 2.1, -11.0);
    this.sunriseGlow.scale.set(24, 18, 1);
    this.root.add(this.sunriseGlow);

    // 5. Minimal calm drifting moonlight dust motes
    const moteCount = 56;
    const moteGeo = new THREE.BufferGeometry();
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = Math.sin(i * 12.7) * 0.5 * 16;
      motePos[i * 3 + 1] = (Math.cos(i * 7.3) * 0.5 + 0.35) * 8;
      motePos[i * 3 + 2] = Math.sin(i * 3.1) * 7;
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const moteMat = new THREE.PointsMaterial({
      size: 0.32,
      map: glowTex,
      color: 0xe8d9be,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.quietMotes = new THREE.Points(moteGeo, moteMat);
    this.root.add(this.quietMotes);

    this.disposables.push(
      stoneMat,
      woodTrimMat,
      brassMat,
      poolMat,
      this.windowGlowMat,
      this.windowPaneMat,
      plinthGeo,
      poolGeo,
      glowTex,
      spillGeo,
      spillMat,
      leftWallGeo,
      sillGeo,
      lintelGeo,
      brassTrimGeo,
      paneGeo,
      shaftGeo,
      this.lightShaftMat,
      vMullionGeo,
      hMullionGeo,
      lanternBaseGeo,
      lanternBodyGeo,
      lanternCapGeo,
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

    // Gentle sunrise warmth emerges during the closing 14 seconds of Chapter V (320..335)
    const dawn = smoothstep(320, 334, filmTime);

    this.planetMat.uniforms.uTime!.value = elapsed;
    this.planetMat.uniforms.uDawn!.value = dawn;
    this.planetMat.uniforms.uOpacity!.value = weight;

    this.windowPaneMat.uniforms.uTime!.value = elapsed;
    this.windowPaneMat.uniforms.uDawn!.value = dawn;
    this.windowPaneMat.uniforms.uOpacity!.value = weight;

    this.windowLight.intensity = (3.0 + dawn * 2.5 + Math.sin(elapsed * 0.7) * 0.12) * weight;
    this.windowGlowMat.emissiveIntensity = 1.35 + dawn * 0.8;
    this.lightShaftMat.opacity = (0.14 + dawn * 0.09) * weight;
    this.planetAtmoMat.uniforms.uIntensity!.value = (0.78 + dawn * 0.68) * weight;

    this.sunriseGlow.material.opacity = dawn * 0.88 * weight;
    const sunScale = 19 + dawn * 18;
    this.sunriseGlow.scale.set(sunScale * 1.38, sunScale, 1);

    // Almost still, restful breathing
    this.silhouetteGroup.position.y = Math.sin(elapsed * 0.52) * 0.022;
    this.quietMotes.rotation.y = elapsed * 0.011;
    (this.quietMotes.material as THREE.PointsMaterial).opacity = 0.42 * weight;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
