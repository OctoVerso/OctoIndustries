const BUILD_VERSION = 1;
const DEFAULTS_RESET_VERSION = 0;
const ASSET_CACHE_NAME = 'gta3-assets';
const PRELOAD_CONCURRENCY = 32;
const ASSET_PREFIX = 'gta3-assets/local';
const DEPLOYMENT_PREFIX = "";
const CHUNKS_DIR = "./gta3sky/";

const ASSET_BASE = DEPLOYMENT_PREFIX.length > 0 ? DEPLOYMENT_PREFIX + ASSET_PREFIX + "/" : new URL(`${ASSET_PREFIX}/`, window.location.href).href;
const ASSET_BASES_WORKING = [ASSET_BASE];
const PRELOAD_URL = new URL('preload_files.list?v=' + Date.now(), window.location.href).href;
const STREAM_URL = new URL('stream_files.list?v=' + Date.now(), window.location.href).href;

/* Every audio stem on disk is exclusively .mp3 OR .wav (never both).
 * Requesting the wrong extension floods the console with 404s. */
const AUDIO_MP3_STEMS = new Set((
  'bet c1_tex d1_stog d2_kk d3_ado d4_gta d4_gta2 d5_es d6_sts d7_mld ' +
  'el_ph1 el_ph2 el_ph3 el_ph4 end hd_ph1 hd_ph2 hd_ph3 hd_ph4 hd_ph5 ' +
  'j0_dm2 j1_lfl j2_kcl j3_vh j4_eth j5_dst j6_tbj jb k1_kbo k2_gis k3_ds ' +
  'k4_shi k4_shi2 k5_sd l1_lg l2_dsb l3_dm l4_pap l5_tfb mt_ph1 mt_ph2 ' +
  'mt_ph3 mt_ph4 r0_pdr2 r1_sw r2_ap r3_ed r4_gf r5_pb r6_mm s0_mas s1_pf ' +
  's2_ctg s2_ctg2 s3_rtc s4_bdba s4_bdbb s4_bdbd s5_lrq s5_lrqb s5_lrqc ' +
  't1_tol t2_tpu t3_mas t4_tat t5_bf yd_ph1 yd_ph2 yd_ph3 yd_ph4'
).split(/\s+/));

function resolveAudioRel(rel) {
  const r = normalizeAssetRel(rel);
  /* Per-sample SFX stay as requested (.mp3 under sfx.raw/). */
  if (r.includes('/sfx') || r.startsWith('sfx')) return r;
  const m = r.match(/^audio\/([^/]+)\.(wav|mp3)$/i);
  if (!m) return r;
  const stem = m[1].toLowerCase();
  const want = AUDIO_MP3_STEMS.has(stem) ? 'mp3' : 'wav';
  return `audio/${stem}.${want}`;
}

function isWrongAudioFormat(rel) {
  const r = normalizeAssetRel(rel);
  if (r.includes('/sfx') || r.startsWith('sfx')) return false;
  const m = r.match(/^audio\/([^/]+)\.(wav|mp3)$/i);
  if (!m) return false;
  return resolveAudioRel(r) !== r;
}

const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const tapHintEl = document.getElementById('tap-hint');
const canvas = document.getElementById('canvas');

const defaultRe3Ini = `[VideoMode]
Width=1280
Height=720
Depth=32
Subsystem=0
Windowed=1

[Controller]
HeadBob1stPerson=0
HorizantalMouseSens=0.002500
InvertMouseVertically=1
DisableMouseSteering=1
Vibration=0
Method=0
InvertPad=0

[Audio]
SfxVolume=64
MusicVolume=64
MP3BoostVolume=0
Radio=0
SpeakerType=0
Provider=0
DynamicAcoustics=0

[Display]
Brightness=256
DrawDistance=1.200000
Subtitles=1
ShowHud=1
RadarMode=0
ShowLegends=0
PedDensity=1.000000
CarDensity=1.000000
CutsceneBorders=1

[Graphics]
AspectRatio=0
VSync=1
Trails=1
FrameLimiter=0
MultiSampling=0

[General]
SkinFile=$$""
Language=0
DrawVersionText=0
NoMovies=1
`;

function sanitizeRe3Ini(ini) {
  let out = ini || defaultRe3Ini;
  out = out.replace(/SfxVolume=\d+/i, 'SfxVolume=64');
  out = out.replace(/MusicVolume=\d+/i, 'MusicVolume=64');
  if (!/SfxVolume=/i.test(out)) out += '\nSfxVolume=64\n';
  if (!/MusicVolume=/i.test(out)) out += '\nMusicVolume=64\n';
  return out;
}
let re3Ini = sanitizeRe3Ini(localStorage.getItem('regta3dos.re3.ini') || defaultRe3Ini);

function applyTouchControlMethod(ini) {
  const want = isTouchDevice ? 1 : 0;
  if (/Method=\d+/i.test(ini)) return ini.replace(/Method=\d+/i, 'Method=' + want);
  return ini + '\n[Controller]\nMethod=' + want + '\n';
}

let bootStarted = false;
let audioUnlocked = false;
let worldLoadComplete = false;
let autoEnterDone = false;
let worldStreamStarted = false;
const trackedAudioContexts = new Set();
const asyncUrlCache = new Map();
const assetDataCache = new Map();
const assetNotFound = new Set();
const streamedPreloadLog = new Set();

function toPreloadListPath(path) {
  const normalized = normalizeAssetRel(path);
  const rel = normalized.replace(/^gta3-assets\/local\//i, '');
  return `${ASSET_PREFIX}/${rel}`;
}

function parsePreloadList(text) {
  const paths = [];
  const seen = new Set();
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const path = toPreloadListPath(line);
    const key = normalizeAssetRel(path);
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(path);
  }
  return paths;
}

function recordStreamedPreload(rel) {
  streamedPreloadLog.add(toPreloadListPath(rel));
}

function printStreamedPreloadLog() {
  const lines = ['# regta3dos streamed preload list', ...streamedPreloadLog];
  const text = lines.join('\n');
  console.log(text);
  streamedPreloadLog.clear();
  return text;
}

window.regta3PrintStreamedPreload = printStreamedPreloadLog;
window.regta3DumpStreamedPreload = printStreamedPreloadLog;

(function patchAudioContextTracking() {
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (!Orig || Orig.__regta3Patched) return;
  class PatchedAudioContext extends Orig {
    constructor(...args) {
      super(...args);
      trackedAudioContexts.add(this);
      const kick = () => {
        if (this.state === 'suspended') {
          this.resume().catch(() => { });
        }
      };
      for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchstart']) {
        document.addEventListener(ev, kick, true);
      }
    }
  }
  PatchedAudioContext.__regta3Patched = true;
  window.AudioContext = PatchedAudioContext;
  if ('webkitAudioContext' in window) window.webkitAudioContext = PatchedAudioContext;
})();

function showDiagError(msg) {
  console.warn('[regta3] DIAGNOSTIC:', msg);
  setStatus('ERROR: ' + msg);
}

window.addEventListener('error', (ev) => {
  const err = ev.error || ev;
  const msg = (err && err.message) ? err.message : String(err);
  if (msg && (msg.includes('RuntimeError') || msg.includes('unreachable') || msg.includes('memory access') ||
    msg.includes('abort') || msg.includes('Aborted') || msg.includes('wasm'))) {
    showDiagError('WASM crash: ' + msg);
  }
});

window.addEventListener('unhandledrejection', (ev) => {
  const msg = ev.reason ? String(ev.reason.message || ev.reason) : 'unknown';
  console.error('[regta3] Unhandled rejection:', msg);
});

function updateLoaderUI(done, total) {
  const percentEl = document.getElementById('loading-percent');
  const barEl = document.getElementById('loading-bar-fill');

  if (percentEl && total > 0) {
    const pct = Math.min(100, Math.floor((done / total) * 100));
    percentEl.textContent = pct + '%';
    if (barEl) barEl.style.width = pct + '%';
  }
}

function showStartPromptUI() {
  const box = document.getElementById('loading-box');
  const prompt = document.getElementById('start-prompt');
  if (box) box.style.display = 'none';
  if (prompt) prompt.style.display = 'block';
}

function hideLoaderUI() {
  const overlay = document.getElementById('status-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function setStatus(text) {
  if (text) {
    console.log('[regta3] status:', text);
  }
}

function setProgress(done, total) {
  if (!total) return;
  updateLoaderUI(done, total);
}

function hideTapHint() {
  if (tapHintEl) tapHintEl.hidden = true;
}

function markGameStarted() {
  worldLoadComplete = true;
  setProgress(0, 0);
  hideTapHint();
  hideLoaderUI();
  document.body.classList.add('game-started');
}

function simulateEnter(target) {
  const el = target || canvas || window;
  const opts = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
}

function maybeAutoEnter(line) {
  if (autoEnterDone) return;
  if (!line.includes('[regta3] gGameState = GS_FRONTEND')) return;
  autoEnterDone = true;
  const target = canvas || window;
  let n = 0;
  const kick = () => {
    simulateEnter(target);
    n += 1;
    if (n < 3) setTimeout(kick, 700);
  };
  setTimeout(kick, 400);
}

let worldStreamDone = 0;
let worldStreamTotal = 0;
async function prefetchWorldModels() {
  if (worldStreamStarted) return;
  worldStreamStarted = true;
  let lines = [];
  try {
    const res = await fetch(STREAM_URL);
    if (res.ok) {
      const text = await res.text();
      lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    }
  } catch (err) {
    return;
  }
  if (!lines.length) return;
  worldStreamTotal = lines.length;
  let i = 0;
  const BATCH = 8;
  const pump = () => {
    for (let n = 0; n < BATCH && i < lines.length; n++, i++) {
      const rel = lines[i].replace(/^gta3-assets\/local\//i, '');
      prefetchAssetAsync(rel);
    }
    worldStreamDone = i;
    if (i < lines.length) {
      setTimeout(pump, 20);
    }
  };
  setTimeout(pump, 500);
}

function updateStatusFromRegta3(line) {
  maybeAutoEnter(line);
  if (line.includes('gGameState = GS_FRONTEND')) {
    prefetchWorldModels();
    prefetchAssetAsync('audio/bet.mp3');
    prefetchAssetAsync('audio/c1_tex.mp3');
    prefetchAssetAsync('audio/head.wav');
    prefetchAssetAsync('audio/police.wav');
  }
  const txdMatch = line.match(/full path was (models\/[^\s"]+\.txd)/i);
  if (txdMatch) {
    prefetchAssetAsync(txdMatch[1].toLowerCase());
  }
  if (line.includes('gGameState = GS_PLAYING_GAME') || line.includes('[regta3] gGameState = GS_PLAYING_GAME')) {
    unlockWebAudio();
    prefetchAssetAsync('audio/bet.mp3');
    prefetchAssetAsync('audio/c1_tex.mp3');
    prefetchAssetAsync('audio/head.wav');
    prefetchAssetAsync('audio/police.wav');
    return;
  }
  if (line.includes('SET_INTRO_IS_PLAYING 0') || line.includes('post-intro stream')) {
    prefetchFirstMissionAudio();
  }
  if (line.includes('per-sample MP3 bank')) {
    prefetchHotSfxAsync();
    prefetchRadioBedsAsync();
    prefetchFirstMissionAudio();
  }
  if (line.includes('OpenAL context created') || line.includes('per-sample MP3 bank') ||
    line.includes("LoadCutsceneData('") || line.includes('START_CUTSCENE') || line.includes('preload audio')) {
    unlockWebAudio();
    const cut = line.match(/LoadCutsceneData\('([^']+)'\)/i) || line.match(/START_CUTSCENE '([^']+)'/i) || line.match(/preload audio (\S+)/i);
    if (cut && cut[1]) {
      const name = String(cut[1]).toLowerCase();
      prefetchAssetAsync(resolveAudioRel(`audio/${name}.mp3`));
    }
  }
  if (line.includes('gGameState = GS_INIT_PLAYING_GAME')) {
    unlockWebAudio();
    return;
  }
  if (!line.includes('[regta3]')) return;
  if (line.includes('Idle frame 0: after RenderScene')) {
    markGameStarted();
  }
}

function getOpenAlHandle() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.__regta3AL) return globalThis.__regta3AL;
    if (typeof Module !== 'undefined' && Module.AL) return Module.AL;
    if (typeof AL !== 'undefined') return AL;
  } catch (_) { }
  return null;
}

function beepOnContext(ctx) {
  if (!ctx) return;
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch (_) { }
}

function resumeAudioCtx(ctx) {
  if (!ctx) return Promise.resolve();
  try {
    if (ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') {
        return p.then(() => beepOnContext(ctx)).catch(() => { });
      }
    } else if (ctx.state === 'running') {
      beepOnContext(ctx);
    }
  } catch (_) { }
  return Promise.resolve();
}

function collectAudioContexts() {
  const out = new Set(trackedAudioContexts);
  try {
    const al = getOpenAlHandle();
    if (al && al.contexts) {
      for (const id of Object.keys(al.contexts)) {
        const c = al.contexts[id];
        if (c && c.audioCtx) out.add(c.audioCtx);
      }
    }
    if (al && al.currentCtx && al.currentCtx.audioCtx) out.add(al.currentCtx.audioCtx);
  } catch (_) { }
  return [...out];
}

function resumeOpenAlContexts() {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.__regta3ResumeOpenAl === 'function') {
      globalThis.__regta3ResumeOpenAl();
    }
    if (typeof Module !== 'undefined' && typeof Module.resumeRegta3Audio === 'function') {
      Module.resumeRegta3Audio();
    }
  } catch (_) { }
  return Promise.all(collectAudioContexts().map((ctx) => resumeAudioCtx(ctx)));
}

function anyAudioRunning() {
  return collectAudioContexts().some((ctx) => ctx && ctx.state === 'running');
}

function unlockWebAudio() {
  return resumeOpenAlContexts().then(() => {
    if (anyAudioRunning()) {
      audioUnlocked = true;
      hideTapHint();
    }
  });
}

function installGestureUnlock() {
  const unlock = () => {
    unlockWebAudio();
    try {
      if (canvas) canvas.focus({ preventScroll: true });
    } catch (_) { }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('mousedown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
}

function installPointerLockErrorSwallow() {
  const patch = (proto) => {
    if (!proto || proto.__regta3LockSwallow) return;
    proto.__regta3LockSwallow = true;
    const orig = proto.requestPointerLock;
    if (typeof orig !== 'function') return;
    proto.requestPointerLock = function (...args) {
      try {
        const ret = orig.apply(this, args);
        if (ret && typeof ret.catch === 'function') return ret.catch(() => { });
        return ret;
      } catch (_) {
        return undefined;
      }
    };
  };
  patch(Element.prototype);
  if (canvas) patch(Object.getPrototypeOf(canvas));
}

async function loadPreloadList() {
  const res = await fetch(PRELOAD_URL);
  if (!res.ok) throw new Error(`preload list: HTTP ${res.status}`);
  const text = await res.text();
  return parsePreloadList(text);
}

function isBootDeferredAsset(rel) {
  const r = normalizeAssetRel(rel);
  if (r.startsWith('audio/') && !r.includes('sfx')) {
    if (/\b(bet|c1_tex|jb|end|head|police|l1_lg|l2_dsb|l3_dm|l4_pap|l5_tfb|lib_a|lib_a1|lib_a2|lib_b|lib_c|lib_d|ammu)\./i.test(r)) return false;
    if (/\.(wav|mp3)$/i.test(r)) return true;
  }
  return false;
}

function bootPreloadPriority(path) {
  const r = normalizeAssetRel(path.replace(/^gta3-assets\/local\//i, ''));
  if (/(?:^|\/)cuts\.img$/i.test(r) || /\.dir$/i.test(r) || /frontend|menu\.txd|fonts/i.test(r)) return 0;
  if (r.startsWith('data/') || r.startsWith('text/')) return 1;
  if (r.startsWith('models/coll') || r.startsWith('models/generic')) return 1;
  if (r.startsWith('models/gta3.img/')) return 2;
  if (r.startsWith('anim/') || r.startsWith('txd/')) return 2;
  return 3;
}

function cacheAssetData(rel, data) {
  // Prevent keeping huge radio stations in JS RAM cache after writing to VFS
  const r = normalizeAssetRel(rel);
  if (r.startsWith('audio/') && !r.includes('sfx') && data && data.length > 5 * 1024 * 1024) {
    return; // Don't hold 50MB audio buffers in duplicate JS memory
  }
  assetDataCache.set(r, data);
}

function getCachedAsset(rel) {
  return assetDataCache.get(normalizeAssetRel(rel));
}

async function readResponseBytes(res, onProgress) {
  const buf = new Uint8Array(await res.arrayBuffer());
  if (onProgress) onProgress(buf.length, buf.length);
  return buf;
}

const ASSET_CACHE_KEY = 'gta3-assets';
let cacheStoragePromise = null;
async function getCacheStorage() {
  if (cacheStoragePromise) return cacheStoragePromise;
  if (typeof caches === 'undefined') return null;
  cacheStoragePromise = caches.open(ASSET_CACHE_KEY).catch(() => null);
  return cacheStoragePromise;
}

async function fetchAsset(relPath, onProgress) {
  const cached = getCachedAsset(relPath);
  if (cached) {
    if (onProgress) onProgress(cached.length, cached.length);
    return cached;
  }
  const nKey = normalizeAssetRel(relPath);
  if (nKey === 'audio/sfx.raw' || nKey.endsWith('/sfx.raw')) {
    throw new Error(`asset ${relPath}: directory, not a file`);
  }
  const bases = ASSET_BASES_WORKING;
  const cache = await getCacheStorage();

  let lastErr;
  for (const base of bases) {
    const url = base + relPath;
    try {
      if (cache) {
        try {
          const cachedRes = await cache.match(url);
          if (cachedRes) {
            const data = new Uint8Array(await cachedRes.arrayBuffer());
            cacheAssetData(relPath, data);
            if (onProgress) onProgress(data.length, data.length);
            return data;
          }
        } catch (_) { }
      }
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`asset ${relPath}: HTTP ${res.status}`);
        continue;
      }
      const data = await readResponseBytes(res, onProgress);
      cacheAssetData(relPath, data);
      if (cache) {
        try {
          const respToCache = new Response(data.slice(0), {
            headers: { 'Content-Type': 'application/octet-stream' }
          });
          cache.put(url, respToCache).catch(() => { });
        } catch (_) { }
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`asset ${relPath}: fetch failed`);
}

async function runPool(items, concurrency, workerFn) {
  let cursor = 0;
  const workers = [];
  const n = Math.min(concurrency, Math.max(1, items.length));
  for (let w = 0; w < n; w++) {
    workers.push((async () => {
      for (; ;) {
        const i = cursor++;
        if (i >= items.length) return;
        await workerFn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
}

function normalizeAssetRel(rel) {
  return String(rel).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function isTextureProbe(rel) {
  const r = normalizeAssetRel(rel);
  if (!/\.(tga|bmp|png)$/i.test(r)) return false;
  if (/\/(generic|misc)\//i.test(r) || /player\./i.test(r) || /fonts/i.test(r)) return false;
  if (/^[^/]+\.(tga|bmp|png)$/i.test(r)) return true;
  return true;
}

function shouldAvoidNetworkForAsset(rel) {
  const r = normalizeAssetRel(rel);
  if (isTextureProbe(r)) return true;
  if (r.startsWith('userfiles/') || r.includes('/userfiles/')) return true;
  if (r === 'audio/sfxbank.raw' || r === 'audio/sound.cache') return true;
  return false;
}

function toAssetPath(file) {
  let path = String(file).replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!path.startsWith(`${ASSET_PREFIX}/`)) {
    path = `${ASSET_PREFIX}/${path.replace(/^\/+/, '')}`;
  }
  return path.toLowerCase();
}

function assetCandidates(rel) {
  const r0 = normalizeAssetRel(rel);
  const r = (r0.startsWith('audio/') && !r0.includes('sfx')) ? resolveAudioRel(r0) : r0;
  const out = [];
  const add = (path) => {
    const n = normalizeAssetRel(path);
    if (!out.includes(n)) out.push(n);
  };

  add(r);

  let m = r.match(/^models\/([^/]+\.(dff|txd|col|ifp))$/);
  if (m) add(`models/gta3.img/${m[1]}`);

  m = r.match(/^models\/([^/]+)\/([^/]+\.(dff|txd|col|ifp))$/);
  if (m && m[1] !== 'gta3.img' && m[1] !== 'coll' && m[1] !== 'generic') {
    add(`models/gta3.img/${m[2]}`);
  }

  m = r.match(/^([^/]+\.(txd|dff))$/);
  if (m) {
    add(`txd/${m[1]}`);
    add(`models/${m[1]}`);
  }

  if (r.endsWith('.dir')) {
    const base = r.slice(0, -4);
    if (base.endsWith('gta3_archive')) add('models/gta3.dir');
    if (base.endsWith('cuts')) add('anim/cuts.dir');
  }

  if (r.endsWith('cuts.img') || r.endsWith('cuts.IMG')) {
    add('anim/cuts.img');
    add('ANIM/CUTS.IMG');
  }

  m = r.match(/^chase(\d+)\.dat$/i);
  if (m) add(`data/paths/chase${m[1]}.dat`);
  m = r.match(/^data\/paths\/chase(\d+)\.dat$/i);
  if (m) add(`chase${m[1]}.dat`);

  if (r === 'userfiles/gta3.set' || r.endsWith('/userfiles/gta3.set')) {
    add('gta3.set');
  }

  return out;
}

async function fetchFirstAvailable(candidates, onProgress) {
  let lastErr;
  for (const rel of candidates) {
    try {
      return { rel, data: await fetchAsset(rel, onProgress) };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('no asset candidates');
}

function vfsPathExists(Module, vfsPath) {
  try {
    return Module.FS.analyzePath(vfsPath).exists;
  } catch (_) {
    return false;
  }
}

function writeAssetToFs(Module, path, data) {
  const vfsPath = '/' + path.replace(/^\/+/, '');
  const dir = vfsPath.substring(0, vfsPath.lastIndexOf('/'));
  Module.FS.mkdirTree(dir);
  Module.FS.writeFile(vfsPath, data);
}

function ensureGameDirs(Module) {
  const dirs = [
    `/${ASSET_PREFIX}/userfiles`,
    `/${ASSET_PREFIX}/skins`,
    `/${ASSET_PREFIX}/audio`,
    `/${ASSET_PREFIX}/audio/sfx.raw`,
    `/${ASSET_PREFIX}/data`,
    `/${ASSET_PREFIX}/data/paths`,
    `/${ASSET_PREFIX}/data/maps`,
    `/${ASSET_PREFIX}/models`,
    `/${ASSET_PREFIX}/models/coll`,
    `/${ASSET_PREFIX}/models/generic`,
    `/${ASSET_PREFIX}/models/gta3.img`,
    `/${ASSET_PREFIX}/anim`,
    `/${ASSET_PREFIX}/ANIM`,
    `/${ASSET_PREFIX}/txd`,
    `/${ASSET_PREFIX}/text`,
    '/userfiles',
    '/skins',
    '/audio',
    '/audio/sfx.raw',
    '/data',
    '/data/paths',
    '/data/maps',
    '/models',
    '/models/coll',
    '/models/generic',
    '/models/gta3.img',
    '/anim',
    '/ANIM',
    '/txd',
    '/text',
  ];
  for (const dir of dirs) {
    try { Module.FS.mkdirTree(dir); } catch (_) { }
  }
  installFsLogging(Module);
}

function installFsLogging(Module) {
  if (!Module || !Module.FS || Module.FS.__loggingInstalled) return;
  Module.FS.__loggingInstalled = true;
  const origOpen = Module.FS.open;
  if (origOpen) {
    Module.FS.open = function (path, flags, mode) {
      const p = String(path);
      try {
        const stream = origOpen.apply(this, arguments);
        return stream;
      } catch (err) {
        throw err;
      }
    };
  }
}

function isExpectedAssetMiss(vfsPath) {
  const p = String(vfsPath || '').toLowerCase();
  return (
    p.includes('sound.cache') ||
    p.includes('sfxbank') ||
    p.includes('gta3sf') ||
    p.endsWith('.b') ||
    p.includes('$$') ||
    p.endsWith('.tga') ||
    p.endsWith('.bmp') ||
    p.endsWith('.png') ||
    p.endsWith('.tif') ||
    isWrongAudioFormat(p.replace(/^\/gta3-assets\/local\//i, ''))
  );
}

const USERFILES_MOUNT = `/${ASSET_PREFIX}/userfiles`;

async function mountUserfilesIdbfs(Module) {
  const mountPath = USERFILES_MOUNT;
  try { Module.FS.mkdirTree(mountPath); } catch (_) { }
  if (!Module.FS.filesystems || !Module.FS.filesystems.IDBFS) {
    console.warn('[regta3] IDBFS unavailable — saves will not persist across reload');
    return false;
  }
  try {
    Module.FS.mount(Module.FS.filesystems.IDBFS, {}, mountPath);
  } catch (err) {
    console.warn('[regta3] IDBFS mount failed:', err && err.message ? err.message : err);
    return false;
  }
  return new Promise((resolve) => {
    Module.FS.syncfs(true, (err) => {
      if (err) {
        console.warn('[regta3] IDBFS populate failed:', err);
        resolve(false);
        return;
      }
      console.log('[regta3] IDBFS userfiles ready');
      resolve(true);
    });
  });
}

function scheduleUserfilesPersist(Module) {
  if (!Module.FS.filesystems || !Module.FS.filesystems.IDBFS) return;
  let pending = false;
  const backupRe3Ini = () => {
    try {
      const data = Module.FS.readFile(`${USERFILES_MOUNT}/re3.ini`, { encoding: 'utf8' });
      if (data && data.length > 0) localStorage.setItem('regta3dos.re3.ini', data);
    } catch (_) { }
  };
  const flush = () => {
    if (pending) return;
    pending = true;
    backupRe3Ini();
    try {
      Module.FS.syncfs(false, (err) => {
        pending = false;
        if (err) {
          console.warn('[regta3] IDBFS flush failed:', err);
          return;
        }
      });
    } catch (err) {
      pending = false;
    }
  };
  setInterval(flush, 20000);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  Module.persistUserfiles = flush;
}

function scheduleRe3IniPersist(Module) {
  const iniPath = `/${ASSET_PREFIX}/re3.ini`;
  const save = () => {
    try {
      if (!vfsPathExists(Module, iniPath)) return;
      const data = Module.FS.readFile(iniPath, { encoding: 'utf8' });
      if (data && data.length > 0) localStorage.setItem('regta3dos.re3.ini', data);
    } catch (err) {
      console.warn('[regta3] re3.ini persist failed:', err && err.message ? err.message : err);
    }
  };
  setInterval(save, 20000);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  Module.persistRe3Ini = save;
}

const prefetchPending = new Set();
function prefetchAssetAsync(rel) {
  const resolved = (normalizeAssetRel(rel).startsWith('audio/') && !normalizeAssetRel(rel).includes('sfx'))
    ? resolveAudioRel(rel) : normalizeAssetRel(rel);
  const nKey = normalizeAssetRel(resolved);
  if (shouldAvoidNetworkForAsset(resolved) || assetNotFound.has(nKey) || assetDataCache.has(nKey) || prefetchPending.has(nKey)) return;
  if (isWrongAudioFormat(rel)) {
    assetNotFound.add(normalizeAssetRel(rel));
  }
  prefetchPending.add(nKey);
  fetchFirstAvailable(assetCandidates(resolved)).then(({ rel: usedRel, data }) => {
    cacheAssetData(usedRel, data);
    cacheAssetData(resolved, data);
    recordStreamedPreload(usedRel);
    const Module = window.Module;
    if (Module && Module.FS) {
      try { writeAssetToFs(Module, `${ASSET_PREFIX}/${usedRel}`, data); } catch (_) { }
      if (usedRel !== resolved) {
        try { writeAssetToFs(Module, `${ASSET_PREFIX}/${resolved}`, data); } catch (_) { }
      }
    }
  }).catch(() => {
    assetNotFound.add(nKey);
  });
}

const loadAsyncFilePending = new Map();
const asyncFileStatus = new Map();
let reportLoadProgressLast = 0;
let reportLoadProgressShown = false;
function loadAsyncFile(vfsPath) {
  const key = String(vfsPath).toLowerCase();
  const inflight = loadAsyncFilePending.get(key);
  if (inflight) return inflight;
  asyncFileStatus.set(key, 'pending');
  const p = loadAsyncFileInner(vfsPath)
    .catch(() => false)
    .then((ok) => {
      asyncFileStatus.set(key, ok ? 'ok' : 'notfound');
      return ok;
    })
    .finally(() => loadAsyncFilePending.delete(key));
  loadAsyncFilePending.set(key, p);
  return p;
}

function getAsyncFileStatus(vfsPath) {
  const Module = window.Module;
  const key = String(vfsPath).toLowerCase();
  const normalized = '/' + key.replace(/^\/+/, '');
  if (Module && Module.FS && vfsPathExists(Module, normalized)) return 1;
  const rel = normalizeAssetRel(normalized.replace(/^\/gta3-assets\/local\//i, ''));
  const st = asyncFileStatus.get(key);
  if (st === 'ok') return 1;
  if (st === 'notfound') return 2;
  if (shouldAvoidNetworkForAsset(rel) || assetNotFound.has(rel)) return 2;
  return 0;
}

async function loadAsyncFileInner(vfsPath) {
  const Module = window.Module;
  if (!Module || !Module.FS) return false;
  const normalized = '/' + String(vfsPath).replace(/^\/+/, '').toLowerCase();
  if (vfsPathExists(Module, normalized)) return true;
  let rel = normalized.replace(/^\/gta3-assets\/local\//i, '');
  let aliasWrongExt = null;
  if (rel.startsWith('audio/') && !rel.includes('sfx')) {
    const fixed = resolveAudioRel(rel);
    if (fixed !== rel) {
      aliasWrongExt = normalizeAssetRel(rel);
      rel = fixed;
      const fixedVfs = `/${ASSET_PREFIX}/${fixed}`;
      if (vfsPathExists(Module, fixedVfs)) {
        try {
          writeAssetToFs(Module, `${ASSET_PREFIX}/${aliasWrongExt}`, Module.FS.readFile(fixedVfs));
        } catch (_) { }
        return true;
      }
    }
  }
  if (shouldAvoidNetworkForAsset(rel)) return false;
  const candidates = assetCandidates(rel);
  for (const c of candidates) {
    if (c !== rel && vfsPathExists(Module, `/${ASSET_PREFIX}/${c}`)) {
      try {
        const data = Module.FS.readFile(`/${ASSET_PREFIX}/${c}`);
        writeAssetToFs(Module, `${ASSET_PREFIX}/${rel}`, data);
        if (aliasWrongExt) writeAssetToFs(Module, `${ASSET_PREFIX}/${aliasWrongExt}`, data);
        return true;
      } catch (_) { }
    }
  }
  if (assetNotFound.has(normalizeAssetRel(rel)) &&
    candidates.every((c) => assetNotFound.has(normalizeAssetRel(c)))) {
    return false;
  }
  try {
    const { rel: usedRel, data } = await fetchFirstAvailable(candidates);
    cacheAssetData(usedRel, data);
    recordStreamedPreload(usedRel);
    writeAssetToFs(Module, `${ASSET_PREFIX}/${usedRel}`, data);
    if (usedRel !== rel) {
      try { writeAssetToFs(Module, `${ASSET_PREFIX}/${rel}`, data); } catch (_) { }
    }
    if (aliasWrongExt && aliasWrongExt !== usedRel) {
      try { writeAssetToFs(Module, `${ASSET_PREFIX}/${aliasWrongExt}`, data); } catch (_) { }
    }
    return true;
  } catch (err) {
    assetNotFound.add(normalizeAssetRel(rel));
    console.warn('[regta3] loadAsyncFile miss:', rel, err && err.message ? err.message : err);
    return false;
  }
}

const HOT_SFX_IDS = [
  10, 11, 15, 16, 18, 19, 21, 22, 29, 30, 32, 33, 34, 35, 36,
  103, 104, 105, 106, 107, 116, 117, 118, 119, 120,
  141, 142, 143, 144, 148, 157, 188,
  284, 285, 287, 288, 294, 295, 297, 298,
  338, 339, 343, 344, 357, 358, 359, 372, 373, 374, 375, 376, 377, 378, 379,
];
let hotSfxPrefetchStarted = false;
function prefetchHotSfxAsync() {
  if (hotSfxPrefetchStarted) return;
  hotSfxPrefetchStarted = true;
  let i = 0;
  const pump = () => {
    const batch = 6;
    for (let n = 0; n < batch && i < HOT_SFX_IDS.length; n++, i++) {
      prefetchAssetAsync(`audio/sfx.raw/${HOT_SFX_IDS[i]}.mp3`);
    }
    if (i < HOT_SFX_IDS.length) {
      setTimeout(pump, 40);
    } else {
      console.log(`[regta3] SFX prefetch queued: ${HOT_SFX_IDS.length} samples`);
    }
  };
  setTimeout(pump, 100);
}

let radioBedPrefetchStarted = false;
function prefetchRadioBedsAsync() {
  if (radioBedPrefetchStarted) return;
  radioBedPrefetchStarted = true;
  // Empty: The engine will stream whichever radio station is active when entering the car.
  // Downloading all 12 at once dumps 500MB+ into RAM and forces iOS Safari to reload!
}

const FIRST_MISSION_AUDIO = [
  'audio/l1_lg.mp3',
  'audio/lib_a.wav', 'audio/lib_a1.wav', 'audio/lib_a2.wav',
  'audio/lib_b.wav', 'audio/lib_c.wav', 'audio/lib_d.wav',
  'audio/l2_a.wav', 'audio/ammu_a.wav', 'audio/ammu_b.wav', 'audio/ammu_c.wav',
];
let firstMissionAudioPrefetchStarted = false;
function prefetchFirstMissionAudio() {
  if (firstMissionAudioPrefetchStarted) return;
  firstMissionAudioPrefetchStarted = true;
  for (const rel of FIRST_MISSION_AUDIO)
    prefetchAssetAsync(rel);
  console.log('[regta3] first-mission audio prefetch started');
}

function wantsTouchControls() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch (_) { }
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

const isTouchDevice = wantsTouchControls();

const TOUCH_BTN = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, L3: 10, R3: 11,
};

const TOUCH_BUTTONS = [
  ['.touch-control.run', TOUCH_BTN.A],
  ['.touch-control.fist', TOUCH_BTN.B],
  ['.touch-control.jump', TOUCH_BTN.X],
  ['.touch-control.getIn', TOUCH_BTN.Y],
  ['.touch-control.radio', TOUCH_BTN.LB],
  ['.touch-control.drift', TOUCH_BTN.RB],
  ['.touch-control.weapon', TOUCH_BTN.RT],
  ['.touch-control.camera', TOUCH_BTN.BACK],
  ['.touch-control.menu', TOUCH_BTN.START],
  ['.touch-control.horn', TOUCH_BTN.L3],
  ['.touch-control.job', TOUCH_BTN.R3],
  ['.touch-control.fireLeft', [TOUCH_BTN.B, TOUCH_BTN.LT]],
  ['.touch-control.fireRight', [TOUCH_BTN.B, TOUCH_BTN.RT]],
];

let touchEmulator = null;
let touchPadIndex = -1;
let touchBindings = [];

function releaseHiddenTouchButtons() {
  if (!touchEmulator || touchPadIndex < 0) return;
  for (const { el, buttonIndexes } of touchBindings) {
    if (getComputedStyle(el).display !== 'none') continue;
    try {
      touchEmulator.PressButton(touchPadIndex, buttonIndexes, 0, false);
    } catch (_) { }
  }
}

function installTouchControls() {
  document.body.dataset.isTouch = isTouchDevice ? '1' : '0';
  if (!isTouchDevice) return;

  // Block pointer lock on touch devices so mobile browsers won't cancel touches
  if (canvas) {
    canvas.requestPointerLock = () => { };
  }
  document.exitPointerLock = () => { };

  if (typeof GamepadEmulator !== 'function') {
    console.warn('[regta3] gamepad-emulator.js not loaded — touch unavailable');
    return;
  }
  if (touchEmulator) return;

  try {
    touchEmulator = new GamepadEmulator();
  } catch (err) {
    console.warn('[regta3] GamepadEmulator:', err && err.message ? err.message : err);
    return;
  }

  const pad = touchEmulator.AddEmulatedGamepad(null, true);
  if (!pad) {
    console.warn('[regta3] failed to create emulated gamepad');
    return;
  }

  const index = pad.index;

  const sticks = [
    ['touch-move', 0, 1],
    ['touch-look', 2, 3],
  ];
  for (const [id, xAxisIndex, yAxisIndex] of sticks) {
    const tapTarget = document.getElementById(id);
    if (!tapTarget) continue;
    touchEmulator.AddDisplayJoystickEventListeners(index, [{
      directions: { up: true, down: true, left: true, right: true },
      dragDistance: 100,
      tapTarget,
      lockTargetWhilePressed: true,
      xAxisIndex,
      yAxisIndex,
    }]);
  }

  const configs = [];
  for (const [selector, buttonIndexes] of TOUCH_BUTTONS) {
    const tapTarget = document.querySelector(selector);
    if (!tapTarget) continue;
    const indexes = Array.isArray(buttonIndexes) ? buttonIndexes : [buttonIndexes];
    configs.push({
      buttonIndexes: indexes,
      type: 'onOff',
      lockTargetWhilePressed: false,
      tapTarget,
    });
    touchBindings.push({ el: tapTarget, buttonIndexes: indexes });
  }
  touchEmulator.AddDisplayButtonEventListeners(index, configs);
  touchPadIndex = index;
}

const TOUCH_STATE_BITS = [
  [1 << 0, 'stateMenu'],
  [1 << 1, 'stateCutscene'],
  [1 << 2, 'stateCar'],
  [1 << 3, 'stateGun'],
  [1 << 4, 'stateCarGun'],
  [1 << 5, 'stateJob'],
  [1 << 6, 'stateVehGun'],
];

function setTouchState(flags) {
  const ds = document.body.dataset;
  let changed = false;
  for (const [bit, name] of TOUCH_STATE_BITS) {
    const want = (flags & bit) ? '1' : '0';
    if (ds[name] !== want) {
      ds[name] = want;
      changed = true;
    }
  }
  if (changed) releaseHiddenTouchButtons();
}

function setTouchDownloadState(on) {
  const want = on ? '1' : '0';
  if (document.body.dataset.stateDownload !== want) {
    document.body.dataset.stateDownload = want;
    releaseHiddenTouchButtons();
  }
}

async function resolveAsyncUrl(file) {
  const path = toAssetPath(file);
  if (asyncUrlCache.has(path)) {
    return asyncUrlCache.get(path);
  }
  const rel = path.replace(/^gta3-assets\/local\//i, '');
  const { rel: usedRel, data } = await fetchFirstAvailable(assetCandidates(rel));
  recordStreamedPreload(usedRel);
  const url = URL.createObjectURL(new Blob([data]));
  asyncUrlCache.set(path, url);
  return url;
}

async function loadDataChunks() {
  const pkg = window.DATA_PACKAGE;
  if (!pkg || !pkg.chunks || !pkg.remote_package_size) {
    console.warn("[regta3] DATA_PACKAGE not found in packages.js. Falling back to direct network loads.");
    return;
  }

  let cache;
  try {
    cache = await caches.open(`gta3-chunks-${BUILD_VERSION}`);
  } catch (e) {
    console.warn("[regta3] Failed to open Cache API for chunks:", e);
  }

  let totalDownloaded = 0;
  const dataSize = pkg.remote_package_size;

  const processChunk = async (chunkName) => {
    const path = `${CHUNKS_DIR}${chunkName}`;

    if (cache) {
      const cachedResponse = await cache.match(path);
      if (cachedResponse) {
        const buffer = await cachedResponse.arrayBuffer();
        totalDownloaded += buffer.byteLength;
        setProgress(totalDownloaded, dataSize);
        return buffer;
      }
    }

    const response = await fetch(path);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch chunk ${path}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;
      totalDownloaded += value.length;
      setProgress(totalDownloaded, dataSize);
    }

    const chunkBuffer = new Uint8Array(receivedLength);
    let offset = 0;
    for (const chunk of chunks) {
      chunkBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    if (cache) {
      await cache.put(path, new Response(chunkBuffer.buffer));
    }
    return chunkBuffer.buffer;
  };

  const chunkBuffers = await Promise.all(pkg.chunks.map(chunk => processChunk(chunk)));
  const fullBuffer = new Uint8Array(dataSize);
  let offset = 0;
  for (const buf of chunkBuffers) {
    fullBuffer.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  // Properly register all path variations into RAM cache
  for (const file of pkg.files) {
    const data = fullBuffer.subarray(file.start, file.end);
    const cleanPath = file.filename.replace(/^\/+/, '');
    const rel = cleanPath.replace(/^gta3-assets\/local\//i, '').replace(/^\/+/, '');

    cacheAssetData(rel, data);
    cacheAssetData(cleanPath, data);
    cacheAssetData(file.filename, data);

    const candidates = assetCandidates(rel);
    for (const cand of candidates) {
      cacheAssetData(cand, data);
    }
  }

  console.log(`[regta3] Successfully loaded ${pkg.files.length} assets from chunks into RAM.`);
}

let gameEngineReady = false;
let launchGameCallback = null;

const Module = {
  instantiateWasm: async (imports, callback) => {
    const binary = await (await fetch(`re3.wasm?v=${BUILD_VERSION}`)).arrayBuffer();
    const wasm = await WebAssembly.instantiate(binary, imports);
    callback(wasm.instance);
  },
  noInitialRun: true,
  noExitRuntime: true,
  canvas,
  regta3LanguageOverride: 0,
  regta3IsTouch: isTouchDevice,
  setTouchState,
  locateFile(path) {
    if (path.endsWith('.wasm')) return `re3.wasm?v=${BUILD_VERSION}`;
    return path;
  },
  preRun: [],
  postRun: [],
  print(...args) {
    const line = args.join(' ');
    updateStatusFromRegta3(line);
  },
  printErr(...args) {
    const msg = args.join(' ');
    if (msg.includes('emscripten_set_main_loop_timing') ||
      msg.includes('GLFW_CURSOR_HIDDEN') ||
      msg.includes('emscripten_sleep') ||
      msg.includes('alGetProcAddress') ||
      msg.includes('bad name in alGetProcAddress')) return;
    console.error(...args);
  },
  setStatus,
  async initFS() {
    // Populate assetDataCache from chunks first
    try {
      await loadDataChunks();
    } catch (err) {
      console.warn('[regta3] Chunk loading failed, falling back to direct network loads:', err);
    }

    const allPaths = await loadPreloadList();
    const paths = allPaths
      .filter((path) => !isBootDeferredAsset(path.replace(/^gta3-assets\/local\//i, '')))
      .sort((a, b) => bootPreloadPriority(a) - bootPreloadPriority(b));

    let done = 0;
    let bytes = 0;
    const total = paths.length;

    const ingestLoaded = (path, rel, data) => {
      writeAssetToFs(Module, path, data);
      try { writeAssetToFs(Module, rel, data); } catch (_) { }
      bytes += data.length || 0;
      const imgMatch = rel.match(/^(models)\/gta3\.img\/([^/]+)$/i);
      if (imgMatch) {
        const aliasRel = `${imgMatch[1]}/${imgMatch[2]}`;
        try {
          writeAssetToFs(Module, `${ASSET_PREFIX}/${aliasRel}`, data);
          writeAssetToFs(Module, aliasRel, data);
        } catch (_) { }
        assetNotFound.delete(normalizeAssetRel(aliasRel));
        cacheAssetData(aliasRel, data);
      }
      const cutsMatch = rel.match(/^anim\/(cuts\.(img|dir))$/i);
      if (cutsMatch) {
        const fname = cutsMatch[1].toUpperCase();
        const upperRel = `ANIM/${fname}`;
        try {
          writeAssetToFs(Module, `${ASSET_PREFIX}/${upperRel}`, data);
          writeAssetToFs(Module, upperRel, data);
        } catch (_) { }
        assetNotFound.delete(normalizeAssetRel(upperRel));
        cacheAssetData(upperRel, data);
        const lowerRel = `anim/${cutsMatch[1].toLowerCase()}`;
        try {
          writeAssetToFs(Module, `${ASSET_PREFIX}/${lowerRel}`, data);
          writeAssetToFs(Module, lowerRel, data);
        } catch (_) { }
        assetNotFound.delete(normalizeAssetRel(lowerRel));
        cacheAssetData(lowerRel, data);
      }
    };

    await runPool(paths, PRELOAD_CONCURRENCY, async (path) => {
      const rel = path.replace(/^gta3-assets\/local\//i, '');
      try {
        const { data } = await fetchFirstAvailable(assetCandidates(rel));
        ingestLoaded(path, rel, data);
      } catch (err) {
        console.warn('preload skip:', path, err.message || err);
      }
      done += 1;
    });

    ensureGameDirs(Module);
    try {
      const resetKey = 'regta3dos.defaultsReset';
      const prev = parseInt(localStorage.getItem(resetKey) || '0', 10);
      if (prev < DEFAULTS_RESET_VERSION) {
        for (const p of [
          `/${ASSET_PREFIX}/userfiles/gta3.set`,
          `/${ASSET_PREFIX}/gta3.set`,
        ]) {
          try {
            if (Module.FS.analyzePath(p).exists) Module.FS.unlink(p);
          } catch (_) { }
        }
        localStorage.setItem(resetKey, String(DEFAULTS_RESET_VERSION));
      }
    } catch (_) { }

    const idbfsOk = await mountUserfilesIdbfs(Module);
    if (idbfsOk) scheduleUserfilesPersist(Module);

    try {
      const userIni = `/${ASSET_PREFIX}/userfiles/re3.ini`;
      let currentIni = re3Ini;
      if (vfsPathExists(Module, userIni)) {
        currentIni = Module.FS.readFile(userIni, { encoding: 'utf8' });
      }
      // Always force Method=1 on touch devices so joystick works!
      const patched = applyTouchControlMethod(currentIni);
      Module.FS.writeFile(userIni, patched);
    } catch (_) { }

    try {
      const setPath = `/${ASSET_PREFIX}/gta3.set`;
      const userSet = `/${ASSET_PREFIX}/userfiles/gta3.set`;
      const hasUserSet = vfsPathExists(Module, userSet) &&
        (Module.FS.stat(userSet).size || 0) > 0;
      if (!hasUserSet && vfsPathExists(Module, setPath)) {
        const setData = Module.FS.readFile(setPath);
        if (setData && setData.length > 0) {
          Module.FS.writeFile(userSet, setData);
        }
      }
    } catch (_) { }

    if (idbfsOk && typeof Module.persistUserfiles === 'function') {
      Module.persistUserfiles();
    }

    const critical = [
      'models/frontend.txd',
      'models/menu.txd',
      'models/fonts.txd',
      'data/gta3.dat',
      'text/american.gxt',
      'anim/cuts.dir',
      'models/gta3.dir',
    ];
    const missing = critical.filter((rel) => !vfsPathExists(Module, `/${ASSET_PREFIX}/${rel}`));
    if (missing.length) {
      throw new Error(
        'Critical assets missing in VFS: ' + missing.join(', ') +
        '. Check gta3-assets directory.'
      );
    }

    // prefetchAssetAsync('anim/cuts.img'); // disabled: already in packages.js chunks

    // Inject installed mods into VFS and patch gta3.dir if present
    try {
      await injectInstalledMods(Module);
    } catch (modErr) {
      console.error('[Mod Manager] Error during mod injection:', modErr);
    }

    // Engine is ready for user click to launch
    gameEngineReady = true;
    showStartPromptUI();
  },
  onAbort(what) {
    showDiagError('WASM abort: ' + what);
  },
  prefetchFirstMissionAudio,
  loadAsyncFile,
  getAsyncFileStatus,
  reportLoadProgress(current, total) {
    if (current >= total) {
      setStatus('');
      return;
    }
  },
  getAsyncUrl(file, onload, onerror) {
    const promise = resolveAsyncUrl(file);
    if (typeof onload === 'function') {
      promise.then(onload).catch((err) => {
        if (typeof onerror === 'function') onerror(err);
      });
      return;
    }
    return promise;
  },
  async mainCalled() {
    Module.FS.mkdirTree('/' + ASSET_PREFIX);
    await Module.initFS();

    // Prepare engine launch callback to execute upon user gesture
    launchGameCallback = () => {
      unlockWebAudio();
      setStatus('Starting engine...');
      if (typeof Module.callMain === 'function') {
        Module.callMain();
      } else if (typeof Module._async_main === 'function') {
        Module._async_main();
      } else {
        throw new Error('callMain / _async_main not found in WASM');
      }
    };
  },
};

window.Module = Module;

async function bootGame() {
  if (bootStarted) return;
  bootStarted = true;
  installGestureUnlock();
  installPointerLockErrorSwallow();
  installTouchControls();

  try {
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (typeof type === 'string' && type.indexOf('webgl') !== -1) {
        attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: false });
        if (attrs.antialias === undefined)
          attrs.antialias = true;
      }
      return origGetContext.call(this, type, attrs);
    };

    setStatus('Loading WASM...');
    if (typeof createRe3Module !== 'function') {
      throw new Error('createRe3Module not found');
    }
    await createRe3Module(Module);
    await Module.mainCalled();
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message);
    bootStarted = false;
  }
}

const DB_NAME = `/${ASSET_PREFIX}/userfiles`;
const STORE_NAME = 'FILE_DATA';
const BASE_USERFILES_PATH = `/${ASSET_PREFIX}/userfiles/`;
const DB_VERSION = 21;

function openUserfilesDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      let store;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME);
      } else {
        store = e.target.transaction.objectStore(STORE_NAME);
      }
      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAllSavesMap() {
  const db = await openUserfilesDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const map = {};

  return new Promise((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        map[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        db.close();
        resolve(map);
      }
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error);
    };
  });
}

async function writeSaveFile(slot, buffer) {
  const db = await openUserfilesDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const path = `${BASE_USERFILES_PATH}GTA3sf${slot}.b`;

  const record = {
    contents: new Uint8Array(buffer),
    mode: 33206,
    timestamp: new Date()
  };

  return new Promise((resolve, reject) => {
    const req = store.put(record, path);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error || e);
    };
  });
}

async function deleteSaveFile(slot) {
  const db = await openUserfilesDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const path = `${BASE_USERFILES_PATH}GTA3sf${slot}.b`;

  return new Promise((resolve, reject) => {
    const req = store.delete(path);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error);
    };
  });
}

async function getSaveFile(slot) {
  const db = await openUserfilesDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const path = `${BASE_USERFILES_PATH}GTA3sf${slot}.b`;

  return new Promise((resolve, reject) => {
    const req = store.get(path);
    req.onsuccess = () => {
      db.close();
      resolve(req.result || null);
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error);
    };
  });
}

function deleteWholeSavesDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      reject(new Error('Deletion blocked: please close any other tabs running the game and try again.'));
    };
  });
}

let activeUploadSlot = null;

async function renderSavesUI() {
  const container = document.getElementById('slots-container');
  if (!container) return;
  container.innerHTML = '';

  let map = {};
  try {
    map = await readAllSavesMap();
  } catch (e) {
    console.warn('[SaveManager] error loading map:', e);
  }

  for (let i = 1; i <= 8; i++) {
    const key = `${BASE_USERFILES_PATH}GTA3sf${i}.b`;
    const save = map[key];
    const exists = !!save;
    const size = save?.contents?.length ? (save.contents.length / 1024).toFixed(1) : 0;

    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `
      <div class="slot-info">
        <span class="slot-num">SLOT ${i}</span>
        <span class="slot-status ${exists ? 'occupied' : ''}">
          ${exists ? `FILE DETECTED (${size} KB)` : 'EMPTY'}
        </span>
      </div>
      <div class="slot-btns">
        <button class="action-btn btn-small" data-act="upload" data-slot="${i}">UPLOAD</button>
        <button class="action-btn btn-small" data-act="max" data-slot="${i}">SET 100%</button>
        <button class="action-btn btn-small btn-green" data-act="download" data-slot="${i}" ${!exists ? 'disabled' : ''}>DOWNLOAD</button>
        <button class="action-btn btn-small btn-red" data-act="delete" data-slot="${i}" ${!exists ? 'disabled' : ''}>DELETE</button>
      </div>
    `;

    container.appendChild(row);
  }
}

// ==========================================
// MOD MANAGER (INDEXEDDB & INJECTION)
// ==========================================
const MODS_DB_NAME = 'gta3sky_mods_db';
const MODS_STORE_NAME = 'MOD_DATA';
const MODS_DB_VERSION = 1;

function openModsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MODS_DB_NAME, MODS_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(MODS_STORE_NAME)) {
        db.createObjectStore(MODS_STORE_NAME, { keyPath: 'filename' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllMods() {
  const db = await openModsDB();
  const tx = db.transaction(MODS_STORE_NAME, 'readonly');
  const store = tx.objectStore(MODS_STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result || []);
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error);
    };
  });
}

async function saveMod(file) {
  const filename = file.name.trim().toLowerCase();
  const buffer = await file.arrayBuffer();
  const db = await openModsDB();
  const tx = db.transaction(MODS_STORE_NAME, 'readwrite');
  const store = tx.objectStore(MODS_STORE_NAME);

  const record = {
    filename,
    data: buffer,
    size: file.size,
    timestamp: new Date()
  };

  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error);
    };
  });
}

async function deleteMod(filename) {
  const db = await openModsDB();
  const tx = db.transaction(MODS_STORE_NAME, 'readwrite');
  const store = tx.objectStore(MODS_STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.delete(filename);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = (e) => {
      db.close();
      reject(e.target.error);
    };
  });
}

function clearAllModsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(MODS_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      reject(new Error('Clear blocked: please close other tabs running the game and try again.'));
    };
  });
}

function getModTypeBadge(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['bmp', 'png', 'jpg'].includes(ext)) {
    return '<span class="mod-badge badge-skin">SKIN</span>';
  } else if (ext === 'dff') {
    return '<span class="mod-badge badge-model">3D MODEL</span>';
  } else if (ext === 'txd') {
    return '<span class="mod-badge badge-texture">TEXTURE</span>';
  } else if (ext === 'col') {
    return '<span class="mod-badge badge-col">COLLISION</span>';
  }
  return `<span class="mod-badge">.${ext.toUpperCase()}</span>`;
}

async function renderModsUI() {
  const container = document.getElementById('mods-container');
  if (!container) return;
  container.innerHTML = '';

  let mods = [];
  try {
    mods = await getAllMods();
  } catch (err) {
    console.warn('[ModManager] Error reading mods:', err);
  }

  if (mods.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p style="margin: 0 0 8px 0; font-size: 1.1rem; color: #fff;">No mods installed</p>
        <span style="font-size: 0.9rem; opacity: 0.8;">Click "UPLOAD MODS" to install custom <code>.dff</code>, <code>.txd</code>, or player skins.</span>
      </div>
    `;
    return;
  }

  for (const mod of mods) {
    const sizeKB = (mod.size / 1024).toFixed(1);
    const dateStr = mod.timestamp ? new Date(mod.timestamp).toLocaleDateString() : '';
    const badge = getModTypeBadge(mod.filename);
    const isSkin = mod.filename.endsWith('.bmp') || mod.filename.endsWith('.png') || mod.filename.endsWith('.jpg');
    const targetDir = isSkin ? 'skins/' : 'models/gta3.img/';

    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `
      <div class="slot-info">
        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
          <span class="slot-num" style="word-break: break-all;">${mod.filename}</span>
          ${badge}
        </div>
        <span class="slot-status occupied" style="font-size: 0.82rem;">
          ${sizeKB} KB &bull; Injects to: <code>${targetDir}${mod.filename}</code> ${dateStr ? `&bull; ${dateStr}` : ''}
        </span>
      </div>
      <div class="slot-btns">
        <button class="action-btn btn-small btn-red" data-act="delete-mod" data-filename="${mod.filename}">UNINSTALL</button>
      </div>
    `;
    container.appendChild(row);
  }
}

async function injectInstalledMods(Module) {
  try {
    const activeMods = await getAllMods();
    if (!activeMods || activeMods.length === 0) {
      console.log('[Mod Manager] No mods installed in IndexedDB.');
      return;
    }

    console.log('[Mod Manager] =========================================');
    console.log(`[Mod Manager] Injecting ${activeMods.length} mods into VFS...`);

    let dirPath = `/${ASSET_PREFIX}/models/gta3.dir`;
    if (!vfsPathExists(Module, dirPath)) {
      dirPath = '/models/gta3.dir';
    }

    let dirData = null;
    let dataView = null;
    let dirModified = false;

    if (vfsPathExists(Module, dirPath)) {
      dirData = Module.FS.readFile(dirPath);
      dataView = new DataView(dirData.buffer, dirData.byteOffset, dirData.byteLength);
    }

    for (const mod of activeMods) {
      const filename = mod.filename.toLowerCase();
      const isSkin = filename.endsWith('.bmp') || filename.endsWith('.png') || filename.endsWith('.jpg');
      let targetPath;

      if (isSkin) {
        targetPath = `/${ASSET_PREFIX}/skins/${filename}`;
      } else {
        targetPath = `/${ASSET_PREFIX}/models/gta3.img/${filename}`;
      }

      try {
        const modBytes = new Uint8Array(mod.data);

        // Remove old file if exists in VFS and write new data
        try { Module.FS.unlink(targetPath); } catch (_) {}
        Module.FS.writeFile(targetPath, modBytes);

        if (targetPath.includes('/models/gta3.img/')) {
          // Robust path aliases
          const alias1 = `/models/gta3.img/${filename}`;
          const alias2 = `/${ASSET_PREFIX}/models/${filename}`;
          const alias3 = `/models/${filename}`;
          try { Module.FS.unlink(alias1); } catch (_) {}
          try { Module.FS.writeFile(alias1, modBytes); } catch (_) {}
          try { Module.FS.unlink(alias2); } catch (_) {}
          try { Module.FS.writeFile(alias2, modBytes); } catch (_) {}
          try { Module.FS.unlink(alias3); } catch (_) {}
          try { Module.FS.writeFile(alias3, modBytes); } catch (_) {}

          // Synchronize in-memory RAM caches
          cacheAssetData(`models/gta3.img/${filename}`, modBytes);
          cacheAssetData(`models/${filename}`, modBytes);
          cacheAssetData(filename, modBytes);

          // Patch gta3.dir TOC entry with new sector size (1 sector = 2048 bytes)
          if (dataView && dirData) {
            const sectorSize = Math.ceil(mod.size / 2048);
            let patched = false;
            for (let i = 0; i < dirData.length; i += 32) {
              let name = '';
              for (let j = 0; j < 24; j++) {
                const charCode = dirData[i + 8 + j];
                if (charCode === 0) break;
                name += String.fromCharCode(charCode);
              }
              if (name.toLowerCase() === filename) {
                dataView.setUint32(i + 4, sectorSize, true); // little-endian
                patched = true;
                dirModified = true;
                console.log(`[Mod Manager] Patched gta3.dir: ${name} -> updated to ${sectorSize} sectors.`);
                break;
              }
            }
            if (!patched) {
              console.log(`[Mod Manager] Notice: ${filename} was not found in gta3.dir TOC (custom file).`);
            }
          }
        } else if (isSkin) {
          const skinAlias = `/skins/${filename}`;
          try { Module.FS.unlink(skinAlias); } catch (_) {}
          try { Module.FS.writeFile(skinAlias, modBytes); } catch (_) {}
          cacheAssetData(`skins/${filename}`, modBytes);
        }

        console.log(`[Mod Manager] Injected: [${filename}]`);
      } catch (err) {
        console.error(`[Mod Manager] Failed to write [${filename}]:`, err);
      }
    }

    if (dirModified && dirData) {
      Module.FS.writeFile(dirPath, dirData);
      try { Module.FS.writeFile('/models/gta3.dir', dirData); } catch (_) {}
      console.log('[Mod Manager] Successfully saved patched gta3.dir to VFS.');
    }

    console.log('[Mod Manager] Injection complete.');
    console.log('[Mod Manager] =========================================');
  } catch (e) {
    console.error('[Mod Manager] Fatal error during mod injection:', e);
  }
}

function extractHostname(urlString) {
  if (!urlString || urlString === 'null') return null;
  try {
    const u = new URL(urlString);
    return u.hostname || null;
  } catch (e) {
    return null;
  }
}

function isAllowedIframer(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return (
    h === 'quenq.com' ||
    h.endsWith('.quenq.com') ||
    h === 'localhost' ||
    h === '127.0.0.1'
  );
}

function shouldInjectAd() {
  try {
    // 1. Check if the site is iframed
    const isIframed = window.self !== window.top;
    if (!isIframed) {
      return false;
    }

    const detectedHosts = [];

    // 2. Try window.top / window.parent location (accessible if same origin)
    try {
      if (window.top && window.top.location && window.top.location.hostname) {
        detectedHosts.push(window.top.location.hostname);
      }
    } catch (e) {}

    try {
      if (window.parent && window.parent.location && window.parent.location.hostname) {
        detectedHosts.push(window.parent.location.hostname);
      }
    } catch (e) {}

    // 3. Try ancestorOrigins (Chrome, Safari, Edge, WebKit)
    try {
      if (window.location && window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0) {
        for (let i = 0; i < window.location.ancestorOrigins.length; i++) {
          const host = extractHostname(window.location.ancestorOrigins[i]);
          if (host) detectedHosts.push(host);
        }
      }
    } catch (e) {}

    // 4. Try document.referrer
    try {
      if (document.referrer) {
        const host = extractHostname(document.referrer);
        if (host) detectedHosts.push(host);
      }
    } catch (e) {}

    // If iframed but no parent host could be detected (e.g. cross-origin iframe with hidden referrer),
    // treat as external embedder.
    if (detectedHosts.length === 0) {
      return true;
    }

    // Check if all detected parent/ancestor hosts belong to quenq.com / *.quenq.com
    const allAllowed = detectedHosts.every(isAllowedIframer);
    return !allAllowed;
  } catch (err) {
    console.warn('[Ad Check] Error determining iframe origin:', err);
    return window.self !== window.top;
  }
}

let adScriptInjected = false;
function injectAdScript() {
  if (adScriptInjected) return;
  adScriptInjected = true;

  const adUrl = '';
  if (!adUrl) return;

  try {
    const s = document.createElement('script');
    s.setAttribute('data-cfasync', 'false');
    s.src = adUrl;
    (document.head || document.documentElement).appendChild(s);
  } catch (err) {
    console.error('Failed to inject ad script:', err);
  }
}

function initStaticUI() {
  const homeView = document.getElementById('home-view');
  const saveView = document.getElementById('save-view');
  const modsView = document.getElementById('mods-view');
  const gameContainer = document.getElementById('game-container');
  const statusOverlay = document.getElementById('status-overlay');
  const fileInput = document.getElementById('save-file-input');
  const modFileInput = document.getElementById('mod-file-input');

  document.getElementById('btn-play-game')?.addEventListener('click', () => {
    if (shouldInjectAd()) {
      injectAdScript();
    }
    if (homeView) homeView.style.display = 'none';
    if (saveView) saveView.style.display = 'none';
    if (modsView) modsView.style.display = 'none';
    if (gameContainer) gameContainer.style.display = 'block';
    if (statusOverlay) statusOverlay.style.display = 'flex';
    bootGame();
  });

  document.getElementById('btn-open-saves')?.addEventListener('click', () => {
    if (homeView) homeView.style.display = 'none';
    if (modsView) modsView.style.display = 'none';
    if (saveView) saveView.style.display = 'flex';
    renderSavesUI();
  });

  document.getElementById('btn-save-back')?.addEventListener('click', () => {
    if (saveView) saveView.style.display = 'none';
    if (homeView) homeView.style.display = 'flex';
  });

  document.getElementById('btn-save-refresh')?.addEventListener('click', () => {
    renderSavesUI();
  });

  document.getElementById('btn-save-wipe')?.addEventListener('click', async () => {
    if (confirm('Wipe all local saves?')) {
      await deleteWholeSavesDB();
      renderSavesUI();
    }
  });

  // Mod Manager Navigation & Actions
  document.getElementById('btn-open-mods')?.addEventListener('click', () => {
    if (homeView) homeView.style.display = 'none';
    if (saveView) saveView.style.display = 'none';
    if (modsView) modsView.style.display = 'flex';
    renderModsUI();
  });

  document.getElementById('btn-mods-back')?.addEventListener('click', () => {
    if (modsView) modsView.style.display = 'none';
    if (homeView) homeView.style.display = 'flex';
  });

  document.getElementById('btn-mods-refresh')?.addEventListener('click', () => {
    renderModsUI();
  });

  document.getElementById('btn-mods-upload')?.addEventListener('click', () => {
    modFileInput?.click();
  });

  document.getElementById('btn-mods-wipe')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to uninstall and remove all mods?')) {
      await clearAllModsDB();
      renderModsUI();
    }
  });

  document.getElementById('mods-container')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act="delete-mod"]');
    if (!btn) return;
    const filename = btn.dataset.filename;
    if (!filename) return;

    if (confirm(`Uninstall mod "${filename}"?`)) {
      try {
        await deleteMod(filename);
        renderModsUI();
      } catch (err) {
        alert('Failed to uninstall mod: ' + err);
      }
    }
  });

  modFileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const allowed = ['dff', 'txd', 'col', 'bmp', 'png', 'jpg'];
    let installedCount = 0;

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!allowed.includes(ext)) {
        alert(`File "${file.name}" is not a supported mod file. (Supported: .dff, .txd, .col, .bmp, .png, .jpg)`);
        continue;
      }

      try {
        await saveMod(file);
        installedCount++;
      } catch (err) {
        alert(`Failed to save "${file.name}": ` + err);
      }
    }

    e.target.value = '';
    if (installedCount > 0) {
      renderModsUI();
    }
  });

  document.getElementById('slots-container')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const action = btn.dataset.act;
    const slot = parseInt(btn.dataset.slot, 10);

    if (action === 'upload') {
      activeUploadSlot = slot;
      fileInput.click();
    } else if (action === 'max') {
      try {
        const resp = await fetch('GTA3sf1.b');
        if (!resp.ok) throw new Error('GTA3sf1.b not found on server root.');
        const buf = await resp.arrayBuffer();
        await writeSaveFile(slot, buf);
        renderSavesUI();
      } catch (err) {
        alert('Failed to set 100% save: ' + err.message);
      }
    } else if (action === 'download') {
      const s = await getSaveFile(slot);
      if (!s || !s.contents) return;
      const blob = new Blob([s.contents], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `GTA3sf${slot}.b`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (action === 'delete') {
      if (confirm(`Delete Slot ${slot}?`)) {
        await deleteSaveFile(slot);
        renderSavesUI();
      }
    }
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !activeUploadSlot) return;

    if (!file.name.toLowerCase().endsWith('.b') || file.size > 524288) {
      alert('INVALID FILE: Must be a valid GTA III save file ending with ".b" (e.g., GTA3sf1.b)');
      e.target.value = '';
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      await writeSaveFile(activeUploadSlot, buffer);
      renderSavesUI();
    } catch (err) {
      alert('Failed to save file: ' + err);
    }
    e.target.value = '';
  });

  const handleStartGame = (e) => {
    if (e && e.cancelable && e.type === 'touchend') {
      e.preventDefault();
    }
    if (gameEngineReady && typeof launchGameCallback === 'function') {
      hideLoaderUI();
      requestAnimationFrame(() => {
        if (typeof launchGameCallback === 'function') {
          launchGameCallback();
          launchGameCallback = null;
        }
      });
    }
  };

  statusOverlay?.addEventListener('click', handleStartGame);
  statusOverlay?.addEventListener('touchend', handleStartGame);

  // Cheat input handling for mobile virtual keyboard
  const cheatInput = document.getElementById('cheat-input');
  const cheatBtn = document.querySelector('.touch-control.cheats');
  let lastCheatBlur = 0;

  cheatBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!cheatInput) return;
    const now = Date.now();
    if (now - lastCheatBlur < 250) return;
    cheatInput.focus();
  });

  cheatBtn?.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cheatInput) return;
    const now = Date.now();
    if (now - lastCheatBlur < 250) return;
    cheatInput.focus();
  });

  cheatInput?.addEventListener('blur', () => {
    lastCheatBlur = Date.now();
  });

  cheatInput?.addEventListener('input', (e) => {
    const char = e.data;
    if (!char) return;

    const upperChar = char.toUpperCase();
    const keyCode = upperChar.charCodeAt(0);

    const target = canvas || window;

    const down = new KeyboardEvent('keydown', {
      key: char,
      keyCode: keyCode,
      code: `Key${upperChar}`,
      which: keyCode,
      bubbles: true,
      cancelable: true
    });

    const up = new KeyboardEvent('keyup', {
      key: char,
      keyCode: keyCode,
      code: `Key${upperChar}`,
      which: keyCode,
      bubbles: true,
      cancelable: true
    });

    target.dispatchEvent(down);
    window.dispatchEvent(down);

    setTimeout(() => {
      target.dispatchEvent(up);
      window.dispatchEvent(up);
    }, 10);

    cheatInput.value = '';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initStaticUI();
});