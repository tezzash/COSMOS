import { test } from 'vitest';
import assert from 'node:assert/strict';
import { computeCosmicDriftState } from './cosmicDrift';

test('Cosmic Drift dynamically shifts opacity across filmTime chapters and dips during Final Silence', () => {
  const early = computeCosmicDriftState(2.0, 2.0, true, false);
  const deepSpace = computeCosmicDriftState(160.0, 160.0, true, false);
  const quietHours = computeCosmicDriftState(312.0, 312.0, true, false);
  const silence = computeCosmicDriftState(367.5, 367.5, true, false);
  const reveal = computeCosmicDriftState(382.0, 382.0, true, false);

  assert.ok(deepSpace.opacity > early.opacity, 'deep space opacity should rise after Big Bang');
  assert.ok(quietHours.opacity < deepSpace.opacity, 'Quiet Hours should soften background drift');
  assert.ok(silence.opacity < 0.08, `Final Silence must drop drift near zero (got ${silence.opacity})`);
  assert.ok(reveal.opacity > silence.opacity * 4, 'post-reveal should bloom cleanly above silence');
  assert.ok(reveal.opacity <= 0.72, 'opacity stays subtle and never washes out the dark void');
});

test('Cosmic Drift parallax scroll advances continuously and calms under reducedMotion', () => {
  const s1 = computeCosmicDriftState(40.0, 40.0, true, false);
  const s2 = computeCosmicDriftState(55.0, 55.0, true, false);
  const calm = computeCosmicDriftState(55.0, 55.0, true, true);

  assert.ok(s2.scrollX > s1.scrollX, 'horizontal cosmic drift should advance over time');
  assert.ok(s2.scrollZ > s1.scrollZ, 'depth cosmic drift should advance over time');
  assert.ok(
    Math.abs(calm.scrollX) < Math.abs(s2.scrollX) * 0.35,
    'reducedMotion should strongly calm parallax scrolling speed',
  );
  assert.ok(Number.isFinite(s2.warmth) && s2.warmth >= 0 && s2.warmth <= 1);
});
