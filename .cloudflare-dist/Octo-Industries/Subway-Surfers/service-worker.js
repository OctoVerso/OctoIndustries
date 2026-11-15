const cacheName = 'octo-subway-surfers-new-york-5';
const shellFiles = [
  './',
  './index.html',
  './style.css',
  './hub/banner-source.png',
  './js/games_lib/ludiAdapter.js',
  './js/boot.js',
  './js/vendor.js',
  './js/main.js',
  './js/inflate.min.js',
  './js/workers/worker.21cc18ec46e616e4eed8.js',
  './assets/data/config.json',
  './assets/data/strings_en.json',
  './assets/data/chunks_idle.json',
  './assets/data/chunks_game.json',
  './assets/ui/ui.json',
  './assets/preload/splash_mip.png',
  './assets/font/lilita-one.css',
  './assets/font/lilita-one.woff2',
  './assets/font/titan-one.css',
  './assets/font/titan-one.woff2',
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
      keys.filter((key) => key.startsWith('octo-subway-surfers-') && key !== cacheName)
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
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.error('Subway Surfers could not cache a local asset for offline play.', error);
      }
    }
    return response;
  })());
});
