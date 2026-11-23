import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAPTERS,
  FILM_DURATION,
  SILENCE_START,
  TITLE_REVEAL_TIME,
  computeOrbitalKilometres,
  formatTimecode,
  getChapterAtTime,
  getChapterProgress,
  getChapterWeight,
  getRevealStage,
  isTitleRevealed,
} from './chapters';
import {
  ASTRONOMICAL_FACTS,
  SCREENPLAY_LINES,
  getActiveNarrationLine,
  getSpoilerSafeTranscript,
} from './screenplay';

test('chapters form a continuous gapless timeline from 0 to FILM_DURATION', () => {
  assert.equal(CHAPTERS[0].start, 0);
  assert.equal(CHAPTERS[CHAPTERS.length - 1].end, FILM_DURATION);
  for (let i = 1; i < CHAPTERS.length; i++) {
    assert.equal(CHAPTERS[i].start, CHAPTERS[i - 1].end);
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

test('reveal stage machine progresses cleanly through silence, burst, title, birthday, and postscript', () => {
  assert.equal(getRevealStage(10), 'hidden');
  assert.equal(getRevealStage(345), 'converging');
  assert.equal(getRevealStage(367), 'silence');
  assert.equal(getRevealStage(371), 'burst');
  assert.equal(getRevealStage(375), 'title');
  assert.equal(getRevealStage(382), 'birthday');
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

test('astronomical data aligns with 25 November 2002 -> 25 November 2026 (24 orbits, ~22.5B km)', () => {
  const km24 = computeOrbitalKilometres(24);
  assert.ok(km24 > 22_000_000_000 && km24 < 23_000_000_000, `Unexpected orbital km: ${km24}`);
  const moonFact = ASTRONOMICAL_FACTS.find((f) => f.id === 'moon');
  assert.ok(moonFact && moonFact.value.includes('72%'));
  const line = getActiveNarrationLine(375);
  assert.ok(line && line.text.includes('Twenty-four'));
});
