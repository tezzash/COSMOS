import { CHAPTERS, FILM_DURATION, clamp } from '../data/chapters';

export interface GravitationalLensState {
  /** Normalized lens warp strength [0..1] peaking smoothly across chapter transitions */
  strength: number;
  /** Normalized Einstein ring radius in aspect-corrected screen space */
  einsteinRadius: number;
  /** Virtual massive-body transit center UV in [0..1] */
  centerX: number;
  centerY: number;
  /** Subtle spectral dispersion along the Einstein ring */
  dispersion: number;
  /** Subtle photon-ring caustic shimmer intensity */
  ringGlint: number;
  /** Active chapter boundary index (1..6), or 0 when outside transition windows */
  transitionIndex: number;
}

/** Half-width in seconds of each smooth chapter-transition gravitational warp window */
export const LENS_TRANSITION_HALF_WINDOW = 3.6;

/**
 * Computes the screen-space 'Gravitational Lens' warp envelope across all chapter
 * transitions (55s, 110s, 175s, 225s, 285s, 335s) plus an optional manual-seek
 * transition pulse (`seekPulse` in [0..1]).
 *
 * Mid-chapter playback returns strength = 0 so the scene remains optically crisp,
 * while crossing between chapters gently bends background starlight around a
 * transiting gravitational mass with an authentic Einstein-ring shimmer.
 */
export function computeChapterTransitionLens(
  filmTime: number,
  seekPulse = 0,
): GravitationalLensState {
  const t = clamp(filmTime, 0, FILM_DURATION);
  const clampedSeek = clamp(seekPulse, 0, 1);

  let bestStrength = 0;
  let bestSignedOffset = 0;
  let bestIndex = 0;

  // Chapter boundaries are CHAPTERS[1..6].start (55, 110, 175, 225, 285, 335)
  for (let i = 1; i < CHAPTERS.length; i++) {
    const boundary = CHAPTERS[i].start;
    const diff = t - boundary;
    const absDiff = Math.abs(diff);
    if (absDiff < LENS_TRANSITION_HALF_WINDOW) {
      // Smooth raised-cosine bell peaking cleanly at diff = 0 with C1-continuous zero ends
      const u = absDiff / LENS_TRANSITION_HALF_WINDOW;
      const bell = 0.5 * (1 + Math.cos(Math.PI * u));
      const shaped = bell * bell;
      if (shaped > bestStrength) {
        bestStrength = shaped;
        bestSignedOffset = diff / LENS_TRANSITION_HALF_WINDOW; // [-1 .. +1]
        bestIndex = i;
      }
    }
  }

  // Blend in optional manual-chapter-seek pulse without exceeding 1.0
  const combinedStrength = clamp(Math.max(bestStrength, clampedSeek * 0.85), 0, 1);

  // Virtual gravitational mass sweeps gracefully across the optical axis during the transition
  const sweepSign = bestIndex % 2 === 0 ? -1 : 1;
  const transitPhase = bestStrength >= clampedSeek * 0.85 ? bestSignedOffset : (1 - clampedSeek) * 0.6 - 0.3;
  const centerX = clamp(0.5 + transitPhase * 0.16 * sweepSign, 0.28, 0.72);
  const centerY = clamp(0.5 + Math.sin(transitPhase * Math.PI * 0.5) * 0.06 * -sweepSign, 0.38, 0.62);

  // Einstein ring swells subtly through peak gravitational proximity
  const einsteinRadius = 0.145 + combinedStrength * 0.125;
  const dispersion = combinedStrength * 0.0024;
  const ringGlint = combinedStrength * 0.14;

  return {
    strength: Number(combinedStrength.toFixed(4)),
    einsteinRadius: Number(einsteinRadius.toFixed(4)),
    centerX: Number(centerX.toFixed(4)),
    centerY: Number(centerY.toFixed(4)),
    dispersion: Number(dispersion.toFixed(5)),
    ringGlint: Number(ringGlint.toFixed(4)),
    transitionIndex: combinedStrength > 0.005 ? bestIndex : 0,
  };
}
