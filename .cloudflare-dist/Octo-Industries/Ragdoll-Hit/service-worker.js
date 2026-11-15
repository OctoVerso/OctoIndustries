const cacheName = 'octo-ragdoll-hit-v1';
const cachedAssets = [
  './',
  './index.html',
  './MobileDetect.js',
  './poki-sdk-compat.js',
  './Build/v84.loader.js',
  './Build/3276aa7c11496bcc48eb6908f112f0c3.js.unityweb',
  './Build/959bf1c60308f1c34bf072f43c3c17d4.data.unityweb',
  './Build/f23c0f3f40a28f1adce731399dde22aa.wasm.unityweb',
  './screenshots/1.jpg',
  './screenshots/2.jpg',
  '../branding/favicon.svg',
  '../branding/game-branding.css',
  '../branding/game-branding.js',
  '../branding/game-loader.css',
  '../branding/game-loader.js',
  '../branding/primary-logo.png',
  '../branding/home-button.png',
  '../branding/watermark-logo.png',
].map((path) => new URL(path, self.registration.scope).pathname);
const cachedPaths = new Set(cachedAssets);
const shellAssets = cachedAssets.filter((path) => !path.includes('/Build/') && !path.includes('/screenshots/'));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await Promise.all(shellAssets.map((path) => cache.add(path).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('octo-ragdoll-hit-') && name !== cacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !cachedPaths.has(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
    }
    return response;
  })());
});