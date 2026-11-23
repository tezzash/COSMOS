import { clamp } from '../data/chapters';

export const TAA_JITTER_SEQUENCE_LENGTH = 16;

export interface TaaJitterOffset {
  /** Sub-pixel offset in pixels [-0.5, +0.5] */
  pixelX: number;
  pixelY: number;
  /** NDC projection offset ready for projectionMatrix.elements[8] and [9] */
  ndcX: number;
  ndcY: number;
}

/**
 * Computes the 1-indexed van der Corput / Halton low-discrepancy radical inverse
 * in the given prime base (2 for X, 3 for Y).
 */
export function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = Math.max(1, Math.floor(index));
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Returns the Halton(2, 3) sub-pixel projection jitter for a given frame index
 * and physical renderbuffer dimensions (width * pixelRatio, height * pixelRatio).
 */
export function computeTaaJitter(
  frameIndex: number,
  renderWidth: number,
  renderHeight: number,
  out?: TaaJitterOffset,
): TaaJitterOffset {
  const sampleIdx = ((Math.floor(frameIndex) % TAA_JITTER_SEQUENCE_LENGTH) + TAA_JITTER_SEQUENCE_LENGTH) % TAA_JITTER_SEQUENCE_LENGTH + 1;
  const pixelX = halton(sampleIdx, 2) - 0.5;
  const pixelY = halton(sampleIdx, 3) - 0.5;

  const safeW = Math.max(1, renderWidth);
  const safeH = Math.max(1, renderHeight);
  const ndcX = (2 * pixelX) / safeW;
  const ndcY = (2 * pixelY) / safeH;

  if (out) {
    out.pixelX = pixelX;
    out.pixelY = pixelY;
    out.ndcX = ndcX;
    out.ndcY = ndcY;
    return out;
  }
  return { pixelX, pixelY, ndcX, ndcY };
}

/**
 * Computes motion-adaptive temporal history blend factor [0..0.88]:
 * - Returns 0 on history reset (chapter seek, replay, resize, or first frame) to prevent ghosting.
 * - Accumulates strongly (~0.84) during slow orbital glides for ultra-sharp sub-pixel antialiasing.
 * - Drops cleanly (~0.56) during rapid cosmic camera dives so stars never leave motion trails.
 */
export function computeTaaBlendFactor(
  cameraSpeed: number,
  reducedMotion: boolean,
  needsReset: boolean,
): number {
  if (needsReset) return 0;
  const speedNorm = clamp(cameraSpeed / 18.0, 0, 1);
  const baseHistory = reducedMotion ? 0.88 : 0.84;
  return clamp(baseHistory - speedNorm * 0.28, 0.52, 0.88);
}
