import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLACEMENT, clampPlacement, movePlacement, resizePlacement, normaliseAngle,
  aspectOfSizeLabel, tileBackgroundSize, clampSplit,
} from '../lib/visualizer/geometry';

test('placement stays inside the photograph when moved past an edge', () => {
  const moved = movePlacement(DEFAULT_PLACEMENT, 90, 90);
  assert.equal(moved.x, 100 - DEFAULT_PLACEMENT.width);
  assert.equal(moved.y, 100 - DEFAULT_PLACEMENT.height);
  const back = movePlacement(DEFAULT_PLACEMENT, -90, -90);
  assert.equal(back.x, 0);
  assert.equal(back.y, 0);
});

test('size is limited, and resizing cannot push the overlay off the photograph', () => {
  const big = resizePlacement({ ...DEFAULT_PLACEMENT, x: 70 }, 80, 0);
  assert.equal(big.width, 100);
  assert.equal(big.x, 0);
  const tiny = resizePlacement(DEFAULT_PLACEMENT, -200, -200);
  assert.equal(tiny.width, 4);
  assert.equal(tiny.height, 4);
});

test('aspect ratio keeps tile proportions when resizing', () => {
  const tall = resizePlacement({ ...DEFAULT_PLACEMENT, width: 20, height: 20 }, 10, 0, 0.5);
  assert.equal(tall.width, 30);
  assert.equal(tall.height, 15);
});

test('rotation is normalised to (-180, 180]', () => {
  assert.equal(normaliseAngle(190), -170);
  assert.equal(normaliseAngle(-190), 170);
  assert.equal(normaliseAngle(180), 180);
  assert.equal(normaliseAngle(720), 0);
  assert.equal(normaliseAngle(Number.NaN), 0);
});

test('opacity, tile count and NaN values are clamped', () => {
  const p = clampPlacement({ ...DEFAULT_PLACEMENT, opacity: 3, tilesAcross: 500 });
  assert.equal(p.opacity, 1);
  assert.equal(p.tilesAcross, 20);
  const q = clampPlacement({ ...DEFAULT_PLACEMENT, opacity: -1, tilesAcross: 0, x: Number.NaN });
  assert.equal(q.opacity, 0.2);
  assert.equal(q.tilesAcross, 1);
  assert.equal(q.x, 0);
});

test('tile labels give the height-to-width ratio; unknown labels default to square', () => {
  assert.equal(aspectOfSizeLabel('600 x 600'), 1);
  assert.equal(aspectOfSizeLabel('600x300 mm'), 0.5);
  assert.equal(aspectOfSizeLabel('1200 × 600'), 0.5);
  assert.equal(aspectOfSizeLabel('large'), 1);
  assert.equal(aspectOfSizeLabel(null), 1);
  assert.equal(aspectOfSizeLabel('0 x 300'), 1);
});

test('tile background size places the requested number of tiles across', () => {
  assert.equal(tileBackgroundSize(4), '25.000% auto');
  assert.equal(tileBackgroundSize(1), '100.000% auto');
});

test('before-and-after split is clamped to the frame', () => {
  assert.equal(clampSplit(-5), 0);
  assert.equal(clampSplit(120), 100);
  assert.equal(clampSplit(40), 40);
});
