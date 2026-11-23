import * as THREE from 'three';
import {
  type BurstSlotState,
  findTriggeredStarBirths,
} from '../nucleosynthesis';

const NUCLEOSYNTHESIS_BURST_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NUCLEOSYNTHESIS_BURST_FRAGMENT_SHADER = /* glsl */ `
  uniform float uAgeNorm;
  uniform float uIntensity;
  uniform float uSeed;
  uniform float uTime;

  varying vec2 vUv;

  vec3 fusionSpectralColor(float t, float band) {
    vec3 core = vec3(1.0, 0.97, 0.92);
    vec3 cno = mix(vec3(0.45, 0.78, 1.0), vec3(0.90, 0.68, 1.0), band);
    vec3 gold = mix(vec3(1.0, 0.78, 0.34), vec3(1.0, 0.54, 0.24), band);
    vec3 remnant = mix(vec3(0.55, 0.32, 0.80), vec3(0.78, 0.34, 0.42), band);

    if (t < 0.24) return mix(core, cno, t / 0.24);
    if (t < 0.62) return mix(cno, gold, (t - 0.24) / 0.38);
    return mix(gold, remnant, (t - 0.62) / 0.38);
  }

  void main() {
    if (uAgeNorm <= 0.001 || uAgeNorm >= 0.999) discard;

    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;

    float angle = atan(p.y, p.x);
    float expansion = 1.0 - pow(1.0 - uAgeNorm, 2.7);
    float flashEnv = smoothstep(0.0, 0.06, uAgeNorm) * pow(max(0.0, 1.0 - uAgeNorm), 2.15);

    // Crisp incandescent fusion core flash (tight pinpoint core, never a flat blown-out blob)
    float coreFlash = exp(-r * r * mix(46.0, 18.0, expansion)) * (0.72 - uAgeNorm * 0.45);

    // Expanding nucleosynthesis shockwave ring
    float ringRadius = 0.08 + expansion * 0.78;
    float ringWidth = mix(20.0, 8.5, expansion);
    float shockRing = exp(-pow((r - ringRadius) * ringWidth, 2.0)) * (1.0 - uAgeNorm * 0.65) * 0.42;

    // Secondary inner plasma echo ring
    float innerRing = exp(-pow((r - ringRadius * 0.62) * 16.0, 2.0)) * (1.0 - uAgeNorm) * 0.24;

    // Procedural coronal light-burst rays rotating organically around the newly born star
    float rot = uTime * 0.22 + uSeed * 1.7;
    float raysA = pow(max(0.0, cos(angle * 4.0 + rot)), 6.0);
    float raysB = pow(max(0.0, cos(angle * 7.0 - rot * 1.3 + uSeed)), 10.0) * 0.75;
    float rayMask = (raysA + raysB) * exp(-r * 3.8) * smoothstep(0.0, 0.12, r) * (1.0 - uAgeNorm * 0.72);

    // Subtle anamorphic diffraction cross right at peak ignition
    float crossX = exp(-abs(p.y) * 34.0) * exp(-abs(p.x) * 3.8);
    float crossY = exp(-abs(p.x) * 40.0) * exp(-abs(p.y) * 5.2);
    float anamorphic = (crossX * 0.34 + crossY * 0.14) * pow(max(0.0, 1.0 - uAgeNorm), 2.5);

    float rawLight = (coreFlash + shockRing + innerRing + rayMask * 0.46 + anamorphic) * flashEnv * uIntensity;
    if (rawLight < 0.002) discard;

    // Soft filmic shoulder preserves rich fusion color gradients instead of clipping to solid white
    float totalLight = rawLight / (1.0 + rawLight * 0.9);

    // Radial + temporal fusion color shift (hot white-blue center -> forged gold-violet outer shock)
    float radialShift = clamp(uAgeNorm * 0.78 + r * 0.46, 0.0, 1.0);
    vec3 col = fusionSpectralColor(radialShift, fract(uSeed * 0.37 + r * 0.5));
    col = mix(col, vec3(1.0, 0.98, 0.94), clamp(coreFlash * 0.52, 0.0, 0.65));

    float edgeFade = smoothstep(1.0, 0.64, r);
    gl_FragColor = vec4(col * totalLight * edgeFade, clamp(totalLight * edgeFade * 0.85, 0.0, 0.78));
  }
`;

const NUCLEOSYNTHESIS_PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aElementBand;
  attribute float aScale;
  attribute float aPhase;

  uniform float uAgeNorm;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uPixelRatio;
  uniform float uTime;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpark;

  vec3 fusionSpectralColor(float t, float band) {
    vec3 core = vec3(1.0, 0.97, 0.92);
    vec3 cno = mix(vec3(0.46, 0.78, 1.0), vec3(0.88, 0.66, 1.0), band);
    vec3 gold = mix(vec3(1.0, 0.77, 0.34), vec3(1.0, 0.55, 0.24), band);
    vec3 remnant = mix(vec3(0.56, 0.32, 0.80), vec3(0.80, 0.36, 0.44), band);

    if (t < 0.24) return mix(core, cno, t / 0.24);
    if (t < 0.62) return mix(cno, gold, (t - 0.24) / 0.38);
    return mix(gold, remnant, (t - 0.62) / 0.38);
  }

  void main() {
    if (uAgeNorm <= 0.001 || uAgeNorm >= 0.999) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    // Staggered per-particle launch & explosive deceleration into swirling nebular ejecta
    float localAge = clamp((uAgeNorm - aPhase * 0.14) / 0.86, 0.0, 1.0);
    float expansion = 1.0 - pow(1.0 - localAge, 2.8);

    // Outward radial blast + gentle magnetic dipole spiral curl
    float swirlAngle = localAge * (1.2 + aElementBand * 1.4) * (aPhase > 0.5 ? 1.0 : -1.0);
    float cs = cos(swirlAngle);
    float sn = sin(swirlAngle);
    vec3 dir = vec3(
      aVelocity.x * cs - aVelocity.z * sn,
      aVelocity.y,
      aVelocity.x * sn + aVelocity.z * cs
    );
    vec3 pos = dir * (uRadius * expansion);

    // Subtle filament turbulence as heavy elements cool
    pos += vec3(
      sin(uTime * 1.4 + aPhase * 12.5),
      cos(uTime * 1.2 + aElementBand * 10.3),
      sin(uTime * 1.1 + aPhase * 9.1)
    ) * (0.45 * localAge);

    // Real-time color shifting along the Stellar Nucleosynthesis fusion spectrum
    float colorTime = clamp(localAge * 0.92 + aElementBand * 0.18, 0.0, 1.0);
    vColor = fusionSpectralColor(colorTime, aElementBand);

    float rise = smoothstep(0.0, 0.05, localAge);
    float fade = pow(max(0.0, 1.0 - localAge), 1.38);
    float twinkle = 0.72 + 0.28 * sin(uTime * 4.5 + aPhase * 6.28318);
    vAlpha = rise * fade * twinkle * uIntensity;
    vSpark = smoothstep(2.1, 3.6, aScale) * (1.0 - localAge * 0.5);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float dist = max(6.0, -mvPosition.z);
    float sizePulse = mix(1.35, 0.72, localAge);
    gl_PointSize = clamp(aScale * sizePulse * uPixelRatio * (110.0 / dist), 1.4, 18.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const NUCLEOSYNTHESIS_PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpark;

  void main() {
    if (vAlpha < 0.005) discard;
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;

    // Hot additive core + luminous soft plasma halo + delicate 4-point fusion glint
    float core = exp(-d * d * 72.0);
    float halo = pow(max(0.0, 1.0 - d * 2.0), 3.2) * 0.34;
    float spikeX = exp(-abs(uv.y) * 54.0) * exp(-abs(uv.x) * 6.5);
    float spikeY = exp(-abs(uv.x) * 54.0) * exp(-abs(uv.y) * 6.5);
    float spikes = (spikeX + spikeY) * vSpark * 0.38;

    float intensity = core + halo + spikes;
    vec3 col = mix(vColor, vec3(1.0, 0.985, 0.94), clamp(core * 0.68, 0.0, 1.0));
    gl_FragColor = vec4(col * intensity * 0.95, clamp(intensity * vAlpha * 0.92, 0.0, 0.95));
  }
`;

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface BurstSlotResources {
  state: BurstSlotState;
  group: THREE.Group;
  burstBillboard: THREE.Mesh;
  burstMat: THREE.ShaderMaterial;
  particlesMat: THREE.ShaderMaterial;
}

/**
 * Procedural 'Stellar Nucleosynthesis' visualization in CosmicEngine:
 * Generates additive-blended radial light bursts, shockwave rings, and color-shifting
 * fusion ejecta particles whenever a star is born (automatically across scheduled cosmic
 * genesis moments or on-demand when the viewer triggers star births & network impulses).
 */
export class StellarNucleosynthesis {
  public readonly root = new THREE.Group();
  public readonly totalParticleCount: number;

  private readonly slots: BurstSlotResources[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private nextSlotIdx = 0;
  private prevFilmTime = -1;
  private totalSpawnedBursts = 0;

  constructor(isMobile: boolean, pixelRatio: number) {
    const slotCount = 4;
    const particlesPerSlot = isMobile ? 280 : 560;
    this.totalParticleCount = slotCount * particlesPerSlot;

    const planeGeo = new THREE.PlaneGeometry(2, 2);
    this.disposables.push(planeGeo);

    for (let s = 0; s < slotCount; s++) {
      const rand = seededRandom(202600 + s * 7919);
      const group = new THREE.Group();
      group.visible = false;

      // 1. Additive-blended procedural light-burst shockwave & coronal flare billboard
      const burstMat = new THREE.ShaderMaterial({
        vertexShader: NUCLEOSYNTHESIS_BURST_VERTEX_SHADER,
        fragmentShader: NUCLEOSYNTHESIS_BURST_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uAgeNorm: { value: 0 },
          uIntensity: { value: 1 },
          uSeed: { value: s + 1 },
          uTime: { value: 0 },
        },
      });
      const burstBillboard = new THREE.Mesh(planeGeo, burstMat);
      burstBillboard.renderOrder = 4;
      group.add(burstBillboard);

      // 2. Additive-blended color-shifting fusion ejecta particle shell
      const pGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(particlesPerSlot * 3);
      const velocities = new Float32Array(particlesPerSlot * 3);
      const elementBands = new Float32Array(particlesPerSlot);
      const scales = new Float32Array(particlesPerSlot);
      const phases = new Float32Array(particlesPerSlot);

      for (let i = 0; i < particlesPerSlot; i++) {
        // Uniform spherical shell + bipolar relativistic jets (~18% of particles)
        const isJet = rand() < 0.18;
        let vx: number;
        let vy: number;
        let vz: number;

        if (isJet) {
          const sign = rand() < 0.5 ? 1 : -1;
          const spread = 0.22;
          vx = (rand() - 0.5) * spread;
          vy = sign * (0.85 + rand() * 0.45);
          vz = (rand() - 0.5) * spread;
        } else {
          const u = rand() * 2 - 1;
          const phi = rand() * Math.PI * 2;
          const root = Math.sqrt(Math.max(0, 1 - u * u));
          const speed = 0.35 + Math.pow(rand(), 0.72) * 0.85;
          vx = root * Math.cos(phi) * speed;
          vy = u * speed;
          vz = root * Math.sin(phi) * speed;
        }

        velocities[i * 3] = vx;
        velocities[i * 3 + 1] = vy;
        velocities[i * 3 + 2] = vz;
        elementBands[i] = rand();
        scales[i] = 1.2 + Math.pow(rand(), 2.1) * 2.8;
        phases[i] = rand();
      }

      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pGeo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
      pGeo.setAttribute('aElementBand', new THREE.BufferAttribute(elementBands, 1));
      pGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
      pGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

      const particlesMat = new THREE.ShaderMaterial({
        vertexShader: NUCLEOSYNTHESIS_PARTICLE_VERTEX_SHADER,
        fragmentShader: NUCLEOSYNTHESIS_PARTICLE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uAgeNorm: { value: 0 },
          uRadius: { value: 14.0 },
          uIntensity: { value: 1.0 },
          uPixelRatio: { value: pixelRatio },
          uTime: { value: 0 },
        },
      });

      const points = new THREE.Points(pGeo, particlesMat);
      points.frustumCulled = false;
      points.renderOrder = 5;
      group.add(points);

      this.root.add(group);
      this.disposables.push(burstMat, pGeo, particlesMat);
      this.slots.push({
        state: {
          active: false,
          age: 0,
          duration: 5.2,
          intensity: 1,
          radius: 14,
          originX: 0,
          originY: 0,
          originZ: 0,
          seed: s + 1,
        },
        group,
        burstBillboard,
        burstMat,
        particlesMat,
      });
    }
  }

  /**
   * Procedurally spawns a new additive-blended Stellar Nucleosynthesis light burst
   * and color-shifting particle eruption at `origin`.
   */
  public spawnBurst(
    origin: readonly [number, number, number],
    intensity = 1.0,
    radius = 14.0,
    duration = 5.2,
    initialAge = 0,
    seed?: number,
  ): void {
    // Reuse an existing young burst at the same location instead of double-stacking white flashes
    let slot: BurstSlotResources | null = null;
    for (let i = 0; i < this.slots.length; i++) {
      const candidate = this.slots[i];
      if (candidate.state.active && candidate.state.age < 2.2) {
        const dx = candidate.state.originX - origin[0];
        const dy = candidate.state.originY - origin[1];
        const dz = candidate.state.originZ - origin[2];
        if (dx * dx + dy * dy + dz * dz < 25.0) {
          slot = candidate;
          break;
        }
      }
    }
    if (!slot) {
      slot = this.slots[this.nextSlotIdx];
      this.nextSlotIdx = (this.nextSlotIdx + 1) % this.slots.length;
    }

    slot.state.active = true;
    slot.state.age = Math.max(0, initialAge);
    slot.state.duration = Math.max(1.5, duration);
    slot.state.intensity = intensity;
    slot.state.radius = radius;
    slot.state.originX = origin[0];
    slot.state.originY = origin[1];
    slot.state.originZ = origin[2];
    slot.state.seed = seed ?? (this.totalSpawnedBursts * 13.7 + 1.3);

    slot.group.position.set(origin[0], origin[1], origin[2]);
    slot.group.visible = true;
    this.totalSpawnedBursts += 1;
  }

  public resetTimeline(filmTime: number): void {
    this.prevFilmTime = filmTime - 0.01;
  }

  public update(
    filmTime: number,
    elapsed: number,
    delta: number,
    cameraQuaternion: THREE.Quaternion,
    hasEntered: boolean,
    onBurstSpawned?: (intensity: number) => void,
  ): void {
    if (hasEntered) {
      if (this.prevFilmTime < 0) {
        // First frame (e.g. ?autostart=1&t=82.5): check seek lookback so star birth bursts appear immediately
        const initialHits = findTriggeredStarBirths(-10, filmTime, 4.2);
        for (let i = 0; i < initialHits.length; i++) {
          const { event, initialAge } = initialHits[i];
          this.spawnBurst(event.origin, event.intensity, event.radius, 5.4, initialAge, event.seed);
          if (initialAge < 0.8) {
            onBurstSpawned?.(event.intensity);
          }
        }
      } else {
        const hits = findTriggeredStarBirths(this.prevFilmTime, filmTime, 4.2);
        for (let i = 0; i < hits.length; i++) {
          const { event, initialAge } = hits[i];
          this.spawnBurst(event.origin, event.intensity, event.radius, 5.4, initialAge, event.seed);
          onBurstSpawned?.(event.intensity);
        }
      }
      this.prevFilmTime = filmTime;
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.state.active) continue;

      slot.state.age += delta;
      const ageNorm = slot.state.age / slot.state.duration;
      if (ageNorm >= 1.0) {
        slot.state.active = false;
        slot.group.visible = false;
        continue;
      }

      slot.group.visible = true;
      slot.burstBillboard.quaternion.copy(cameraQuaternion);
      const billboardScale = slot.state.radius * (0.48 + ageNorm * 0.72);
      slot.burstBillboard.scale.set(billboardScale, billboardScale, 1);

      slot.burstMat.uniforms.uAgeNorm.value = ageNorm;
      slot.burstMat.uniforms.uIntensity.value = slot.state.intensity;
      slot.burstMat.uniforms.uSeed.value = slot.state.seed;
      slot.burstMat.uniforms.uTime.value = elapsed;

      slot.particlesMat.uniforms.uAgeNorm.value = ageNorm;
      slot.particlesMat.uniforms.uRadius.value = slot.state.radius;
      slot.particlesMat.uniforms.uIntensity.value = slot.state.intensity;
      slot.particlesMat.uniforms.uTime.value = elapsed;
    }
  }

  public getActiveBurstCount(): number {
    let active = 0;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i].state.active) active++;
    }
    return active;
  }

  public getTotalSpawnedBursts(): number {
    return this.totalSpawnedBursts;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
