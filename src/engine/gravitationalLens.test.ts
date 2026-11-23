import { test } from 'vitest';
import assert from 'node:assert/strict';
import { CHAPTERS } from '../data/chapters';
import { computeChapterTransitionLens } from './gravitationalLens';

test('Gravitational Lens peaks cleanly at every chapter boundary and rests at zero mid-chapter', () => {
  const midCh1 = computeChapterTransitionLens(82.0);
  const midCh3 = computeChapterTransitionLens(200.0);
  assert.equal(midCh1.strength, 0);
  assert.equal(midCh1.transitionIndex, 0);
  assert.equal(midCh3.strength, 0);

  for (let i = 1; i < CHAPTERS.length; i++) {
    const chapter = CHAPTERS[i];
    assert.ok(chapter);
    const boundary = chapter.start;
    const atSeam = computeChapterTransitionLens(boundary);
    const beforeSeam = computeChapterTransitionLens(boundary - 2.0);
    const afterSeam = computeChapterTransitionLens(boundary + 2.0);

    assert.equal(atSeam.transitionIndex, i);
    assert.ok(atSeam.strength > 0.98, `Expected peak warp at chapter ${i} boundary`);
    assert.ok(beforeSeam.strength > 0.05 && beforeSeam.strength < atSeam.strength);
    assert.ok(afterSeam.strength > 0.05 && afterSeam.strength < atSeam.strength);
    assert.notEqual(
      beforeSeam.centerX,
      afterSeam.centerX,
      'Massive body center should transit across the optical axis',
    );
  }
});

test('Gravitational Lens responds smoothly to manual chapter-seek warp pulses', () => {
  const idle = computeChapterTransitionLens(140.0, 0);
  const pulsed = computeChapterTransitionLens(140.0, 0.9);
  assert.equal(idle.strength, 0);
  assert.ok(pulsed.strength > 0.7 && pulsed.strength <= 1.0);
  assert.ok(pulsed.dispersion > 0);
  assert.ok(pulsed.ringGlint > 0);
});
