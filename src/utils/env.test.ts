import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseAppEnv } from './env';

test('parseAppEnv handles missing, empty, or undefined environment safely', () => {
  const empty = parseAppEnv(undefined);
  assert.equal(empty.revealAudioUrl, null);
  assert.equal(empty.qualityTierOverride, 'auto');
  assert.equal(empty.warnings.length, 0);
});

test('parseAppEnv accepts valid https or root-relative audio URLs and quality tiers', () => {
  const valid = parseAppEnv({
    VITE_REVEAL_AUDIO_URL: 'https://cdn.example.com/song.mp3',
    VITE_QUALITY_TIER: 'BALANCED',
  });
  assert.equal(valid.revealAudioUrl, 'https://cdn.example.com/song.mp3');
  assert.equal(valid.qualityTierOverride, 'balanced');
  assert.equal(valid.warnings.length, 0);

  const rel = parseAppEnv({
    VITE_REVEAL_AUDIO_URL: '/audio/reveal.m4a',
  });
  assert.equal(rel.revealAudioUrl, '/audio/reveal.m4a');
});

test('parseAppEnv rejects malformed or unsafe URLs and unknown quality tiers without throwing', () => {
  const invalid = parseAppEnv({
    VITE_REVEAL_AUDIO_URL: 'javascript:alert(1)',
    VITE_QUALITY_TIER: 'ultra-extreme-9000',
  });
  assert.equal(invalid.revealAudioUrl, null);
  assert.equal(invalid.qualityTierOverride, 'auto');
  assert.equal(invalid.warnings.length, 2);
});
