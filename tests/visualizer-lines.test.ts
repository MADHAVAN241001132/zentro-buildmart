import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVisualizerLines } from '../lib/visualizer/lines';

const V1 = '0a0b0c0d-0000-4000-8000-000000000001';
const V2 = '0a0b0c0d-0000-4000-8000-000000000002';

test('valid lines are accepted and repeated variants are combined', () => {
  const out = parseVisualizerLines(JSON.stringify([{ variantId: V1, quantity: 2 }, { variantId: V1.toUpperCase(), quantity: 3 }, { variantId: V2, quantity: 1 }]));
  assert.deepEqual(out, [{ variantId: V1, quantity: 5 }, { variantId: V2, quantity: 1 }]);
});

test('quantities are capped at the cart limit', () => {
  const out = parseVisualizerLines(JSON.stringify([{ variantId: V1, quantity: 900 }, { variantId: V1, quantity: 900 }]));
  assert.equal(out?.[0]?.quantity, 999);
});

test('malformed input is refused, not guessed at', () => {
  assert.equal(parseVisualizerLines('not json'), null);
  assert.equal(parseVisualizerLines('[]'), null);
  assert.equal(parseVisualizerLines('{"variantId":"' + V1 + '","quantity":1}'), null);
  assert.equal(parseVisualizerLines(JSON.stringify([{ variantId: 'drop table', quantity: 1 }])), null);
  assert.equal(parseVisualizerLines(JSON.stringify([{ variantId: V1, quantity: 0 }])), null);
  assert.equal(parseVisualizerLines(JSON.stringify([{ variantId: V1, quantity: 1.5 }])), null);
  assert.equal(parseVisualizerLines(JSON.stringify([{ variantId: V1, quantity: '2' }])), null);
  assert.equal(parseVisualizerLines(JSON.stringify([null])), null);
  assert.equal(parseVisualizerLines(JSON.stringify([[V1, 1]])), null);
});

test('more than twelve lines is refused', () => {
  const many = Array.from({ length: 13 }, (_, i) => ({ variantId: `0a0b0c0d-0000-4000-8000-${String(i).padStart(12, '0')}`, quantity: 1 }));
  assert.equal(parseVisualizerLines(JSON.stringify(many)), null);
});
