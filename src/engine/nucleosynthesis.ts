import { TITLE_REVEAL_TIME, clamp } from '../data/chapters';

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface ScheduledStarBirth {
  id: string;
  triggerTime: number;
  origin: readonly [number, number, number];
  intensity: number;
  radius: number;
  seed: number;
}

export interface BurstSlotState {
  active: boolean;
  age: number;
  duration: number;
  intensity: number;
  radius: number;
  originX: number;
  originY: number;
  originZ: number;
  seed: number;
}

/**
 * Scheduled astronomical star-birth moments synchronized to the continuous 7-chapter
 * 3D journey so Stellar Nucleosynthesis bursts illuminate every cosmic genesis point.
 */
export const SCHEDULED_STAR_BIRTHS: readonly ScheduledStarBirth[] = [
  {
    id: 'prologue-first-star',
    triggerTime: 12.2,
    origin: [0, 0.2, 0],
    intensity: 0.92,
    radius: 15.5,
    seed: 101,
  },
  {
    id: 'hyderabad-birth-star',
    triggerTime: 82.0,
    origin: [6.8, 4.2, -82.4],
    intensity: 0.72,
    radius: 6.4,
    seed: 202,
  },
  {
    id: 'sagittarius-ignition',
    triggerTime: 146.0,
    origin: [1.55, 4.75, -174.6],
    intensity: 0.85,
    radius: 14.0,
    seed: 303,
  },
  {
    id: 'network-genesis',
    triggerTime: 196.0,
    origin: [0, 0, -255],
    intensity: 0.88,
    radius: 16.0,
    seed: 404,
  },
  {
    id: 'binary-ignition',
    triggerTime: 248.5,
    origin: [0, 0, -340],
    intensity: 0.9,
    radius: 16.5,
    seed: 505,
  },
  {
    id: 'reveal-supernova-birth',
    triggerTime: TITLE_REVEAL_TIME - 0.6,
    origin: [0, 0, -515],
    intensity: 1.15,
    radius: 22.0,
    seed: 606,
  },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluates the physically inspired Stellar Nucleosynthesis spectral color shift
 * across normalized burst age [0..1] and per-particle fusion element band [0..1]:
 * - Core ignition (0.00–0.22): Hydrogen -> Helium blue-white incandescent flash
 * - Mid expansion (0.22–0.58): Carbon/Oxygen/Neon hot sapphire, violet & solar gold
 * - Heavy forging (0.58–1.00): Silicon/Gold/Iron-peak warm amber-gold -> twilight ember
 */
export function evaluateFusionColor(
  ageNorm: number,
  elementBand: number,
  out: RgbTuple = { r: 0, g: 0, b: 0 },
): RgbTuple {
  const t = clamp(ageNorm, 0, 1);
  const band = clamp(elementBand, 0, 1);

  // Stage 0: Incandescent Hydrogen-Helium ignition core
  const c0r = 1.0;
  const c0g = 0.97;
  const c0b = 0.92;

  // Stage 1: Blue-sapphire / plasma-cyan CNO fusion wave
  const c1r = lerp(0.48, 0.94, band);
  const c1g = lerp(0.76, 0.72, band);
  const c1b = lerp(1.0, 0.98, band);

  // Stage 2: Forged solar gold / copper heavy elements
  const c2r = lerp(0.98, 1.0, band);
  const c2g = lerp(0.76, 0.56, band);
  const c2b = lerp(0.32, 0.24, band);

  // Stage 3: Cooling violet-crimson nebular remnant
  const c3r = lerp(0.55, 0.78, band);
  const c3g = lerp(0.30, 0.34, band);
  const c3b = lerp(0.76, 0.44, band);

  if (t < 0.24) {
    const k = t / 0.24;
    out.r = lerp(c0r, c1r, k);
    out.g = lerp(c0g, c1g, k);
    out.b = lerp(c0b, c1b, k);
  } else if (t < 0.62) {
    const k = (t - 0.24) / 0.38;
    out.r = lerp(c1r, c2r, k);
    out.g = lerp(c1g, c2g, k);
    out.b = lerp(c1b, c2b, k);
  } else {
    const k = (t - 0.62) / 0.38;
    out.r = lerp(c2r, c3r, k);
    out.g = lerp(c2g, c3g, k);
    out.b = lerp(c2b, c3b, k);
  }

  return out;
}

/**
 * Computes the smooth radial expansion factor [0..1] and additive burst glow envelope [0..1]
 * for a stellar birth burst at normalized lifetime `ageNorm` in [0..1].
 */
export function evaluateBurstEnvelope(ageNorm: number): {
  expansion: number;
  flashAlpha: number;
  particleAlpha: number;
} {
  const t = clamp(ageNorm, 0, 1);
  // Rapid explosive initial expansion decelerating organically into nebular drift
  const expansion = 1 - Math.pow(1 - t, 2.8);
  // Crisp incandescent light burst flash peaking immediately (~t=0.08), decaying smoothly
  const flashRise = clamp(t / 0.07, 0, 1);
  const flashDecay = Math.pow(Math.max(0, 1 - t), 2.1);
  const flashAlpha = flashRise * flashDecay;
  // Color-shifting particles ignite swiftly and linger longer as glowing nucleosynthesis clouds
  const pRise = clamp(t / 0.05, 0, 1);
  const pFade = Math.pow(Math.max(0, 1 - t), 1.35);
  const particleAlpha = pRise * pFade;

  return { expansion, flashAlpha, particleAlpha };
}

/**
 * Finds any scheduled star-birth events whose triggerTime falls inside `(prevTime, currentTime]`
 * (or within a short lookback window right after a timeline seek so scrubbing directly onto a
 * star-birth moment immediately renders its active nucleosynthesis burst).
 */
export function findTriggeredStarBirths(
  prevFilmTime: number,
  currentFilmTime: number,
  seekLookbackSec = 2.8,
): Array<{ event: ScheduledStarBirth; initialAge: number }> {
  const results: Array<{ event: ScheduledStarBirth; initialAge: number }> = [];
  const isSeekJump =
    currentFilmTime < prevFilmTime - 0.05 || currentFilmTime - prevFilmTime > 3.5;

  for (const ev of SCHEDULED_STAR_BIRTHS) {
    if (isSeekJump) {
      const age = currentFilmTime - ev.triggerTime;
      if (age >= 0 && age <= seekLookbackSec) {
        results.push({ event: ev, initialAge: age });
      }
    } else if (ev.triggerTime > prevFilmTime && ev.triggerTime <= currentFilmTime) {
      results.push({ event: ev, initialAge: Math.max(0, currentFilmTime - ev.triggerTime) });
    }
  }
  return results;
}
