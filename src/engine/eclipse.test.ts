import assert from 'node:assert/strict';
import test from 'node:test';
import { computePlanetaryEclipse } from './eclipse.ts';

test('sunward points receive full sunlight and zero eclipse shadow', () => {
  const res = computePlanetaryEclipse([12, 0, 0], [0, 0, 0], 8.2, [1, 0, 0]);
  assert.equal(res.sunFactor, 1);
  assert.equal(res.copperRim, 0);
  assert.equal(res.earthshine, 0);
});

test('points deep inside Earth umbra receive zero direct sun and nonzero Earthshine', () => {
  const res = computePlanetaryEclipse([-14, 0, 0], [0, 0, 0], 8.2, [1, 0, 0]);
  assert.equal(res.sunFactor, 0);
  assert.ok(res.earthshine > 0.3);
  assert.equal(res.copperRim, 0);
});

test('points along Earth penumbra rim receive partial sun and warm copper atmospheric refraction', () => {
  const res = computePlanetaryEclipse([-14, 8.2, 0], [0, 0, 0], 8.2, [1, 0, 0]);
  assert.ok(res.sunFactor > 0.1 && res.sunFactor < 0.9);
  assert.ok(res.copperRim > 0.4);
});

test('points well outside the penumbra cone return to full sunlight', () => {
  const res = computePlanetaryEclipse([-14, 15, 0], [0, 0, 0], 8.2, [1, 0, 0]);
  assert.equal(res.sunFactor, 1);
  assert.equal(res.copperRim, 0);
  assert.equal(res.earthshine, 0);
});
