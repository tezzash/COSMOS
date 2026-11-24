import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  AdaptiveQualityController,
  detectDeviceProfile,
  formatQualityModeLabel,
  getNextQualityMode,
  getQualitySettingsForTier,
  getShaderPrecisionForEffect,
  resolveEffectiveDpr,
} from './deviceProfile';

test('detectDeviceProfile accurately identifies iPhone Pro Max high-PPI OLED in landscape and keeps Yin-Yang parity', () => {
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
  assert.equal(iphoneLandscape.isHighPpi, true);
  assert.equal(iphoneLandscape.initialTier, 'HIGH');
  assert.equal(iphoneLandscape.targetFps, 60);

  const highSettings = getQualitySettingsForTier('HIGH', iphoneLandscape, false);
  const balancedSettings = getQualitySettingsForTier('BALANCED', iphoneLandscape, false);
  const thermalSettings = getQualitySettingsForTier('THERMAL-SAFE', iphoneLandscape, false);

  // High-PPI 3x OLED dynamically scales DPR smoothly across quality tiers
  assert.equal(resolveEffectiveDpr(3, highSettings), 2.0);
  assert.equal(resolveEffectiveDpr(3, balancedSettings), 1.65);
  assert.equal(resolveEffectiveDpr(3, thermalSettings), 1.25);

  // Mobile shader tier uses mediump for non-critical ambient shaders while preserving highp hero parity
  assert.equal(getShaderPrecisionForEffect('ambient', iphoneLandscape, 'HIGH'), 'mediump');
  assert.equal(getShaderPrecisionForEffect('ambient', iphoneLandscape, 'BALANCED'), 'mediump');
  assert.equal(getShaderPrecisionForEffect('hero', iphoneLandscape, 'HIGH'), 'highp');
  assert.equal(getShaderPrecisionForEffect('hero', iphoneLandscape, 'THERMAL-SAFE'), 'highp');

  // Central Yin-Yang set piece retains high mobile particle parity (>= 0.85 on high-PPI phones)
  assert.ok(highSettings.yinYangScaleFactor >= 0.85);
  assert.equal(highSettings.yinYangDrawRatio, 1.0);
  assert.ok(balancedSettings.yinYangDrawRatio >= 0.88);
  assert.ok(thermalSettings.particleDrawRatio < highSettings.particleDrawRatio);
  assert.equal(thermalSettings.gpgpuEnabled, false);
});

test('detectDeviceProfile respects desktop browsers, shader tiers, and reduced motion preference', () => {
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
  assert.equal(desktop.isHighPpi, false);
  assert.equal(desktop.prefersReducedMotion, true);
  assert.equal(desktop.initialTier, 'HIGH');

  assert.equal(getShaderPrecisionForEffect('ambient', desktop, 'HIGH'), 'highp');
  assert.equal(getShaderPrecisionForEffect('ambient', desktop, 'BALANCED'), 'mediump');
  assert.equal(getShaderPrecisionForEffect('hero', desktop, 'BALANCED'), 'highp');

  assert.equal(resolveEffectiveDpr(2, getQualitySettingsForTier('HIGH', desktop, false)), 2);
  assert.equal(resolveEffectiveDpr(2, getQualitySettingsForTier('BALANCED', desktop, false)), 1.5);
  assert.equal(resolveEffectiveDpr(2, getQualitySettingsForTier('THERMAL-SAFE', desktop, false)), 1.2);
  assert.equal(resolveEffectiveDpr(1, getQualitySettingsForTier('HIGH', desktop, false)), 1);
});

test('QualityMode cycles cleanly through Auto -> High -> Balanced -> Saver -> Auto', () => {
  assert.equal(getNextQualityMode('auto'), 'high');
  assert.equal(getNextQualityMode('high'), 'balanced');
  assert.equal(getNextQualityMode('balanced'), 'thermal-safe');
  assert.equal(getNextQualityMode('thermal-safe'), 'auto');
  assert.equal(formatQualityModeLabel('auto'), 'Auto');
  assert.equal(formatQualityModeLabel('thermal-safe'), 'Saver');
});

test('AdaptiveQualityController steps down under sustained slow frames, respects manual locks, and recovers with headroom', () => {
  const ctrl = new AdaptiveQualityController('HIGH');
  assert.equal(ctrl.getTier(), 'HIGH');

  // Manual lock suppresses automatic tier transitions
  ctrl.setLocked(true);
  for (let i = 0; i < 400; i++) {
    assert.equal(ctrl.recordFrame(0.04), null);
  }
  assert.equal(ctrl.getTier(), 'HIGH');

  // Unlocking resets hysteresis and resumes 60fps monitoring
  ctrl.setLocked(false);

  // Advance past initial cooldown with steady 16ms frames
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

  // Manual setTier jumps directly
  ctrl.setTier('HIGH');
  assert.equal(ctrl.getTier(), 'HIGH');
});
