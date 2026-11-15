/*!
 * PvZ2 Gardendless – durable local saves
 * - Mirrors the game's localStorage save keys into IndexedDB on every write.
 * - Restores missing keys from IndexedDB on boot (Safari can evict localStorage).
 * - Export / import the save as a JSON file.
 *
 * LOAD ORDER: classic <script> in <head>, BEFORE any game script.
 * Exposes: window.PVZSave, window.PVZ_READY
 */
(function () {
  'use strict';

  // ======================= CONFIG =======================
  // Fill with the keys found by the console snippet in INSTALL.md.
  // A key ending in "*" is a prefix match, e.g. "pvzge_*".
  // Leave EMPTY to mirror ALL localStorage keys (fallback mode).
  var SAVE_KEYS = ['PvZ2_*']; // PvZ2_PlayerProperties, PvZ2_Settings, PvZ2_GitHubLevels, PvZ2_GitHubLevels_Sha

  // Never mirrored in fallback (all-keys) mode.
  var IGNORE_PREFIXES = ['firebase:', 'firebaseLocalStorage', '__pvz'];

  // Max time the game boot waits for the IndexedDB restore (ms).
  var BOOT_TIMEOUT_MS = 1500;

  var SAVE_VERSION = 1;
  // ======================================================

  var DB_NAME = 'pvz-save';
  var DB_VERSION = 1;
  var FLUSH_DELAY_MS = 50;

  var ls;
  try { ls = window.localStorage; } catch (e) { ls = null; }
  if (!ls) {
    console.warn('[PVZSave] localStorage unavailable; save mirroring disabled.');
    window.PVZ_READY = Promise.resolve();
    return;
  }

  var proto = Storage.prototype;
  var origSetItem = proto.setItem;
  var origRemoveItem = proto.removeItem;

  // ---------- key filter ----------
  function isTracked(key) {
    key = String(key);
    if (SAVE_KEYS.length) {
      for (var i = 0; i < SAVE_KEYS.length; i++) {
        var k = SAVE_KEYS[i];
        if (k.charAt(k.length - 1) === '*') {
          if (key.indexOf(k.slice(0, -1)) === 0) return true;
        } else if (k === key) {
          return true;
        }
      }
      return false;
    }
    for (var j = 0; j < IGNORE_PREFIXES.length; j++) {
      if (key.indexOf(IGNORE_PREFIXES[j]) === 0) return false;
    }
    return true;
  }

  // Keys that existed in localStorage before the game ran (captured synchronously).
  var bootKeys = {};
  for (var b = 0; b < ls.length; b++) bootKeys[ls.key(b)] = true;

  // ---------- IndexedDB ----------
  var dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function readAll(storeName) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = {};
        var t = db.transaction(storeName, 'readonly');
        var cur = t.objectStore(storeName).openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (c) { out[c.key] = c.value; c.continue(); }
        };
        t.oncomplete = function () { resolve(out); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }

  // ---------- metadata ----------
  var meta = { updatedAt: 0, dirty: false, lastSyncedAt: 0, deviceId: '' };
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  // ---------- write queue (coalesced) ----------
  var pending = {};          // key -> string value | null (delete)
  var metaPending = false;
  var restoreDone = false;   // block flushing until boot restore finished
  var flushTimer = null;
  var writesSinceBoot = 0;

  function scheduleFlush() {
    if (!restoreDone || flushTimer) return;
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function flush() {
    flushTimer = null;
    var keys = Object.keys(pending);
    if (!keys.length && !metaPending) return Promise.resolve();
    var batch = pending; pending = {};
    var writeMeta = metaPending; metaPending = false;
    var metaCopy = JSON.parse(JSON.stringify(meta));
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(['kv', 'meta'], 'readwrite');
        var kv = t.objectStore('kv');
        keys.forEach(function (k) {
          if (batch[k] === null) kv.delete(k); else kv.put(batch[k], k);
        });
        if (writeMeta) t.objectStore('meta').put(metaCopy, 'state');
        t.oncomplete = function () { resolve(); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    }).catch(function (e) {
      console.warn('[PVZSave] IndexedDB write failed:', e);
    });
  }

  function saveMeta() { metaPending = true; scheduleFlush(); }

  function markDirty() {
    meta.updatedAt = Math.max(Date.now(), meta.updatedAt + 1);
    meta.dirty = true;
    writesSinceBoot++;
    saveMeta();
    try { window.dispatchEvent(new CustomEvent('pvz:localsave', { detail: { updatedAt: meta.updatedAt } })); } catch (e) {}
  }

  // ---------- localStorage hooks ----------
  // clear() is intentionally NOT mirrored, so an accidental localStorage.clear() is recoverable.
  proto.setItem = function (key, value) {
    origSetItem.call(this, key, value); // throws (e.g. quota) before we mirror
    if (this === ls && isTracked(key)) {
      pending[String(key)] = String(value);
      markDirty();
      scheduleFlush();
    }
  };
  proto.removeItem = function (key) {
    origRemoveItem.call(this, key);
    if (this === ls && isTracked(key)) {
      pending[String(key)] = null;
      markDirty();
      scheduleFlush();
    }
  };

  // ---------- boot restore ----------
  var gated = false;        // true if the game boot was wrapped with PVZSave.gateBoot()
  var bootReleased = false; // true once the gated boot has been allowed to run

  var restorePromise = openDB()
    .then(function () {
      return Promise.all([readAll('kv'), readAll('meta')]);
    })
    .then(function (res) {
      var kv = res[0];
      var m = res[1].state;
      if (m) for (var p in m) meta[p] = m[p];
      if (!meta.deviceId) { meta.deviceId = newId(); metaPending = true; }

      // 1) Restore keys that were missing from localStorage when the page loaded.
      var restored = 0;
      Object.keys(kv).forEach(function (k) {
        if (!isTracked(k) || bootKeys[k]) return;
        try {
          origSetItem.call(ls, k, kv[k]);
          delete pending[k]; // drop defaults the game may have written in the meantime
          restored++;
        } catch (e) {
          console.warn('[PVZSave] restore failed for', k, e);
        }
      });

      // 2) Seed IndexedDB with keys that exist only in localStorage (first run).
      var seeded = 0;
      for (var i = 0; i < ls.length; i++) {
        var key = ls.key(i);
        if (isTracked(key) && !(key in kv) && !(key in pending)) {
          pending[key] = ls.getItem(key);
          seeded++;
        }
      }
      if (seeded && !meta.updatedAt) { meta.updatedAt = Date.now(); meta.dirty = true; metaPending = true; }

      if (restored) console.info('[PVZSave] Restored ' + restored + ' key(s) from IndexedDB.');
      return restored;
    })
    .catch(function (e) {
      console.warn('[PVZSave] restore skipped:', e);
      if (!meta.deviceId) meta.deviceId = newId();
      return 0;
    })
    .then(function (restored) {
      restoreDone = true;
      scheduleFlush();
      // If the game started before the restore finished, reload once so it reads the restored save.
      var gameAlreadyRunning = !gated || bootReleased;
      if (restored && gameAlreadyRunning) {
        var guard = '__pvz_restore_reloaded';
        var already = false;
        try { already = sessionStorage.getItem(guard) === '1'; sessionStorage.setItem(guard, '1'); } catch (e) {}
        if (!already) {
          flush().then(function () { location.reload(); });
          return new Promise(function () {}); // never resolve; page is reloading
        }
      }
      try { sessionStorage.removeItem('__pvz_restore_reloaded'); } catch (e) {}
    });

  var ready = Promise.race([
    restorePromise,
    new Promise(function (r) { setTimeout(r, BOOT_TIMEOUT_MS); })
  ]);
  window.PVZ_READY = ready;

  // Ask the browser not to evict our storage.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(function (p) {
      if (!p) return navigator.storage.persist();
    }).catch(function () {});
  }

  // Flush on background / close.
  function flushNow() { if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; } if (restoreDone) flush(); }
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushNow(); });

  // ---------- snapshots (used by cloud sync / export) ----------
  function collectData() {
    var keys = [];
    for (var i = 0; i < ls.length; i++) { var k = ls.key(i); if (isTracked(k)) keys.push(k); }
    keys.sort();
    var data = {};
    keys.forEach(function (k) { data[k] = ls.getItem(k); });
    return data;
  }

  function getSnapshot() {
    var data = collectData();
    var json = JSON.stringify(data);
    return {
      data: data,
      json: json,
      hasData: json !== '{}',
      updatedAt: meta.updatedAt,
      dirty: meta.dirty,
      deviceId: meta.deviceId,
      saveVersion: SAVE_VERSION
    };
  }

  // Replace the local save with `data` (object of key -> string). Does not reload.
  function applySnapshot(data, updatedAt, opts) {
    opts = opts || {};
    var current = collectData();
    Object.keys(current).forEach(function (k) {
      if (!(k in data)) { origRemoveItem.call(ls, k); pending[k] = null; }
    });
    Object.keys(data).forEach(function (k) {
      if (!isTracked(k)) return;
      origSetItem.call(ls, k, String(data[k]));
      pending[k] = String(data[k]);
    });
    meta.updatedAt = updatedAt || Date.now();
    if (opts.dirty) {
      meta.dirty = true;
    } else {
      meta.dirty = false;
      meta.lastSyncedAt = meta.updatedAt;
    }
    metaPending = true;
    return flush();
  }

  // Called by cloud sync after a successful upload/agreement.
  function markSynced(syncedUpdatedAt) {
    meta.lastSyncedAt = syncedUpdatedAt;
    if (meta.updatedAt === syncedUpdatedAt) meta.dirty = false;
    saveMeta();
  }

  // ---------- export / import ----------
  function exportFile() {
    var snap = getSnapshot();
    var payload = {
      format: 'pvzge-save',
      saveVersion: SAVE_VERSION,
      exportedAt: new Date().toISOString(),
      updatedAt: snap.updatedAt,
      data: snap.data
    };
    saveText('pvzge-save-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2));
  }

  // ---------- saving a text file on iPad ----------
  // iPadOS often ignores <a download> (always in Home Screen apps, and some school-managed
  // iPads block downloads). The Share sheet ("Save to Files") works there, so touch screens use
  // it first; if that's unavailable we show a small sheet whose buttons run on a real tap,
  // with Download and Copy as fallbacks.
  var isTouchDevice = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  function makeFile(name, text) {
    var types = ['application/json', 'text/plain'];
    for (var i = 0; i < types.length; i++) {
      try {
        var f = new File([text], name, { type: types[i] });
        if (navigator.canShare && navigator.canShare({ files: [f] })) return f;
      } catch (e) {}
    }
    return null;
  }
  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 60000);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove(); ok ? resolve() : reject(new Error('copy blocked'));
    });
  }
  function showSaveSheet(name, text, note) {
    var old = document.getElementById('pvz-save-sheet');
    if (old) old.remove();
    var el = document.createElement('div');
    el.id = 'pvz-save-sheet';
    var file = makeFile(name, text);
    el.innerHTML = '<div class="pvz-sheet-box"><b></b><p></p>' +
      (file ? '<button type="button" data-a="share">Save to Files / Share</button>' : '') +
      '<button type="button" data-a="dl">Download</button>' +
      '<button type="button" data-a="copy">Copy as text</button>' +
      '<button type="button" data-a="close" class="pvz-sheet-close">Close</button></div>';
    el.querySelector('b').textContent = name;
    el.querySelector('p').textContent = note || 'Choose how to save it.';
    var msg = el.querySelector('p');
    el.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (!a) { if (e.target === el) el.remove(); return; }
      if (a === 'close') el.remove();
      else if (a === 'share') {
        navigator.share({ files: [file], title: name }).then(function () { el.remove(); }, function (err) {
          if (!err || err.name !== 'AbortError') msg.textContent = 'Sharing is blocked on this iPad – try Download or Copy.';
        });
      } else if (a === 'dl') {
        download(name, text);
        msg.textContent = 'If nothing appeared, downloads may be blocked – use Copy and paste it into Notes.';
      } else if (a === 'copy') {
        copyText(text).then(function () { msg.textContent = 'Copied. Paste it into Notes or a message to keep it.'; },
          function () { msg.textContent = 'Copying is blocked too, sorry.'; });
      }
    });
    (document.body || document.documentElement).appendChild(el);
  }
  function saveText(name, text) {
    text = String(text);
    if (!isTouchDevice) { try { download(name, text); return; } catch (e) {} }
    var file = makeFile(name, text);
    if (file && navigator.share) {
      try {
        navigator.share({ files: [file], title: name }).catch(function (err) {
          if (!err || err.name !== 'AbortError') showSaveSheet(name, text);
        });
        return;
      } catch (e) {}
    }
    showSaveSheet(name, text);
  }
  window.__pvzSaveText = saveText;

  function importFile(file) {
    return file.text().then(function (text) {
      var payload = JSON.parse(text);
      if (!payload || payload.format !== 'pvzge-save' || typeof payload.data !== 'object') {
        throw new Error('Not a PvZ GE save file.');
      }
      // Imported save counts as a fresh local change so it uploads on next sync.
      return applySnapshot(payload.data, Date.now(), { dirty: true });
    }).then(function () {
      location.reload();
    });
  }

  window.PVZSave = {
    ready: ready,
    restored: restorePromise,
    SAVE_VERSION: SAVE_VERSION,
    isTracked: isTracked,
    getSnapshot: getSnapshot,
    applySnapshot: applySnapshot,
    markSynced: markSynced,
    getMeta: function () { return JSON.parse(JSON.stringify(meta)); },
    writesSinceBoot: function () { return writesSinceBoot; },
    exportFile: exportFile,
    importFile: importFile,
    flush: flushNow,
    // Wrap the game's boot call so it runs only after the restore (or BOOT_TIMEOUT_MS).
    gateBoot: function (bootFn) {
      gated = true;
      return ready.then(function () { bootReleased = true; return bootFn(); });
    }
  };
})();
