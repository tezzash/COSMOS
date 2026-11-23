import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAmbientAtmosphereState } from './ambientAtmosphere';

test('Ambient Atmosphere opens frequency filters into a cinematic swell during high-impact moments', () => {
  const quiet = computeAmbientAtmosphereState(312.0, true, false);
  const bigBang = computeAmbientAtmosphereState(16.0, true, false);
  const binaryLock = computeAmbientAtmosphereState(261.0, true, false);
  const convergence = computeAmbientAtmosphereState(360.0, true, false);
  const reveal = computeAmbientAtmosphereState(378.0, true, false);

  assert.ok(quiet.lowpassHz < 420, `Quiet Hours should stay softly filtered (got ${quiet.lowpassHz})`);
  assert.ok(bigBang.lowpassHz > 1400, `Big Bang swell should open lowpass (got ${bigBang.lowpassHz})`);
  assert.ok(binaryLock.lowpassHz > 1500, `Binary Equilibrium swell should open lowpass (got ${binaryLock.lowpassHz})`);
  assert.ok(convergence.lowpassHz > 1900, `Final Convergence swell should peak high (got ${convergence.lowpassHz})`);
  assert.ok(reveal.lowpassHz > 2100, `Title Reveal swell should bloom brightest (got ${reveal.lowpassHz})`);
  assert.ok(reveal.bandpassHz > quiet.bandpassHz + 500, 'Bandpass air formant should sweep upward on swells');
  assert.ok(reveal.gain > quiet.gain * 2.5 && reveal.gain <= 0.068, 'Gain should swell subtly without overpowering score');
  assert.equal(binaryLock.activeMoment, 'binary-equilibrium');
  assert.equal(reveal.activeMoment, 'title-reveal-bloom');
});

test('Ambient Atmosphere cuts cleanly to silence during sacred silence, mute, and pause', () => {
  const silence = computeAmbientAtmosphereState(367.5, true, false);
  const muted = computeAmbientAtmosphereState(261.0, true, true);
  const paused = computeAmbientAtmosphereState(261.0, false, false);

  assert.equal(silence.activeMoment, 'sacred-silence');
  assert.ok(silence.gain <= 0.0002);
  assert.equal(silence.swellIntensity, 0);
  assert.equal(muted.gain, 0);
  assert.equal(paused.gain, 0);
});
