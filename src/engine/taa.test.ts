import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TAA_JITTER_SEQUENCE_LENGTH,
  computeTaaBlendFactor,
  computeTaaJitter,
  halton,
} from './taa';

test('halton sequence produces exact low-discrepancy values in bases 2 and 3', () => {
  assert.equal(halton(1, 2), 0.5);
  assert.equal(halton(2, 2), 0.25);
  assert.equal(halton(3, 2), 0.75);
  assert.equal(halton(4, 2), 0.125);

  assert.ok(Math.abs(halton(1, 3) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(halton(2, 3) - 2 / 3) < 1e-9);
  assert.ok(Math.abs(halton(3, 3) - 1 / 9) < 1e-9);
});

test('computeTaaJitter stays bounded within +-0.5 sub-pixels and repeats cleanly over 16 frames', () => {
  const seen = new Set<string>();
  const width = 1440;
  const height = 900;

  for (let i = 0; i < TAA_JITTER_SEQUENCE_LENGTH; i++) {
    const j = computeTaaJitter(i, width, height);
    assert.ok(j.pixelX >= -0.5 && j.pixelX <= 0.5);
    assert.ok(j.pixelY >= -0.5 && j.pixelY <= 0.5);
    assert.ok(Math.abs(j.ndcX) <= 1 / width + 1e-9);
    assert.ok(Math.abs(j.ndcY) <= 1 / height + 1e-9);
    seen.add(`${j.pixelX.toFixed(6)},${j.pixelY.toFixed(6)}`);
  }

  // All 16 samples in the cycle are unique sub-pixel positions
  assert.equal(seen.size, TAA_JITTER_SEQUENCE_LENGTH);

  // Frame 16 wraps identically to frame 0
  const f0 = computeTaaJitter(0, width, height);
  const f16 = computeTaaJitter(TAA_JITTER_SEQUENCE_LENGTH, width, height);
  assert.deepEqual(f0, f16);
});

test('computeTaaBlendFactor resets to zero on cuts and adapts smoothly to camera velocity', () => {
  assert.equal(computeTaaBlendFactor(0, false, true), 0);
  assert.equal(computeTaaBlendFactor(25, true, true), 0);

  const slowGlide = computeTaaBlendFactor(0.4, false, false);
  const fastDive = computeTaaBlendFactor(16.0, false, false);
  const calmMode = computeTaaBlendFactor(0.4, true, false);

  assert.ok(slowGlide >= 0.8 && slowGlide <= 0.86);
  assert.ok(fastDive < slowGlide && fastDive >= 0.52);
  assert.ok(calmMode > slowGlide && calmMode <= 0.88);
});
