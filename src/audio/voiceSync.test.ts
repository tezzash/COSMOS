import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SCREENPLAY_LINES } from '../data/screenplay';
import { computeSyncedSpeechPlan, estimateBaseSpeechDuration } from './voiceSync';

test('estimateBaseSpeechDuration scales monotonically with text length and punctuation', () => {
  const shortLine = estimateBaseSpeechDuration('Quite the illusion.');
  const longLine = estimateBaseSpeechDuration(
    'An interesting place, really. A world that spins at roughly 1,670 kilometres per hour at its equator, travels around its star at approximately 107,000 kilometres per hour.',
  );
  assert.ok(shortLine >= 0.6 && shortLine < 2.2);
  assert.ok(longLine > shortLine * 4);
});

test('computeSyncedSpeechPlan keeps every screenplay caption finishing within its display window', () => {
  for (const line of SCREENPLAY_LINES) {
    const plan = computeSyncedSpeechPlan(
      line.text,
      line.start,
      line.end,
      line.start,
      line.tone,
    );
    assert.ok(plan !== null, `Line ${line.id} should produce a speech plan at its start`);
    assert.ok(plan.rate >= 0.94 && plan.rate <= 1.62, `Rate out of natural bounds for ${line.id}: ${plan.rate}`);
    const spokenDuration = plan.estimatedSecAt1x / plan.rate;
    const windowSec = line.end - line.start;
    // Every cue should comfortably finish inside or very close to its display window
    assert.ok(
      spokenDuration <= windowSec + 0.75,
      `Line ${line.id} (${spokenDuration.toFixed(2)}s) lagged behind caption window (${windowSec.toFixed(2)}s) at rate ${plan.rate}`,
    );
  }
});

test('computeSyncedSpeechPlan trims to later sentences on mid-cue seek and skips near-expired cues', () => {
  const line = SCREENPLAY_LINES.find((l) => l.id === 'p-6')!;
  const midTime = line.start + (line.end - line.start) * 0.55;
  const midPlan = computeSyncedSpeechPlan(line.text, line.start, line.end, midTime, line.tone);
  assert.ok(midPlan !== null);
  assert.equal(midPlan.trimmedForSeek, true);
  assert.ok(midPlan.text.length < line.text.length);

  const nearEnd = computeSyncedSpeechPlan(line.text, line.start, line.end, line.end - 0.4, line.tone);
  assert.equal(nearEnd, null);
});
