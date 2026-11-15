/*!
 * PvZ2 Gardendless – offline + save UI
 * - Registers the service worker.
 * - Online/offline indicator + settings pill (export/import, sync now, download for offline).
 * - Toasts (used by cloud-sync.js via window.PVZUI.toast).
 *
 * LOAD ORDER: <script src="pvz-ui.js" defer> at the end of <body>, after save-store.js.
 */
(function () {
  'use strict';

  var swVersion = null;

  // ---------- Service worker ----------
  var swSupported = 'serviceWorker' in navigator && (location.protocol === 'https:' ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1');

  function askVersion(target) {
    if (target) target.postMessage({ type: 'GET_VERSION' });
  }

  if (swSupported) {
    // The worker lives next to the page itself (not under <base href>), so it controls the whole game.
    var swUrl = new URL('sw.js', location.href).href;
    navigator.serviceWorker.register(swUrl).then(function (reg) {
      askVersion(navigator.serviceWorker.controller || reg.active);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'activated' && navigator.serviceWorker.controller) {
            toast('Game updated.', 'Reload', function () { location.reload(); });
          }
        });
      });
    }).catch(function (e) {
      console.warn('[PVZ] Service worker registration failed:', e);
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'VERSION') { swVersion = e.data.version; render(); }
    });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      askVersion(navigator.serviceWorker.controller);
    });
  } else {
    console.warn('[PVZ] Service worker not available (needs HTTPS or localhost). Offline play disabled.');
  }

  // ---------- Warm cache ----------
  // ---------- Background offline download ----------
  // The service worker downloads the whole game in small batches, asked for from here, so the
  // game works offline everywhere (not just the screens already visited). It pauses during
  // levels, while hidden or offline, so it never competes with gameplay; "Download all for
  // offline" runs it at full speed.
  var pack = { have: 0, total: 0, bytesHave: 0, bytesTotal: 0, done: false, quota: false, error: '' };
  var fillBusy = false, fillTimer = 0, manualFill = false;

  function inLevel() {
    try {
      var sc = window.cc && window.cc.director && window.cc.director.getScene();
      return !!(sc && /inGame/i.test(sc.name || ''));
    } catch (e) { return false; }
  }

  function askWorker(msg) {
    return new Promise(function (resolve, reject) {
      var ctl = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!ctl || !window.MessageChannel) { reject(new Error('no worker')); return; }
      var ch = new MessageChannel();
      var t = setTimeout(function () { reject(new Error('timeout')); }, 120000);
      ch.port1.onmessage = function (e) { clearTimeout(t); resolve(e.data); };
      ctl.postMessage(msg, [ch.port2]);
    });
  }

  function scheduleFill(ms) {
    clearTimeout(fillTimer);
    fillTimer = setTimeout(fillTick, ms);
  }

  function fillTick() {
    if (fillBusy || pack.done || pack.quota) return;
    var ready = swSupported && navigator.serviceWorker.controller && navigator.onLine;
    if (!ready || document.visibilityState !== 'visible') { scheduleFill(10000); return; }
    var playing = !manualFill && inLevel(); // during levels: a gentle trickle
    fillBusy = true;
    askWorker({ type: 'FILL', max: manualFill ? 40 : playing ? 6 : 12 }).then(function (r) {
      if (r && r.type === 'FILL') {
        if (r.error) pack.error = r.error;
        else {
          pack.have = r.have; pack.total = r.total; pack.bytesHave = r.bytesHave; pack.bytesTotal = r.bytesTotal;
          pack.done = !!r.done; pack.quota = !!r.quota; pack.error = '';
        }
      }
    }).catch(function (e) { pack.error = e.message; }).then(function () {
      fillBusy = false;
      renderPack();
      if (pack.done) { manualFill = false; return; }
      if (pack.quota) { manualFill = false; toast('Not enough storage on this iPad to finish the offline download.'); return; }
      scheduleFill(pack.error ? 15000 : manualFill ? 50 : inLevel() ? 4000 : 1500);
    });
  }

  function startFill(manual) {
    if (manual) manualFill = true;
    pack.quota = false;
    scheduleFill(manual ? 0 : 8000);
  }
  if (swSupported) {
    navigator.serviceWorker.ready.then(function () { startFill(false); });
    navigator.serviceWorker.addEventListener('controllerchange', function () { pack.done = false; startFill(false); });
    window.addEventListener('online', function () { startFill(false); });
  }

  function packText() {
    if (!swSupported) return 'Needs HTTPS';
    if (!navigator.serviceWorker.controller) return 'Starting… (reload once)';
    if (!pack.total) return pack.error ? 'Waiting…' : 'Checking…';
    if (pack.done) return 'Complete – works fully offline';
    var pct = pack.bytesTotal ? Math.floor(pack.bytesHave / pack.bytesTotal * 100) : Math.floor(pack.have / pack.total * 100);
    return pct + '% downloaded';
  }

  // ---------- DOM ----------
  var hud, label, backdrop, fileInput, progress, toastEl;
  var cloud = window.__pvzCloud || { state: 'starting', detail: '' };

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    hud = el('div', { id: 'pvz-hud' },
      '<button type="button" class="pvz-hud-btn" data-h="fs" aria-label="Full screen">⛶</button>' +
      '<button type="button" class="pvz-hud-btn" data-h="menu" aria-label="Save, offline and graphics settings">' +
        '<span class="pvz-dot"></span><span class="pvz-hud-label"></span><span class="pvz-gear">⚙</span></button>');
    label = hud.querySelector('.pvz-hud-label');
    hud.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-h]');
      if (!b) return;
      if (b.getAttribute('data-h') === 'fs') toggleFullscreen(); else openPanel();
    });
    if (!fsSupported()) hud.querySelector('[data-h="fs"]').style.display = 'none';

    backdrop = el('div', { id: 'pvz-panel-backdrop' },
      '<div id="pvz-panel" role="dialog" aria-modal="true" aria-labelledby="pvz-panel-title">' +
        '<h2 id="pvz-panel-title">Settings</h2>' +
        '<div class="pvz-row"><span>Network</span><span data-f="net"></span></div>' +
        '<div class="pvz-row"><span>Last local save</span><span data-f="local"></span></div>' +
        '<div class="pvz-row"><span>Cloud</span><span data-f="cloud"></span></div>' +
        '<div class="pvz-row"><span>Offline pack</span><span data-f="pack"></span></div>' +
        '<div class="pvz-quality"><span>Graphics</span><div class="pvz-seg">' +
          '<button type="button" data-q="smooth">Smoothest</button>' +
          '<button type="button" data-q="balanced">Balanced</button>' +
          '<button type="button" data-q="sharp">Sharpest</button>' +
        '</div></div>' +
        '<div class="pvz-actions">' +
          '<button type="button" data-a="export">Export save</button>' +
          '<button type="button" data-a="import">Import save</button>' +
          '<button type="button" data-a="sync">Sync now</button>' +
          '<button type="button" data-a="offline">Download all for offline</button>' +
          '<button type="button" class="wide ghost" data-a="repair">Repair (clear offline copy, keeps saves)</button>' +
          '<button type="button" class="wide ghost" data-a="close">Close</button>' +
        '</div>' +
        '<div id="pvz-diag"><h3>Device</h3><pre data-f="device"></pre><h3>Problems</h3><pre data-f="errors"></pre></div>' +
        '<div id="pvz-progress"><div class="bar"><div class="fill"></div></div><div class="text"></div></div>' +
      '</div>');
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closePanel();
      var qb = e.target.closest && e.target.closest('[data-q]');
      if (qb) {
        var nq = qb.getAttribute('data-q');
        if (nq === window.__pvzQuality) return;
        try { localStorage.setItem('__pvz_quality', nq); } catch (err) {}
        if (window.PVZSave) window.PVZSave.flush();
        location.reload();
        return;
      }
      var a = e.target.closest && e.target.closest('[data-a]');
      if (!a) return;
      var act = a.getAttribute('data-a');
      if (act === 'close') closePanel();
      if (act === 'export' && window.PVZSave) window.PVZSave.exportFile();
      if (act === 'import') fileInput.click();
      if (act === 'sync') {
        if (window.PVZCloud) window.PVZCloud.syncNow('manual');
        else toast('Cloud sync is not configured.');
      }
      if (act === 'offline') downloadAll();
      if (act === 'repair') repair();
    });
    progress = backdrop.querySelector('#pvz-progress');

    fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: '' });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f || !window.PVZSave) return;
      if (!confirm('Replace your current progress with this save file?')) return;
      window.PVZSave.importFile(f).catch(function (e) { toast('Import failed: ' + e.message); });
    });

    toastEl = el('div', { id: 'pvz-toast', role: 'status' });
    probeStartupFiles();

    document.body.appendChild(hud);
    if (isTouchUI()) setTimeout(offerFullscreen, 1500);
    document.body.appendChild(backdrop);
    document.body.appendChild(fileInput);
    document.body.appendChild(toastEl);
    render();
  }

  // ---------- Full screen ----------
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fsSupported() {
    var d = document.documentElement;
    return !isStandalone() && !!(d.requestFullscreen || d.webkitRequestFullscreen) &&
      (document.fullscreenEnabled !== false || document.webkitFullscreenEnabled);
  }
  function isStandalone() { return !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)); }
  function toggleFullscreen() {
    try {
      if (fsElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        var d = document.documentElement;
        var r = (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
        if (r && r.catch) r.catch(function () { toast('Full screen isn\'t available here. Use Share → Add to Home Screen instead.'); });
      }
    } catch (e) {
      toast('Full screen isn\'t available here. Use Share → Add to Home Screen instead.');
    }
  }
  function offerFullscreen() {
    if (!fsSupported() || fsElement()) return;
    try { if (sessionStorage.getItem('__pvz_fs_offered')) return; sessionStorage.setItem('__pvz_fs_offered', '1'); } catch (e) {}
    toast('Play in full screen?', 'Full screen', toggleFullscreen);
  }

  function openPanel() { render(); backdrop.classList.add('open'); }
  function closePanel() { backdrop.classList.remove('open'); }

  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    var today = new Date().toDateString() === d.toDateString();
    return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                 : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  var CLOUD_TEXT = {
    starting: 'Starting…', disabled: 'Not configured', offline: 'Waiting for connection',
    syncing: 'Syncing…', synced: 'Up to date', pending: 'Changes not uploaded yet', error: 'Error'
  };


  function render() {
    if (!hud) return;
    var online = navigator.onLine;
    hud.classList.toggle('offline', !online);
    label.textContent = online ? '' : 'Offline';

    var f = function (name) { return backdrop.querySelector('[data-f="' + name + '"]'); };
    f('net').textContent = online ? 'Online' : 'Offline';
    var meta = window.PVZSave ? window.PVZSave.getMeta() : null;
    f('local').textContent = meta ? fmtTime(meta.updatedAt) : '—';
    var c = CLOUD_TEXT[cloud.state] || cloud.state;
    if (cloud.state === 'synced' && meta && meta.lastSyncedAt) c += ' · ' + fmtTime(meta.lastSyncedAt);
    if (cloud.state === 'error' && cloud.detail) c += ': ' + cloud.detail;
    f('cloud').textContent = c;
    var qs = backdrop.querySelectorAll('[data-q]');
    for (var qi = 0; qi < qs.length; qi++) qs[qi].classList.toggle('on', qs[qi].getAttribute('data-q') === window.__pvzQuality);
    f('device').textContent = deviceInfo();
    var errs = window.__pvzErrors || [];
    f('errors').textContent = errs.length ? errs.join('\n\n') : 'None';
    hud.classList.toggle('has-errors', errs.length > 0);
    f('pack').textContent = packText();
  }

  // ---------- Diagnostics ----------
  var avifOk = null;
  (function () {
    var img = new Image();
    img.onload = function () { avifOk = img.width > 0; render(); };
    img.onerror = function () { avifOk = false; render(); };
    img.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  })();
  function layoutInfo() {
    try {
      var r = function (el) { if (!el) return '?'; var b = el.getBoundingClientRect(); return Math.round(b.width) + '×' + Math.round(b.height) + (Math.round(b.left) || Math.round(b.top) ? '@' + Math.round(b.left) + ',' + Math.round(b.top) : ''); };
      var vv = window.visualViewport;
      var ws = window.cc && window.cc.screen && window.cc.screen.windowSize;
      var de = document.documentElement;
      return [
        'Layout: window ' + innerWidth + '×' + innerHeight +
          (vv ? ' · visible ' + Math.round(vv.width) + '×' + Math.round(vv.height) + ' zoom ' + vv.scale.toFixed(2) : ''),
        '  page ' + de.clientWidth + '×' + de.clientHeight + ' · box ' + r(document.getElementById('GameDiv')) +
          ' · canvas ' + r(document.getElementById('GameCanvas')),
        '  engine ' + (ws ? Math.round(ws.width) + '×' + Math.round(ws.height) : '?') +
          ' · dpr ' + (window.__pvzRealDpr || '?') + '→' + (window.cc && window.cc.screen ? window.cc.screen.devicePixelRatio : '?') +
          ' · fullscreen ' + (document.fullscreenElement || document.webkitFullscreenElement ? 'yes' : 'no') +
          ' · re-fits ' + (window.__pvzLayoutFixes || 0) +
          (window.__pvzLetterboxed && window.__pvzLetterboxed() ? ' · bars on (screen narrower than 16:10)' : '') +
          ' · ' + (screen.orientation ? screen.orientation.type : (window.orientation + '°'))
      ].join('\n');
    } catch (e) { return 'Layout: ' + e.message; }
  }
  function isTouchUI() { return (navigator.maxTouchPoints || 0) > 0; }
  function deviceInfo() {
    var started = !!(window.cc && window.cc.director && window.cc.director.getScene && window.cc.director.getScene());
    return [
      navigator.userAgent,
      'Screen ' + screen.width + '×' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x',
      'AVIF images: ' + (avifOk === null ? 'checking…' : avifOk ? 'supported' : 'NOT supported (needs iPadOS 16+)'),
      'Service worker: ' + (!swSupported ? 'unavailable' : navigator.serviceWorker.controller ? 'active ' + (swVersion || '') : 'not yet active'),
      'Graphics: ' + (window.__pvzQuality || '?') + ' · canvas ' + (function () { var c = document.getElementById('GameCanvas'); return c ? c.width + '×' + c.height : '?'; })(),
      layoutInfo(),
      'Home Screen app: ' + (navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'yes' : 'no'),
      'Game engine started: ' + (started ? 'yes' : 'no'),
      soundInfo()
    ].join('\n');
  }
  function soundInfo() {
    var a = window.audioEngine;
    if (!a || !a.status) return 'Sound: not started';
    var s = a.status(), t = s.stats || {};
    return 'Sound: ' + s.state + (s.rate ? ' ' + s.rate + 'Hz' : '') +
      ' · music volume ' + (s.musicVolumeWorks ? 'OK' : 'fixed (old route)') +
      ' · music playing ' + s.musicPlaying + (s.musicBlocked ? ' (' + s.musicBlocked + ' waiting for a tap)' : '') +
      ' · effects ' + (t.played || 0) + ' played, ' + (t.late || 0) + ' late, ' + (t.dropped || 0) + ' dropped, ' +
      s.cachedMB + 'MB cached';
  }
  function repair() {
    if (!confirm('Clear the offline copy and reload? Your saves are kept.')) return;
    var jobs = [];
    if (window.caches) jobs.push(caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf('pvz-') === 0; }).map(function (k) { return caches.delete(k); }));
    }));
    if (swSupported) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
      return Promise.all(rs.map(function (r) { return r.unregister(); }));
    }));
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('__pvz_pack_') === 0) localStorage.removeItem(k); }); } catch (e) {}
    Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }
  // When a startup file fails to load, check each one and report its HTTP status.
  var IMPORT_FAIL = /module script failed|dynamically imported module|loading dynamically imported/i;
  var probed = false;
  function probeStartupFiles() {
    if (probed) return;
    var errs = window.__pvzErrors || [];
    if (!errs.some(function (e) { return IMPORT_FAIL.test(e); })) return;
    probed = true;
    var push = function (m) { errs.push(m); render(); };
    push('Base URL: ' + document.baseURI);
    ['game-audio.js', 'resource-codec-avif-support.js', 'index.js', 'src/system.bundle.js', 'src/import-map.json', 'audio/manifest.json']
      .forEach(function (f) {
        var u = new URL(f, document.baseURI).href;
        fetch(u, { cache: 'no-store' })
          .then(function (r) { push(f + ': HTTP ' + r.status + ' ' + (r.headers.get('content-type') || '')); })
          .catch(function (e) { push(f + ': ' + e.message); });
      });
  }
  window.addEventListener('pvz:error', function (e) {
    render(); probeStartupFiles();
    // Offline and the game asked for something not downloaded yet: say so instead of nothing.
    if (/status: 504|Offline and not downloaded/.test(String(e.detail || '')) && !offlineToastShown) {
      offlineToastShown = true;
      toast('This part of the game isn\'t downloaded yet (' + packText() + '). Connect to the internet to finish the download.');
      setTimeout(function () { offlineToastShown = false; }, 30000);
    }
  });
  var offlineToastShown = false;

  // ---------- Download all for offline ----------
  function downloadAll() {
    if (!swSupported) { toast('Offline mode needs the site served over HTTPS.'); return; }
    if (!navigator.onLine) { toast('Connect to the internet to download the game.'); return; }
    if (!navigator.serviceWorker.controller) {
      toast('Reload the page once, then try again.', 'Reload', function () { location.reload(); });
      return;
    }
    if (pack.done) { toast('Already complete – the game works fully offline.'); return; }
    progress.classList.add('show');
    startFill(true);
    renderPack();
  }

  function renderPack() {
    if (!backdrop) return;
    var f = backdrop.querySelector('[data-f="pack"]');
    if (f) f.textContent = packText();
    if (progress && (manualFill || progress.classList.contains('show'))) {
      var pct = pack.bytesTotal ? pack.bytesHave / pack.bytesTotal * 100 : 0;
      progress.querySelector('.fill').style.width = (pack.done ? 100 : pct).toFixed(1) + '%';
      progress.querySelector('.text').textContent = pack.done
        ? 'Done – the game now works fully offline.'
        : (pack.total ? pack.have + ' / ' + pack.total + ' files (' + Math.round(pack.bytesHave / 1048576) + ' / ' + Math.round(pack.bytesTotal / 1048576) + ' MB)' : 'Starting…');
    }
  }

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg, actionLabel, action, opts) {
    if (!toastEl) { console.info('[PVZ]', msg); return; }
    opts = opts || {};
    toastEl.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg;
    toastEl.appendChild(span);
    if (actionLabel) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = actionLabel;
      b.addEventListener('click', function () { hideToast(); action && action(); });
      toastEl.appendChild(b);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'close';
    x.setAttribute('aria-label', 'Dismiss');
    x.textContent = '✕';
    x.addEventListener('click', hideToast);
    toastEl.appendChild(x);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    if (!opts.sticky) toastTimer = setTimeout(hideToast, actionLabel ? 12000 : 5000);
  }
  function hideToast() { if (toastEl) toastEl.classList.remove('show'); }

  window.PVZUI = { toast: toast, hideToast: hideToast, render: render };

  // ---------- Events ----------
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  window.addEventListener('pvz:localsave', function () { if (backdrop && backdrop.classList.contains('open')) render(); });
  window.addEventListener('pvz:cloudstatus', function (e) { cloud = e.detail; render(); });

  // After a graphics reset (see ipad.js): explain what happened once.
  function graphicsNotice() {
    var n = null;
    try { n = JSON.parse(localStorage.getItem('__pvz_gl_notice') || 'null'); localStorage.removeItem('__pvz_gl_notice'); } catch (e) {}
    if (!n) return;
    var names = { smooth: 'Smoothest', balanced: 'Balanced', sharp: 'Sharpest' };
    setTimeout(function () {
      toast(n.to !== n.from
        ? 'The iPad ran low on memory and reset the graphics. Graphics set to ' + names[n.to] + ' to stop it happening again.'
        : 'The iPad ran low on memory and reset the graphics. Closing other apps and tabs helps.');
    }, 3000);
  }

  if (document.body) { build(); graphicsNotice(); }
  else document.addEventListener('DOMContentLoaded', function () { build(); graphicsNotice(); });
})();
