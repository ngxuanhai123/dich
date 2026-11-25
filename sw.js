// HiHi Study - Unified Service Worker (Offline Cache & Performance)
const CACHE_NAME = 'hihi-dich-v2.1-neobrutalism';
const CACHE_PREFIX = 'hihi-dich-';
const STATIC_ASSETS = [
  './',
  './hihi-leaderboard.js',
  './hihi-monitor.js',
  './index.html',
  './hihi-phiquiz.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_ASSETS.map((asset) =>
          fetch(new Request(asset, { cache: 'no-cache' }))
            .then((res) => (res && res.ok ? cache.put(asset, res) : null))
            .catch(() => null)
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => (key.startsWith(CACHE_PREFIX) || key.startsWith('hihi-study-')) && key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // 1. Không cache manifest (vocab_manifest.json, vocab_manifest_indo.json) — dễ stale
  if (url.pathname.includes('vocab_manifest')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Cache fonts, audio and static JSON vocabulary files with CacheFirst strategy
  if (
    url.hostname.includes('fonts.') ||
    url.hostname.includes('cdnjs.') ||
    (url.pathname.endsWith('.json') && !url.pathname.includes('manifest')) ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.m4a') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3. HTML, CSS & Scripts: Network-first (revalidate HTTP cache) with Cache fallback
  const networkReq = url.origin === self.location.origin
    ? new Request(event.request.url, { cache: 'no-cache' })
    : event.request;
  event.respondWith(
    fetch(networkReq)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
