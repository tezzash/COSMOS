import {
  FILM_DURATION,
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  clamp,
  smoothstep,
} from '../data/chapters';

export interface AmbientAtmosphereState {
  /** Combined cinematic high-impact swell intensity [0..1] synchronized to filmTime */
  swellIntensity: number;
  /** Primary silky lowpass filter cutoff frequency in Hz (sweeps open during swells) */
  lowpassHz: number;
  /** Secondary ethereal bandpass air-resonance center frequency in Hz */
  bandpassHz: number;
  /** Bandpass resonance Q (gentle, warm, never whistling) */
  bandpassQ: number;
  /** Target output gain [0..0.075] — restrained cinematic breath beneath score & voice */
  gain: number;
  /** Name of the active cinematic swell beat (for diagnostics/testing) */
  activeMoment: string;
}

interface ImpactMoment {
  id: string;
  riseStart: number;
  peakStart: number;
  peakEnd: number;
  fallEnd: number;
  weight: number;
}

/**
 * Synchronized high-impact cinematic beats across the 06:45 (405s) film arc where
 * the Ambient Atmosphere air bed opens its frequency filters into a warm swell.
 */
const HIGH_IMPACT_MOMENTS: readonly ImpactMoment[] = [
  { id: 'big-bang-ignition', riseStart: 7.0, peakStart: 13.0, peakEnd: 20.0, fallEnd: 29.0, weight: 0.78 },
  { id: 'hyderabad-dawn', riseStart: 72.0, peakStart: 81.0, peakEnd: 89.0, fallEnd: 99.0, weight: 0.82 },
  { id: 'sagittarius-constellation', riseStart: 144.0, peakStart: 154.0, peakEnd: 162.0, fallEnd: 172.0, weight: 0.72 },
  { id: 'network-resonance', riseStart: 194.0, peakStart: 204.0, peakEnd: 212.0, fallEnd: 222.0, weight: 0.76 },
  { id: 'binary-equilibrium', riseStart: 246.0, peakStart: 256.0, peakEnd: 268.0, fallEnd: 279.0, weight: 0.84 },
  { id: 'final-convergence-swell', riseStart: 340.0, peakStart: 356.0, peakEnd: 363.2, fallEnd: SILENCE_START - 0.1, weight: 0.96 },
  { id: 'title-reveal-bloom', riseStart: TITLE_REVEAL_TIME - 0.4, peakStart: TITLE_REVEAL_TIME + 2.5, peakEnd: 386.0, fallEnd: 401.0, weight: 1.0 },
];

function evaluateMomentEnvelope(t: number, m: ImpactMoment): number {
  if (t <= m.riseStart || t >= m.fallEnd) return 0;
  const up = smoothstep(m.riseStart, m.peakStart, t);
  const down = 1 - smoothstep(m.peakEnd, m.fallEnd, t);
  return up * down * m.weight;
}

/**
 * Computes real-time frequency filtering and gain parameters for the 'Ambient Atmosphere'
 * Web Audio layer synchronized strictly to `filmTime`.
 *
 * - Keeps a subtle, ultra-clean warm air floor during calm chapters (low cutoff, low gain).
 * - Smoothly sweeps both lowpass and ethereal bandpass filters upward during high-impact
 *   cinematic moments for an organic film-score swell.
 * - Drops cleanly to silence during the sacred 365.0s–370.5s pre-reveal pause, pause, or mute.
 */
export function computeAmbientAtmosphereState(
  filmTime: number,
  playing: boolean,
  muted: boolean,
): AmbientAtmosphereState {
  const t = clamp(filmTime, 0, FILM_DURATION);

  if (!playing || muted) {
    return {
      swellIntensity: 0,
      lowpassHz: 260,
      bandpassHz: 420,
      bandpassQ: 1.0,
      gain: 0,
      activeMoment: 'idle',
    };
  }

  // Sacred silence cut (365.0s .. 370.5s)
  const inSilence = t >= SILENCE_START && t < SILENCE_END;
  if (inSilence) {
    return {
      swellIntensity: 0,
      lowpassHz: 240,
      bandpassHz: 380,
      bandpassQ: 1.0,
      gain: 0.0001,
      activeMoment: 'sacred-silence',
    };
  }

  let peakSwell = 0;
  let activeMoment = 'ambient-bed';
  for (let i = 0; i < HIGH_IMPACT_MOMENTS.length; i++) {
    const m = HIGH_IMPACT_MOMENTS[i];
    const env = evaluateMomentEnvelope(t, m);
    if (env > peakSwell) {
      peakSwell = env;
      if (env > 0.08) {
        activeMoment = m.id;
      }
    }
  }

  // Soft hush during Chapter V Quiet Hours (285s–335s)
  const quietHush =
    smoothstep(285.0, 298.0, t) * (1 - smoothstep(330.0, 342.0, t));
  // Smooth fade-in at film opening (0..4s) and gentle tail fade-out (400..405s)
  const filmEdges = smoothstep(0.4, 4.2, t) * (1 - smoothstep(400.0, FILM_DURATION, t));
  // Taper smoothly into the sacred silence threshold
  const preSilenceCut = 1 - smoothstep(SILENCE_START - 0.85, SILENCE_START, t);
  const postSilenceResume = smoothstep(SILENCE_END - 0.1, SILENCE_END + 1.2, t);
  const silenceGate = t < SILENCE_START ? preSilenceCut : postSilenceResume;

  const swellIntensity = clamp(peakSwell * silenceGate, 0, 1);

  // Dynamic frequency filter sweep:
  // Calm nocturnal air (~290–380 Hz) -> Expansive cinematic swell (~1850–2350 Hz)
  const baseCutoff = 360 - quietHush * 110;
  const lowpassHz = Math.round(baseCutoff + Math.pow(swellIntensity, 1.15) * 1980);

  // Ethereal upper-mid air formant bandpass sweeps 440 Hz -> 1260 Hz during swells
  const bandpassHz = Math.round(440 - quietHush * 60 + swellIntensity * 820);
  const bandpassQ = Number((1.05 + swellIntensity * 0.85).toFixed(2));

  // Subtle restrained gain: audible cinematic air swell that never muddies felt piano or voice
  const bedGain = 0.014 * (1 - quietHush * 0.45);
  const swellGain = swellIntensity * 0.044;
  const gain = Number(
    clamp((bedGain + swellGain) * filmEdges * silenceGate, 0.0001, 0.068).toFixed(5),
  );

  return {
    swellIntensity: Number(swellIntensity.toFixed(4)),
    lowpassHz,
    bandpassHz,
    bandpassQ,
    gain,
    activeMoment,
  };
}
