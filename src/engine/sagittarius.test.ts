import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  SAGITTARIUS_DRAW_END,
  SAGITTARIUS_DRAW_START,
  SAGITTARIUS_EDGES,
  SAGITTARIUS_STARS,
  evaluateSagittariusState,
} from './sagittarius';

test('Sagittarius catalog defines valid star indices and covers all major asterism groups', () => {
  assert.ok(SAGITTARIUS_STARS.length >= 16);
  assert.ok(SAGITTARIUS_EDGES.length >= 20);

  const groups = new Set<string>();
  const touched = new Set<number>();

  for (const edge of SAGITTARIUS_EDGES) {
    assert.ok(edge.from >= 0 && edge.from < SAGITTARIUS_STARS.length);
    assert.ok(edge.to >= 0 && edge.to < SAGITTARIUS_STARS.length);
    assert.notEqual(edge.from, edge.to);
    groups.add(edge.group);
    touched.add(edge.from);
    touched.add(edge.to);
  }

  assert.ok(groups.has('arrow'));
  assert.ok(groups.has('bow'));
  assert.ok(groups.has('teapot'));
  assert.ok(groups.has('string'));
  assert.ok(groups.has('crown'));
  // Every defined star participates in the connected Sagittarius figure
  assert.equal(touched.size, SAGITTARIUS_STARS.length);
});

test('Sagittarius stars connect strictly one by one across Chapter II', () => {
  const before = evaluateSagittariusState(SAGITTARIUS_DRAW_START - 2.0);
  assert.equal(before.completedEdges, 0);
  assert.equal(before.activeEdgeIndex, -1);
  assert.equal(before.sparkPos, null);
  assert.equal(before.overallProgress, 0);

  // Sample multiple points throughout the drawing window
  const sampleTimes = [114, 121, 130, 140, 150];
  let prevCompleted = -1;
  let prevLit = -1;

  for (const t of sampleTimes) {
    const state = evaluateSagittariusState(t);
    assert.ok(
      state.completedEdges > prevCompleted,
      `expected completedEdges to increase at t=${t} (${state.completedEdges} vs ${prevCompleted})`,
    );
    assert.ok(state.litStarCount >= prevLit);

    // Strictly at most one edge actively drawing at any instant
    const drawingCount = state.edges.filter((e) => e.isDrawing).length;
    assert.ok(drawingCount <= 1, `expected <= 1 drawing edge at t=${t}, got ${drawingCount}`);

    if (drawingCount === 1) {
      assert.ok(state.activeEdgeIndex >= 0);
      assert.ok(state.sparkPos !== null);
    }

    prevCompleted = state.completedEdges;
    prevLit = state.litStarCount;
  }
});

test('Sagittarius completes fully after draw window and supports deterministic seeking', () => {
  const done = evaluateSagittariusState(SAGITTARIUS_DRAW_END + 4.0);
  assert.equal(done.completedEdges, SAGITTARIUS_EDGES.length);
  assert.equal(done.litStarCount, SAGITTARIUS_STARS.length);
  assert.equal(done.overallProgress, 1);
  assert.equal(done.sparkPos, null);
  for (const edge of done.edges) {
    assert.equal(edge.progress, 1);
    assert.equal(edge.isDrawing, false);
  }

  // Seeking backwards returns identical deterministic state
  const midA = evaluateSagittariusState(133.5);
  const midB = evaluateSagittariusState(133.5);
  assert.equal(midA.completedEdges, midB.completedEdges);
  assert.equal(midA.activeEdgeIndex, midB.activeEdgeIndex);
  assert.deepEqual(midA.sparkPos, midB.sparkPos);
});
