/*!
 * PvZ2 Gardendless – service worker (offline play)
 *
 * Lives next to the page's index.html (site root on GitHub Pages). build-pages-lite.mjs
 * stamps CACHE_VERSION and RELEASE (the releases/<commit>/ folder holding the game files) on
 * every deploy; for plain hosting RELEASE stays '' and CACHE_VERSION is bumped by hand.
 *
 * How offline stays reliable across updates:
 * - Each release has one cache. Installing a new release first carries over every unchanged
 *   file from the previous release's cache (matched by the content hash in asset-list.json),
 *   then downloads the start-up files that are missing. Only when that has worked does the new
 *   release take over; if it fails (e.g. offline), the previous release keeps working.
 * - The rest of the game (art, sounds, music) is downloaded in the background on request from
 *   the page ("FILL" messages), here in the worker so it doesn't slow the game down.
 */
const CACHE_VERSION = 'v1';
const RELEASE = '';

const CACHE = `pvz-rel-${CACHE_VERSION}`;
const FIREBASE_SDK = '10.14.1'; // keep in sync with sync/cloud-sync.js
const LIB_CACHE = `pvz-lib-firebase-${FIREBASE_SDK}`;

const SCOPE = new URL(self.registration.scope);
const ROOT_URL = SCOPE.href;
const BASE = new URL(RELEASE, SCOPE).href; // folder holding the game files
const MANIFEST_URL = new URL('asset-list.json', BASE).href;
const MANIFEST_KEY = BASE + '__pvz_manifest__';
// Game data (art, sounds, music): everything else is needed to start the game.
const DATA_RE = /^(assets\/resources\/(native|import)\/|audio\/(Music|Sounds)\/)/;

function cacheable(res) {
  return !!res && res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'cors');
}

// Path of a game file relative to its release folder (or the site root for plain hosting).
function relPath(urlStr) {
  const u = new URL(urlStr);
  if (!u.pathname.startsWith(SCOPE.pathname)) return null;
  let p = u.pathname.slice(SCOPE.pathname.length);
  const m = /^releases\/[0-9a-f]{7,40}\//.exec(p);
  if (m) p = p.slice(m[0].length);
  return p;
}

async function readManifest(cache) {
  const res = await cache.match(MANIFEST_KEY);
  return res ? res.json() : null;
}

async function pool(items, concurrency, fn) {
  let i = 0;
  const lanes = [];
  for (let n = 0; n < concurrency; n++) {
    lanes.push((async () => { while (i < items.length) await fn(items[i++]); })());
  }
  await Promise.all(lanes);
}

// ---------- install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(install());
});

async function install() {
  const cache = await caches.open(CACHE);

  const mres = await fetch(MANIFEST_URL, { cache: 'no-store' });
  if (!cacheable(mres)) throw new Error('asset-list.json unavailable');
  const manifest = await mres.clone().json();
  await cache.put(MANIFEST_KEY, mres);

  const root = await fetch(ROOT_URL, { cache: 'reload' });
  if (!cacheable(root)) throw new Error('start page unavailable');
  await cache.put(ROOT_URL, root);

  const want = new Map();
  for (const f of manifest.files) want.set(f.p, f);
  const have = new Set((await cache.keys()).map((r) => r.url));

  await carryOver(cache, want, have);

  // Start-up files must all be present before this release takes over.
  const boot = manifest.files.filter((f) => !DATA_RE.test(f.p));
  await pool(boot, 4, async (f) => {
    const url = new URL(f.p, BASE).href;
    if (have.has(url)) return;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!cacheable(res)) throw new Error('missing start-up file ' + f.p);
    await cache.put(url, res);
    have.add(url);
  });

  await self.skipWaiting();
}

// Copy unchanged files from earlier releases' caches into this release's cache.
async function carryOver(cache, want, have) {
  const names = (await caches.keys()).filter((n) => n.startsWith('pvz-') && n !== CACHE && n !== LIB_CACHE);
  for (const name of names) {
    const old = await caches.open(name);
    const reqs = await old.keys();
    // Old manifest (with hashes) if this cache has one.
    let oldHash = null;
    const mreq = reqs.find((r) => r.url.endsWith('__pvz_manifest__'));
    if (mreq) {
      try {
        const om = await (await old.match(mreq)).json();
        oldHash = new Map(om.files.map((f) => [f.p, f.h]));
      } catch (e) { oldHash = null; }
    }
    await pool(reqs, 4, async (req) => {
      if (req.url.endsWith('__pvz_manifest__')) return;
      const p = relPath(req.url);
      if (!p) return;
      const f = want.get(p);
      if (!f) return;
      // With hashes: only identical files. Without (older caches): only game data, which
      // never changes between our updates; code is always downloaded fresh.
      if (oldHash ? oldHash.get(p) !== f.h : !DATA_RE.test(p)) return;
      const url = new URL(p, BASE).href;
      if (have.has(url)) return;
      const res = await old.match(req);
      if (!cacheable(res)) return;
      try { await cache.put(url, res); have.add(url); } catch (e) { /* quota: download later */ }
    });
  }
}

// ---------- activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('pvz-') && n !== CACHE && n !== LIB_CACHE).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// ---------- messages ----------
let fillHave = null; // Set of cached URLs, rebuilt when the worker restarts
let filling = null;

self.addEventListener('message', (event) => {
  const d = event.data || {};
  const reply = (msg) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(msg);
    else if (event.source) event.source.postMessage(msg);
  };
  if (d.type === 'GET_VERSION') reply({ type: 'VERSION', version: CACHE_VERSION });
  if (d.type === 'FILL') event.waitUntil(fill(d.max || 20).then(reply, (e) => reply({ type: 'FILL', error: String(e && e.message || e) })));
});

// Download up to `max` not-yet-cached game files; report progress.
function fill(max) {
  if (!filling) filling = doFill(max).finally(() => { filling = null; });
  return filling;
}

async function doFill(max) {
  const cache = await caches.open(CACHE);
  const manifest = await readManifest(cache);
  if (!manifest) return { type: 'FILL', done: true, have: 0, total: 0, bytesHave: 0, bytesTotal: 0 };
  if (!fillHave) fillHave = new Set((await cache.keys()).map((r) => r.url));
  const missing = [];
  let bytesHave = 0, bytesTotal = 0, have = 0;
  for (const f of manifest.files) {
    const url = new URL(f.p, BASE).href;
    bytesTotal += f.s || 0;
    if (fillHave.has(url)) { have++; bytesHave += f.s || 0; } else missing.push({ f, url });
  }
  // Small level data first, then art, then sound effects, then music (largest, least urgent).
  const rank = (p) => /^assets\/resources\/import\//.test(p) ? 0 : /^assets\/resources\/native\//.test(p) ? 1 : /^audio\/Sounds\//.test(p) ? 2 : /^audio\/Music\//.test(p) ? 3 : 0;
  missing.sort((a, b) => rank(a.f.p) - rank(b.f.p));
  const batch = missing.slice(0, max);
  let quota = false;
  await pool(batch, 3, async ({ f, url }) => {
    if (quota) return;
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!cacheable(res)) return;
      await cache.put(url, res);
      fillHave.add(url);
      have++; bytesHave += f.s || 0;
    } catch (e) {
      if (e && e.name === 'QuotaExceededError') quota = true;
    }
  });
  return {
    type: 'FILL', have, total: manifest.files.length, bytesHave, bytesTotal,
    done: have >= manifest.files.length, quota
  };
}

// ---------- fetch ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase SDK modules from gstatic: cache-first so cloud-sync.js loads offline.
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(libFirst(req));
    return;
  }
  // Everything else cross-origin (Firestore, Auth, analytics…) goes straight to the network.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE.pathname)) return;

  if (req.mode === 'navigate') { event.respondWith(page(req)); return; }
  if (url.href.split('?')[0] === MANIFEST_URL) { event.respondWith(networkThenCache(req)); return; }
  if (req.headers.has('range')) { event.respondWith(rangeFromCache(req, event)); return; }
  event.respondWith(gameFile(req, event));
});

async function libFirst(req) {
  const hit = await caches.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) (await caches.open(LIB_CACHE)).put(req, res.clone()).catch(() => {});
  return res;
}

// The start page: always the live one when the network works, the cached one offline.
async function page(req) {
  try {
    const res = await fetch(req);
    if (cacheable(res) && new URL(req.url).pathname === SCOPE.pathname) {
      // Only keep a newer start page if this worker has its game files (same release).
      const text = await res.clone().text();
      if (!RELEASE || text.includes(RELEASE)) (await caches.open(CACHE)).put(ROOT_URL, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    const cache = await caches.open(CACHE);
    const hit = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(ROOT_URL));
    if (hit) return hit;
    return offlinePage();
  }
}

async function networkThenCache(req) {
  try {
    return await fetch(req);
  } catch (e) {
    const hit = await (await caches.open(CACHE)).match(MANIFEST_KEY);
    if (hit) return hit;
    throw e;
  }
}

// Same file in this release's folder (a page still running an older release asks for
// releases/<old>/x after an update; the content is almost always identical).
function currentUrlFor(urlStr) {
  const p = relPath(urlStr);
  return p == null ? null : new URL(p, BASE).href;
}

async function gameFile(req, event) {
  const cache = await caches.open(CACHE);
  const key = req.url.split('#')[0];
  let hit = await cache.match(key, { ignoreVary: true });
  if (hit) return hit;
  const alt = currentUrlFor(key);
  try {
    const res = await fetch(req);
    if (cacheable(res)) {
      if (alt === key || !RELEASE) {
        event.waitUntil(cache.put(key, res.clone()).then(() => { if (fillHave) fillHave.add(key); }).catch(() => {}));
      }
      return res;
    }
    if (alt && alt !== key) { hit = await cache.match(alt); if (hit) return hit; }
    return res;
  } catch (e) {
    if (alt && alt !== key) { hit = await cache.match(alt); if (hit) return hit; }
    return new Response('', { status: 504, statusText: 'Offline and not downloaded yet' });
  }
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PvZ – offline</title>' +
    '<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1a0d;color:#fff;font:600 18px -apple-system,sans-serif;text-align:center;padding:24px">' +
    '<div>You\'re offline and the game hasn\'t been downloaded on this device yet.<br><br>Connect to the internet once and open the game; it then works offline.<br><br>' +
    '<button onclick="location.reload()" style="font:inherit;padding:10px 18px;border:0;border-radius:10px;background:#7ed957">Try again</button></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// Safari asks for music in many small Range pieces. Keep the last two files' bytes in memory
// so each piece is a cheap slice instead of re-reading a multi-MB file from storage.
const RANGE_MEMO_MAX = 2;
const rangeMemo = new Map(); // url -> Promise<ArrayBuffer>
function bodyOf(url, response) {
  let p = rangeMemo.get(url);
  if (p) { rangeMemo.delete(url); rangeMemo.set(url, p); return p; }
  p = response.arrayBuffer();
  rangeMemo.set(url, p);
  p.catch(() => rangeMemo.delete(url));
  while (rangeMemo.size > RANGE_MEMO_MAX) rangeMemo.delete(rangeMemo.keys().next().value);
  return p;
}

// Safari requests <audio> with Range headers; serve slices of the full cached file.
async function rangeFromCache(req, event) {
  const cache = await caches.open(CACHE);
  const key = req.url.split('#')[0];
  let fullKey = key;
  let full = await cache.match(key, { ignoreVary: true });
  if (!full) {
    const alt = currentUrlFor(key);
    if (alt && alt !== key) { full = await cache.match(alt); if (full) fullKey = alt; }
  }
  if (!full) {
    // Cache the whole file in the background for next time, answer this request from the network.
    event.waitUntil((async () => {
      try {
        const res = await fetch(key);
        if (cacheable(res)) { await cache.put(key, res); if (fillHave) fillHave.add(key); }
      } catch (e) {}
    })());
    try { return await fetch(req); } catch (e) { return new Response('', { status: 504 }); }
  }
  const buf = await bodyOf(fullKey, full);
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}
