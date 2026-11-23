export type YinYangRegion =
  | 'yang'
  | 'yin'
  | 'yin-seed-in-yang'
  | 'yang-seed-in-yin'
  | 'boundary'
  | 'outside';

export interface CosmicYinYangConfig {
  radius: number;
  starCount: number;
  nebulaCount: number;
  seedGalaxyStars: number;
  seedGalaxyNebulae: number;
  boundaryStarCount: number;
  embeddedGalaxyCount: number;
  seed: number;
}

export const DEFAULT_COSMIC_YINYANG_CONFIG: CosmicYinYangConfig = {
  radius: 15.0,
  starCount: 20000,
  nebulaCount: 880,
  seedGalaxyStars: 1350,
  seedGalaxyNebulae: 48,
  boundaryStarCount: 2600,
  embeddedGalaxyCount: 8,
  seed: 20021125,
};

export interface CosmicYinYangStarBuffers {
  count: number;
  startPositions: Float32Array;
  targetPositions: Float32Array;
  flowTangents: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  phases: Float32Array;
  ignitionTimes: Float32Array;
  halfSigns: Float32Array; // +1 = Yang (clockwise), -1 = Yin (counter-clockwise), 0 = boundary
  seedFlags: Float32Array; // 1 = part of seed mini-galaxy, 0 = main field
}

export interface CosmicYinYangNebulaBuffers {
  count: number;
  startPositions: Float32Array;
  targetPositions: Float32Array;
  flowTangents: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  phases: Float32Array;
  opacities: Float32Array;
  ignitionTimes: Float32Array;
  halfSigns: Float32Array;
}

export interface CosmicYinYangStats {
  totalStars: number;
  totalNebulae: number;
  yangStarCount: number;
  yinStarCount: number;
  yangSeedStarCount: number;
  yinSeedStarCount: number;
  boundaryStarCount: number;
  yangMeanLuminance: number;
  yinMeanLuminance: number;
  symmetryBalanceRatio: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u1 = Math.max(1e-6, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Exact Taijitu region classifier used to arrange purely cosmic entities
 * (stars, clusters, miniature spiral galaxies, nebulae) into a natural,
 * unmistakable symmetrical Yin-Yang formation without any solid geometry.
 *
 * Coordinate convention:
 * - Upper lobe center: (0, +R/2) -> Yang head holding the dark Yin seed galaxy
 * - Lower lobe center: (0, -R/2) -> Yin head holding the luminous Yang seed galaxy
 */
export function classifyYinYangPoint(x: number, y: number, radius: number): YinYangRegion {
  const R = Math.max(1e-4, radius);
  const r = Math.hypot(x, y);
  if (r > R * 1.035) return 'outside';
  if (r > R * 0.965) return 'boundary';

  const halfR = R * 0.5;
  const seedR = R * 0.165;
  const dTop = Math.hypot(x, y - halfR);
  const dBot = Math.hypot(x, y + halfR);

  if (dTop <= seedR) return 'yin-seed-in-yang';
  if (dBot <= seedR) return 'yang-seed-in-yin';

  if (dTop <= halfR) return 'yang';
  if (dBot <= halfR) return 'yin';

  return x >= 0 ? 'yang' : 'yin';
}

/**
 * Computes the signed distance to the internal S-curve seam separating Yang and Yin,
 * allowing organic density tapering & interstellar star-stream blending along the seam.
 */
export function distanceToYinYangSeam(x: number, y: number, radius: number): number {
  const halfR = radius * 0.5;
  const dTop = Math.abs(Math.hypot(x, y - halfR) - halfR);
  const dBot = Math.abs(Math.hypot(x, y + halfR) - halfR);
  return Math.min(dTop, dBot);
}

/**
 * Computes a smooth, divergence-respecting tangential circulation vector inside
 * the Yang (+1, clockwise) or Yin (-1, counter-clockwise) lobe so both halves
 * counter-rotate continuously while preserving the exact Yin-Yang silhouette.
 */
export function computeYinYangFlowTangent(
  x: number,
  y: number,
  radius: number,
  halfSign: number,
): [number, number] {
  const halfR = radius * 0.5;
  // Blend circulation around the lobe head center with outer perimeter tangent
  const lobeCy = halfSign > 0 ? halfR : -halfR;
  const dxLobe = x;
  const dyLobe = y - lobeCy;
  const dLobe = Math.max(0.25, Math.hypot(dxLobe, dyLobe));

  // Yang (+1) circulates clockwise: (dy, -dx); Yin (-1) circulates counter-clockwise: (-dy, dx)
  const dir = halfSign >= 0 ? 1 : -1;
  const lx = (dyLobe / dLobe) * dir;
  const ly = (-dxLobe / dLobe) * dir;

  const r = Math.max(0.25, Math.hypot(x, y));
  const rx = (y / r) * dir;
  const ry = (-x / r) * dir;

  // Near the head lobe use lobe swirl; along the tapering tail blend smoothly into outer arc stream
  const lobeWeight = clamp(1.15 - dLobe / (radius * 0.85), 0.18, 0.92);
  const tx = lx * lobeWeight + rx * (1 - lobeWeight);
  const ty = ly * lobeWeight + ry * (1 - lobeWeight);
  const len = Math.max(1e-4, Math.hypot(tx, ty));
  return [tx / len, ty / len];
}

function mix3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const k = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// Cohesive Astrophotography Spectral Palettes
// Yang: dense luminous golden-white stars, radiant cerulean/blue nebulae
const YANG_STAR_GOLD: readonly [number, number, number] = [1.0, 0.88, 0.56];
const YANG_STAR_WHITE: readonly [number, number, number] = [1.0, 0.96, 0.84];
const YANG_STAR_AMBER: readonly [number, number, number] = [0.98, 0.72, 0.32];
const YANG_STAR_BLUE: readonly [number, number, number] = [0.56, 0.82, 1.0];
const YANG_NEBULA_BLUE: readonly [number, number, number] = [0.28, 0.6, 0.98];
const YANG_NEBULA_GOLD: readonly [number, number, number] = [0.96, 0.76, 0.36];

// Yin: deep violet, nebula crimson, and electric-blue cosmic matter
const YIN_STAR_VIOLET: readonly [number, number, number] = [0.64, 0.34, 1.0];
const YIN_STAR_CRIMSON: readonly [number, number, number] = [0.96, 0.24, 0.44];
const YIN_STAR_ELECTRIC: readonly [number, number, number] = [0.24, 0.64, 1.0];
const YIN_STAR_DEEP: readonly [number, number, number] = [0.46, 0.22, 0.86];
const YIN_NEBULA_VIOLET: readonly [number, number, number] = [0.42, 0.16, 0.82];
const YIN_NEBULA_CRIMSON: readonly [number, number, number] = [0.82, 0.14, 0.34];
const YIN_NEBULA_ELECTRIC: readonly [number, number, number] = [0.16, 0.46, 0.96];

function pickYangStarColor(rand: () => number, coreBias: number): [number, number, number] {
  const r = rand();
  if (r < 0.42 + coreBias * 0.25) return mix3(YANG_STAR_WHITE, YANG_STAR_GOLD, rand() * 0.65);
  if (r < 0.8) return mix3(YANG_STAR_GOLD, YANG_STAR_AMBER, rand() * 0.7);
  return mix3(YANG_STAR_BLUE, YANG_STAR_WHITE, rand() * 0.45);
}

function pickYinStarColor(rand: () => number): [number, number, number] {
  const r = rand();
  if (r < 0.44) return mix3(YIN_STAR_VIOLET, YIN_STAR_DEEP, rand() * 0.65);
  if (r < 0.74) return mix3(YIN_STAR_CRIMSON, YIN_STAR_VIOLET, rand() * 0.4);
  return mix3(YIN_STAR_ELECTRIC, YIN_STAR_VIOLET, rand() * 0.35);
}

/**
 * Generates ALL pure-cosmic-entity buffers (stars, dense star clusters,
 * miniature spiral seed galaxies, embedded companion galaxies, delicate
 * perimeter star streams, and volumetric nebula clouds) arranged collectively
 * into a breathtaking, symmetrical Yin-Yang formation.
 */
export function generateCosmicYinYangEntities(
  partialConfig?: Partial<CosmicYinYangConfig>,
): {
  stars: CosmicYinYangStarBuffers;
  nebulae: CosmicYinYangNebulaBuffers;
  stats: CosmicYinYangStats;
} {
  const cfg: CosmicYinYangConfig = {
    ...DEFAULT_COSMIC_YINYANG_CONFIG,
    ...partialConfig,
  };
  const rand = createPrng(cfg.seed);
  const R = cfg.radius;
  const halfR = R * 0.5;
  const seedR = R * 0.165;
  const moatR = seedR * 1.42;

  const embeddedGalaxyStarsEach = 220;
  const totalEmbeddedStars = cfg.embeddedGalaxyCount * embeddedGalaxyStarsEach;
  const totalStars =
    cfg.starCount + cfg.seedGalaxyStars * 2 + cfg.boundaryStarCount + totalEmbeddedStars;
  const totalNebulae = cfg.nebulaCount + cfg.seedGalaxyNebulae * 2 + cfg.embeddedGalaxyCount * 6;

  const startPositions = new Float32Array(totalStars * 3);
  const targetPositions = new Float32Array(totalStars * 3);
  const flowTangents = new Float32Array(totalStars * 3);
  const colors = new Float32Array(totalStars * 3);
  const scales = new Float32Array(totalStars);
  const phases = new Float32Array(totalStars);
  const ignitionTimes = new Float32Array(totalStars);
  const halfSigns = new Float32Array(totalStars);
  const seedFlags = new Float32Array(totalStars);

  let sIdx = 0;
  let yangStarCount = 0;
  let yinStarCount = 0;
  let yangSeedStarCount = 0;
  let yinSeedStarCount = 0;
  let boundaryStarCount = 0;
  let yangLumSum = 0;
  let yinLumSum = 0;

  const writeStar = (
    tx: number,
    ty: number,
    tz: number,
    col: readonly [number, number, number],
    scale: number,
    halfSign: number,
    seedFlag: number,
    ignition: number,
    tangentOverride?: readonly [number, number, number],
  ) => {
    if (sIdx >= totalStars) return;
    // Dispersed dark-space origin far from final Yin-Yang target for organic convergence
    const swirlAngle = Math.atan2(ty, tx) + (halfSign >= 0 ? -1.45 : 1.45) + (rand() - 0.5) * 1.4;
    const expandR = Math.hypot(tx, ty) * (1.75 + rand() * 1.65) + 4.0 + rand() * 14.0;
    startPositions[sIdx * 3] = Math.cos(swirlAngle) * expandR;
    startPositions[sIdx * 3 + 1] = Math.sin(swirlAngle) * expandR;
    startPositions[sIdx * 3 + 2] = tz + (rand() - 0.5) * 28.0;

    targetPositions[sIdx * 3] = tx;
    targetPositions[sIdx * 3 + 1] = ty;
    targetPositions[sIdx * 3 + 2] = tz;

    if (tangentOverride) {
      flowTangents[sIdx * 3] = tangentOverride[0];
      flowTangents[sIdx * 3 + 1] = tangentOverride[1];
      flowTangents[sIdx * 3 + 2] = tangentOverride[2];
    } else {
      const [ftx, fty] = computeYinYangFlowTangent(tx, ty, R, halfSign);
      flowTangents[sIdx * 3] = ftx;
      flowTangents[sIdx * 3 + 1] = fty;
      flowTangents[sIdx * 3 + 2] = (rand() - 0.5) * 0.14;
    }

    colors[sIdx * 3] = col[0];
    colors[sIdx * 3 + 1] = col[1];
    colors[sIdx * 3 + 2] = col[2];
    scales[sIdx] = scale;
    phases[sIdx] = rand();
    ignitionTimes[sIdx] = clamp(ignition, 0, 1);
    halfSigns[sIdx] = halfSign;
    seedFlags[sIdx] = seedFlag;
    sIdx++;
  };

  // Pre-build 72 organic dense star-cluster attractors distributed inside Yang & Yin spiral arcs
  interface ClusterAnchor {
    x: number;
    y: number;
    z: number;
    spread: number;
    halfSign: number;
  }
  const clusters: ClusterAnchor[] = [];
  for (let attempt = 0; attempt < 900 && clusters.length < 72; attempt++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * R * 0.91;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const reg = classifyYinYangPoint(x, y, R);
    if (reg !== 'yang' && reg !== 'yin') continue;
    const dTop = Math.hypot(x, y - halfR);
    const dBot = Math.hypot(x, y + halfR);
    if (dTop < moatR * 1.15 || dBot < moatR * 1.15) continue;
    clusters.push({
      x,
      y,
      z: (rand() - 0.5) * 1.35,
      spread: 0.45 + rand() * 1.25,
      halfSign: reg === 'yang' ? 1 : -1,
    });
  }

  // 1. Main intertwined Yang & Yin stellar populations (organic spiral arms + dense clusters)
  const targetYangCount = Math.floor(cfg.starCount * 0.54);
  const targetYinCount = cfg.starCount - targetYangCount;

  const populateHalf = (wantHalf: 'yang' | 'yin', countTarget: number) => {
    const halfSign = wantHalf === 'yang' ? 1 : -1;
    const halfClusters = clusters.filter((c) => c.halfSign === halfSign);
    let placed = 0;
    let safety = 0;

    while (placed < countTarget && safety < countTarget * 12) {
      safety++;
      let x: number;
      let y: number;
      let z: number;
      let clusterBoost = 0;

      const modeRoll = rand();
      if (modeRoll < 0.34 && halfClusters.length > 0) {
        // Dense organic star clusters nestled inside the cosmic spiral arms
        const cl = halfClusters[Math.floor(rand() * halfClusters.length)];
        if (!cl) continue;
        x = cl.x + gaussian(rand) * cl.spread;
        y = cl.y + gaussian(rand) * cl.spread;
        z = cl.z + gaussian(rand) * 0.55;
        clusterBoost = 0.45;
      } else if (modeRoll < 0.72) {
        // Sweeping logarithmic spiral streams following the Yin-Yang teardrop spine
        // u in [0..1] runs from head center around outer rim to tapering tail tip
        const u = Math.pow(rand(), 0.82);
        const lobeCy = halfSign > 0 ? halfR : -halfR;
        const spiralArm = Math.floor(rand() * 3);
        const armAngle =
          (halfSign > 0 ? 0.35 : Math.PI + 0.35) +
          (spiralArm / 3) * Math.PI * 1.25 +
          u * 4.4 * (halfSign > 0 ? -1 : 1);

        if (u < 0.58) {
          // Head spiral swirl around (0, ±R/2) outside the contrasting seed moat
          const rad = moatR * 0.96 + (u / 0.58) * (halfR * 0.98 - moatR * 0.96);
          x = Math.cos(armAngle) * rad + gaussian(rand) * 0.62;
          y = lobeCy + Math.sin(armAngle) * rad + gaussian(rand) * 0.62;
        } else {
          // Sweeping outer cosmic tail curling smoothly around the opposing lobe
          const tailT = (u - 0.58) / 0.42;
          const tailAngle =
            halfSign > 0
              ? Math.PI * 0.42 - tailT * Math.PI * 0.95
              : -Math.PI * 0.58 - tailT * Math.PI * 0.95;
          const tailRad = R * (0.56 + (1 - tailT) * 0.38) + gaussian(rand) * (1.25 * (1 - tailT * 0.65));
          x = Math.cos(tailAngle) * tailRad;
          y = Math.sin(tailAngle) * tailRad;
        }
        z = gaussian(rand) * (0.65 + (1 - u) * 0.55);
      } else {
        // Fine interstellar star field filling the domain organically with subtle spiral density wave
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * R * 0.96;
        x = Math.cos(a) * r;
        y = Math.sin(a) * r;
        z = gaussian(rand) * 0.78;
      }

      const reg = classifyYinYangPoint(x, y, R);
      if (reg !== wantHalf) continue;

      // Carve clean natural dark interstellar moat around both seed galaxies so the dots shine crisply
      const dTop = Math.hypot(x, y - halfR);
      const dBot = Math.hypot(x, y + halfR);
      if (dTop < moatR && rand() < 0.94) continue;
      if (dBot < moatR && rand() < 0.94) continue;

      // Subtle organic density taper right on the S-curve seam (allows feathery star-stream crossover)
      const seamDist = distanceToYinYangSeam(x, y, R);
      if (seamDist < R * 0.032 && rand() < 0.36) continue;

      const mag = Math.pow(rand(), 2.95);
      const col =
        wantHalf === 'yang' ? pickYangStarColor(rand, clusterBoost) : pickYinStarColor(rand);

      // Yang has richer luminous golden-white stars; Yin stays deeper & moodier so silhouette is unmistakable
      const scale =
        wantHalf === 'yang'
          ? 1.25 + clusterBoost * 0.65 + mag * 3.4
          : 0.92 + clusterBoost * 0.45 + mag * 2.55;

      // Staggered organic ignition: bright guide stars ignite first in the darkness, fine stardust follows
      const ignition = clamp(0.04 + (1 - mag) * 0.62 + rand() * 0.32, 0.02, 0.98);

      writeStar(x, y, z, col, scale, halfSign, 0, ignition);
      const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
      if (wantHalf === 'yang') {
        yangStarCount++;
        yangLumSum += lum * scale;
      } else {
        yinStarCount++;
        yinLumSum += lum * scale;
      }
      placed++;
    }
  };

  populateHalf('yang', targetYangCount);
  populateHalf('yin', targetYinCount);

  // 2. Two Characteristic Circular Dots -> Concentrated Miniature Rotating Spiral Galaxies + Star Clusters
  const populateSeedSpiralGalaxy = (
    cx: number,
    cy: number,
    isYangSeed: boolean,
    count: number,
  ) => {
    const halfSign = isYangSeed ? 1 : -1;
    const arms = 3;
    const maxR = seedR * 0.96;

    for (let i = 0; i < count; i++) {
      const isCore = i < count * 0.34;
      let lx: number;
      let ly: number;
      let lz: number;
      let radialFrac: number;

      if (isCore) {
        // Dense intensely glowing central star cluster bulge
        radialFrac = Math.pow(rand(), 1.9) * 0.38;
        const a = rand() * Math.PI * 2;
        const r = radialFrac * maxR;
        lx = Math.cos(a) * r;
        ly = Math.sin(a) * r;
        lz = gaussian(rand) * 0.22;
      } else {
        // Crisp 3-arm miniature spiral galaxy swirling around the seed core
        const arm = i % arms;
        radialFrac = 0.14 + Math.pow(rand(), 1.22) * 0.86;
        const r = radialFrac * maxR;
        const spinDir = isYangSeed ? -1 : 1;
        const angle =
          (arm / arms) * Math.PI * 2 +
          Math.pow(radialFrac, 0.84) * 3.8 * spinDir +
          gaussian(rand) * (0.18 + radialFrac * 0.22);
        lx = Math.cos(angle) * r;
        ly = Math.sin(angle) * r;
        lz = gaussian(rand) * 0.18 * (1 - radialFrac * 0.5);
      }

      const tx = cx + lx;
      const ty = cy + ly;
      const tz = 0.45 + lz;

      // Local spiral spin tangent around the miniature galaxy's own center
      const d = Math.max(0.05, Math.hypot(lx, ly));
      const spinDir = isYangSeed ? 1 : -1;
      const tangent: [number, number, number] = [(ly / d) * spinDir, (-lx / d) * spinDir, 0];

      const col = isYangSeed
        ? mix3(YANG_STAR_WHITE, radialFrac < 0.45 ? YANG_STAR_GOLD : YANG_STAR_BLUE, radialFrac * 0.72)
        : mix3(
            radialFrac < 0.35 ? YIN_STAR_ELECTRIC : YIN_STAR_CRIMSON,
            YIN_STAR_VIOLET,
            radialFrac * 0.65,
          );

      const scale = (isYangSeed ? 1.55 : 1.38) + (1 - radialFrac) * 1.9 + Math.pow(rand(), 2.8) * 2.2;
      const ignition = clamp(0.18 + radialFrac * 0.45 + rand() * 0.25, 0.1, 0.92);

      writeStar(tx, ty, tz, col, scale, halfSign, 1, ignition, tangent);
      if (isYangSeed) {
        yangSeedStarCount++;
      } else {
        yinSeedStarCount++;
      }
    }
  };

  // Radiant golden-white miniature spiral galaxy nestled inside the deep violet/crimson Yin lobe (0, -R/2)
  populateSeedSpiralGalaxy(0, -halfR, true, cfg.seedGalaxyStars);
  // Deep violet/crimson/electric-blue miniature spiral galaxy nestled inside the golden Yang lobe (0, +R/2)
  populateSeedSpiralGalaxy(0, halfR, false, cfg.seedGalaxyStars);

  // 3. Embedded Radiant Miniature Companion Galaxies inside the Yang & Yin arms
  const embeddedSpots: Array<{ x: number; y: number; r: number; halfSign: number; tilt: number }> = [
    // Yang embedded radiant galaxies
    { x: R * 0.32, y: R * 0.56, r: 1.55, halfSign: 1, tilt: 0.48 },
    { x: R * 0.62, y: R * 0.18, r: 1.45, halfSign: 1, tilt: -0.35 },
    { x: R * 0.56, y: -R * 0.34, r: 1.25, halfSign: 1, tilt: 0.62 },
    { x: -R * 0.28, y: R * 0.66, r: 1.2, halfSign: 1, tilt: -0.52 },
    // Yin embedded violet/crimson/electric-blue galaxies
    { x: -R * 0.32, y: -R * 0.56, r: 1.55, halfSign: -1, tilt: -0.44 },
    { x: -R * 0.62, y: -R * 0.18, r: 1.45, halfSign: -1, tilt: 0.38 },
    { x: -R * 0.56, y: R * 0.34, r: 1.25, halfSign: -1, tilt: -0.58 },
    { x: R * 0.28, y: -R * 0.66, r: 1.2, halfSign: -1, tilt: 0.5 },
  ];

  const activeEmbedded = embeddedSpots.slice(0, cfg.embeddedGalaxyCount);
  for (let g = 0; g < activeEmbedded.length; g++) {
    const spot = activeEmbedded[g];
    if (!spot) continue;
    const cosT = Math.cos(spot.tilt);
    const sinT = Math.sin(spot.tilt);
    for (let i = 0; i < embeddedGalaxyStarsEach; i++) {
      const arm = i % 2;
      const rf = Math.pow(rand(), 1.35);
      const r = rf * spot.r;
      const ang = arm * Math.PI + rf * 3.4 * (spot.halfSign > 0 ? -1 : 1) + gaussian(rand) * 0.25;
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r * 0.64; // inclined mini-galaxy ellipse
      const rx = px * cosT - py * sinT;
      const ry = px * sinT + py * cosT;
      const tx = spot.x + rx;
      const ty = spot.y + ry;
      const tz = (g % 2 === 0 ? 0.55 : -0.45) + gaussian(rand) * 0.16;

      const col =
        spot.halfSign > 0
          ? mix3(YANG_STAR_WHITE, rf < 0.4 ? YANG_STAR_GOLD : YANG_STAR_BLUE, rf * 0.8)
          : mix3(YIN_STAR_ELECTRIC, rf < 0.5 ? YIN_STAR_CRIMSON : YIN_STAR_VIOLET, rf * 0.85);
      const scale = 1.1 + (1 - rf) * 1.45 + Math.pow(rand(), 3.0) * 1.8;
      writeStar(tx, ty, tz, col, scale, spot.halfSign, 0, 0.22 + rf * 0.5);
    }
  }

  // 4. Delicate Outer Boundary Stream (pure shimmering stars & cosmic dust particles — NEVER a solid line!)
  for (let i = 0; i < cfg.boundaryStarCount; i++) {
    const theta = rand() * Math.PI * 2;
    const radialJitter = gaussian(rand) * (R * 0.024);
    const r = R * 0.992 + radialJitter;
    const tx = Math.cos(theta) * r;
    const ty = Math.sin(theta) * r;
    const tz = gaussian(rand) * 0.48;

    // Right/top hemisphere carries golden-white & sapphire stardust; left/bottom carries electric-blue/violet
    const isYangArc = tx * 0.85 + ty * 0.52 >= 0;
    const col = isYangArc
      ? mix3(YANG_STAR_GOLD, YANG_STAR_BLUE, rand() * 0.45)
      : mix3(YIN_STAR_ELECTRIC, YIN_STAR_VIOLET, rand() * 0.65);

    const mag = Math.pow(rand(), 2.8);
    const scale = 0.85 + mag * 2.25;
    const tangent: [number, number, number] = [
      (Math.sin(theta) * (isYangArc ? 1 : -1)) * 0.85,
      (-Math.cos(theta) * (isYangArc ? 1 : -1)) * 0.85,
      0,
    ];
    writeStar(tx, ty, tz, col, scale, isYangArc ? 1 : -1, 0, 0.3 + rand() * 0.65, tangent);
    boundaryStarCount++;
  }

  // 5. Volumetric Nebula Clouds & Interstellar Dust Filaments (Yang blue-gold vs Yin violet-crimson-electric)
  const nStart = new Float32Array(totalNebulae * 3);
  const nTarget = new Float32Array(totalNebulae * 3);
  const nTangents = new Float32Array(totalNebulae * 3);
  const nColors = new Float32Array(totalNebulae * 3);
  const nScales = new Float32Array(totalNebulae);
  const nPhases = new Float32Array(totalNebulae);
  const nOpacities = new Float32Array(totalNebulae);
  const nIgnition = new Float32Array(totalNebulae);
  const nHalfSigns = new Float32Array(totalNebulae);

  let nIdx = 0;
  const writeNebula = (
    tx: number,
    ty: number,
    tz: number,
    col: readonly [number, number, number],
    scale: number,
    opacity: number,
    halfSign: number,
    ignition: number,
  ) => {
    if (nIdx >= totalNebulae) return;
    const swirl = Math.atan2(ty, tx) + (halfSign >= 0 ? -1.2 : 1.2) + (rand() - 0.5) * 1.1;
    const expandR = Math.hypot(tx, ty) * (1.6 + rand() * 1.35) + 5.0 + rand() * 10.0;
    nStart[nIdx * 3] = Math.cos(swirl) * expandR;
    nStart[nIdx * 3 + 1] = Math.sin(swirl) * expandR;
    nStart[nIdx * 3 + 2] = tz + (rand() - 0.5) * 18.0;

    nTarget[nIdx * 3] = tx;
    nTarget[nIdx * 3 + 1] = ty;
    nTarget[nIdx * 3 + 2] = tz;

    const [ftx, fty] = computeYinYangFlowTangent(tx, ty, R, halfSign);
    nTangents[nIdx * 3] = ftx;
    nTangents[nIdx * 3 + 1] = fty;
    nTangents[nIdx * 3 + 2] = 0;

    nColors[nIdx * 3] = col[0];
    nColors[nIdx * 3 + 1] = col[1];
    nColors[nIdx * 3 + 2] = col[2];
    nScales[nIdx] = scale;
    nPhases[nIdx] = rand();
    nOpacities[nIdx] = opacity;
    nIgnition[nIdx] = clamp(ignition, 0, 1);
    nHalfSigns[nIdx] = halfSign;
    nIdx++;
  };

  let nebPlaced = 0;
  let nebSafety = 0;
  while (nebPlaced < cfg.nebulaCount && nebSafety < cfg.nebulaCount * 12) {
    nebSafety++;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * R * 0.93;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const reg = classifyYinYangPoint(x, y, R);
    if (reg !== 'yang' && reg !== 'yin') continue;

    // Keep seed galaxy moats crisp & unclouded
    if (Math.hypot(x, y - halfR) < moatR * 1.08) continue;
    if (Math.hypot(x, y + halfR) < moatR * 1.08) continue;

    // Keep seam clean enough for clear Yin-Yang read while gently overlapping at the edges
    const seamDist = distanceToYinYangSeam(x, y, R);
    if (seamDist < R * 0.055 && rand() < 0.72) continue;

    const isYang = reg === 'yang';
    const halfSign = isYang ? 1 : -1;
    const tz = gaussian(rand) * 0.65 - 0.15;

    let col: [number, number, number];
    if (isYang) {
      // Yang nebulae: luminous blue nebulae interwoven with radiant warm golden stardust clouds
      col =
        rand() < 0.46
          ? mix3(YANG_NEBULA_BLUE, YANG_STAR_BLUE, rand() * 0.5)
          : mix3(YANG_NEBULA_GOLD, YANG_STAR_GOLD, rand() * 0.55);
    } else {
      // Yin nebulae: deep violet, rich crimson, and electric-blue cosmic clouds
      const roll = rand();
      if (roll < 0.44) {
        col = mix3(YIN_NEBULA_VIOLET, YIN_STAR_VIOLET, rand() * 0.45);
      } else if (roll < 0.76) {
        col = mix3(YIN_NEBULA_CRIMSON, YIN_STAR_CRIMSON, rand() * 0.4);
      } else {
        col = mix3(YIN_NEBULA_ELECTRIC, YIN_STAR_ELECTRIC, rand() * 0.42);
      }
    }

    const scale = (isYang ? 3.2 : 3.45) + rand() * 3.4;
    const opacity = isYang ? 0.22 + rand() * 0.14 : 0.24 + rand() * 0.15;
    writeNebula(x, y, tz, col, scale, opacity, halfSign, 0.15 + rand() * 0.55);
    nebPlaced++;
  }

  // Volumetric nebular cores for the two seed miniature spiral galaxies
  for (let i = 0; i < cfg.seedGalaxyNebulae; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.pow(rand(), 1.35) * seedR * 0.85;
    // Golden-white + pale blue nebula inside Yang seed (at 0, -halfR)
    const yCol = mix3(YANG_STAR_GOLD, YANG_NEBULA_BLUE, rand() * 0.35);
    writeNebula(
      Math.cos(a) * r,
      -halfR + Math.sin(a) * r,
      0.35,
      yCol,
      1.85 + rand() * 1.35,
      0.3,
      1,
      0.25 + rand() * 0.35,
    );
    // Deep violet + crimson + electric-blue nebula inside Yin seed (at 0, +halfR)
    const dCol =
      rand() < 0.5
        ? mix3(YIN_NEBULA_VIOLET, YIN_STAR_CRIMSON, rand() * 0.58)
        : mix3(YIN_NEBULA_ELECTRIC, YIN_NEBULA_VIOLET, rand() * 0.5);
    writeNebula(
      Math.cos(a) * r,
      halfR + Math.sin(a) * r,
      0.35,
      dCol,
      1.85 + rand() * 1.35,
      0.32,
      -1,
      0.25 + rand() * 0.35,
    );
  }

  // Subtle nebular wisps on the 8 embedded miniature companion galaxies
  for (const spot of activeEmbedded) {
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * spot.r * 0.65;
      const col =
        spot.halfSign > 0
          ? mix3(YANG_NEBULA_GOLD, YANG_NEBULA_BLUE, rand() * 0.5)
          : mix3(YIN_NEBULA_VIOLET, YIN_NEBULA_CRIMSON, rand() * 0.5);
      writeNebula(
        spot.x + Math.cos(a) * r,
        spot.y + Math.sin(a) * r,
        0.1,
        col,
        1.1 + rand() * 0.9,
        0.16,
        spot.halfSign,
        0.28 + rand() * 0.35,
      );
    }
  }

  const yangMeanLum = yangStarCount > 0 ? yangLumSum / yangStarCount : 0;
  const yinMeanLum = yinStarCount > 0 ? yinLumSum / yinStarCount : 0;
  const symmetryBalanceRatio =
    Math.max(yangStarCount, yinStarCount) > 0
      ? Math.min(yangStarCount, yinStarCount) / Math.max(yangStarCount, yinStarCount)
      : 0;

  return {
    stars: {
      count: sIdx,
      startPositions: startPositions.subarray(0, sIdx * 3),
      targetPositions: targetPositions.subarray(0, sIdx * 3),
      flowTangents: flowTangents.subarray(0, sIdx * 3),
      colors: colors.subarray(0, sIdx * 3),
      scales: scales.subarray(0, sIdx),
      phases: phases.subarray(0, sIdx),
      ignitionTimes: ignitionTimes.subarray(0, sIdx),
      halfSigns: halfSigns.subarray(0, sIdx),
      seedFlags: seedFlags.subarray(0, sIdx),
    },
    nebulae: {
      count: nIdx,
      startPositions: nStart.subarray(0, nIdx * 3),
      targetPositions: nTarget.subarray(0, nIdx * 3),
      flowTangents: nTangents.subarray(0, nIdx * 3),
      colors: nColors.subarray(0, nIdx * 3),
      scales: nScales.subarray(0, nIdx),
      phases: nPhases.subarray(0, nIdx),
      opacities: nOpacities.subarray(0, nIdx),
      ignitionTimes: nIgnition.subarray(0, nIdx),
      halfSigns: nHalfSigns.subarray(0, nIdx),
    },
    stats: {
      totalStars: sIdx,
      totalNebulae: nIdx,
      yangStarCount,
      yinStarCount,
      yangSeedStarCount,
      yinSeedStarCount,
      boundaryStarCount,
      yangMeanLuminance: yangMeanLum,
      yinMeanLuminance: yinMeanLum,
      symmetryBalanceRatio,
    },
  };
}
