import {
  FILM_DURATION,
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  clamp,
  smoothstep,
} from '../data/chapters';

export interface CosmicDriftState {
  /** Dynamic background starfield opacity [0..1], modulated cleanly by filmTime */
  opacity: number;
  /** Continuous slow parallax-scroll offset in world units (multiplied per star by aDepth in GLSL) */
  scrollX: number;
  scrollY: number;
  scrollZ: number;
  /** Subtle warm-gold vs. cool-sapphire tint blend [0 = cool deep void, 1 = warm golden] */
  warmth: number;
}

/**
 * Computes the subtle 'Cosmic Drift' background starfield state purely from `filmTime`
 * and `elapsed` seconds.
 *
 * Opacity breathes across the 7-chapter arc so the drifting parallax field enriches
 * open deep-space sequences while yielding respectfully during Earth orbit, the
 * intimate Quiet Hours room, and the sacred pre-reveal Final Silence (365s–370.5s).
 */
export function computeCosmicDriftState(
  filmTime: number,
  elapsed: number,
  hasEntered: boolean,
  reducedMotion: boolean,
): CosmicDriftState {
  const t = clamp(filmTime, 0, FILM_DURATION);

  // Opening emergence: starts whisper-soft on the landing veil, awakens after Big Bang
  const landingBase = 0.22;
  const awakeCurve = smoothstep(4.5, 22.0, t);

  // Subtle chapter-aware breathing envelope:
  // - Slight calm dip during Earth close-up (62s–105s) so Hyderabad sunrise dominates
  const earthDip =
    smoothstep(60.0, 72.0, t) * (1 - smoothstep(98.0, 110.0, t)) * 0.26;
  // - Gentle luminous rise through Sagittarius (115s–172s) & Chapter III–IV deep-space vistas (180s–280s)
  const deepSpaceLift =
    smoothstep(112.0, 132.0, t) * (1 - smoothstep(276.0, 290.0, t)) * 0.16;
  // - Soft nocturnal hush during Chapter V Quiet Hours (286s–334s)
  const quietDip =
    smoothstep(284.0, 298.0, t) * (1 - smoothstep(330.0, 342.0, t)) * 0.34;
  // - Sacred silence hold (365.0s–370.5s): cosmic drift fades almost completely to stillness
  const silenceDip =
    smoothstep(SILENCE_START - 2.0, SILENCE_START + 0.5, t) *
    (1 - smoothstep(SILENCE_END, SILENCE_END + 2.8, t));
  // - Post-reveal golden resurgence (371.5s–405s)
  const revealBloom = smoothstep(TITLE_REVEAL_TIME - 0.5, TITLE_REVEAL_TIME + 5.5, t) * 0.14;

  // Gentle organic breathing wave (never strobes; ultra-slow 26-second harmonic breath)
  const breath = reducedMotion ? 0 : Math.sin(t * 0.24) * 0.04;

  let rawOpacity: number;
  if (!hasEntered) {
    rawOpacity = landingBase + (reducedMotion ? 0 : Math.sin(elapsed * 0.25) * 0.025);
  } else {
    const base = 0.16 + awakeCurve * 0.42 + deepSpaceLift + revealBloom - earthDip - quietDip + breath;
    rawOpacity = base * (1 - silenceDip * 0.94);
  }
  const opacity = clamp(rawOpacity, 0.015, 0.72);

  // Slow continuous multi-axis parallax scroll (smooth diagonal celestial drift + gentle forward glide)
  // Attenuates gracefully in reduced-motion mode and pauses gently during the sacred silence hold
  const motionScale = reducedMotion ? 0.18 : 1.0;
  const driftTime = hasEntered ? t * 0.65 + elapsed * 0.35 : elapsed * 0.45;
  const silenceFreeze = 1 - silenceDip * 0.7;

  const scrollX =
    (driftTime * 1.15 + Math.sin(driftTime * 0.09) * 3.2) * motionScale * silenceFreeze;
  const scrollY =
    (driftTime * 0.42 + Math.cos(driftTime * 0.07) * 2.1) * motionScale * silenceFreeze;
  const scrollZ = driftTime * 1.85 * motionScale * silenceFreeze;

  // Chapter color warmth: cool indigo-silver in early cosmos & silence, warm gold in Earth/Equilibrium/Reveal
  const earthWarmth = smoothstep(56.0, 74.0, t) * (1 - smoothstep(104.0, 118.0, t)) * 0.55;
  const ch4Warmth = smoothstep(232.0, 252.0, t) * (1 - smoothstep(280.0, 294.0, t)) * 0.45;
  const quietWarmth = smoothstep(288.0, 305.0, t) * (1 - smoothstep(334.0, 346.0, t)) * 0.65;
  const revealWarmth = smoothstep(TITLE_REVEAL_TIME - 1.0, TITLE_REVEAL_TIME + 4.5, t) * 0.75;
  const warmth = clamp(0.18 + earthWarmth + ch4Warmth + quietWarmth + revealWarmth, 0, 1);

  return {
    opacity,
    scrollX,
    scrollY,
    scrollZ,
    warmth,
  };
}
