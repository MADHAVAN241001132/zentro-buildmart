import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUCKETS, buildObjectPath, isStorePath, sniffImage, validateImageUpload } from '../lib/storage/image-policy';

const STORE = '11111111-2222-3333-4444-555555555555';
const ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test('sniffs JPEG, PNG and WebP by content, not by name', () => {
  assert.deepEqual(sniffImage(JPEG), { mime: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual(sniffImage(PNG), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(sniffImage(WEBP), { mime: 'image/webp', ext: 'webp' });
});

test('refuses SVG, HTML and GIF content even when the bytes are short', () => {
  assert.equal(sniffImage(new TextEncoder().encode('<svg onload="x()"></svg>')), null);
  assert.equal(sniffImage(new TextEncoder().encode('<!doctype html><script>')), null);
  assert.equal(sniffImage(new TextEncoder().encode('GIF89a')), null);
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null);
});

test('rejects empty and oversized files per bucket', () => {
  assert.equal(validateImageUpload({ bucket: BUCKETS.catalogue, size: 0, head: JPEG }).ok, false);
  const big = validateImageUpload({ bucket: BUCKETS.catalogue, size: 5 * 1024 * 1024 + 1, head: JPEG });
  assert.equal(big.ok, false);
  assert.equal(validateImageUpload({ bucket: BUCKETS.privatePhotos, size: 6 * 1024 * 1024, head: JPEG }).ok, true);
});

test('accepts a valid image within the bucket limit', () => {
  assert.equal(validateImageUpload({ bucket: BUCKETS.catalogue, size: 200_000, head: PNG }).ok, true);
});

test('object paths are tenant-prefixed and never use the original name', () => {
  const path = buildObjectPath(STORE, 'product', { mime: 'image/png', ext: 'png' }, ID);
  assert.equal(path, `${STORE}/products/${ID}.png`);
  assert.equal(isStorePath(path, STORE), true);
});

test('isStorePath refuses traversal, other stores and malformed names', () => {
  assert.equal(isStorePath(`${STORE}/products/../${ID}.png`, STORE), false);
  assert.equal(isStorePath(`${STORE}/products/${ID}.gif`, STORE), false);
  assert.equal(isStorePath(`${ID}/products/${ID}.png`, STORE), false);
  assert.equal(isStorePath(`${STORE}/products/${ID}.png/../x`, STORE), false);
});
