/* ZENTRO BuildMart service worker.
 *
 * What is cached, and why:
 *  - Precache: the offline page, the manifest and app icons. None of these carries customer data.
 *  - Content-hashed build assets under /_next/static/. They are public and immutable.
 *
 * What is never cached:
 *  - Any HTML page, navigation response or API response. Prices, stock, orders, quotations, refunds,
 *    room photographs, Storage URLs, owner and admin pages and sign-in state always come from the server.
 *  - Any request with a query string (signed URLs carry tokens in the query).
 *  - Cross-origin requests (payment gateway, Supabase). They are passed through untouched.
 *
 * Cache versioning: bump CACHE_VERSION when the precache list changes. Old caches with this prefix are
 * removed on activation. Nothing else is deleted.
 */

const CACHE_VERSION = 'zentro-pwa-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.json',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
  // The new worker waits until the page asks for it (see the update banner), so a session is never
  // switched mid-checkout.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('zentro-pwa-') && name !== STATIC_CACHE)
          .map((name) => caches.delete(name)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isPrecached(pathname) {
  return PRECACHE.includes(pathname);
}

function isBuildAsset(pathname) {
  return pathname.startsWith('/_next/static/');
}

async function networkFirstPage(request) {
  try {
    // Pages are fetched fresh and never written to a cache.
    return await fetch(request);
  } catch (error) {
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.search) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (isPrecached(url.pathname) || isBuildAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else goes to the network without interception.
});
