const cacheName = "octo-industries-block-blast-1.1";
const contentToCache = [
    "Build/BlockBlast1.1-8.loader.js",
    "Build/BlockBlast1.1-8.framework.js.unityweb",
    "Build/BlockBlast1.1-8.data.unityweb",
    "Build/BlockBlast1.1-8.wasm.unityweb",
    "TemplateData/style.css"

];

self.addEventListener('install', function (e) {
    console.log('[Service Worker] Install');
    
    e.waitUntil((async function () {
      const cache = await caches.open(cacheName);
      console.log('[Service Worker] Caching all: app shell and content');
      await cache.addAll(contentToCache);
    })());
});

self.addEventListener('install', function () {
    self.skipWaiting();
});

self.addEventListener('activate', function (e) {
    e.waitUntil((async function () {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== cacheName).map((name) => caches.delete(name)));
      await self.clients.claim();
    })());
});

// Large game builds are cached for speed; the page and shared branding always come from the network when available.
self.addEventListener('fetch', function (e) {
    if (e.request.method !== 'GET') { return; }
    const isBuild = new URL(e.request.url).pathname.includes('/Build/');

    e.respondWith((async function () {
      if (isBuild) {
        const cached = await caches.match(e.request);
        if (cached) { return cached; }
      }

      try {
        const response = await fetch(e.request);
        if (isBuild && response.ok) {
          const cache = await caches.open(cacheName);
          cache.put(e.request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(e.request);
        if (cached) { return cached; }
        throw error;
      }
    })());
});
