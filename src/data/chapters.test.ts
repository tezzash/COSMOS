import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  BIRTHDAY_REVEAL_TIME,
  CHAPTERS,
  FILM_DURATION,
  ORBITAL_CODA_TIME,
  SILENCE_END,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  computeOrbitalKilometres,
  formatTimecode,
  getChapterAtTime,
  getChapterPauseRange,
  getChapterProgress,
  getChapterWeight,
  getRevealStage,
  isTitleRevealed,
} from './chapters';
import {
  ASTRONOMICAL_FACTS,
  SCREENPLAY_LINES,
  analyzeScreenplayPacing,
  getActiveNarrationLine,
  getFinalSequencePhase,
  getSpoilerSafeTranscript,
} from './screenplay';

test('chapters form a continuous gapless timeline from 0 to FILM_DURATION', () => {
  assert.equal(CHAPTERS[0]?.start, 0);
  assert.equal(CHAPTERS[CHAPTERS.length - 1]?.end, FILM_DURATION);
  for (let i = 1; i < CHAPTERS.length; i++) {
    assert.equal(CHAPTERS[i]?.start, CHAPTERS[i - 1]?.end);
  }
});

test('title secrecy holds strictly before TITLE_REVEAL_TIME', () => {
  assert.equal(isTitleRevealed(0), false);
  assert.equal(isTitleRevealed(120), false);
  assert.equal(isTitleRevealed(SILENCE_START), false);
  assert.equal(isTitleRevealed(TITLE_REVEAL_TIME - 0.1), false);
  assert.equal(isTitleRevealed(TITLE_REVEAL_TIME), true);

  // No chapter title or label exposes the hidden title
  for (const ch of CHAPTERS) {
    assert.equal(/isha|birthday/i.test(ch.title), false);
    assert.equal(/isha|birthday/i.test(ch.label), false);
  }

  // No narration line before TITLE_REVEAL_TIME mentions the name or birthday
  for (const line of SCREENPLAY_LINES) {
    if (line.start < TITLE_REVEAL_TIME) {
      assert.equal(/isha|birthday/i.test(line.text), false, `Early spoiler in line ${line.id}`);
    }
  }
});

test('spoiler-safe transcript masks reveal lines until unlocked', () => {
  const lockedView = getSpoilerSafeTranscript(120, false);
  const revealLines = lockedView.filter((l) => l.containsReveal);
  assert.ok(revealLines.length >= 3);
  assert.ok(revealLines.every((l) => l.locked === true));

  const unlockedView = getSpoilerSafeTranscript(TITLE_REVEAL_TIME + 1, false);
  assert.ok(unlockedView.every((l) => l.locked === false));
});

test('reveal stage machine progresses cleanly through silence, burst, immediate birthday reveal at 371.5s, coda, and postscript', () => {
  assert.equal(BIRTHDAY_REVEAL_TIME, TITLE_REVEAL_TIME);
  assert.ok(ORBITAL_CODA_TIME > BIRTHDAY_REVEAL_TIME);
  assert.equal(getRevealStage(10), 'hidden');
  assert.equal(getRevealStage(345), 'converging');
  assert.equal(getRevealStage(367), 'silence');
  assert.equal(getRevealStage(371), 'burst');
  assert.equal(getRevealStage(371.5), 'birthday');
  assert.equal(getRevealStage(375), 'birthday');
  assert.equal(getRevealStage(380), 'coda');
  assert.equal(getRevealStage(395), 'postscript');
});

test('chapter lookup, progress, weights, and timecodes are bounded and accurate', () => {
  const ch1 = getChapterAtTime(75);
  assert.equal(ch1.id, 'chapter-1');
  assert.ok(getChapterProgress(75, ch1) > 0 && getChapterProgress(75, ch1) < 1);
  assert.equal(getChapterWeight(75, ch1.start, ch1.end), 1);
  assert.equal(getChapterWeight(0, ch1.start, ch1.end), 0);
  assert.equal(formatTimecode(0), '00:00');
  assert.equal(formatTimecode(65), '01:05');
  assert.equal(formatTimecode(405), '06:45');
});

test('screenplay enforces 2-4s breathing pauses in Chapters I, IV, and V and ~15% trimmed cinematic pacing', () => {
  const pacing = analyzeScreenplayPacing(SCREENPLAY_LINES);

  // Every line must be strictly non-overlapping and stay within FILM_DURATION and outside Sacred Silence
  for (let i = 0; i < SCREENPLAY_LINES.length; i++) {
    const line = SCREENPLAY_LINES[i]!;
    assert.ok(line.end > line.start, `Line ${line.id} must have positive duration`);
    assert.ok(line.end <= FILM_DURATION, `Line ${line.id} exceeds FILM_DURATION`);
    const overlapsSilence = line.start < SILENCE_END && line.end > SILENCE_START;
    assert.equal(overlapsSilence, false, `Line ${line.id} must not overlap Sacred Silence`);
    if (i > 0) {
      const prev = SCREENPLAY_LINES[i - 1]!;
      assert.ok(
        line.start > prev.end,
        `Line ${line.id} (${line.start}s) overlaps previous line ${prev.id} (${prev.end}s)`,
      );
    }
  }

  // Chapters I, IV, and V declare and enforce 2.0s..4.0s pauses between beats
  for (const cid of ['chapter-1', 'chapter-4', 'chapter-5'] as const) {
    assert.deepEqual(getChapterPauseRange(cid), [2.0, 4.0]);
    const stats = pacing.byChapter[cid];
    assert.ok(stats.gapsSec.length >= 4, `Expected multiple inter-cue gaps in ${cid}`);
    for (const gap of stats.gapsSec) {
      assert.ok(
        gap >= 2.0 && gap <= 4.0,
        `Expected 2-4s pause in ${cid}, got ${gap}s (all gaps: ${stats.gapsSec.join(', ')})`,
      );
    }
  }

  // Overall trimmed narration length (~15% trimmed from prior 592 words / 284.3s -> <= 515 words / <= 248s)
  assert.ok(
    pacing.totalWords <= 515 && pacing.totalWords >= 440,
    `Expected ~15% trimmed word count (~495-510), got ${pacing.totalWords}`,
  );
  assert.ok(
    pacing.totalSpokenSec <= 248 && pacing.totalSpokenSec >= 210,
    `Expected ~15% trimmed spoken duration (~238-245s), got ${pacing.totalSpokenSec}s`,
  );
  assert.ok(
    pacing.averageWpm >= 115 && pacing.averageWpm <= 145,
    `Expected unhurried cinema WPM (115-145), got ${pacing.averageWpm}`,
  );
});

test('final reveal swaps order: Happy Birthday Isha appears immediately at 371.5s, followed by orbital statistics coda', () => {
  const km24 = computeOrbitalKilometres(24);
  assert.ok(km24 > 22_000_000_000 && km24 < 23_000_000_000, `Unexpected orbital km: ${km24}`);
  const moonFact = ASTRONOMICAL_FACTS.find((f) => f.id === 'moon');
  assert.ok(moonFact && moonFact.value.includes('72%'));

  const birthdayLine = getActiveNarrationLine(TITLE_REVEAL_TIME);
  assert.ok(birthdayLine, 'Expected active birthday line immediately at 371.5s reveal');
  assert.equal(birthdayLine.id, 'f-6');
  assert.equal(birthdayLine.start, TITLE_REVEAL_TIME);
  assert.equal(birthdayLine.sequenceRole, 'reveal-greeting');
  assert.ok(
    birthdayLine.text.includes('Happy Birthday, Isha'),
    `Expected Happy Birthday, Isha immediately at 371.5s, got: ${birthdayLine.text}`,
  );

  const statsCodaLine = getActiveNarrationLine(380.5);
  assert.ok(statsCodaLine, 'Expected orbital statistics coda line after birthday line');
  assert.equal(statsCodaLine.id, 'f-7');
  assert.equal(statsCodaLine.sequenceRole, 'post-reveal-coda');
  assert.ok(
    statsCodaLine.text.includes('Twenty-four') && statsCodaLine.text.includes('22.5 billion'),
    `Expected orbital statistics coda second, got: ${statsCodaLine.text}`,
  );
  assert.ok(birthdayLine.end < statsCodaLine.start);

  assert.equal(getFinalSequencePhase(350), 'pre-reveal');
  assert.equal(getFinalSequencePhase(367), 'silence');
  assert.equal(getFinalSequencePhase(371.5), 'birthday-reveal');
  assert.equal(getFinalSequencePhase(380.5), 'statistical-coda');
  assert.equal(getFinalSequencePhase(392), 'closing-blessing');
});
