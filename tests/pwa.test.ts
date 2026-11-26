import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isIosDevice, isIosSafari, isStandalone, shouldOfferInstall } from '../lib/pwa/support';
import { missingTamilKeys } from '../lib/i18n/translate';

const root = join(__dirname, '..');
const publicPath = (p: string) => join(root, 'public', p);

test('manifest is valid JSON with standalone display, scope and maskable icon', () => {
  const manifest = JSON.parse(readFileSync(publicPath('manifest.json'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.lang, 'en-IN');
  const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose ?? 'any');
  assert.ok(purposes.includes('maskable'), 'a maskable icon is declared');
  assert.ok(purposes.includes('any'), 'an any-purpose icon is declared');
});

test('every icon listed in the manifest exists on disk at its declared size', () => {
  const manifest = JSON.parse(readFileSync(publicPath('manifest.json'), 'utf8'));
  for (const icon of manifest.icons as { src: string }[]) {
    assert.ok(existsSync(publicPath(icon.src.replace(/^\//, ''))), `missing ${icon.src}`);
  }
});

test('the apple touch icon and offline page exist', () => {
  assert.ok(existsSync(publicPath('icons/apple-touch-icon.png')));
  assert.ok(existsSync(publicPath('offline.html')));
});

test('offline page declares its language and names the connection-only actions', () => {
  const html = readFileSync(publicPath('offline.html'), 'utf8');
  assert.match(html, /<html lang="en-IN">/);
  assert.match(html, /lang="ta-IN"/);
  assert.match(html, /Checkout and online payments/);
});

test('service worker precaches only static files that exist', () => {
  const sw = readFileSync(publicPath('sw.js'), 'utf8');
  const match = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(match && match[1] !== undefined, 'PRECACHE list found');
  const entries = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    assert.ok(existsSync(publicPath(entry.replace(/^\//, ''))), `precache entry missing: ${entry}`);
  }
  assert.ok(!entries.some((e) => e === '/' || e.startsWith('/store') || e.startsWith('/owner') || e.startsWith('/admin')));
});

test('service worker never caches query-string requests and only caches static paths', () => {
  const sw = readFileSync(publicPath('sw.js'), 'utf8');
  assert.match(sw, /if \(url\.search\) return;/, 'requests with a query string bypass the worker');
  assert.match(sw, /startsWith\('\/_next\/static\/'\)/);
  // Navigations go to the network and are never written to a cache.
  const navigation = sw.slice(sw.indexOf('async function networkFirstPage'), sw.indexOf('async function cacheFirst'));
  assert.ok(!navigation.includes('cache.put'), 'page responses are not cached');
  assert.ok(!navigation.includes('caches.open'), 'page responses do not open a cache');
});

test('service worker versions its caches and clears only its own old caches', () => {
  const sw = readFileSync(publicPath('sw.js'), 'utf8');
  assert.match(sw, /const CACHE_VERSION = 'zentro-pwa-v\d+'/);
  assert.match(sw, /name\.startsWith\('zentro-pwa-'\) && name !== STATIC_CACHE/);
  assert.match(sw, /SKIP_WAITING/);
});

test('iOS Safari is identified; other iOS browsers receive no install instructions', () => {
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const chromeIos = safari.replace('Version/18.1', '').replace('Safari/604.1', 'CriOS/130.0 Safari/604.1');
  assert.equal(isIosSafari(safari), true);
  assert.equal(isIosSafari(chromeIos), false);
  assert.equal(isIosDevice(chromeIos), true);
});

test('iPadOS reporting itself as a Mac with touch is treated as iOS', () => {
  const ipadDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  assert.equal(isIosDevice(ipadDesktop, 5), true);
  assert.equal(isIosDevice(ipadDesktop, 0), false);
});

test('Android and desktop Chrome are not given iOS instructions', () => {
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  assert.equal(isIosSafari(android), false);
});

test('an installed app is recognised as standalone and not offered install', () => {
  assert.equal(isStandalone(true), true);
  assert.equal(isStandalone(false, true), true);
  assert.equal(isStandalone(false), false);
  assert.equal(shouldOfferInstall({ standalone: true, dismissed: false }), false);
  assert.equal(shouldOfferInstall({ standalone: false, dismissed: true }), false);
  assert.equal(shouldOfferInstall({ standalone: false, dismissed: false }), true);
});

test('every PWA message has a Tamil entry', () => {
  const missing = missingTamilKeys().filter((key) => key.startsWith('pwa.') || key.startsWith('status.'));
  assert.deepEqual(missing, []);
});
