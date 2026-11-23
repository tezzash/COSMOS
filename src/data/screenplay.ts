import {
  BIRTHDAY_REVEAL_TIME,
  type ChapterId,
  ORBITAL_CODA_TIME,
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  clamp,
  getChapterPauseRange,
} from './chapters';

export type NarrationSequenceRole = 'narration' | 'reveal-greeting' | 'post-reveal-coda';

export interface NarrationLine {
  id: string;
  chapterId: ChapterId;
  start: number;
  end: number;
  text: string;
  containsReveal?: boolean;
  tone?: 'monumental' | 'warm' | 'playful' | 'quiet' | 'climax';
  sequenceRole?: NarrationSequenceRole;
}

export interface NarrationBeatSpec {
  id: string;
  chapterId: ChapterId;
  text: string;
  /** Optional explicit cue start in seconds (chapter openings & locked emotional beats) */
  anchorStartSec?: number;
  /** Target speaking duration in seconds (falls back to cinematic WPM estimation) */
  durationSec?: number;
  /** Deliberate silent visual/musical pause after this cue before the next cue */
  pauseAfterSec: number;
  containsReveal?: boolean;
  tone?: 'monumental' | 'warm' | 'playful' | 'quiet' | 'climax';
  sequenceRole?: NarrationSequenceRole;
}

export interface AstronomicalFact {
  id: string;
  label: string;
  value: string;
  detail: string;
  start: number;
  end: number;
}

export interface ConstellationTrait {
  word: string;
  start: number;
  end: number;
}

export interface ChapterPacingStats {
  readonly lineCount: number;
  readonly wordCount: number;
  readonly spokenSec: number;
  readonly gapsSec: number[];
  readonly minGapSec: number;
  readonly maxGapSec: number;
}

export interface ScreenplayPacingSummary {
  readonly totalLines: number;
  readonly totalWords: number;
  readonly totalSpokenSec: number;
  readonly averageWpm: number;
  readonly byChapter: Record<ChapterId, ChapterPacingStats>;
}

export const ASTRONOMICAL_FACTS: AstronomicalFact[] = [
  {
    id: 'rotation',
    label: 'Equatorial Rotation',
    value: '~1,670 km/h',
    detail: 'Earth sidereal spin at 0° latitude',
    start: 62,
    end: 74,
  },
  {
    id: 'orbit',
    label: 'Mean Orbital Velocity',
    value: '~107,000 km/h',
    detail: 'NASA solar orbit average',
    start: 65,
    end: 78,
  },
  {
    id: 'date-location',
    label: 'Monday · 25 November 2002',
    value: '17.3850° N, 78.4867° E',
    detail: 'Hyderabad, Andhra Pradesh, India (2002)',
    start: 78,
    end: 95,
  },
  {
    id: 'moon',
    label: 'Lunar Illumination',
    value: 'Waning Gibbous · ~72%',
    detail: 'Full Moon passed 20 Nov 2002 (~07:04 IST)',
    start: 82,
    end: 98,
  },
  {
    id: 'daylight',
    label: 'Hyderabad Daylight',
    value: '~06:30 — 17:36 IST',
    detail: 'Approx. 11 hours 6 minutes of sunlight',
    start: 86,
    end: 103,
  },
];

export const CONSTELLATION_TRAITS: ConstellationTrait[] = [
  { word: 'INTELLIGENCE', start: 158.5, end: 162.2 },
  { word: 'KINDNESS', start: 161.2, end: 164.8 },
  { word: 'AMBITION', start: 163.8, end: 167.4 },
  { word: 'HUMOUR', start: 166.3, end: 169.8 },
  { word: 'CURIOSITY', start: 168.8, end: 172.3 },
  { word: 'DETERMINATION', start: 171.2, end: 174.8 },
];

function roundTenth(sec: number): number {
  return Math.round(sec * 10) / 10;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Estimates a natural cinematic speaking window for a narration beat when an
 * explicit duration is not specified (~128 WPM baseline, slightly slower for quiet beats).
 */
export function estimateCinematicBeatDuration(
  text: string,
  tone: NarrationLine['tone'] = 'warm',
): number {
  const words = countWords(text);
  const wpm = tone === 'quiet' ? 116 : tone === 'monumental' ? 122 : 132;
  const punctuationPauses = (text.match(/[.!?—…]/g) ?? []).length * 0.22;
  return roundTenth(Math.max(3.2, (words / wpm) * 60 + punctuationPauses));
}

/**
 * Deterministically converts declarative screenplay beat specs (with explicit
 * inter-cue visual/musical pause intervals) into non-overlapping timeline cues.
 */
export function buildTimedScreenplay(beats: readonly NarrationBeatSpec[]): NarrationLine[] {
  const lines: NarrationLine[] = [];
  let cursor = 0;

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (!beat) continue;

    const start = roundTenth(
      beat.anchorStartSec !== undefined ? Math.max(cursor, beat.anchorStartSec) : cursor,
    );
    const duration = roundTenth(
      beat.durationSec ?? estimateCinematicBeatDuration(beat.text, beat.tone),
    );
    const end = roundTenth(start + duration);

    lines.push({
      id: beat.id,
      chapterId: beat.chapterId,
      start,
      end,
      text: beat.text,
      tone: beat.tone,
      ...(beat.containsReveal ? { containsReveal: true } : {}),
      ...(beat.sequenceRole ? { sequenceRole: beat.sequenceRole } : {}),
    });

    const nextBeat = beats[i + 1];
    const chapterPauseRange =
      nextBeat && nextBeat.chapterId === beat.chapterId
        ? getChapterPauseRange(beat.chapterId)
        : undefined;
    const effectivePause = chapterPauseRange
      ? clamp(beat.pauseAfterSec, chapterPauseRange[0], chapterPauseRange[1])
      : Math.max(0, beat.pauseAfterSec);

    cursor = roundTenth(end + effectivePause);
  }

  return lines;
}

/**
 * Refactored cinema-paced screenplay:
 * - ~15% leaner overall narration length (~498 words / ~238s spoken across 405s runtime)
 *   for effortless ~125 WPM breathing room and visual immersion.
 * - Explicit 2–4 second pauses of pure visuals & score between every beat in
 *   Chapters I (3.0–3.6s), IV (3.2–3.8s), and V (3.4–3.8s).
 * - Swapped Final Reveal order: "Happy Birthday, Isha." lands immediately after the
 *   371.5s ISHA constellation reveal, followed by the 24-orbit / 22.5B km statistics
 *   as a warm coda at 379.5s.
 */
export const SCREENPLAY_BEATS: readonly NarrationBeatSpec[] = [
  // PROLOGUE — BEFORE ANYTHING HAD A NAME (00:00–00:55)
  {
    id: 'p-1',
    chapterId: 'prologue',
    anchorStartSec: 3.6,
    durationSec: 5.8,
    pauseAfterSec: 3.0,
    text: 'Before time learned to count. Before space stretched open.',
    tone: 'monumental',
  },
  {
    id: 'p-2',
    chapterId: 'prologue',
    durationSec: 5.0,
    pauseAfterSec: 3.2,
    text: 'There was a beginning. Matter. Energy. Gravity. Light.',
    tone: 'monumental',
  },
  {
    id: 'p-3',
    chapterId: 'prologue',
    durationSec: 5.6,
    pauseAfterSec: 3.2,
    text: 'Stars ignited for billions of years. Galaxies drifted through the dark.',
    tone: 'monumental',
  },
  {
    id: 'p-4',
    chapterId: 'prologue',
    durationSec: 4.8,
    pauseAfterSec: 3.0,
    text: 'Worlds rose and vanished—until the cosmos learned to make life.',
    tone: 'warm',
  },
  {
    id: 'p-5',
    chapterId: 'prologue',
    durationSec: 5.0,
    pauseAfterSec: 2.6,
    text: 'I have witnessed supernovas, black holes, and colliding galaxies.',
    tone: 'monumental',
  },
  {
    id: 'p-6',
    chapterId: 'prologue',
    durationSec: 5.2,
    pauseAfterSec: 2.2,
    text: 'I have sculpted wonders. Yet my finest creations turned out human.',
    tone: 'playful',
  },

  // CHAPTER I — A LITTLE PLANET, A BIG STORY (00:55–01:50; deliberate 3.0–3.6s pauses)
  {
    id: 'c1-1',
    chapterId: 'chapter-1',
    anchorStartSec: 56.4,
    durationSec: 4.4,
    pauseAfterSec: 3.0,
    text: 'Visit one of my favourite worlds. Earth.',
    tone: 'warm',
  },
  {
    id: 'c1-2',
    chapterId: 'chapter-1',
    durationSec: 7.8,
    pauseAfterSec: 3.2,
    text: 'Spinning at 1,670 kilometres an hour, racing at 107,000—yet convincing everyone it stands still.',
    tone: 'playful',
  },
  {
    id: 'c1-3',
    chapterId: 'chapter-1',
    durationSec: 5.2,
    pauseAfterSec: 3.4,
    text: 'On Monday, 25 November 2002, Earth kept its quiet rhythm.',
    tone: 'warm',
  },
  {
    id: 'c1-4',
    chapterId: 'chapter-1',
    durationSec: 6.4,
    pauseAfterSec: 3.6,
    text: 'A waning gibbous Moon shone seventy-two percent bright. Dawn gave Hyderabad eleven hours of light.',
    tone: 'warm',
  },
  {
    id: 'c1-5',
    chapterId: 'chapter-1',
    durationSec: 4.6,
    pauseAfterSec: 3.0,
    text: 'Nothing exploded. No galaxies paused. A new human simply arrived.',
    tone: 'quiet',
  },
  {
    id: 'c1-6',
    chapterId: 'chapter-1',
    durationSec: 4.4,
    pauseAfterSec: 2.6,
    text: 'And quietly, a rare possibility entered the story.',
    tone: 'warm',
  },

  // CHAPTER II — AN UNUSUAL FORM OF EXISTENCE (01:50–02:55)
  {
    id: 'c2-1',
    chapterId: 'chapter-2',
    anchorStartSec: 111.6,
    durationSec: 4.2,
    pauseAfterSec: 2.8,
    text: 'Watching her unfold has offered delightful surprises.',
    tone: 'playful',
  },
  {
    id: 'c2-2',
    chapterId: 'chapter-2',
    durationSec: 5.6,
    pauseAfterSec: 2.8,
    text: 'First, the fire she carries—warmth, drive, and ambition in one person.',
    tone: 'playful',
  },
  {
    id: 'c2-3',
    chapterId: 'chapter-2',
    durationSec: 6.8,
    pauseAfterSec: 2.8,
    text: "Her mind is relentless. She sees good, thinks 'Could be better,' and makes it better.",
    tone: 'playful',
  },
  {
    id: 'c2-4',
    chapterId: 'chapter-2',
    durationSec: 4.8,
    pauseAfterSec: 2.8,
    text: 'Honestly, it is exhausting to watch—even for an expanding universe.',
    tone: 'playful',
  },
  {
    id: 'c2-5',
    chapterId: 'chapter-2',
    durationSec: 5.6,
    pauseAfterSec: 2.8,
    text: 'She listens. She guides people home. A gifted therapist, among many things.',
    tone: 'warm',
  },
  {
    id: 'c2-6',
    chapterId: 'chapter-2',
    durationSec: 6.0,
    pauseAfterSec: 3.0,
    text: 'Beyond titles: games, cinema, music, sharp sarcasm, and mysteries I leave unsolved.',
    tone: 'playful',
  },
  {
    id: 'c2-7',
    chapterId: 'chapter-2',
    durationSec: 6.2,
    pauseAfterSec: 2.8,
    text: "She doesn't chase applause. She simply sees what can be done—and does it.",
    tone: 'monumental',
  },

  // CHAPTER III — THE INVISIBLE GRAVITY (02:55–03:45)
  {
    id: 'c3-1',
    chapterId: 'chapter-3',
    anchorStartSec: 176.4,
    durationSec: 6.2,
    pauseAfterSec: 3.0,
    text: "Not every force announces itself. Gravity doesn't ask applause before holding galaxies together.",
    tone: 'monumental',
  },
  {
    id: 'c3-2',
    chapterId: 'chapter-3',
    durationSec: 5.2,
    pauseAfterSec: 3.0,
    text: 'Some people never see how far their quietest kindness travels.',
    tone: 'warm',
  },
  {
    id: 'c3-3',
    chapterId: 'chapter-3',
    durationSec: 7.4,
    pauseAfterSec: 3.2,
    text: 'A moment of patience. The right words at the right hour. Somewhere, someone dares to try again.',
    tone: 'warm',
  },
  {
    id: 'c3-4',
    chapterId: 'chapter-3',
    durationSec: 5.4,
    pauseAfterSec: 3.0,
    text: 'And she? Already moving on—perfecting a detail nobody else noticed.',
    tone: 'playful',
  },
  {
    id: 'c3-5',
    chapterId: 'chapter-3',
    durationSec: 6.8,
    pauseAfterSec: 2.8,
    text: "You never know how many universes you shift simply by living your own.",
    tone: 'monumental',
  },

  // CHAPTER IV — TWO HALVES OF A STRANGE EQUILIBRIUM (03:45–04:45; deliberate 3.2–3.8s pauses)
  {
    id: 'c4-1',
    chapterId: 'chapter-4',
    anchorStartSec: 226.4,
    durationSec: 4.4,
    pauseAfterSec: 3.2,
    text: 'Then comes the quiet miracle of two orbits finding each other.',
    tone: 'monumental',
  },
  {
    id: 'c4-2',
    chapterId: 'chapter-4',
    durationSec: 5.0,
    pauseAfterSec: 3.4,
    text: 'One of you: precise, structured, five steps ahead with a plan.',
    tone: 'warm',
  },
  {
    id: 'c4-3',
    chapterId: 'chapter-4',
    durationSec: 5.4,
    pauseAfterSec: 3.6,
    text: 'The other: imperfect, improvising, making questionable choices with great confidence.',
    tone: 'playful',
  },
  {
    id: 'c4-4',
    chapterId: 'chapter-4',
    durationSec: 5.2,
    pauseAfterSec: 3.8,
    text: 'Perfection without spontaneity turns still. Chaos without direction loses its way.',
    tone: 'monumental',
  },
  {
    id: 'c4-5',
    chapterId: 'chapter-4',
    durationSec: 5.8,
    pauseAfterSec: 3.6,
    text: "Opposites don't have to compete. Two rhythms simply make room for each other.",
    tone: 'warm',
  },
  {
    id: 'c4-6',
    chapterId: 'chapter-4',
    durationSec: 6.8,
    pauseAfterSec: 3.2,
    text: 'Neither needed to become the other. Only stay true—and keep orbiting together.',
    tone: 'warm',
  },

  // CHAPTER V — EVEN STARS HAVE QUIET HOURS (04:45–05:35; deliberate 3.4–3.8s breathing pauses)
  {
    id: 'c5-1',
    chapterId: 'chapter-5',
    anchorStartSec: 286.6,
    durationSec: 5.4,
    pauseAfterSec: 3.6,
    text: "I've been expanding for 13.8 billion years. Even I wouldn't try that without a pause.",
    tone: 'quiet',
  },
  {
    id: 'c5-2',
    chapterId: 'chapter-5',
    durationSec: 6.4,
    pauseAfterSec: 3.8,
    text: 'Yet humans push themselves to keep going. To achieve. To help. To become more.',
    tone: 'quiet',
  },
  {
    id: 'c5-3',
    chapterId: 'chapter-5',
    durationSec: 5.8,
    pauseAfterSec: 3.8,
    text: "Listen. You don't have to turn every day into an achievement, or hold every answer.",
    tone: 'quiet',
  },
  {
    id: 'c5-4',
    chapterId: 'chapter-5',
    durationSec: 5.2,
    pauseAfterSec: 3.4,
    text: 'Some days are for progress. Some are for doing nothing at all. Even stars rest.',
    tone: 'warm',
  },
  {
    id: 'c5-5',
    chapterId: 'chapter-5',
    durationSec: 6.4,
    pauseAfterSec: 2.6,
    text: 'I hope those who care for everyone remember they deserve gentleness—simply for existing.',
    tone: 'warm',
  },

  // FINAL CHAPTER — THE REVELATION (05:35–06:45)
  {
    id: 'f-1',
    chapterId: 'final-chapter',
    anchorStartSec: 336.8,
    durationSec: 5.4,
    pauseAfterSec: 2.6,
    text: 'So after all those galaxies, all those stars, all that time...',
    tone: 'monumental',
  },
  {
    id: 'f-2',
    chapterId: 'final-chapter',
    durationSec: 6.2,
    pauseAfterSec: 2.6,
    text: 'There is one extraordinary mind that refuses to settle, one heart that changes the room.',
    tone: 'climax',
  },
  {
    id: 'f-3',
    chapterId: 'final-chapter',
    durationSec: 4.6,
    pauseAfterSec: 2.0,
    text: 'A little mischief. A little brilliance. Far more sarcasm than I planned.',
    tone: 'playful',
  },
  {
    id: 'f-4',
    chapterId: 'final-chapter',
    durationSec: 4.4,
    pauseAfterSec: 6.9, // 364.6 + 6.9 = 371.5s (Sacred Silence 365.0..370.5 + 1.0s burst -> ISHA reveal)
    text: "I have seen countless wonders. I'll gladly make an exception for this one.",
    tone: 'climax',
  },
  // 365.0–370.5: Complete cosmic silence — one star remains.
  // 371.5: ISHA constellation reveal & "Happy Birthday, Isha." immediately together!
  // Followed by the 24-orbit / 22.5B km orbital statistics as a warm coda at 378.8s.
  {
    id: 'f-6',
    chapterId: 'final-chapter',
    anchorStartSec: BIRTHDAY_REVEAL_TIME, // 371.5s — immediately at the ISHA reveal
    durationSec: 4.5,
    pauseAfterSec: 2.8,
    text: 'From this rather enormous universe... Happy Birthday, Isha.',
    tone: 'climax',
    containsReveal: true,
    sequenceRole: 'reveal-greeting',
  },
  {
    id: 'f-7',
    chapterId: 'final-chapter',
    anchorStartSec: ORBITAL_CODA_TIME, // 378.8s — warm post-reveal statistical coda
    durationSec: 6.2,
    pauseAfterSec: 2.6,
    text: "Twenty-four journeys around a star. 22.5 billion kilometres—and your story is only beginning.",
    tone: 'warm',
    containsReveal: true,
    sequenceRole: 'post-reveal-coda',
  },
  {
    id: 'f-8',
    chapterId: 'final-chapter',
    durationSec: 5.0,
    pauseAfterSec: 2.4,
    text: 'Keep being curious. Keep laughing. Keep exploring. Keep becoming.',
    tone: 'warm',
    containsReveal: true,
  },
  {
    id: 'f-9',
    chapterId: 'final-chapter',
    durationSec: 6.6,
    pauseAfterSec: 0,
    text: 'Remember, you are allowed to simply be. Today, the universe celebrates you.',
    tone: 'warm',
    containsReveal: true,
  },
];

export const SCREENPLAY_LINES: NarrationLine[] = buildTimedScreenplay(SCREENPLAY_BEATS);

export const FINAL_POSTSCRIPT =
  'P.S. The universe has reviewed your performance. Expectations remain unreasonably high. Please continue being you.';

export function getActiveNarrationLine(timeSec: number): NarrationLine | null {
  for (let i = 0; i < SCREENPLAY_LINES.length; i++) {
    const line = SCREENPLAY_LINES[i];
    if (line && timeSec >= line.start && timeSec <= line.end) {
      return line;
    }
  }
  return null;
}

export function getActiveFacts(timeSec: number): AstronomicalFact[] {
  return ASTRONOMICAL_FACTS.filter((f) => timeSec >= f.start && timeSec <= f.end);
}

export function getActiveTrait(timeSec: number): ConstellationTrait | null {
  for (let i = 0; i < CONSTELLATION_TRAITS.length; i++) {
    const trait = CONSTELLATION_TRAITS[i];
    if (trait && timeSec >= trait.start && timeSec <= trait.end) {
      return trait;
    }
  }
  return null;
}

/**
 * Prevents transcript spoilers before the viewer reaches the Final Chapter reveal.
 */
export function getSpoilerSafeTranscript(
  currentTimeSec: number,
  hasUnlockedReveal: boolean,
): Array<NarrationLine & { locked: boolean }> {
  const unlocked = hasUnlockedReveal || currentTimeSec >= TITLE_REVEAL_TIME;
  return SCREENPLAY_LINES.map((line) => ({
    ...line,
    locked: Boolean(line.containsReveal && !unlocked),
  }));
}

export type FinalSequencePhase =
  | 'pre-reveal'
  | 'silence'
  | 'birthday-reveal'
  | 'statistical-coda'
  | 'closing-blessing';

/**
 * Resolves the narrative beat phase for the Final Chapter reveal sequence:
 * Sacred Silence (365..370.5s) -> immediate Happy Birthday, Isha reveal at 371.5s ->
 * warm orbital statistics coda at 378.8s -> closing birthday blessing.
 */
export function getFinalSequencePhase(timeSec: number): FinalSequencePhase {
  if (timeSec < SILENCE_START) return 'pre-reveal';
  if (timeSec < SILENCE_END) return 'silence';
  if (timeSec < TITLE_REVEAL_TIME) return 'pre-reveal';
  if (timeSec < ORBITAL_CODA_TIME) return 'birthday-reveal';
  const codaLine = SCREENPLAY_LINES.find((l) => l.sequenceRole === 'post-reveal-coda');
  const codaEnd = codaLine ? codaLine.end : ORBITAL_CODA_TIME + 6.2;
  if (timeSec <= codaEnd + 1.5) return 'statistical-coda';
  return 'closing-blessing';
}

/**
 * Pure screenplay pacing metrics used by automated tests to verify trimmed narration
 * length, natural cinematic WPM, and chapter-level inter-cue breathing pauses.
 */
export function analyzeScreenplayPacing(
  lines: readonly NarrationLine[] = SCREENPLAY_LINES,
): ScreenplayPacingSummary {
  const chapterIds: ChapterId[] = [
    'prologue',
    'chapter-1',
    'chapter-2',
    'chapter-3',
    'chapter-4',
    'chapter-5',
    'final-chapter',
  ];

  const grouped = new Map<ChapterId, NarrationLine[]>();
  for (const id of chapterIds) {
    grouped.set(id, []);
  }

  let totalWords = 0;
  let totalSpokenSec = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    totalWords += countWords(line.text);
    totalSpokenSec += Math.max(0, line.end - line.start);
    grouped.get(line.chapterId)?.push(line);
  }

  const byChapter = {} as Record<ChapterId, ChapterPacingStats>;
  for (const id of chapterIds) {
    const chLines = grouped.get(id) ?? [];
    const gapsSec: number[] = [];
    let chWords = 0;
    let chSpoken = 0;

    for (let i = 0; i < chLines.length; i++) {
      const cur = chLines[i];
      if (!cur) continue;
      chWords += countWords(cur.text);
      chSpoken += Math.max(0, cur.end - cur.start);
      if (i > 0) {
        const prev = chLines[i - 1];
        if (prev) {
          gapsSec.push(roundTenth(cur.start - prev.end));
        }
      }
    }

    byChapter[id] = {
      lineCount: chLines.length,
      wordCount: chWords,
      spokenSec: roundTenth(chSpoken),
      gapsSec,
      minGapSec: gapsSec.length > 0 ? Math.min(...gapsSec) : 0,
      maxGapSec: gapsSec.length > 0 ? Math.max(...gapsSec) : 0,
    };
  }

  const roundedSpoken = roundTenth(totalSpokenSec);
  const averageWpm =
    roundedSpoken > 0 ? Math.round((totalWords / (roundedSpoken / 60)) * 10) / 10 : 0;

  return {
    totalLines: lines.length,
    totalWords,
    totalSpokenSec: roundedSpoken,
    averageWpm,
    byChapter,
  };
}
