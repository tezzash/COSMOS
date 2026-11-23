import * as THREE from 'three';
import { getChapterWeight, smoothstep } from '../../data/chapters';
import { createSoftGlowTexture } from '../shaders';

const NIGHT_EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const NIGHT_EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  uniform float uDawn;
  uniform float uHasTex;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 v = normalize(cameraPosition - vWorldPos);
    float d = dot(n, uSunDir);
    float day = smoothstep(-0.06, 0.32, d);

    vec3 dayTex = mix(vec3(0.05, 0.08, 0.14), texture2D(uDay, vUv).rgb, uHasTex);
    vec3 nightTex = mix(vec3(0.0), texture2D(uNight, vUv).rgb, uHasTex);

    vec3 moonlit = dayTex * vec3(0.42, 0.52, 0.85) * 0.055;
    vec3 sunlit = dayTex * (1.25 * day);
    float lum = dot(nightTex, vec3(0.299, 0.587, 0.114));
    vec3 cities = vec3(1.0, 0.72, 0.38) * pow(lum, 1.35) * 3.6 * (1.0 - day);

    float terminator = exp(-pow(d * 6.5, 2.0));
    vec3 dawnBand = vec3(1.0, 0.42, 0.16) * terminator * (0.1 + 0.32 * uDawn);

    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.2);
    vec3 rimCol = mix(vec3(0.16, 0.32, 0.85), vec3(1.0, 0.62, 0.32), smoothstep(-0.35, 0.3, d));

    vec3 col = moonlit + sunlit + cities + dawnBand + rimCol * rim * 0.75;
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const ATMOSPHERE_SHELL_VERTEX = /* glsl */ `
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;
  void main() {
    vViewNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ATMOSPHERE_SHELL_FRAGMENT = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uIntensity;
  uniform float uDawn;
  varying vec3 vViewNormal;
  varying vec3 vWorldNormal;
  void main() {
    // Back faces: k = 0 at the outer edge of the shell, ~0.29 at the planet limb
    float k = -vViewNormal.z;
    float glow = pow(smoothstep(0.0, 0.28, k), 1.6) * (1.0 - smoothstep(0.28, 0.42, k)) * 1.6;
    float sunSide = smoothstep(-0.4, 0.6, dot(normalize(vWorldNormal), uSunDir));
    vec3 col = mix(vec3(0.18, 0.38, 1.0), vec3(1.0, 0.56, 0.24), sunSide * (0.35 + 0.65 * uDawn));
    float a = glow * uIntensity * (0.55 + sunSide * (0.6 + 1.4 * uDawn));
    gl_FragColor = vec4(col * a, a);
  }
`;

const AURORA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const AURORA_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float x = vUv.x * 46.0;
    float curtain = 0.55 + 0.45 * sin(x + uTime * 0.35 + sin(x * 0.37 - uTime * 0.21) * 2.4);
    curtain *= 0.6 + 0.4 * sin(x * 2.7 - uTime * 0.6);
    float vertical = smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - vUv.y, 1.8);
    vec3 col = mix(vec3(0.15, 0.95, 0.55), vec3(0.55, 0.3, 0.95), smoothstep(0.35, 1.0, vUv.y));
    float a = curtain * vertical * uOpacity;
    gl_FragColor = vec4(col * a, a);
  }
`;

const MOON_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  uniform float uHasTex;
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    vec3 tex = mix(vec3(0.55), texture2D(uMap, vUv).rgb, uHasTex);
    float l = smoothstep(-0.05, 0.4, dot(normalize(vWorldNormal), uSunDir));
    vec3 col = tex * (0.025 + 1.15 * l);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const PLANET_RADIUS = 15;
const PLANET_CENTER = new THREE.Vector3(0, -17, -6);
const SUN_NIGHT = new THREE.Vector3(0.9, -0.42, -1.2).normalize();
const SUN_DAWN = new THREE.Vector3(1.0, 0.02, -0.75).normalize();

/**
 * Chapter V: Even Stars Have Quiet Hours (centered at 0, -2, -425).
 * Earth seen from low orbit on its night side: amber city lights, a breathing auroral oval,
 * a thin atmospheric limb, a crescent Moon, one warm light still burning below, and a
 * real sunrise sweeping over the limb as the chapter closes.
 */
export class QuietHoursSequence {
  public readonly root = new THREE.Group();

  private readonly earth: THREE.Mesh;
  private readonly earthMat: THREE.ShaderMaterial;
  private readonly atmoMat: THREE.ShaderMaterial;
  private readonly auroraMat: THREE.ShaderMaterial;
  private readonly moonMat: THREE.ShaderMaterial;
  private readonly sunGlow: THREE.Sprite;
  private readonly sunCore: THREE.Sprite;
  private readonly beacon: THREE.Sprite;
  private readonly quietMotes: THREE.Points;
  private readonly sunDir = new THREE.Vector3();
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(maxAnisotropy: number) {
    this.root.position.set(0, -2, -425);

    const loader = new THREE.TextureLoader();
    const load = (url: string, onReady: (tex: THREE.Texture) => void) =>
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAnisotropy;
        this.disposables.push(tex);
        onReady(tex);
      });

    // 1. Night-side Earth
    this.earthMat = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: null },
        uNight: { value: null },
        uSunDir: { value: SUN_NIGHT.clone() },
        uOpacity: { value: 0 },
        uDawn: { value: 0 },
        uHasTex: { value: 0 },
      },
      vertexShader: NIGHT_EARTH_VERTEX,
      fragmentShader: NIGHT_EARTH_FRAGMENT,
      transparent: true,
    });
    let texReady = 0;
    const markReady = () => {
      texReady++;
      if (texReady === 2) this.earthMat.uniforms.uHasTex.value = 1;
    };
    load('/textures/earth_day_4k.jpg', (tex) => {
      this.earthMat.uniforms.uDay.value = tex;
      markReady();
    });
    load('/textures/earth_night_4k.jpg', (tex) => {
      this.earthMat.uniforms.uNight.value = tex;
      markReady();
    });

    const earthGeo = new THREE.SphereGeometry(PLANET_RADIUS, 128, 96);
    this.earth = new THREE.Mesh(earthGeo, this.earthMat);
    this.earth.position.copy(PLANET_CENTER);
    this.earth.rotation.set(0.42, -1.9, 0.08);
    this.root.add(this.earth);

    // 2. Atmospheric limb
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: SUN_NIGHT.clone() },
        uIntensity: { value: 0 },
        uDawn: { value: 0 },
      },
      vertexShader: ATMOSPHERE_SHELL_VERTEX,
      fragmentShader: ATMOSPHERE_SHELL_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const atmoGeo = new THREE.SphereGeometry(PLANET_RADIUS * 1.045, 96, 64);
    const atmo = new THREE.Mesh(atmoGeo, this.atmoMat);
    atmo.position.copy(PLANET_CENTER);
    this.root.add(atmo);

    // 3. Auroral oval hugging the polar cap
    this.auroraMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: AURORA_VERTEX,
      fragmentShader: AURORA_FRAGMENT,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lat = THREE.MathUtils.degToRad(68);
    const auroraGeo = new THREE.CylinderGeometry(
      PLANET_RADIUS * Math.cos(lat) * 1.04,
      PLANET_RADIUS * Math.cos(lat),
      1.5,
      160,
      1,
      true,
    );
    const aurora = new THREE.Mesh(auroraGeo, this.auroraMat);
    aurora.position.set(0, PLANET_RADIUS * Math.sin(lat) + 0.7, 0);
    const auroraPivot = new THREE.Group();
    auroraPivot.position.copy(PLANET_CENTER);
    auroraPivot.rotation.set(-0.5, 0, 0.22);
    auroraPivot.add(aurora);
    this.root.add(auroraPivot);

    // 4. Crescent Moon
    this.moonMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uSunDir: { value: SUN_NIGHT.clone() },
        uOpacity: { value: 0 },
        uHasTex: { value: 0 },
      },
      vertexShader: NIGHT_EARTH_VERTEX,
      fragmentShader: MOON_FRAGMENT,
      transparent: true,
    });
    load('/textures/moon_4k.jpg', (tex) => {
      this.moonMat.uniforms.uMap.value = tex;
      this.moonMat.uniforms.uHasTex.value = 1;
    });
    const moonGeo = new THREE.SphereGeometry(1.05, 64, 48);
    const moon = new THREE.Mesh(moonGeo, this.moonMat);
    moon.position.set(-10.5, 7.2, -26);
    this.root.add(moon);

    // 5. Sun rising behind the limb
    const sunGlowTex = createSoftGlowTexture('#fff3dc', '#ff9a4a', 'rgba(0,0,0,0)', 256);
    const sunGlowMat = new THREE.SpriteMaterial({
      map: sunGlowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.sunGlow = new THREE.Sprite(sunGlowMat);
    this.sunGlow.position.set(13.5, -2.6, -40);
    this.root.add(this.sunGlow);

    const sunCoreTex = createSoftGlowTexture('#ffffff', '#fff1d0', 'rgba(0,0,0,0)', 128);
    const sunCoreMat = new THREE.SpriteMaterial({
      map: sunCoreTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.sunCore = new THREE.Sprite(sunCoreMat);
    this.sunCore.position.copy(this.sunGlow.position);
    this.root.add(this.sunCore);

    // 6. One warm light still burning on the night side (rotates with Earth)
    const beaconTex = createSoftGlowTexture('#fffaf0', '#ffc46b', 'rgba(0,0,0,0)', 128);
    const beaconMat = new THREE.SpriteMaterial({
      map: beaconTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    this.beacon = new THREE.Sprite(beaconMat);
    const beaconWorldDir = new THREE.Vector3(-0.12, 0.93, 0.35).normalize();
    const invRot = new THREE.Quaternion().setFromEuler(this.earth.rotation).invert();
    this.beacon.position.copy(beaconWorldDir.applyQuaternion(invRot).multiplyScalar(PLANET_RADIUS * 1.004));
    this.earth.add(this.beacon);

    // 7. Drifting quiet motes
    const moteCount = 260;
    const motePos = new Float32Array(moteCount * 3);
    let seed = 52731;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (rand() - 0.5) * 40;
      motePos[i * 3 + 1] = rand() * 14 - 2;
      motePos[i * 3 + 2] = (rand() - 0.5) * 30 - 4;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const moteMat = new THREE.PointsMaterial({
      color: 0xbfd2ff,
      size: 0.05,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.quietMotes = new THREE.Points(moteGeo, moteMat);
    this.root.add(this.quietMotes);

    this.disposables.push(
      earthGeo,
      this.earthMat,
      atmoGeo,
      this.atmoMat,
      auroraGeo,
      this.auroraMat,
      moonGeo,
      this.moonMat,
      sunGlowTex,
      sunGlowMat,
      sunCoreTex,
      sunCoreMat,
      beaconTex,
      beaconMat,
      moteGeo,
      moteMat,
    );
  }

  public update(filmTime: number, elapsed: number): void {
    const weight = getChapterWeight(filmTime, 285, 335, 6.5, 6.5);
    this.root.visible = weight > 0.004;
    if (!this.root.visible) return;

    // Sunrise sweeps over the limb in the closing seconds of Chapter V
    const dawn = smoothstep(320, 334, filmTime);
    this.sunDir.lerpVectors(SUN_NIGHT, SUN_DAWN, dawn).normalize();

    this.earth.rotation.y = -1.9 + elapsed * 0.0035;

    const eu = this.earthMat.uniforms;
    eu.uOpacity.value = weight;
    eu.uDawn.value = dawn;
    eu.uSunDir.value.copy(this.sunDir);

    const au = this.atmoMat.uniforms;
    au.uIntensity.value = 1.35 * weight;
    au.uDawn.value = dawn;
    au.uSunDir.value.copy(this.sunDir);

    this.auroraMat.uniforms.uTime.value = elapsed;
    this.auroraMat.uniforms.uOpacity.value =
      (0.32 + 0.12 * Math.sin(elapsed * 0.4)) * (1 - dawn * 0.75) * weight;

    this.moonMat.uniforms.uOpacity.value = weight;
    this.moonMat.uniforms.uSunDir.value.copy(this.sunDir);

    const rise = smoothstep(0, 1, dawn);
    this.sunGlow.position.y = -5.0 + rise * 3.2;
    this.sunCore.position.y = this.sunGlow.position.y;
    this.sunGlow.material.opacity = rise * 0.8 * weight;
    const glowScale = 6 + rise * 12;
    this.sunGlow.scale.set(glowScale * 1.6, glowScale, 1);
    this.sunCore.material.opacity = smoothstep(0.35, 1, dawn) * weight;
    this.sunCore.scale.setScalar(1.0 + rise * 1.2);

    const breath = 0.5 + 0.5 * Math.sin(elapsed * 0.9);
    this.beacon.material.opacity = (0.75 + 0.25 * breath) * weight * (1 - dawn * 0.4);
    this.beacon.scale.setScalar(0.42 + breath * 0.14);

    this.quietMotes.rotation.y = elapsed * 0.01;
    (this.quietMotes.material as THREE.PointsMaterial).opacity = 0.38 * weight;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
