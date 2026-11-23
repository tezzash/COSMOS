import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  DEFAULT_HERO_GALAXY_PARAMS,
  GALAXY_COLOR_PALETTES,
  applyColorPreset,
  computeGalaxyStats,
  generateGalaxyBuffers,
  sanitizeGalaxyParams,
} from './proceduralGalaxy';

test('procedural galaxy generator produces deterministic finite star and nebula buffers', () => {
  const a = generateGalaxyBuffers(DEFAULT_HERO_GALAXY_PARAMS, 1200, 80);
  const b = generateGalaxyBuffers(DEFAULT_HERO_GALAXY_PARAMS, 1200, 80);

  assert.equal(a.starCount, 1200);
  assert.equal(a.nebulaCount, b.nebulaCount);
  assert.ok(a.nebulaCount >= 40);
  assert.deepEqual(Array.from(a.starPositions.slice(0, 30)), Array.from(b.starPositions.slice(0, 30)));

  for (let i = 0; i < a.starPositions.length; i++) {
    assert.ok(Number.isFinite(a.starPositions[i]), `star position ${i} must be finite`);
  }
  for (let i = 0; i < a.nebulaPositions.length; i++) {
    assert.ok(Number.isFinite(a.nebulaPositions[i]), `nebula position ${i} must be finite`);
  }
});

test('spiral galaxy exhibits strong arm harmonic clustering while elliptical galaxy is isotropic and 3D-thick', () => {
  const spiralParams = sanitizeGalaxyParams({
    ...DEFAULT_HERO_GALAXY_PARAMS,
    type: 'spiral',
    arms: 3,
    armSpread: 0.16,
    seed: 101,
  });
  const ellipticalParams = sanitizeGalaxyParams({
    ...DEFAULT_HERO_GALAXY_PARAMS,
    type: 'elliptical',
    ellipticity: 0.35,
    seed: 101,
  });

  const spiralBuf = generateGalaxyBuffers(spiralParams, 2400, 90);
  const ellipticalBuf = generateGalaxyBuffers(ellipticalParams, 2400, 90);

  const spiralStats = computeGalaxyStats(spiralBuf, spiralParams);
  const ellipticalStats = computeGalaxyStats(ellipticalBuf, ellipticalParams);

  assert.ok(
    spiralStats.armHarmonicStrength > 0.32,
    `Expected strong spiral arm clustering, got ${spiralStats.armHarmonicStrength}`,
  );
  assert.ok(
    ellipticalStats.armHarmonicStrength < 0.08,
    `Expected isotropic elliptical distribution, got ${ellipticalStats.armHarmonicStrength}`,
  );
  assert.ok(
    ellipticalStats.verticalThicknessRatio > spiralStats.verticalThicknessRatio * 3.0,
    `Expected elliptical vertical thickness (${ellipticalStats.verticalThicknessRatio}) >> spiral (${spiralStats.verticalThicknessRatio})`,
  );
});

test('barred-spiral galaxy forms an elongated central stellar bar along local X-axis', () => {
  const barredParams = sanitizeGalaxyParams({
    ...DEFAULT_HERO_GALAXY_PARAMS,
    type: 'barred-spiral',
    arms: 2,
    coreSize: 0.28,
    seed: 777,
  });
  const spiralParams = sanitizeGalaxyParams({
    ...DEFAULT_HERO_GALAXY_PARAMS,
    type: 'spiral',
    arms: 2,
    coreSize: 0.28,
    seed: 777,
  });

  const barredStats = computeGalaxyStats(generateGalaxyBuffers(barredParams, 2200, 80), barredParams);
  const spiralStats = computeGalaxyStats(generateGalaxyBuffers(spiralParams, 2200, 80), spiralParams);

  assert.ok(
    barredStats.innerBarAspectRatio > 1.45,
    `Expected inner bar X/Z aspect > 1.45, got ${barredStats.innerBarAspectRatio}`,
  );
  assert.ok(
    barredStats.innerBarAspectRatio > spiralStats.innerBarAspectRatio * 1.3,
    `Expected barred-spiral inner elongation > standard spiral`,
  );
});

test('size, starDensity, starDistribution, and nebulaIntensity parameters measurably control galaxy output', () => {
  const smallParams = sanitizeGalaxyParams({ ...DEFAULT_HERO_GALAXY_PARAMS, size: 16 });
  const largeParams = sanitizeGalaxyParams({ ...DEFAULT_HERO_GALAXY_PARAMS, size: 48 });
  const smallStats = computeGalaxyStats(generateGalaxyBuffers(smallParams, 1000, 60), smallParams);
  const largeStats = computeGalaxyStats(generateGalaxyBuffers(largeParams, 1000, 60), largeParams);
  assert.ok(largeStats.meanRadius > smallStats.meanRadius * 2.5);

  const sparseBuf = generateGalaxyBuffers({ ...DEFAULT_HERO_GALAXY_PARAMS, starDensity: 0.4 }, 1000, 60);
  const denseBuf = generateGalaxyBuffers({ ...DEFAULT_HERO_GALAXY_PARAMS, starDensity: 1.5 }, 1000, 60);
  assert.ok(denseBuf.starCount > sparseBuf.starCount * 3);

  const diffuseParams = sanitizeGalaxyParams({ ...DEFAULT_HERO_GALAXY_PARAMS, starDistribution: 0.7 });
  const concentratedParams = sanitizeGalaxyParams({ ...DEFAULT_HERO_GALAXY_PARAMS, starDistribution: 2.5 });
  const diffuseStats = computeGalaxyStats(generateGalaxyBuffers(diffuseParams, 1800, 60), diffuseParams);
  const concentratedStats = computeGalaxyStats(
    generateGalaxyBuffers(concentratedParams, 1800, 60),
    concentratedParams,
  );
  assert.ok(
    concentratedStats.coreFraction > diffuseStats.coreFraction + 0.18,
    `Higher starDistribution should concentrate stars toward the core (${concentratedStats.coreFraction} vs ${diffuseStats.coreFraction})`,
  );

  const noNebulaBuf = generateGalaxyBuffers({ ...DEFAULT_HERO_GALAXY_PARAMS, nebulaIntensity: 0 }, 800, 80);
  assert.equal(noNebulaBuf.nebulaCount, 0);
});

test('color presets shift star and nebula RGB channels cleanly while preserving cosmic cohesion', () => {
  const azureParams = applyColorPreset(DEFAULT_HERO_GALAXY_PARAMS, 'celestial-azure');
  const goldParams = applyColorPreset(DEFAULT_HERO_GALAXY_PARAMS, 'ancient-gold');

  assert.equal(azureParams.armColor, GALAXY_COLOR_PALETTES['celestial-azure'].armColor);
  assert.equal(goldParams.armColor, GALAXY_COLOR_PALETTES['ancient-gold'].armColor);

  const azureBuf = generateGalaxyBuffers(azureParams, 1000, 60);
  const goldBuf = generateGalaxyBuffers(goldParams, 1000, 60);

  let azureBlue = 0;
  let goldRed = 0;
  let azureRed = 0;
  let goldBlue = 0;
  for (let i = 0; i < azureBuf.starCount; i++) {
    azureRed += azureBuf.starColors[i * 3] ?? 0;
    azureBlue += azureBuf.starColors[i * 3 + 2] ?? 0;
    goldRed += goldBuf.starColors[i * 3] ?? 0;
    goldBlue += goldBuf.starColors[i * 3 + 2] ?? 0;
  }

  assert.ok(azureBlue / azureBuf.starCount > goldBlue / goldBuf.starCount + 0.12);
  assert.ok(goldRed / goldBuf.starCount > azureRed / azureBuf.starCount + 0.08);
});
