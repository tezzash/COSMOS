import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCinemaPresentation } from './cinemaPresentation.ts';

test('cinema presentation mode is inactive when disabled', () => {
  const state = computeCinemaPresentation(20, false, false);
  assert.equal(state.letterboxBarPct, 0);
  assert.equal(state.isImaxExpanded, true);
  assert.equal(state.cadenceFps, 0);
});

test('cinema presentation frames 2.39:1 normally and opens smoothly to full-bleed IMAX on Earth and Reveal', () => {
  const prologue = computeCinemaPresentation(20, true, false);
  const earth = computeCinemaPresentation(78, true, false);
  const quiet = computeCinemaPresentation(310, true, false);
  const reveal = computeCinemaPresentation(380, true, false);

  assert.ok(prologue.letterboxBarPct > 7.5 && !prologue.isImaxExpanded);
  assert.ok(earth.letterboxBarPct < 0.2 && earth.isImaxExpanded);
  assert.ok(quiet.letterboxBarPct > 7.5 && !quiet.isImaxExpanded);
  assert.ok(reveal.letterboxBarPct < 0.2 && reveal.isImaxExpanded);
  assert.equal(prologue.cadenceFps, 24);
});

test('optical focal rack peaks smoothly at chapter transitions and calms in reduced motion', () => {
  const boundary = computeCinemaPresentation(110, true, false);
  const midChapter = computeCinemaPresentation(145, true, false);
  const calmBoundary = computeCinemaPresentation(110, true, true);

  assert.ok(boundary.focalRackStrength > 0.85);
  assert.equal(midChapter.focalRackStrength, 0);
  assert.ok(calmBoundary.focalRackStrength < boundary.focalRackStrength * 0.4);
  assert.equal(calmBoundary.cadenceFps, 0);
});
