import { SILENCE_END, clamp, smoothstep } from '../data/chapters';

export interface CinemaPresentationState {
  /** Top/bottom letterbox matte bar height as percentage of viewport height [0..11.5%] */
  letterboxBarPct: number;
  /** True when aspect ratio has expanded open to full-bleed IMAX framing */
  isImaxExpanded: boolean;
  /** Silky S-curve optical focal rack intensity [0..1] for depth transitions */
  focalRackStrength: number;
  /** Target presentation cadence in FPS (24 for filmic cadence when enabled, 0 for native) */
  cadenceFps: number;
}

/**
 * Computes Anamorphic 2.39:1 -> IMAX Full-Bleed letterbox breathing & silky S-curve
 * optical focal rack transitions for the optional Cinema Presentation mode.
 *
 * When enabled:
 * - Default intimate/cosmic acts frame in classic 2.39:1 Panavision anamorphic (~9.5% bars on 16:9)
 * - Gracefully breathes OPEN to full-bleed IMAX framing during monumental spectacle beats:
 *   1. Chapter I Orbital Earth & Hyderabad Sunrise (58s..104s)
 *   2. Final Chapter Supernova & Monumental Reveal (370s..405s)
 */
export function computeCinemaPresentation(
  filmTime: number,
  cinemaModeEnabled: boolean,
  reducedMotion: boolean,
): CinemaPresentationState {
  const t = clamp(filmTime, 0, 405);

  // Focal rack pulses gracefully across chapter entrance boundaries (silky S-curve pull)
  const chapterTransitions = [55, 110, 175, 225, 285, 335];
  let focalRack = 0;
  for (const boundary of chapterTransitions) {
    const dt = Math.abs(t - boundary);
    if (dt < 4.5) {
      const bell = 1 - smoothstep(0.0, 4.5, dt);
      focalRack = Math.max(focalRack, bell * bell);
    }
  }
  const focalRackStrength = reducedMotion ? focalRack * 0.25 : focalRack;

  if (!cinemaModeEnabled) {
    return {
      letterboxBarPct: 0,
      isImaxExpanded: true,
      focalRackStrength,
      cadenceFps: 0,
    };
  }

  // Open smoothly to full-bleed IMAX for Chapter I Earth & Final Supernova Reveal
  const earthImax = smoothstep(54, 62, t) * (1 - smoothstep(102, 110, t));
  const revealImax = smoothstep(SILENCE_END - 0.5, SILENCE_END + 2.8, t);
  const imaxOpen = clamp(Math.max(earthImax, revealImax), 0, 1);

  // 2.39:1 matte on 16:9 viewport is ~9.4% top + 9.4% bottom (never crowds caption band)
  const maxBarPct = 8.4;
  const letterboxBarPct = maxBarPct * (1 - imaxOpen);

  return {
    letterboxBarPct,
    isImaxExpanded: imaxOpen > 0.72,
    focalRackStrength,
    cadenceFps: reducedMotion ? 0 : 24,
  };
}
