import { test } from 'vitest';
import assert from 'node:assert/strict';
import { getActiveNarrationLine } from '../data/screenplay';
import {
  computeInteractiveFieldInfluence,
  computeNarrationCosmicReactivity,
  generateProceduralNebulaLayers,
  generateProceduralParticleFieldData,
} from './dynamicNebulaField';

test('narration reactivity intensifies during cosmic creation and quiets during Chapter V rest', () => {
  const creationTime = 15.2; // Prologue p-2: "There was a beginning. Matter. Energy. Gravity. Light."
  const creationLine = getActiveNarrationLine(creationTime);
  assert.ok(creationLine, 'expected active creation narration line');
  const creation = computeNarrationCosmicReactivity(creationTime, creationLine);

  const restTime = 309.5; // Chapter V c5-3: quiet reflection
  const restLine = getActiveNarrationLine(restTime);
  assert.ok(restLine, 'expected active Chapter V rest narration line');
  const rest = computeNarrationCosmicReactivity(restTime, restLine);

  assert.equal(creation.mode, 'creation');
  assert.equal(rest.mode, 'rest');
  assert.ok(
    creation.intensity > 1.05 && rest.intensity < 0.5,
    `expected creation (${creation.intensity}) >> rest (${rest.intensity})`,
  );
  assert.ok(
    creation.turbulence > rest.turbulence * 2.5,
    `expected creation turbulence (${creation.turbulence}) >> rest (${rest.turbulence})`,
  );
  assert.ok(
    creation.nebulaDensity > rest.nebulaDensity * 1.8,
    `expected denser procedural nebulae during creation (${creation.nebulaDensity}) than rest (${rest.nebulaDensity})`,
  );
});

test('narration reactivity hushes to near-stillness in Sacred Silence and blossoms at Final Revelation', () => {
  const silence = computeNarrationCosmicReactivity(367.5, null);
  assert.equal(silence.mode, 'silence');
  assert.ok(silence.intensity <= 0.08, `expected silence hush, got ${silence.intensity}`);
  assert.ok(silence.flowSpeed <= 0.2);

  const revealTime = 374.5; // Final Chapter f-6: "Happy Birthday, Isha."
  const revealLine = getActiveNarrationLine(revealTime);
  const reveal = computeNarrationCosmicReactivity(revealTime, revealLine);
  assert.equal(reveal.mode, 'revelation');
  assert.ok(reveal.intensity > 1.05, `expected radiant revelation intensity, got ${reveal.intensity}`);
  assert.ok(reveal.creationPulse > 0.5);
});

test('user interaction shifts particle flow and color subtly while respecting reducedMotion', () => {
  const idle = computeInteractiveFieldInfluence(0, 0, 0, 0, 0, false);
  assert.equal(idle.swirlStrength, 0);
  assert.equal(idle.colorShift, 0);
  assert.equal(idle.luminanceBoost, 0);

  const leftGlide = computeInteractiveFieldInfluence(-0.8, -0.2, -1.2, 0.4, 0, false);
  const rightGlide = computeInteractiveFieldInfluence(0.8, 0.2, 1.2, -0.4, 0.6, false);

  assert.ok(leftGlide.colorShift < -0.4, 'leftward pointer should shift palette cool');
  assert.ok(rightGlide.colorShift > 0.4, 'rightward pointer should shift palette warm');
  assert.ok(rightGlide.swirlStrength > 0 && rightGlide.swirlStrength <= 0.65);
  assert.ok(rightGlide.luminanceBoost > leftGlide.luminanceBoost);

  const reduced = computeInteractiveFieldInfluence(0.8, 0.2, 1.2, -0.4, 0.6, true);
  assert.ok(
    reduced.swirlStrength < rightGlide.swirlStrength * 0.4,
    'reducedMotion must attenuate physical particle flow displacement',
  );
  assert.equal(
    reduced.colorShift,
    rightGlide.colorShift,
    'reducedMotion preserves subtle non-motion color harmony',
  );
});

test('procedural nebula layers and particle field generation are deterministic and well-formed', () => {
  const layersA = generateProceduralNebulaLayers(25112002, 8);
  const layersB = generateProceduralNebulaLayers(25112002, 8);
  assert.equal(layersA.length, 8);
  assert.deepEqual(layersA, layersB);
  for (const layer of layersA) {
    assert.ok(Number.isFinite(layer.x) && Number.isFinite(layer.y) && Number.isFinite(layer.z));
    assert.ok(layer.scaleX > 40 && layer.scaleY > 25);
    assert.ok(layer.baseOpacity > 0 && layer.baseOpacity <= 0.5);
  }

  const fieldA = generateProceduralParticleFieldData(20021125, 512);
  const fieldB = generateProceduralParticleFieldData(20021125, 512);
  assert.equal(fieldA.count, 512);
  assert.equal(fieldA.positions.length, 512 * 3);
  assert.deepEqual(Array.from(fieldA.positions.slice(0, 15)), Array.from(fieldB.positions.slice(0, 15)));
  for (let i = 0; i < fieldA.scales.length; i++) {
    const s = fieldA.scales[i];
    assert.ok(s !== undefined && Number.isFinite(s) && s > 0);
  }
});
