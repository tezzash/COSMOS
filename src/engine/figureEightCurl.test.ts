import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  FigureEightCurlBuffer,
  evaluateLemniscate3D,
  sampleDivergenceFreeCurl3D,
} from './figureEightCurl';

test('evaluateLemniscate3D forms a symmetric figure-eight wrapping both binary lobes and crossing L1', () => {
  const halfSpan = 12.0;
  // At theta = 0 -> right lobe apex (+halfSpan, 0, 0)
  const rightApex = evaluateLemniscate3D(0, halfSpan);
  assert.ok(Math.abs(rightApex.x - halfSpan) < 1e-6);
  assert.ok(Math.abs(rightApex.y) < 1e-6);

  // At theta = pi -> left lobe apex (-halfSpan, 0, 0)
  const leftApex = evaluateLemniscate3D(Math.PI, halfSpan);
  assert.ok(Math.abs(leftApex.x + halfSpan) < 1e-6);
  assert.ok(Math.abs(leftApex.y) < 1e-6);

  // At theta = pi/2 and 3*pi/2 -> passes cleanly through exact Lagrange L1 saddle (0, 0, 0)
  const saddleA = evaluateLemniscate3D(Math.PI / 2, halfSpan);
  const saddleB = evaluateLemniscate3D((3 * Math.PI) / 2, halfSpan);
  assert.ok(Math.abs(saddleA.x) < 1e-6 && Math.abs(saddleA.y) < 1e-6);
  assert.ok(Math.abs(saddleB.x) < 1e-6 && Math.abs(saddleB.y) < 1e-6);
});

test('sampleDivergenceFreeCurl3D has zero numeric divergence across 3D space', () => {
  const eps = 1e-4;
  const pts: ReadonlyArray<readonly [number, number, number]> = [
    [1.2, -2.5, 0.8],
    [-4.1, 3.3, -1.7],
    [0.0, 0.5, 2.2],
  ];
  for (const [x, y, z] of pts) {
    const dxp = sampleDivergenceFreeCurl3D(x + eps, y, z, 1.4).x;
    const dxm = sampleDivergenceFreeCurl3D(x - eps, y, z, 1.4).x;
    const dyp = sampleDivergenceFreeCurl3D(x, y + eps, z, 1.4).y;
    const dym = sampleDivergenceFreeCurl3D(x, y - eps, z, 1.4).y;
    const dzp = sampleDivergenceFreeCurl3D(x, y, z + eps, 1.4).z;
    const dzm = sampleDivergenceFreeCurl3D(x, y, z - eps, 1.4).z;

    const div = (dxp - dxm + dyp - dym + dzp - dzm) / (2 * eps);
    assert.ok(Math.abs(div) < 1e-4, `Expected divergence-free curl field, got div=${div}`);
  }
});

test('FigureEightCurlBuffer evolves finite particles across both golden and violet lobes', () => {
  const buf = new FigureEightCurlBuffer(240, 42);
  buf.update(2.5, 12.2, 1.0, 0.0);

  let goldCount = 0;
  let violetCount = 0;
  for (let i = 0; i < buf.count; i++) {
    const x = buf.positions[i * 3] ?? NaN;
    const y = buf.positions[i * 3 + 1] ?? NaN;
    const z = buf.positions[i * 3 + 2] ?? NaN;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    if (x > 2.5) {
      goldCount++;
      // Golden lobe particles should be warm (R > B)
      assert.ok((buf.colors[i * 3] ?? 0) > (buf.colors[i * 3 + 2] ?? 0));
    } else if (x < -2.5) {
      violetCount++;
      // Violet lobe particles should be cool sapphire-violet (B > R)
      assert.ok((buf.colors[i * 3 + 2] ?? 0) > (buf.colors[i * 3] ?? 0));
    }
  }
  assert.ok(goldCount > 40 && violetCount > 40);
});
