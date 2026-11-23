import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULED_STAR_BIRTHS,
  evaluateBurstEnvelope,
  evaluateFusionColor,
  findTriggeredStarBirths,
} from './nucleosynthesis';

test('evaluateFusionColor shifts smoothly from incandescent core to blue CNO fusion to forged gold', () => {
  const core = evaluateFusionColor(0.0, 0.2);
  const cnoBlue = evaluateFusionColor(0.24, 0.1);
  const forgedGold = evaluateFusionColor(0.62, 0.5);
  const remnant = evaluateFusionColor(0.98, 0.2);

  assert.ok(core.r > 0.95 && core.g > 0.9 && core.b > 0.85, 'core flash should be incandescent white');
  assert.ok(cnoBlue.b > cnoBlue.r, 'early CNO wave should be blue-dominant');
  assert.ok(forgedGold.r > forgedGold.b * 2, 'mid-late forged elements should shift warm amber-gold');
  assert.ok(remnant.b > remnant.g, 'cooling remnant should soften toward twilight violet');
});

test('evaluateBurstEnvelope expands monotonically and peaks light flash before fading cleanly', () => {
  const e0 = evaluateBurstEnvelope(0.0);
  const ePeak = evaluateBurstEnvelope(0.08);
  const eMid = evaluateBurstEnvelope(0.5);
  const eEnd = evaluateBurstEnvelope(1.0);

  assert.equal(e0.expansion, 0);
  assert.ok(ePeak.flashAlpha > eMid.flashAlpha, 'light burst flash should peak early');
  assert.ok(eMid.expansion > ePeak.expansion && eEnd.expansion === 1, 'expansion must be monotonic');
  assert.equal(eEnd.flashAlpha, 0);
  assert.equal(eEnd.particleAlpha, 0);
});

test('findTriggeredStarBirths detects both continuous playback crossings and direct timeline seeks', () => {
  assert.ok(SCHEDULED_STAR_BIRTHS.length >= 6);

  // Continuous playback crossing Hyderabad birth star (82.0s)
  const continuous = findTriggeredStarBirths(81.8, 82.2);
  assert.equal(continuous.length, 1);
  assert.equal(continuous[0].event.id, 'hyderabad-birth-star');

  // Direct seek right after birth star ignition still spawns burst with elapsed initialAge
  const seekHit = findTriggeredStarBirths(10.0, 83.2);
  assert.equal(seekHit.length, 1);
  assert.equal(seekHit[0].event.id, 'hyderabad-birth-star');
  assert.ok(Math.abs(seekHit[0].initialAge - 1.2) < 0.01);
});
