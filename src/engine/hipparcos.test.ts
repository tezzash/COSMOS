import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  BIRTH_DATE_UTC,
  HIPPARCOS_ANCHOR_STARS,
  HYDERABAD_LAT_DEG,
  HYDERABAD_LON_DEG,
  buildHyderabadHipparcosStarfield,
  bvToRgb,
  computeJulianDate,
  computeLocalSiderealTimeDeg,
  equatorialToHyderabadCartesian,
} from './hipparcos.ts';

test('Julian Date and Local Sidereal Time compute accurately for Hyderabad on 25 Nov 2002', () => {
  const jdJ2000 = computeJulianDate(2000, 1, 1, 12);
  assert.ok(Math.abs(jdJ2000 - 2451545.0) < 1e-6);

  const jdBirth = computeJulianDate(
    BIRTH_DATE_UTC.year,
    BIRTH_DATE_UTC.month,
    BIRTH_DATE_UTC.day,
    BIRTH_DATE_UTC.hourUtc,
  );
  // 25 Nov 2002 is ~1058.54 days after J2000.0
  assert.ok(jdBirth > 2452603 && jdBirth < 2452604.5);

  const lst = computeLocalSiderealTimeDeg(jdBirth, HYDERABAD_LON_DEG);
  assert.ok(lst >= 0 && lst < 360);
});

test('equatorialToHyderabadCartesian projects stars onto exact sphere radius and preserves Polaris north', () => {
  const radius = 385;
  const lst = 142.5;
  const [px, py, pz] = equatorialToHyderabadCartesian(
    2.5303,
    89.2641,
    lst,
    HYDERABAD_LAT_DEG,
    radius,
  );
  const mag = Math.hypot(px, py, pz);
  assert.ok(Math.abs(mag - radius) < 1e-4);
  // Polaris should sit north (-Z) and above northern horizon (+Y ~ sin(17.385°)*r)
  assert.ok(pz < -300);
  assert.ok(py > 95 && py < 140);
});

test('bvToRgb produces blue-dominant O-stars and warm amber-dominant M-stars', () => {
  const [or, og, ob] = bvToRgb(-0.25);
  assert.ok(ob > or && ob >= og);

  const [mr, mg, mb] = bvToRgb(1.75);
  assert.ok(mr > mg && mg > mb);
});

test('buildHyderabadHipparcosStarfield generates 9000 finite stars including all Hipparcos anchors', () => {
  const field = buildHyderabadHipparcosStarfield(9000, 385);
  assert.equal(field.count, 9000);
  assert.equal(field.positions.length, 9000 * 3);
  assert.equal(field.colors.length, 9000 * 3);
  assert.equal(field.scales.length, 9000);
  assert.ok(HIPPARCOS_ANCHOR_STARS.length >= 80);

  // Sirius (index 0) should be among the brightest/largest stars in the catalog
  assert.ok((field.scales[0] ?? 0) > 4.2);

  for (let i = 0; i < 9000; i++) {
    const x = field.positions[i * 3] ?? NaN;
    const y = field.positions[i * 3 + 1] ?? NaN;
    const z = field.positions[i * 3 + 2] ?? NaN;
    const r = Math.hypot(x, y, z);
    assert.ok(Number.isFinite(r) && r > 350 && r < 420);
  }
});
