const cacheName = 'octo-red-ball-4-1.08.03-6';
const shellFiles = [
  './',
  './index.html',
  './style.css',
  './platform-compat.js',
  './Build/10803.loader.js',
  './Build/e8fdbdd07c2824facdf87342f6be608a.js',
  './Build/9fce8ead7dd6a9263cda3ed3ec873dd3.data',
  './Build/b48067ed8fa8d994a559745a5a8a38d4.wasm',
  './screenshots/1.jpg',
  './screenshots/2.jpg',
  './screenshots/3.jpg',
  './screenshots/4.jpg',
  './hub/banner-source.jpg',
  '../branding/game-branding.css',
  '../branding/game-branding.js',
  '../branding/home-button.png',
  '../branding/watermark-logo.png',
  '../branding/favicon.svg',
  '../branding/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shellFiles)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('octo-red-ball-4-') && key !== cacheName)
        .map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.error('Red Ball 4 could not cache a local resource for offline play.', error);
      }
    }
    return response;
  })());
});
