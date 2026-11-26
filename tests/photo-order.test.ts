import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderProductPhotos, type RawPhoto } from '../lib/storage/photo-order';

const photo = (url: string, extra: Partial<RawPhoto> = {}): RawPhoto => ({
  public_url: url,
  alt_text: null,
  is_primary: false,
  sort_order: 0,
  ...extra,
});

test('null or empty input gives no photographs', () => {
  assert.deepEqual(orderProductPhotos(null, 'Tile'), []);
  assert.deepEqual(orderProductPhotos(undefined, 'Tile'), []);
  assert.deepEqual(orderProductPhotos([], 'Tile'), []);
});

test('the primary photograph comes first even when its display order is later', () => {
  const ordered = orderProductPhotos(
    [photo('https://x/a.jpg', { sort_order: 0 }), photo('https://x/b.jpg', { sort_order: 5, is_primary: true })],
    'Tile',
  );
  assert.deepEqual(
    ordered.map((p) => p.url),
    ['https://x/b.jpg', 'https://x/a.jpg'],
  );
  assert.equal(ordered[0]?.isPrimary, true);
});

test('the remaining photographs follow display order', () => {
  const ordered = orderProductPhotos(
    [photo('https://x/c.jpg', { sort_order: 2 }), photo('https://x/a.jpg', { sort_order: 0 }), photo('https://x/b.jpg', { sort_order: 1 })],
    'Tile',
  );
  assert.deepEqual(
    ordered.map((p) => p.url),
    ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'],
  );
});

test('equal display order keeps the order the rows arrived in', () => {
  const ordered = orderProductPhotos([photo('https://x/first.jpg'), photo('https://x/second.jpg')], 'Tile');
  assert.deepEqual(
    ordered.map((p) => p.url),
    ['https://x/first.jpg', 'https://x/second.jpg'],
  );
});

test('rows with a blank URL are dropped', () => {
  const ordered = orderProductPhotos([photo(''), photo('https://x/ok.jpg')], 'Tile');
  assert.deepEqual(
    ordered.map((p) => p.url),
    ['https://x/ok.jpg'],
  );
});

test('a blank alt text falls back to the product name', () => {
  const [only] = orderProductPhotos([photo('https://x/a.jpg', { alt_text: '   ' })], 'Ceramic floor tile');
  assert.equal(only?.alt, 'Ceramic floor tile');
  const [described] = orderProductPhotos([photo('https://x/a.jpg', { alt_text: ' Matt finish ' })], 'Ceramic floor tile');
  assert.equal(described?.alt, 'Matt finish');
});
