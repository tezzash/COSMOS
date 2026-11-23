import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LUT_SIZE,
  bakeFilmPrintLutData,
  computeChapterLutWeights,
} from './colorGrading.ts';

test('computeChapterLutWeights always sums to 1 and assigns expected chapter prints', () => {
  const times = [0, 18, 76, 150, 250, 310, 366, 385, 405];
  for (const t of times) {
    const w = computeChapterLutWeights(t);
    const sum = w.cosmosCool + w.etherealViolet + w.kodak2383Warm;
    assert.ok(Math.abs(sum - 1) < 1e-6);
    assert.ok(w.cosmosCool >= 0 && w.etherealViolet >= 0 && w.kodak2383Warm >= 0);
  }

  assert.equal(computeChapterLutWeights(15).activeLabel, 'cosmosCool');
  assert.equal(computeChapterLutWeights(155).activeLabel, 'etherealViolet');
  assert.equal(computeChapterLutWeights(310).activeLabel, 'kodak2383Warm');
  assert.equal(computeChapterLutWeights(385).activeLabel, 'kodak2383Warm');
});

test('bakeFilmPrintLutData generates valid 32x32x32 LUTs that preserve pure obsidian black and Kodak warmth', () => {
  const cool = bakeFilmPrintLutData('cosmosCool', LUT_SIZE);
  const warm = bakeFilmPrintLutData('kodak2383Warm', LUT_SIZE);

  assert.equal(cool.length, LUT_SIZE * LUT_SIZE * LUT_SIZE * 4);
  assert.equal(warm.length, LUT_SIZE * LUT_SIZE * LUT_SIZE * 4);

  // Pure black input (0,0,0) must stay pure black (zero lifted void!)
  assert.equal(cool[0], 0);
  assert.equal(cool[1], 0);
  assert.equal(cool[2], 0);
  assert.equal(warm[0], 0);
  assert.equal(warm[1], 0);
  assert.equal(warm[2], 0);

  // Mid-gray (16,16,16): Kodak 2383 warm must have higher R than B; cool must have higher B than R
  const midOff = ((16 * LUT_SIZE + 16) * LUT_SIZE + 16) * 4;
  assert.ok(warm[midOff] > warm[midOff + 2]);
  assert.ok(cool[midOff + 2] > cool[midOff]);
});
