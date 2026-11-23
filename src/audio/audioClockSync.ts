import { FILM_DURATION, clamp } from '../data/chapters';
import { NarrationLine, getActiveNarrationLine } from '../data/screenplay';

export interface AudioClockAnchor {
  filmTimeAnchor: number;
  audioTimeAnchor: number;
  playing: boolean;
}

export interface SpeechProgressState {
  lineId: string | null;
  spokenText: string;
  charOffsetInFullLine: number;
  lastBoundaryCharIndex: number;
  speechStartAudioTime: number;
  estimatedSpokenSec: number;
  isSpeaking: boolean;
}

export interface CaptionSyncSnapshot {
  filmTime: number;
  audioTime: number;
  line: NarrationLine | null;
  /** Character index inside line.text corresponding to exact Web Audio currentTime */
  spokenCharIndex: number;
  /** Normalized [0..1] playback progress across the active caption text */
  spokenProgress: number;
  isSpeaking: boolean;
  clockSource: 'web-audio' | 'fallback';
}

export function createInitialAudioClockAnchor(initialFilmTime = 0): AudioClockAnchor {
  return {
    filmTimeAnchor: clamp(initialFilmTime, 0, FILM_DURATION),
    audioTimeAnchor: 0,
    playing: false,
  };
}

/**
 * Re-anchors the Web Audio hardware clock to a known film timestamp
 * (called on seek, play/pause, replay, or drift correction).
 */
export function reanchorAudioClock(
  filmTime: number,
  currentAudioTime: number,
  playing: boolean,
): AudioClockAnchor {
  return {
    filmTimeAnchor: clamp(filmTime, 0, FILM_DURATION),
    audioTimeAnchor: Number.isFinite(currentAudioTime) ? Math.max(0, currentAudioTime) : 0,
    playing,
  };
}

/**
 * Computes exact double-precision film time from Web Audio API `AudioContext.currentTime`.
 */
export function computeAudioAnchoredFilmTime(
  anchor: AudioClockAnchor,
  currentAudioTime: number,
): number {
  if (!anchor.playing) {
    return clamp(anchor.filmTimeAnchor, 0, FILM_DURATION);
  }
  const elapsed = Math.max(0, currentAudioTime - anchor.audioTimeAnchor);
  return clamp(anchor.filmTimeAnchor + elapsed, 0, FILM_DURATION);
}

/**
 * Resolves the exact active NarrationLine and micro-second speech progress
 * from the Web Audio API `currentTime` clock.
 */
export function resolveCaptionSyncSnapshot(
  anchor: AudioClockAnchor,
  currentAudioTime: number,
  speech: SpeechProgressState,
  clockSource: 'web-audio' | 'fallback',
): CaptionSyncSnapshot {
  const filmTime = computeAudioAnchoredFilmTime(anchor, currentAudioTime);
  const line = getActiveNarrationLine(filmTime);

  if (!line) {
    return {
      filmTime,
      audioTime: currentAudioTime,
      line: null,
      spokenCharIndex: 0,
      spokenProgress: 0,
      isSpeaking: false,
      clockSource,
    };
  }

  const fullLen = line.text.length;
  let spokenCharIndex = 0;
  let spokenProgress = 0;
  const activeSpeechMatches = speech.isSpeaking && speech.lineId === line.id;

  if (activeSpeechMatches && fullLen > 0) {
    // Combine exact Web Speech word-boundary charIndex with micro-second AudioContext interpolation
    const elapsedAudio = Math.max(0, currentAudioTime - speech.speechStartAudioTime);
    const estDur = Math.max(0.4, speech.estimatedSpokenSec);
    const timeFrac = clamp(elapsedAudio / estDur, 0, 1);
    const interpCharInUtter = Math.round(timeFrac * speech.spokenText.length);
    const bestCharInUtter = Math.max(speech.lastBoundaryCharIndex, interpCharInUtter);
    spokenCharIndex = clamp(speech.charOffsetInFullLine + bestCharInUtter, 0, fullLen);
    spokenProgress = clamp(spokenCharIndex / fullLen, 0, 1);
  } else if (fullLen > 0) {
    const winDur = Math.max(0.25, line.end - line.start);
    spokenProgress = clamp((filmTime - line.start) / winDur, 0, 1);
    spokenCharIndex = Math.round(spokenProgress * fullLen);
  }

  return {
    filmTime,
    audioTime: currentAudioTime,
    line,
    spokenCharIndex,
    spokenProgress,
    isSpeaking: activeSpeechMatches,
    clockSource,
  };
}
