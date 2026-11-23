import { clamp } from '../data/chapters';

export interface SpeechSyncPlan {
  text: string;
  rate: number;
  pitch: number;
  remainingSec: number;
  estimatedSecAt1x: number;
  trimmedForSeek: boolean;
}

/**
 * Estimates natural spoken duration in seconds at Web Speech rate = 1.0,
 * accounting for word count, longer multi-syllable words, and punctuation pauses.
 */
export function estimateBaseSpeechDuration(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;

  const words = cleaned.split(/\s+/).filter(Boolean);
  // Count longer words (>7 chars) slightly heavier to approximate syllable count
  let weightedWords = 0;
  for (const w of words) {
    const letters = w.replace(/[^a-zA-Z0-9]/g, '').length;
    weightedWords += letters > 8 ? 1.28 : letters > 5 ? 1.08 : 0.92;
  }

  // Standard Web Speech 1.0x cadence is ~2.75 weighted words/sec
  const wordsTime = weightedWords / 2.75;

  // Natural pauses for ellipses, sentence terminators, and commas
  const ellipsisMatches = cleaned.match(/\.{3}|…/g) ?? [];
  const withoutEllipsis = cleaned.replace(/\.{3}|…/g, ' ');
  const sentenceStops = (withoutEllipsis.match(/[.!?]/g) ?? []).length;
  const commas = (withoutEllipsis.match(/[,;:—–]/g) ?? []).length;

  // Subtract final trailing stop since it occurs at end of utterance
  const internalStops = Math.max(0, sentenceStops - 1);
  const pauseTime =
    ellipsisMatches.length * 0.28 + internalStops * 0.24 + commas * 0.12;

  return Math.max(0.6, wordsTime + pauseTime);
}

/**
 * Computes a synchronized speech plan so spoken Web Speech narration finishes
 * cleanly within the caption's exact [start, end] display window without lagging
 * behind or colliding with the next caption.
 */
export function computeSyncedSpeechPlan(
  text: string,
  lineStart: number,
  lineEnd: number,
  currentFilmTime: number,
  tone: 'monumental' | 'warm' | 'playful' | 'quiet' | 'climax' = 'warm',
): SpeechSyncPlan | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const totalDuration = Math.max(1.0, lineEnd - lineStart);
  const elapsedInLine = clamp(currentFilmTime - lineStart, 0, totalDuration);
  // Leave a subtle 0.22s breathing margin before the caption fades out
  const remainingSec = Math.max(0.65, lineEnd - currentFilmTime - 0.22);

  // If the viewer scrubbed into the final 0.85s of a caption, skip speaking it
  // so it doesn't awkwardly clip immediately when the next line enters.
  if (elapsedInLine > 0.75 && remainingSec < 0.85) {
    return null;
  }

  let speakText = trimmed;
  let trimmedForSeek = false;

  // If the viewer jumped into the middle of a multi-sentence cue (>38% through),
  // advance cleanly to the remaining sentence(s) that fit the remaining time.
  const lineProgress = elapsedInLine / totalDuration;
  if (lineProgress > 0.38) {
    const sentences = trimmed
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      const startIdx = Math.min(
        sentences.length - 1,
        Math.floor(lineProgress * sentences.length),
      );
      if (startIdx > 0) {
        speakText = sentences.slice(startIdx).join(' ');
        trimmedForSeek = true;
      }
    }
  }

  const estimatedSecAt1x = estimateBaseSpeechDuration(speakText);

  // Target rate makes estimated duration fit cleanly inside remainingSec,
  // biased slightly gentle for short quiet lines and nimble for dense captions.
  const rawRate = estimatedSecAt1x / remainingSec;
  const minRate = tone === 'quiet' ? 0.94 : 0.98;
  const maxRate = 1.62;
  const rate = clamp(Number(rawRate.toFixed(2)), minRate, maxRate);

  const pitch =
    tone === 'monumental'
      ? 0.94
      : tone === 'playful'
        ? 1.02
        : tone === 'quiet'
          ? 0.96
          : 0.98;

  return {
    text: speakText,
    rate,
    pitch,
    remainingSec,
    estimatedSecAt1x,
    trimmedForSeek,
  };
}
