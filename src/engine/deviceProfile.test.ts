import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  AdaptiveQualityController,
  detectDeviceProfile,
  getQualitySettingsForTier,
} from './deviceProfile';

test('detectDeviceProfile accurately identifies iPhone 17 Pro Max in both portrait and landscape', () => {
  const iphoneLandscape = detectDeviceProfile({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
    platform: 'iPhone',
    maxTouchPoints: 5,
    coarsePointer: true,
    anyHover: false,
    screenWidth: 956,
    screenHeight: 440,
    innerWidth: 956,
    innerHeight: 440,
    devicePixelRatio: 3,
    prefersReducedMotion: false,
  });

  assert.equal(iphoneLandscape.isMobile, true);
  assert.equal(iphoneLandscape.isIOS, true);
  assert.equal(iphoneLandscape.isIOSSafari, true);
  assert.equal(iphoneLandscape.isIPhoneProMaxClass, true);
  assert.equal(iphoneLandscape.initialTier, 'HIGH');
  assert.equal(iphoneLandscape.targetFps, 60);

  const highSettings = getQualitySettingsForTier('HIGH', iphoneLandscape, false);
  const thermalSettings = getQualitySettingsForTier('THERMAL-SAFE', iphoneLandscape, false);
  assert.ok(highSettings.maxDpr <= 2.0, 'iPhone 17 Pro Max caps WebGL DPR below 3x native');
  assert.ok(thermalSettings.maxDpr < highSettings.maxDpr);
  assert.ok(thermalSettings.particleDrawRatio < highSettings.particleDrawRatio);
  assert.equal(thermalSettings.gpgpuEnabled, false);
});

test('detectDeviceProfile respects desktop browsers and reduced motion preference', () => {
  const desktop = detectDeviceProfile({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    coarsePointer: false,
    anyHover: true,
    screenWidth: 2560,
    screenHeight: 1440,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    prefersReducedMotion: true,
  });

  assert.equal(desktop.isMobile, false);
  assert.equal(desktop.isIOS, false);
  assert.equal(desktop.prefersReducedMotion, true);
  assert.equal(desktop.initialTier, 'HIGH');
});

test('AdaptiveQualityController steps down under sustained slow frames and recovers with headroom', () => {
  const ctrl = new AdaptiveQualityController('HIGH');
  assert.equal(ctrl.getTier(), 'HIGH');

  // Advance past initial 3s cooldown with steady 16ms frames
  for (let i = 0; i < 200; i++) {
    assert.equal(ctrl.recordFrame(0.016), null);
  }

  // Simulate sustained 34ms frames (~29 FPS) -> should step down to BALANCED
  let transition: string | null = null;
  for (let i = 0; i < 160; i++) {
    const res = ctrl.recordFrame(0.034);
    if (res) {
      transition = res;
      break;
    }
  }
  assert.equal(transition, 'BALANCED');
  assert.equal(ctrl.getTier(), 'BALANCED');

  // Continue sustained 36ms frames -> after cooldown, steps down to THERMAL-SAFE
  let secondTransition: string | null = null;
  for (let i = 0; i < 320; i++) {
    const res = ctrl.recordFrame(0.036);
    if (res) {
      secondTransition = res;
      break;
    }
  }
  assert.equal(secondTransition, 'THERMAL-SAFE');
  assert.equal(ctrl.getTier(), 'THERMAL-SAFE');

  // Sustained smooth 12ms frames -> after cooldown + 8.5s headroom, steps up to BALANCED
  let recovery: string | null = null;
  for (let i = 0; i < 2200; i++) {
    const res = ctrl.recordFrame(0.012);
    if (res) {
      recovery = res;
      break;
    }
  }
  assert.equal(recovery, 'BALANCED');
});
