export type ChapterId =
  | 'prologue'
  | 'chapter-1'
  | 'chapter-2'
  | 'chapter-3'
  | 'chapter-4'
  | 'chapter-5'
  | 'final-chapter';

export interface ChapterDefinition {
  id: ChapterId;
  index: number;
  label: string;
  roman: string;
  title: string;
  start: number; // seconds
  end: number;   // seconds
  fogColor: string;
  fogDensity: number;
  accentHex: string;
  ambientTone: 'void' | 'earth' | 'constellation' | 'gravity' | 'yinyang' | 'quiet' | 'revelation';
  /** Deliberate [min, max] inter-cue visual/musical pause window in seconds */
  pauseRangeSec?: readonly [number, number];
}

export const FILM_DURATION = 405; // 06:45
export const SILENCE_START = 365; // Hard orchestral silence before reveal
export const SILENCE_END = 370.5;
export const TITLE_REVEAL_TIME = 371.5; // First moment "ISHA" & "Happy Birthday, Isha." appear
export const BIRTHDAY_REVEAL_TIME = 371.5; // Appears immediately at 371.5s with ISHA reveal
export const ORBITAL_CODA_TIME = 378.8; // Warm orbital statistics coda: 24 orbits · 22.5B km
export const SHOOTING_STAR_TIME = 387; // Subtle golden shooting star
export const POSTSCRIPT_REVEAL_TIME = 391; // Playful universe postscript

export const CHAPTERS: ChapterDefinition[] = [
  {
    id: 'prologue',
    index: 0,
    label: 'Prologue',
    roman: 'PROLOGUE',
    title: 'Before Anything Had a Name',
    start: 0,
    end: 55,
    fogColor: '#020309',
    fogDensity: 0.0042,
    accentHex: '#e2bd72',
    ambientTone: 'void',
  },
  {
    id: 'chapter-1',
    index: 1,
    label: 'Chapter I',
    roman: 'CHAPTER I',
    title: 'A Little Planet, a Big Story',
    start: 55,
    end: 110,
    fogColor: '#050c1d',
    fogDensity: 0.0028,
    accentHex: '#f1b963',
    ambientTone: 'earth',
    pauseRangeSec: [2.0, 4.0],
  },
  {
    id: 'chapter-2',
    index: 2,
    label: 'Chapter II',
    roman: 'CHAPTER II',
    title: 'An Unusual Form of Existence',
    start: 110,
    end: 175,
    fogColor: '#070618',
    fogDensity: 0.0036,
    accentHex: '#e5c17b',
    ambientTone: 'constellation',
  },
  {
    id: 'chapter-3',
    index: 3,
    label: 'Chapter III',
    roman: 'CHAPTER III',
    title: 'The Invisible Gravity',
    start: 175,
    end: 225,
    fogColor: '#030510',
    fogDensity: 0.0032,
    accentHex: '#f0ca82',
    ambientTone: 'gravity',
  },
  {
    id: 'chapter-4',
    index: 4,
    label: 'Chapter IV',
    roman: 'CHAPTER IV',
    title: 'Two Halves of a Strange Equilibrium',
    start: 225,
    end: 285,
    fogColor: '#060516',
    fogDensity: 0.003,
    accentHex: '#d9c4f2',
    ambientTone: 'yinyang',
    pauseRangeSec: [2.0, 4.0],
  },
  {
    id: 'chapter-5',
    index: 5,
    label: 'Chapter V',
    roman: 'CHAPTER V',
    title: 'Even Stars Have Quiet Hours',
    start: 285,
    end: 335,
    fogColor: '#070c1a',
    fogDensity: 0.0048,
    accentHex: '#f0c584',
    ambientTone: 'quiet',
    pauseRangeSec: [2.0, 4.0],
  },
  {
    id: 'final-chapter',
    index: 6,
    label: 'Final Chapter',
    roman: 'FINAL CHAPTER',
    title: 'The Revelation',
    start: 335,
    end: FILM_DURATION,
    fogColor: '#020309',
    fogDensity: 0.0024,
    accentHex: '#f5d68c',
    ambientTone: 'revelation',
  },
];

export type RevealStage =
  | 'hidden'
  | 'converging'
  | 'silence'
  | 'burst'
  | 'title'
  | 'birthday'
  | 'coda'
  | 'postscript';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function getChapterAtTime(timeSec: number): ChapterDefinition {
  const clamped = clamp(timeSec, 0, FILM_DURATION);
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    const ch = CHAPTERS[i];
    if (ch && clamped >= ch.start) {
      return ch;
    }
  }
  return CHAPTERS[0]!;
}

export function getChapterPauseRange(
  chapterId: ChapterId,
): readonly [number, number] | undefined {
  return CHAPTERS.find((ch) => ch.id === chapterId)?.pauseRangeSec;
}

export function getChapterProgress(timeSec: number, chapter: ChapterDefinition): number {
  const duration = Math.max(0.001, chapter.end - chapter.start);
  return clamp((timeSec - chapter.start) / duration, 0, 1);
}

/**
 * Returns the continuous chapter blend weight [0..1] for smooth visual cross-fades
 * without hard cuts. Each chapter fades in over `fadeIn` seconds and out over `fadeOut`.
 */
export function getChapterWeight(
  timeSec: number,
  start: number,
  end: number,
  fadeIn = 4.5,
  fadeOut = 4.5,
): number {
  const inW = smoothstep(start - fadeIn * 0.5, start + fadeIn * 0.5, timeSec);
  const outW = 1 - smoothstep(end - fadeOut * 0.5, end + fadeOut * 0.5, timeSec);
  return clamp(inW * outW, 0, 1);
}

export function isTitleRevealed(timeSec: number): boolean {
  return timeSec >= TITLE_REVEAL_TIME;
}

export function getRevealStage(timeSec: number): RevealStage {
  if (timeSec < 335) return 'hidden';
  if (timeSec < SILENCE_START) return 'converging';
  if (timeSec < SILENCE_END) return 'silence';
  if (timeSec < TITLE_REVEAL_TIME) return 'burst';
  if (timeSec < BIRTHDAY_REVEAL_TIME) return 'title';
  if (timeSec < ORBITAL_CODA_TIME) return 'birthday';
  if (timeSec < POSTSCRIPT_REVEAL_TIME) return 'coda';
  return 'postscript';
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Computes Earth's accumulated orbital path length since 25 November 2002
 * using NASA's mean orbital speed (~107,000 km/h) over 24 sidereal years (2002 -> 2026).
 */
export function computeOrbitalKilometres(yearsElapsed: number): number {
  const HOURS_PER_YEAR = 365.25636 * 24;
  const MEAN_ORBITAL_SPEED_KMH = 107000;
  return Math.round(yearsElapsed * HOURS_PER_YEAR * MEAN_ORBITAL_SPEED_KMH);
}
