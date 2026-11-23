import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HapticsService,
  buildHapticPattern,
  isMobileHapticDevice,
} from './hapticsService';

test('isMobileHapticDevice enables only for touch/mobile environments with Vibration API', () => {
  const noop = () => true;
  assert.equal(isMobileHapticDevice({ vibrate: noop, maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), true);
  assert.equal(isMobileHapticDevice({ vibrate: noop, maxTouchPoints: 0, coarsePointer: true }), true);
  assert.equal(isMobileHapticDevice({ vibrate: noop, maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' }), false);
  assert.equal(isMobileHapticDevice({ maxTouchPoints: 5, userAgent: 'Android' }), false);
});

test('buildHapticPattern keeps every pulse light and short (8ms..36ms)', () => {
  const burst = buildHapticPattern('nucleosynthesis-burst', 1.0);
  assert.ok(Array.isArray(burst) && burst.length === 3);
  assert.ok(burst[0] >= 8 && burst[0] <= 24);
  assert.ok(burst[2] >= 10 && burst[2] <= 28);

  const tap = buildHapticPattern('network-impulse', 1.0);
  assert.equal(typeof tap, 'number');
  assert.ok((tap as number) >= 8 && (tap as number) <= 18);
});

test('HapticsService triggers light pulses, respects cooldown and mute gating', () => {
  const calls: Array<number | number[]> = [];
  let fakeNow = 1000;
  const service = new HapticsService(
    {
      vibrate: (p) => {
        calls.push(p);
        return true;
      },
      maxTouchPoints: 5,
      userAgent: 'Android Mobile',
      now: () => fakeNow,
    },
    250,
  );

  assert.equal(service.isSupported(), true);
  assert.equal(service.trigger('nucleosynthesis-burst', 1.0), true);
  assert.equal(service.getPulseCount(), 1);
  assert.equal(service.getLastEvent(), 'nucleosynthesis-burst');

  // Within cooldown window -> throttled cleanly
  fakeNow += 100;
  assert.equal(service.trigger('network-impulse', 1.0), false);
  assert.equal(service.getPulseCount(), 1);

  // After cooldown -> triggers again
  fakeNow += 300;
  assert.equal(service.trigger('birth-star-ignition', 1.1), true);
  assert.equal(service.getPulseCount(), 2);

  // Muted -> cancels and suppresses further pulses
  service.setMuted(true);
  fakeNow += 500;
  assert.equal(service.trigger('reveal-supernova', 1.0, true), false);
  assert.equal(calls[calls.length - 1], 0); // cancel(0) was sent
});
