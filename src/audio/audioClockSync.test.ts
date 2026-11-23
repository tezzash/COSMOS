import assert from 'node:assert/strict';
import test from 'node:test';
import { SCREENPLAY_LINES } from '../data/screenplay';
import {
  computeAudioAnchoredFilmTime,
  reanchorAudioClock,
  resolveCaptionSyncSnapshot,
} from './audioClockSync';

test('computeAudioAnchoredFilmTime tracks Web Audio currentTime with sub-millisecond precision', () => {
  const anchor = reanchorAudioClock(10.0, 4.125, true);
  const t1 = computeAudioAnchoredFilmTime(anchor, 4.5255);
  assert.ok(Math.abs(t1 - 10.4005) < 1e-9);

  // When paused, advancing AudioContext.currentTime must hold filmTime frozen
  const paused = reanchorAudioClock(25.5, 8.0, false);
  assert.equal(computeAudioAnchoredFilmTime(paused, 12.75), 25.5);
});

test('resolveCaptionSyncSnapshot dynamically triggers exact screenplay cue at AudioContext.currentTime', () => {
  const cue = SCREENPLAY_LINES[1]; // p-2 starts at 10.4
  const anchor = reanchorAudioClock(10.0, 2.0, true);
  const idleSpeech = {
    lineId: null,
    spokenText: '',
    charOffsetInFullLine: 0,
    lastBoundaryCharIndex: 0,
    speechStartAudioTime: 0,
    estimatedSpokenSec: 1,
    isSpeaking: false,
  };

  // Just before cue.start (10.35s) -> in gap between p-1 (ends 10.0) and p-2 (starts 10.4)
  const before = resolveCaptionSyncSnapshot(anchor, 2.35, idleSpeech, 'web-audio');
  assert.equal(before.line, null);
  assert.equal(before.clockSource, 'web-audio');

  // Exact micro-second after cue.start (10.4001s) -> p-2 triggers immediately
  const triggered = resolveCaptionSyncSnapshot(anchor, 2.4001, idleSpeech, 'web-audio');
  assert.equal(triggered.line?.id, cue.id);
  assert.ok(triggered.spokenProgress >= 0 && triggered.spokenProgress < 0.02);
});

test('resolveCaptionSyncSnapshot tracks live synthesized speech boundaries and AudioContext interpolation', () => {
  const cue = SCREENPLAY_LINES[0]; // p-1 (2.4 -> 10.0)
  const anchor = reanchorAudioClock(cue.start, 1.0, true);
  const activeSpeech = {
    lineId: cue.id,
    spokenText: cue.text,
    charOffsetInFullLine: 0,
    lastBoundaryCharIndex: 28,
    speechStartAudioTime: 1.0,
    estimatedSpokenSec: 6.8,
    isSpeaking: true,
  };

  const snapEarly = resolveCaptionSyncSnapshot(anchor, 1.5, activeSpeech, 'web-audio');
  assert.equal(snapEarly.isSpeaking, true);
  assert.ok(snapEarly.spokenCharIndex >= 28);

  const snapLater = resolveCaptionSyncSnapshot(anchor, 4.4, activeSpeech, 'web-audio');
  assert.ok(snapLater.spokenCharIndex > snapEarly.spokenCharIndex);
  assert.ok(snapLater.spokenProgress > 0.45 && snapLater.spokenProgress < 0.85);
});
