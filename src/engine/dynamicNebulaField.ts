import {
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  clamp,
  getChapterAtTime,
  smoothstep,
} from '../data/chapters';
import type { NarrationLine } from '../data/screenplay';

export type CosmicReactivityMode =
  | 'creation'
  | 'expansion'
  | 'warmth'
  | 'playful'
  | 'rest'
  | 'silence'
  | 'revelation';

export interface RgbTuple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface NarrationCosmicReactivity {
  readonly mode: CosmicReactivityMode;
  /** Overall brightness & volumetric presence multiplier [0.02..1.35] */
  readonly intensity: number;
  /** Curl-noise turbulence / filament agitation [0.08..1.45] */
  readonly turbulence: number;
  /** Volumetric nebula gas density multiplier [0.12..1.30] */
  readonly nebulaDensity: number;
  /** Particle advection velocity scale [0.15..1.35] */
  readonly flowSpeed: number;
  /** Subtle radial expansion surge during creation & reveal bursts [0..1] */
  readonly creationPulse: number;
  readonly primary: RgbTuple;
  readonly secondary: RgbTuple;
  readonly accent: RgbTuple;
}

export interface InteractiveFieldInfluence {
  /** Normalized cursor NDC [-1..1] */
  readonly pointerX: number;
  readonly pointerY: number;
  /** Restrained tangential swirl/flow velocity bias [-0.45..0.45] */
  readonly flowX: number;
  readonly flowY: number;
  /** Overall flow displacement magnitude [0..0.65] (attenuated under reducedMotion) */
  readonly swirlStrength: number;
  /** Subtle spectral hue shift [-1 (cool sapphire/violet) .. +1 (warm starlight gold)] */
  readonly colorShift: number;
  /** Gentle luminous bloom/warmth boost from pointer glide or tap [0..0.38] */
  readonly luminanceBoost: number;
  /** Decaying radial ripple energy from click/tap [0..1] */
  readonly pulseEnergy: number;
}

export interface ProceduralNebulaLayerSpec {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationZ: number;
  readonly seed: number;
  readonly fbmScale: number;
  readonly ridgeWeight: number;
  readonly baseOpacity: number;
  readonly depthFactor: number;
  readonly hueBias: number;
}

export interface ProceduralParticleFieldData {
  readonly count: number;
  readonly positions: Float32Array;
  readonly scales: Float32Array;
  readonly phases: Float32Array;
  readonly bands: Float32Array;
  readonly temperatures: Float32Array;
}

const PALETTES: Record<
  CosmicReactivityMode,
  { primary: RgbTuple; secondary: RgbTuple; accent: RgbTuple }
> = {
  creation: {
    primary: { r: 0.14, g: 0.30, b: 0.68 }, // Deep ionized cobalt
    secondary: { r: 0.44, g: 0.24, b: 0.72 }, // Primordial violet plasma
    accent: { r: 0.96, g: 0.74, b: 0.38 }, // Molten stellar birth gold
  },
  expansion: {
    primary: { r: 0.10, g: 0.24, b: 0.56 }, // Deep cosmic midnight blue
    secondary: { r: 0.34, g: 0.21, b: 0.62 }, // Astral violet
    accent: { r: 0.85, g: 0.66, b: 0.36 }, // Ancient amber starlight
  },
  warmth: {
    primary: { r: 0.14, g: 0.25, b: 0.52 }, // Twilight cerulean
    secondary: { r: 0.42, g: 0.26, b: 0.58 }, // Warm amethyst dusk
    accent: { r: 0.95, g: 0.77, b: 0.46 }, // Golden ember warmth
  },
  playful: {
    primary: { r: 0.15, g: 0.34, b: 0.66 }, // Luminous sapphire
    secondary: { r: 0.46, g: 0.30, b: 0.74 }, // Electric iris violet
    accent: { r: 0.98, g: 0.84, b: 0.54 }, // Champagne starlight
  },
  rest: {
    primary: { r: 0.08, g: 0.16, b: 0.36 }, // Hushed midnight indigo
    secondary: { r: 0.20, g: 0.16, b: 0.40 }, // Quiet twilight plum
    accent: { r: 0.72, g: 0.62, b: 0.46 }, // Soft hearth candle-gold
  },
  silence: {
    primary: { r: 0.04, g: 0.07, b: 0.16 }, // Near-obsidian void
    secondary: { r: 0.09, g: 0.07, b: 0.18 }, // Deep stillness
    accent: { r: 0.42, g: 0.36, b: 0.28 }, // Single distant ember
  },
  revelation: {
    primary: { r: 0.16, g: 0.29, b: 0.62 }, // Radiant royal night
    secondary: { r: 0.48, g: 0.28, b: 0.68 }, // Celebratory cosmic violet
    accent: { r: 1.0, g: 0.84, b: 0.50 }, // Golden supernova crown
  },
};

const CREATION_KEYWORDS =
  /\b(beginning|matter|energy|gravity|light|ignited|stars|galaxies|supernovas|worlds formed|birth|arrived)\b/i;
const REST_KEYWORDS =
  /\b(pause|rest|quiet|still|nothing at all|gentleness|simply be|quietly|nothing exploded)\b/i;

function lerpRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  const k = clamp(t, 0, 1);
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Computes continuous, narration-reactive target parameters for the procedural
 * nebulae and cosmic particle fields.
 *
 * - Intensifies organically during cosmic creation (Prologue Big Bang & star birth),
 *   narrative climaxes, and the Final Revelation.
 * - Quiets softly during Chapter V Quiet Hours, `quiet`-toned narration lines,
 *   breathing pauses between cues, and drops to near-stillness during Sacred Silence.
 */
export function computeNarrationCosmicReactivity(
  filmTime: number,
  activeLine: NarrationLine | null,
): NarrationCosmicReactivity {
  const chapter = getChapterAtTime(filmTime);

  // Sacred Silence (365.0s..370.5s): complete hushed stillness before ISHA
  const silenceWindow =
    smoothstep(SILENCE_START - 1.2, SILENCE_START + 0.35, filmTime) *
    (1 - smoothstep(SILENCE_END - 0.1, SILENCE_END + 1.4, filmTime));
  if (silenceWindow > 0.72) {
    const p = PALETTES.silence;
    return {
      mode: 'silence',
      intensity: 0.04,
      turbulence: 0.1,
      nebulaDensity: 0.14,
      flowSpeed: 0.16,
      creationPulse: 0,
      primary: p.primary,
      secondary: p.secondary,
      accent: p.accent,
    };
  }

  // Smooth fade-in / fade-out envelope inside an active narration line so visuals
  // swell naturally with each spoken phrase rather than stepping abruptly.
  let lineEnvelope = 0;
  if (activeLine) {
    const lineDur = Math.max(0.5, activeLine.end - activeLine.start);
    const edge = Math.min(1.1, lineDur * 0.25);
    lineEnvelope =
      smoothstep(activeLine.start - 0.15, activeLine.start + edge, filmTime) *
      (1 - smoothstep(activeLine.end - edge, activeLine.end + 0.15, filmTime));
  }

  // Determine narrative mode from timeline + active narration semantics
  const isPrologueCreation = filmTime >= 3.0 && filmTime <= 38.5;
  const isFinalRevelation = filmTime >= TITLE_REVEAL_TIME - 0.5;
  const isQuietChapter = chapter.id === 'chapter-5';
  const hasCreationLexicon = Boolean(activeLine && CREATION_KEYWORDS.test(activeLine.text));
  const hasRestLexicon = Boolean(activeLine && REST_KEYWORDS.test(activeLine.text));

  let mode: CosmicReactivityMode = 'expansion';
  if (isFinalRevelation) {
    mode = 'revelation';
  } else if (isQuietChapter || activeLine?.tone === 'quiet' || hasRestLexicon) {
    mode = 'rest';
  } else if (
    isPrologueCreation ||
    activeLine?.tone === 'climax' ||
    (activeLine?.tone === 'monumental' && hasCreationLexicon)
  ) {
    mode = 'creation';
  } else if (activeLine?.tone === 'playful') {
    mode = 'playful';
  } else if (activeLine?.tone === 'warm' || chapter.id === 'chapter-1' || chapter.id === 'chapter-3') {
    mode = 'warmth';
  }

  // Base chapter energy before active-line modulation
  let intensity: number;
  let turbulence: number;
  let nebulaDensity: number;
  let flowSpeed: number;
  let creationPulse: number;

  switch (mode) {
    case 'creation': {
      // Peaks during Big Bang expansion & primordial star ignition
      const bangCrest =
        smoothstep(5.0, 15.0, filmTime) * (1 - smoothstep(28.0, 42.0, filmTime));
      const climaxBoost = activeLine?.tone === 'climax' ? 0.18 : 0;
      intensity = 1.04 + bangCrest * 0.22 + lineEnvelope * 0.12 + climaxBoost;
      turbulence = 1.02 + bangCrest * 0.28 + lineEnvelope * 0.14;
      nebulaDensity = 1.02 + bangCrest * 0.18 + lineEnvelope * 0.08;
      flowSpeed = 0.98 + bangCrest * 0.26 + lineEnvelope * 0.1;
      creationPulse = clamp(bangCrest * 0.85 + lineEnvelope * 0.35 + climaxBoost, 0, 1);
      break;
    }
    case 'revelation': {
      const revealBloom = smoothstep(TITLE_REVEAL_TIME - 0.5, TITLE_REVEAL_TIME + 4.0, filmTime);
      const lateCalm = smoothstep(392.0, 405.0, filmTime);
      intensity = 1.08 + revealBloom * 0.2 - lateCalm * 0.22 + lineEnvelope * 0.08;
      turbulence = 0.86 + revealBloom * 0.18 - lateCalm * 0.26;
      nebulaDensity = 0.98 + revealBloom * 0.16 - lateCalm * 0.14;
      flowSpeed = 0.88 + revealBloom * 0.16 - lateCalm * 0.24;
      creationPulse = clamp(revealBloom * (1 - lateCalm * 0.65), 0, 1);
      break;
    }
    case 'playful': {
      intensity = 0.86 + lineEnvelope * 0.14;
      turbulence = 0.78 + lineEnvelope * 0.14;
      nebulaDensity = 0.8 + lineEnvelope * 0.08;
      flowSpeed = 0.84 + lineEnvelope * 0.12;
      creationPulse = lineEnvelope * 0.25;
      break;
    }
    case 'warmth': {
      intensity = 0.78 + lineEnvelope * 0.14;
      turbulence = 0.56 + lineEnvelope * 0.1;
      nebulaDensity = 0.78 + lineEnvelope * 0.1;
      flowSpeed = 0.62 + lineEnvelope * 0.08;
      creationPulse = lineEnvelope * 0.18;
      break;
    }
    case 'rest': {
      // Deliberately serene, hushed, low-turbulence breathing stillness
      intensity = 0.36 + lineEnvelope * 0.06;
      turbulence = 0.24 + lineEnvelope * 0.05;
      nebulaDensity = 0.42 + lineEnvelope * 0.06;
      flowSpeed = 0.28 + lineEnvelope * 0.04;
      creationPulse = 0;
      break;
    }
    case 'expansion':
    default: {
      intensity = 0.74 + lineEnvelope * 0.14;
      turbulence = 0.64 + lineEnvelope * 0.12;
      nebulaDensity = 0.74 + lineEnvelope * 0.1;
      flowSpeed = 0.68 + lineEnvelope * 0.1;
      creationPulse = lineEnvelope * 0.2;
      break;
    }
  }

  // Subtle breathing drop during unspoken pauses between cues (keeps visuals alive yet poised)
  if (!activeLine && mode !== 'rest' && mode !== 'revelation') {
    intensity *= 0.88;
    turbulence *= 0.86;
    flowSpeed *= 0.88;
  }

  // Smoothly blend toward Sacred Silence as we approach 365s or emerge at 370.5s
  const basePalette = PALETTES[mode];
  const silencePalette = PALETTES.silence;
  const silKeep = 1 - silenceWindow;

  return {
    mode,
    intensity: clamp(intensity * silKeep + 0.04 * silenceWindow, 0.04, 1.35),
    turbulence: clamp(turbulence * silKeep + 0.1 * silenceWindow, 0.08, 1.45),
    nebulaDensity: clamp(nebulaDensity * silKeep + 0.14 * silenceWindow, 0.12, 1.3),
    flowSpeed: clamp(flowSpeed * silKeep + 0.16 * silenceWindow, 0.15, 1.35),
    creationPulse: clamp(creationPulse * silKeep, 0, 1),
    primary: lerpRgb(basePalette.primary, silencePalette.primary, silenceWindow),
    secondary: lerpRgb(basePalette.secondary, silencePalette.secondary, silenceWindow),
    accent: lerpRgb(basePalette.accent, silencePalette.accent, silenceWindow),
  };
}

/**
 * Computes restrained, cinema-safe user interaction influence from pointer position,
 * pointer glide velocity, and optional click/tap ripple energy.
 * Designed to make particles and nebulae feel softly responsive without ever
 * breaking the serene IMAX space feel.
 */
export function computeInteractiveFieldInfluence(
  pointerX: number,
  pointerY: number,
  pointerVelX: number,
  pointerVelY: number,
  pulseEnergy: number,
  reducedMotion: boolean,
): InteractiveFieldInfluence {
  const px = clamp(Number.isFinite(pointerX) ? pointerX : 0, -1, 1);
  const py = clamp(Number.isFinite(pointerY) ? pointerY : 0, -1, 1);
  const vx = clamp(Number.isFinite(pointerVelX) ? pointerVelX : 0, -3, 3);
  const vy = clamp(Number.isFinite(pointerVelY) ? pointerVelY : 0, -3, 3);
  const pulse = clamp(Number.isFinite(pulseEnergy) ? pulseEnergy : 0, 0, 1);

  const speed = Math.hypot(vx, vy);
  const radialOffset = Math.min(1, Math.hypot(px, py));
  const motionAtten = reducedMotion ? 0.25 : 1.0;

  // Tangential swirl + gentle glide drag, tightly capped so flow stays graceful
  const flowX = clamp((vx * 0.16 - py * 0.09) * motionAtten, -0.42, 0.42);
  const flowY = clamp((vy * 0.16 + px * 0.09) * motionAtten, -0.42, 0.42);
  const swirlStrength = clamp(
    (Math.min(1, speed * 0.42) * 0.36 + radialOffset * 0.12 + pulse * 0.28) * motionAtten,
    0,
    0.65,
  );

  // Subtle horizontal & diagonal spectral tint shift:
  // left -> cool sapphire/violet (-), right -> warm starlight gold (+)
  const colorShift = clamp(px * 0.72 + py * 0.22 + vx * 0.12, -1, 1);
  const luminanceBoost = clamp(
    radialOffset * 0.08 + Math.min(1, speed * 0.35) * 0.12 + pulse * 0.2,
    0,
    0.38,
  );

  return {
    pointerX: px,
    pointerY: py,
    flowX,
    flowY,
    swirlStrength,
    colorShift,
    luminanceBoost,
    pulseEnergy: pulse,
  };
}

/**
 * Deterministically generates procedural volumetric FBM nebula layer specs
 * distributed along the full 600-unit cosmic camera corridor.
 */
export function generateProceduralNebulaLayers(
  seed = 25112002,
  count = 8,
): ProceduralNebulaLayerSpec[] {
  const safeCount = clamp(Math.floor(count), 1, 16);
  const rand = seededRandom(seed);
  const specs: ProceduralNebulaLayerSpec[] = [];

  // Corridor spans from Prologue (z = -18) through Final Reveal (z = -575)
  const zStart = -18;
  const zEnd = -575;

  for (let i = 0; i < safeCount; i++) {
    const t = safeCount === 1 ? 0.5 : i / (safeCount - 1);
    const side = i % 2 === 0 ? -1 : 1;
    const z = zStart + (zEnd - zStart) * t + (rand() - 0.5) * 26;
    const x = side * (16 + rand() * 24) * (i === safeCount - 1 ? 0.25 : 1);
    const y = (rand() - 0.5) * 24;
    const baseScale = 88 + t * 56 + rand() * 24;

    specs.push({
      id: i,
      x,
      y,
      z,
      scaleX: baseScale,
      scaleY: baseScale * (0.64 + rand() * 0.22),
      rotationZ: (rand() - 0.5) * Math.PI * 0.9,
      seed: 1.5 + i * 3.17 + rand() * 2.0,
      fbmScale: 2.2 + rand() * 1.4,
      ridgeWeight: 0.35 + rand() * 0.35,
      baseOpacity: 0.2 + rand() * 0.14,
      depthFactor: 0.18 + rand() * 0.24,
      hueBias: (rand() - 0.5) * 0.5,
    });
  }

  return specs;
}

/**
 * Deterministically generates a procedural cosmic particle field composed of
 * swirling interstellar dust filaments, ionized nebula embers, and fine star-forming
 * knots distributed seamlessly along the cosmic corridor.
 */
export function generateProceduralParticleFieldData(
  seed = 20021125,
  count = 2200,
): ProceduralParticleFieldData {
  const safeCount = clamp(Math.floor(count), 64, 12000);
  const rand = seededRandom(seed);

  const positions = new Float32Array(safeCount * 3);
  const scales = new Float32Array(safeCount);
  const phases = new Float32Array(safeCount);
  const bands = new Float32Array(safeCount);
  const temperatures = new Float32Array(safeCount);

  const filamentCount = 5;

  for (let i = 0; i < safeCount; i++) {
    const t = rand();
    // Spread smoothly across z = +30 to -595 so particles frame every chapter
    const z = 30 - t * 625;

    // Organize ~70% of particles along twisting organic cosmic filaments, ~30% as diffuse halo dust
    const isFilament = rand() < 0.72;
    let x: number;
    let y: number;
    let band: number;

    if (isFilament) {
      const fIdx = i % filamentCount;
      const helixAngle = t * Math.PI * 6.5 + (fIdx * Math.PI * 2) / filamentCount;
      const ribbonRadius = 15 + Math.sin(t * Math.PI * 3.0 + fIdx) * 9 + rand() * 16;
      const spread = (rand() - 0.5) * 9.5;
      x = Math.cos(helixAngle) * ribbonRadius + spread;
      y = Math.sin(helixAngle) * ribbonRadius * 0.68 + (rand() - 0.5) * 7.5;
      band = rand() < 0.45 ? 0 : 1; // 0 = luminous core filament, 1 = ionized gas dust
    } else {
      const angle = rand() * Math.PI * 2;
      const r = 10 + Math.pow(rand(), 0.75) * 58;
      x = Math.cos(angle) * r;
      y = Math.sin(angle) * r * 0.72;
      band = 2; // 2 = diffuse outer stardust
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Power-law size distribution: mostly fine stardust with occasional glowing gas knots
    scales[i] =
      band === 1
        ? 2.2 + Math.pow(rand(), 1.9) * 4.4
        : 1.1 + Math.pow(rand(), 2.3) * 3.1;
    phases[i] = rand();
    bands[i] = band;
    temperatures[i] = rand();
  }

  return {
    count: safeCount,
    positions,
    scales,
    phases,
    bands,
    temperatures,
  };
}
