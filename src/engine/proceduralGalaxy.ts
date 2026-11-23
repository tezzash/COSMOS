export type GalaxyType = 'spiral' | 'barred-spiral' | 'elliptical';

export type GalaxyColorPreset =
  | 'champagne-sapphire'
  | 'amethyst-ember'
  | 'celestial-azure'
  | 'ancient-gold';

export interface GalaxyColorPalette {
  id: GalaxyColorPreset;
  label: string;
  coreColor: string;
  armColor: string;
  outerColor: string;
  nebulaColor: string;
  h2KnotColor: string;
}

export const GALAXY_COLOR_PALETTES: Record<GalaxyColorPreset, GalaxyColorPalette> = {
  'champagne-sapphire': {
    id: 'champagne-sapphire',
    label: 'Champagne & Sapphire',
    coreColor: '#fff3d8',
    armColor: '#e6be78',
    outerColor: '#5b86e5',
    nebulaColor: '#2d357c',
    h2KnotColor: '#f5b884',
  },
  'amethyst-ember': {
    id: 'amethyst-ember',
    label: 'Amethyst & Ember',
    coreColor: '#fff1df',
    armColor: '#dc9468',
    outerColor: '#7b5cd6',
    nebulaColor: '#3f2370',
    h2KnotColor: '#f29cb4',
  },
  'celestial-azure': {
    id: 'celestial-azure',
    label: 'Celestial Azure',
    coreColor: '#f2f7ff',
    armColor: '#84b8ff',
    outerColor: '#3b58b8',
    nebulaColor: '#1b387a',
    h2KnotColor: '#a6dcff',
  },
  'ancient-gold': {
    id: 'ancient-gold',
    label: 'Ancient Gold',
    coreColor: '#fff6e0',
    armColor: '#e0b366',
    outerColor: '#8d6538',
    nebulaColor: '#4e351a',
    h2KnotColor: '#ffd394',
  },
};

export interface GalaxyParams {
  type: GalaxyType;
  size: number;
  arms: number;
  armTightness: number;
  armSpread: number;
  starDensity: number;
  starDistribution: number;
  nebulaIntensity: number;
  coreSize: number;
  ellipticity: number;
  colorPreset: GalaxyColorPreset;
  coreColor: string;
  armColor: string;
  outerColor: string;
  nebulaColor: string;
  seed: number;
}

export const DEFAULT_HERO_GALAXY_PARAMS: GalaxyParams = {
  type: 'spiral',
  size: 28,
  arms: 4,
  armTightness: 0.72,
  armSpread: 0.24,
  starDensity: 1.0,
  starDistribution: 1.45,
  nebulaIntensity: 0.92,
  coreSize: 0.22,
  ellipticity: 0.42,
  colorPreset: 'champagne-sapphire',
  coreColor: GALAXY_COLOR_PALETTES['champagne-sapphire'].coreColor,
  armColor: GALAXY_COLOR_PALETTES['champagne-sapphire'].armColor,
  outerColor: GALAXY_COLOR_PALETTES['champagne-sapphire'].outerColor,
  nebulaColor: GALAXY_COLOR_PALETTES['champagne-sapphire'].nebulaColor,
  seed: 20021125,
};

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface GeneratedGalaxyBuffers {
  starCount: number;
  starPositions: Float32Array;
  starScales: Float32Array;
  starPhases: Float32Array;
  starColors: Float32Array;
  starRadii: Float32Array;
  nebulaCount: number;
  nebulaPositions: Float32Array;
  nebulaScales: Float32Array;
  nebulaPhases: Float32Array;
  nebulaColors: Float32Array;
  nebulaOpacities: Float32Array;
  nebulaRadii: Float32Array;
}

export interface GalaxyStats {
  starCount: number;
  nebulaCount: number;
  meanRadius: number;
  maxRadius: number;
  coreFraction: number;
  verticalThicknessRatio: number;
  innerBarAspectRatio: number;
  armHarmonicStrength: number;
}

export function clampNumber(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function sanitizeGalaxyParams(input: Partial<GalaxyParams>): GalaxyParams {
  const presetKey: GalaxyColorPreset =
    input.colorPreset && input.colorPreset in GALAXY_COLOR_PALETTES
      ? input.colorPreset
      : DEFAULT_HERO_GALAXY_PARAMS.colorPreset;
  const palette = GALAXY_COLOR_PALETTES[presetKey];

  const type: GalaxyType =
    input.type === 'spiral' || input.type === 'barred-spiral' || input.type === 'elliptical'
      ? input.type
      : DEFAULT_HERO_GALAXY_PARAMS.type;

  return {
    type,
    size: clampNumber(input.size ?? DEFAULT_HERO_GALAXY_PARAMS.size, 12, 60),
    arms: Math.round(clampNumber(input.arms ?? DEFAULT_HERO_GALAXY_PARAMS.arms, 2, 6)),
    armTightness: clampNumber(input.armTightness ?? DEFAULT_HERO_GALAXY_PARAMS.armTightness, 0.15, 1.4),
    armSpread: clampNumber(input.armSpread ?? DEFAULT_HERO_GALAXY_PARAMS.armSpread, 0.08, 0.65),
    starDensity: clampNumber(input.starDensity ?? DEFAULT_HERO_GALAXY_PARAMS.starDensity, 0.3, 1.6),
    starDistribution: clampNumber(
      input.starDistribution ?? DEFAULT_HERO_GALAXY_PARAMS.starDistribution,
      0.6,
      2.8,
    ),
    nebulaIntensity: clampNumber(
      input.nebulaIntensity ?? DEFAULT_HERO_GALAXY_PARAMS.nebulaIntensity,
      0,
      1.4,
    ),
    coreSize: clampNumber(input.coreSize ?? DEFAULT_HERO_GALAXY_PARAMS.coreSize, 0.12, 0.45),
    ellipticity: clampNumber(input.ellipticity ?? DEFAULT_HERO_GALAXY_PARAMS.ellipticity, 0.18, 0.85),
    colorPreset: presetKey,
    coreColor: isValidHexColor(input.coreColor) ? input.coreColor : palette.coreColor,
    armColor: isValidHexColor(input.armColor) ? input.armColor : palette.armColor,
    outerColor: isValidHexColor(input.outerColor) ? input.outerColor : palette.outerColor,
    nebulaColor: isValidHexColor(input.nebulaColor) ? input.nebulaColor : palette.nebulaColor,
    seed: Math.floor(Math.abs(input.seed ?? DEFAULT_HERO_GALAXY_PARAMS.seed)) || 1,
  };
}

export function applyColorPreset(params: GalaxyParams, preset: GalaxyColorPreset): GalaxyParams {
  const pal = GALAXY_COLOR_PALETTES[preset];
  return {
    ...params,
    colorPreset: preset,
    coreColor: pal.coreColor,
    armColor: pal.armColor,
    outerColor: pal.outerColor,
    nebulaColor: pal.nebulaColor,
  };
}

function isValidHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexToRgb(hex: string): RgbTuple {
  const clean = hex.replace('#', '');
  const n = Number.parseInt(clean, 16);
  if (!Number.isFinite(n)) {
    return { r: 1, g: 0.94, b: 0.84 };
  }
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function lerpRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  const k = clampNumber(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianRandom(rand: () => number): number {
  const u1 = Math.max(1e-6, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Generates deterministic 3D starfield & volumetric nebula puff buffers
 * for spiral, barred-spiral, and elliptical galaxies with physically inspired
 * radial density profiles, spiral arm phase locking, H-II star-forming knots,
 * and dark-cinema cohesive spectral palettes.
 */
export function generateGalaxyBuffers(
  rawParams: Partial<GalaxyParams>,
  baseStarCount: number,
  baseNebulaCount: number,
): GeneratedGalaxyBuffers {
  const params = sanitizeGalaxyParams(rawParams);
  const rand = createSeededRandom(params.seed);

  const starCount = Math.max(240, Math.round(baseStarCount * params.starDensity));
  const nebulaCount =
    params.nebulaIntensity <= 0.01
      ? 0
      : Math.max(24, Math.round(baseNebulaCount * (0.55 + params.nebulaIntensity * 0.55)));

  const starPositions = new Float32Array(starCount * 3);
  const starScales = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);
  const starColors = new Float32Array(starCount * 3);
  const starRadii = new Float32Array(starCount);

  const coreRgb = hexToRgb(params.coreColor);
  const armRgb = hexToRgb(params.armColor);
  const outerRgb = hexToRgb(params.outerColor);
  const nebulaRgb = hexToRgb(params.nebulaColor);
  const h2Rgb = hexToRgb(GALAXY_COLOR_PALETTES[params.colorPreset].h2KnotColor);

  const R = params.size;
  const bulgeFrac = params.coreSize;
  const barHalfLen = R * clampNumber(bulgeFrac * 1.45, 0.24, 0.42);
  const windingScale = 2.6 + params.armTightness * 4.4;

  for (let i = 0; i < starCount; i++) {
    let x: number;
    let y: number;
    let z: number;
    let radialRatio: number;
    let isBulgeOrBar = false;
    let isH2Knot = false;

    if (params.type === 'elliptical') {
      // Triaxial de Vaucouleurs / Hernquist-inspired elliptical galaxy
      const u = rand();
      // Higher starDistribution -> stronger core concentration
      radialRatio = Math.pow(u, params.starDistribution * 1.08);
      const r = radialRatio * R;

      // Uniform direction on unit sphere
      const cosTheta = rand() * 2 - 1;
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = rand() * Math.PI * 2;

      // Triaxial semi-axes governed by ellipticity (E0..E7 range)
      const axisA = 1.0 + params.ellipticity * 0.24;
      const axisB = 1.0 - params.ellipticity * 0.48;
      const axisC = 1.0 - params.ellipticity * 0.22;

      x = r * sinTheta * Math.cos(phi) * axisA;
      y = r * cosTheta * axisB;
      z = r * sinTheta * Math.sin(phi) * axisC;
      isBulgeOrBar = radialRatio < bulgeFrac * 1.45;
    } else if (params.type === 'barred-spiral') {
      const roll = rand();
      const barRatio = 0.26 + bulgeFrac * 0.35;
      const haloRatio = 0.1;

      if (roll < barRatio) {
        // Luminous elongated central stellar bar + warm core bulge
        const along = (rand() * 2 - 1) * barHalfLen * Math.pow(rand(), 0.48);
        const across = gaussianRandom(rand) * barHalfLen * (0.14 + 0.12 * (1 - Math.abs(along) / barHalfLen));
        const vert = gaussianRandom(rand) * R * 0.042 * (1 - 0.45 * (Math.abs(along) / barHalfLen));
        x = along;
        y = vert;
        z = across;
        radialRatio = clampNumber(Math.hypot(x, z) / R, 0, 1);
        isBulgeOrBar = true;
      } else if (roll < barRatio + haloRatio) {
        // Outer spheroidal Population II halo stars
        radialRatio = Math.pow(rand(), params.starDistribution);
        const r = radialRatio * R * 1.05;
        const theta = rand() * Math.PI * 2;
        x = Math.cos(theta) * r;
        z = Math.sin(theta) * r;
        y = gaussianRandom(rand) * R * (0.09 + 0.06 * (1 - radialRatio));
      } else {
        // Grand-design spiral arms anchored cleanly to the two bar ends
        const armIndex = i % params.arms;
        const endSign = armIndex % 2 === 0 ? 1 : -1;
        const baseBarAngle = endSign > 0 ? 0 : Math.PI;
        const secondaryOffset =
          params.arms > 2 ? (Math.floor(armIndex / 2) / Math.ceil(params.arms / 2)) * Math.PI : 0;

        const armProgress = Math.pow(rand(), params.starDistribution * 0.85);
        const startR = barHalfLen * 0.86;
        const r = startR + armProgress * (R - startR);
        radialRatio = clampNumber(r / R, 0, 1);

        const spin = Math.pow(armProgress, 0.88) * windingScale * 0.85;
        const angularScatter = gaussianRandom(rand) * params.armSpread * (0.28 + armProgress * 0.92);
        const radialJitter = gaussianRandom(rand) * R * 0.032 * (0.4 + armProgress);

        const angle = baseBarAngle + secondaryOffset + spin + angularScatter;
        const finalR = Math.max(startR * 0.65, r + radialJitter);
        x = Math.cos(angle) * finalR;
        z = Math.sin(angle) * finalR;

        const diskHeight = R * (0.018 + 0.042 * Math.exp(-radialRatio * 3.2)) * (0.7 + params.ellipticity * 0.45);
        y = gaussianRandom(rand) * diskHeight;

        isH2Knot = Math.abs(angularScatter) < params.armSpread * 0.25 && rand() < 0.085 * params.nebulaIntensity;
      }
    } else {
      // Grand-design logarithmic spiral galaxy
      const roll = rand();
      const bulgeProb = clampNumber(bulgeFrac * 0.95, 0.14, 0.38);
      const haloProb = 0.09;

      if (roll < bulgeProb) {
        // Warm central galactic bulge
        const br = Math.pow(rand(), params.starDistribution * 1.25) * R * bulgeFrac * 1.45;
        const cosT = rand() * 2 - 1;
        const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
        const phi = rand() * Math.PI * 2;
        x = br * sinT * Math.cos(phi);
        y = br * cosT * 0.52;
        z = br * sinT * Math.sin(phi);
        radialRatio = clampNumber(Math.hypot(x, z) / R, 0, 1);
        isBulgeOrBar = true;
      } else if (roll < bulgeProb + haloProb) {
        // Inter-arm disk & faint halo field stars
        radialRatio = Math.pow(rand(), params.starDistribution * 0.95);
        const r = radialRatio * R * 1.06;
        const theta = rand() * Math.PI * 2;
        x = Math.cos(theta) * r;
        z = Math.sin(theta) * r;
        y = gaussianRandom(rand) * R * (0.045 + 0.055 * (1 - radialRatio));
      } else {
        // Distinct logarithmic spiral arm stars
        const armIndex = i % params.arms;
        const armBaseAngle = (armIndex / params.arms) * Math.PI * 2;

        radialRatio = clampNumber(0.06 + Math.pow(rand(), params.starDistribution * 0.9) * 0.94, 0, 1);
        const r = radialRatio * R;

        const spinAngle = Math.pow(radialRatio, 0.82) * windingScale;
        const angularScatter = gaussianRandom(rand) * params.armSpread * (0.24 + radialRatio * 0.88);
        const radialJitter = gaussianRandom(rand) * R * 0.028 * (0.35 + radialRatio);

        const angle = armBaseAngle + spinAngle + angularScatter;
        const finalR = Math.max(0.25, r + radialJitter);
        x = Math.cos(angle) * finalR;
        z = Math.sin(angle) * finalR;

        const diskThickness =
          R * (0.015 + 0.045 * Math.exp(-radialRatio * 3.4)) * (0.65 + params.ellipticity * 0.45);
        y = gaussianRandom(rand) * diskThickness;

        isH2Knot = Math.abs(angularScatter) < params.armSpread * 0.22 && rand() < 0.095 * params.nebulaIntensity;
      }
    }

    starPositions[i * 3] = x;
    starPositions[i * 3 + 1] = y;
    starPositions[i * 3 + 2] = z;
    starRadii[i] = radialRatio;

    // Power-law stellar magnitude distribution: crisp pinpoint stars + rare luminous supergiants
    const magPower = Math.pow(rand(), 2.8);
    const baseScale = isH2Knot
      ? 2.6 + magPower * 3.2
      : isBulgeOrBar
        ? 1.45 + magPower * 2.8
        : 1.05 + (1 - radialRatio * 0.45) * 1.25 + magPower * 3.6;
    starScales[i] = baseScale;
    starPhases[i] = rand();

    // Spectral color gradient: incandescent core -> arm tint -> cool outer halo + H-II emission knots
    let rgb: RgbTuple;
    if (isH2Knot) {
      rgb = lerpRgb(h2Rgb, coreRgb, rand() * 0.35);
    } else if (radialRatio < bulgeFrac * 1.15) {
      rgb = lerpRgb(coreRgb, armRgb, radialRatio / Math.max(0.05, bulgeFrac * 1.15));
    } else {
      const outerT = (radialRatio - bulgeFrac * 1.15) / Math.max(0.05, 1 - bulgeFrac * 1.15);
      rgb = lerpRgb(armRgb, outerRgb, Math.pow(clampNumber(outerT, 0, 1), 0.9));
    }

    // Subtle per-star blackbody jitter so star populations look organic rather than flat
    const tintShift = (rand() - 0.5) * 0.14;
    starColors[i * 3] = clampNumber(rgb.r + tintShift, 0.08, 1);
    starColors[i * 3 + 1] = clampNumber(rgb.g + tintShift * 0.65, 0.08, 1);
    starColors[i * 3 + 2] = clampNumber(rgb.b - tintShift * 0.85, 0.1, 1);
  }

  // Generate volumetric nebula gas & star-forming clouds locked to the galaxy morphology
  const nebulaPositions = new Float32Array(nebulaCount * 3);
  const nebulaScales = new Float32Array(nebulaCount);
  const nebulaPhases = new Float32Array(nebulaCount);
  const nebulaColors = new Float32Array(nebulaCount * 3);
  const nebulaOpacities = new Float32Array(nebulaCount);
  const nebulaRadii = new Float32Array(nebulaCount);

  for (let i = 0; i < nebulaCount; i++) {
    let x: number;
    let y: number;
    let z: number;
    let radialRatio: number;

    if (params.type === 'elliptical') {
      // Smooth diffuse golden-violet ionized halo envelope
      radialRatio = Math.pow(rand(), params.starDistribution * 0.95);
      const r = radialRatio * R * 0.88;
      const cosT = rand() * 2 - 1;
      const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
      const phi = rand() * Math.PI * 2;

      const axisA = 1.0 + params.ellipticity * 0.22;
      const axisB = 1.0 - params.ellipticity * 0.45;
      const axisC = 1.0 - params.ellipticity * 0.2;

      x = r * sinT * Math.cos(phi) * axisA;
      y = r * cosT * axisB;
      z = r * sinT * Math.sin(phi) * axisC;
    } else if (params.type === 'barred-spiral') {
      if (i < nebulaCount * 0.24) {
        const along = (rand() * 2 - 1) * barHalfLen * 0.92;
        const across = gaussianRandom(rand) * barHalfLen * 0.18;
        x = along;
        z = across;
        y = gaussianRandom(rand) * R * 0.025;
        radialRatio = clampNumber(Math.hypot(x, z) / R, 0, 1);
      } else {
        const armIndex = i % params.arms;
        const endSign = armIndex % 2 === 0 ? 1 : -1;
        const baseBarAngle = endSign > 0 ? 0 : Math.PI;
        const secondaryOffset =
          params.arms > 2 ? (Math.floor(armIndex / 2) / Math.ceil(params.arms / 2)) * Math.PI : 0;

        const armProgress = Math.pow(rand(), 0.92);
        const startR = barHalfLen * 0.84;
        const r = startR + armProgress * (R * 0.95 - startR);
        radialRatio = clampNumber(r / R, 0, 1);

        const spin = Math.pow(armProgress, 0.88) * windingScale * 0.85;
        const scatter = gaussianRandom(rand) * params.armSpread * 0.55;
        const angle = baseBarAngle + secondaryOffset + spin + scatter;

        x = Math.cos(angle) * r;
        z = Math.sin(angle) * r;
        y = gaussianRandom(rand) * R * 0.026;
      }
    } else {
      // Spiral nebulae & H-II clouds nested directly along the spiral arms
      const armIndex = i % params.arms;
      const armBaseAngle = (armIndex / params.arms) * Math.PI * 2;
      radialRatio = clampNumber(0.08 + Math.pow(rand(), 0.95) * 0.88, 0, 1);
      const r = radialRatio * R;
      const spinAngle = Math.pow(radialRatio, 0.82) * windingScale;
      const scatter = gaussianRandom(rand) * params.armSpread * 0.52;
      const angle = armBaseAngle + spinAngle + scatter;

      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
      y = gaussianRandom(rand) * R * 0.022;
    }

    nebulaPositions[i * 3] = x;
    nebulaPositions[i * 3 + 1] = y;
    nebulaPositions[i * 3 + 2] = z;
    nebulaRadii[i] = radialRatio;

    const isEmissionKnot = params.type !== 'elliptical' && rand() < 0.28;
    const baseCloudScale = R * (0.14 + rand() * 0.22) * (1.15 - radialRatio * 0.35);
    nebulaScales[i] = isEmissionKnot ? baseCloudScale * 0.58 : baseCloudScale;
    nebulaPhases[i] = rand();

    let nRgb: RgbTuple;
    if (isEmissionKnot) {
      nRgb = lerpRgb(h2Rgb, armRgb, 0.35);
    } else if (radialRatio < bulgeFrac * 1.25) {
      nRgb = lerpRgb(coreRgb, armRgb, 0.55);
    } else {
      nRgb = lerpRgb(nebulaRgb, outerRgb, 0.32 + radialRatio * 0.45);
    }
    nebulaColors[i * 3] = nRgb.r;
    nebulaColors[i * 3 + 1] = nRgb.g;
    nebulaColors[i * 3 + 2] = nRgb.b;

    const radialFade = 1 - radialRatio * 0.52;
    nebulaOpacities[i] = clampNumber(
      (isEmissionKnot ? 0.24 : 0.16) * radialFade * params.nebulaIntensity,
      0,
      0.42,
    );
  }

  return {
    starCount,
    starPositions,
    starScales,
    starPhases,
    starColors,
    starRadii,
    nebulaCount,
    nebulaPositions,
    nebulaScales,
    nebulaPhases,
    nebulaColors,
    nebulaOpacities,
    nebulaRadii,
  };
}

/**
 * Pure geometric analytics on generated galaxy buffers for deterministic validation
 * of morphology differences (spiral arm harmonic clustering, barred core aspect ratio,
 * elliptical 3D vertical thickness, radial concentration).
 */
export function computeGalaxyStats(
  buffers: GeneratedGalaxyBuffers,
  params: GalaxyParams,
): GalaxyStats {
  const n = buffers.starCount;
  if (n === 0) {
    return {
      starCount: 0,
      nebulaCount: buffers.nebulaCount,
      meanRadius: 0,
      maxRadius: 0,
      coreFraction: 0,
      verticalThicknessRatio: 0,
      innerBarAspectRatio: 1,
      armHarmonicStrength: 0,
    };
  }

  let radiusSum = 0;
  let maxRadius = 0;
  let coreCount = 0;
  let absYSum = 0;
  let innerAbsX = 0;
  let innerAbsZ = 0;
  let innerCount = 0;

  // Measure spiral arm phase coherence using de-wound azimuthal harmonic at k = arms
  const windingScale = 2.6 + params.armTightness * 4.4;
  let cosSum = 0;
  let sinSum = 0;
  let midDiskCount = 0;

  for (let i = 0; i < n; i++) {
    const x = buffers.starPositions[i * 3] ?? 0;
    const y = buffers.starPositions[i * 3 + 1] ?? 0;
    const z = buffers.starPositions[i * 3 + 2] ?? 0;
    const r = Math.hypot(x, y, z);
    const rXZ = Math.hypot(x, z);
    radiusSum += r;
    if (r > maxRadius) maxRadius = r;
    absYSum += Math.abs(y);

    const frac = r / Math.max(1e-4, params.size);
    if (frac < 0.3) coreCount++;

    if (frac > 0.06 && frac < 0.38) {
      innerAbsX += Math.abs(x);
      innerAbsZ += Math.abs(z);
      innerCount++;
    }

    if (frac > 0.32 && frac < 0.88 && rXZ > 0.1) {
      const theta = Math.atan2(z, x);
      const dewound = theta - Math.pow(clampNumber(rXZ / params.size, 0, 1), 0.82) * windingScale;
      cosSum += Math.cos(params.arms * dewound);
      sinSum += Math.sin(params.arms * dewound);
      midDiskCount++;
    }
  }

  const meanRadius = radiusSum / n;
  const verticalThicknessRatio = absYSum / Math.max(1e-4, radiusSum);
  const innerBarAspectRatio =
    innerCount > 10 && innerAbsZ > 1e-4 ? innerAbsX / innerAbsZ : 1;
  const armHarmonicStrength =
    midDiskCount > 10 ? Math.hypot(cosSum, sinSum) / midDiskCount : 0;

  return {
    starCount: n,
    nebulaCount: buffers.nebulaCount,
    meanRadius,
    maxRadius,
    coreFraction: coreCount / n,
    verticalThicknessRatio,
    innerBarAspectRatio,
    armHarmonicStrength,
  };
}
