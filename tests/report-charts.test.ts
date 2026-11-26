import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { barHeights, donutSlices, linePath, linePoints } from '../lib/reports/charts';

test('line points scale to the maximum and stay inside the frame', () => {
  const { points, max } = linePoints([0, 50, 100], 200, 100, 10);
  assert.equal(max, 100);
  assert.equal(points[0]!.x, 10);
  assert.equal(points[2]!.x, 190);
  assert.equal(points[2]!.y, 10);
  assert.equal(points[0]!.y, 90);
  assert.ok(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('all-zero series draw a flat baseline without NaN', () => {
  const { points } = linePoints([0, 0, 0], 200, 100);
  assert.ok(points.every((p) => p.y === points[0]!.y && Number.isFinite(p.y)));
  assert.equal(linePath([]), '');
  assert.equal(barHeights([0, 0], 50).every((h) => h === 0), true);
});

test('bars are proportional to the largest value', () => {
  assert.deepEqual(barHeights([10, 5, 20], 100), [50, 25, 100]);
});

test('donut slices cover the full circle and report shares', () => {
  const slices = donutSlices([{ label: 'Online', value: 3 }, { label: 'Cash', value: 1 }], 50, 50, 40, 20);
  assert.equal(slices.length, 2);
  assert.ok(Math.abs(slices[0]!.share - 0.75) < 1e-9);
  assert.ok(slices.every((s) => s.path.startsWith('M') && s.path.endsWith('Z')));
});

test('donut with no value draws nothing; a single slice draws a ring', () => {
  assert.deepEqual(donutSlices([{ label: 'x', value: 0 }], 50, 50, 40, 20), []);
  const single = donutSlices([{ label: 'only', value: 5 }], 50, 50, 40, 20);
  assert.equal(single[0]!.share, 1);
  assert.ok(single[0]!.path.includes('A40 40'));
});
