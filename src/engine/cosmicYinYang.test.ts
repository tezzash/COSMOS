import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  classifyYinYangPoint,
  computeYinYangFlowTangent,
  generateCosmicYinYangEntities,
} from './cosmicYinYang';

test('classifyYinYangPoint cleanly partitions Yang, Yin, both contrasting seeds, boundary, and outside', () => {
  const R = 15;
  assert.equal(classifyYinYangPoint(0, R * 0.5, R), 'yin-seed-in-yang');
  assert.equal(classifyYinYangPoint(0, -R * 0.5, R), 'yang-seed-in-yin');
  assert.equal(classifyYinYangPoint(R * 0.55, R * 0.2, R), 'yang');
  assert.equal(classifyYinYangPoint(-R * 0.55, -R * 0.2, R), 'yin');
  assert.equal(classifyYinYangPoint(R * 0.99, 0, R), 'boundary');
  assert.equal(classifyYinYangPoint(R * 1.2, 0, R), 'outside');
});

test('computeYinYangFlowTangent drives opposing counter-rotation for Yang (+1) and Yin (-1)', () => {
  const R = 15;
  // Compare mirror points in Yang head and Yin head: tangential cross-product signs must be opposite
  const [yx, yy] = computeYinYangFlowTangent(3, R * 0.5, R, 1);
  const [nx, ny] = computeYinYangFlowTangent(3, -R * 0.5, R, -1);

  assert.ok(Math.abs(Math.hypot(yx, yy) - 1) < 1e-4);
  assert.ok(Math.abs(Math.hypot(nx, ny) - 1) < 1e-4);
  // At (3, +R/2), Yang clockwise points downward (yy < 0); at (3, -R/2), Yin counter-clockwise points upward (ny > 0)
  assert.ok(yy < -0.5, `Expected Yang clockwise tangent yy < -0.5, got ${yy}`);
  assert.ok(ny > 0.5, `Expected Yin counter-clockwise tangent ny > 0.5, got ${ny}`);
});

test('generateCosmicYinYangEntities builds balanced cosmic-only Yang, Yin, seed galaxies, boundary stream, and nebulae', () => {
  const result = generateCosmicYinYangEntities({
    starCount: 3000,
    nebulaCount: 160,
    seedGalaxyStars: 300,
    seedGalaxyNebulae: 16,
    boundaryStarCount: 400,
    embeddedGalaxyCount: 8,
    seed: 20021125,
  });

  assert.ok(result.stats.totalStars >= 5000);
  assert.ok(result.stats.totalNebulae >= 180);
  assert.equal(result.stats.yangSeedStarCount, 300);
  assert.equal(result.stats.yinSeedStarCount, 300);
  assert.equal(result.stats.boundaryStarCount, 400);
  assert.ok(
    result.stats.symmetryBalanceRatio > 0.78,
    `Expected balanced Yang/Yin silhouette counts, got ${result.stats.symmetryBalanceRatio}`,
  );
  // Yang golden-white stars must be visibly more luminous than deep violet-crimson Yin stars
  assert.ok(
    result.stats.yangMeanLuminance > result.stats.yinMeanLuminance * 1.45,
    `Expected luminous golden Yang (${result.stats.yangMeanLuminance}) > deep violet/crimson Yin (${result.stats.yinMeanLuminance})`,
  );

  // Every coordinate must be finite
  for (let i = 0; i < result.stars.targetPositions.length; i++) {
    assert.ok(Number.isFinite(result.stars.targetPositions[i]));
  }
  for (let i = 0; i < result.nebulae.targetPositions.length; i++) {
    assert.ok(Number.isFinite(result.nebulae.targetPositions[i]));
  }
});
