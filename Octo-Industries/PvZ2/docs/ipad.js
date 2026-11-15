/*!
 * PvZ2 Gardendless – iPad support
 * - Re-fits the game on resize / rotation / Safari toolbar changes.
 * - "Rotate your iPad" overlay in portrait (touch devices only, CSS-driven).
 * - Blocks pinch / double-tap zoom.
 * - Unlocks Web Audio on the first touch (iOS blocks autoplay).
 *
 * LOAD ORDER: classic <script> in <head>, BEFORE any game script
 * (it must patch AudioContext before the engine creates one).
 */
(function () {
  'use strict';

  // ---------- Graphics quality (render resolution + antialias) ----------
  // Drawing at the iPad's full 2x resolution with antialiasing keeps the GPU at 100%, and the
  // iPad then heats up and throttles: smooth at first, laggier over time, worst on hordes.
  //   smooth   = 1x, no antialias      balanced = 1.5x, no antialias (default on touch screens)
  //   sharp    = native, antialias (original PC behaviour, default with mouse)
  var QUALITY = { smooth: { scale: 1, aa: false }, balanced: { scale: 1.5, aa: false }, sharp: { scale: 0, aa: true } };
  var isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  var quality = null;
  try { quality = localStorage.getItem('__pvz_quality'); } catch (e) {}
  if (!QUALITY[quality]) quality = isTouch ? 'balanced' : 'sharp';
  var q = QUALITY[quality];
  window.__pvzQuality = quality;
  var realDpr = window.devicePixelRatio || 1;
  window.__pvzRealDpr = realDpr;
  if (q.scale && realDpr > q.scale) {
    try {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: function () { return q.scale; } });
    } catch (e) {}
  }
  if (window.HTMLCanvasElement) {
    var origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      if (this.id === 'GameCanvas' && /webgl/i.test(String(type))) {
        var a = {};
        if (attrs) for (var k in attrs) a[k] = attrs[k];
        if (!q.aa) a.antialias = false;
        a.powerPreference = 'high-performance';
        var ctx = origGetContext.call(this, type, a);
        if (ctx && !window.__pvzGL) window.__pvzGL = ctx;
        return ctx;
      }
      return origGetContext.apply(this, arguments);
    };
  }

  // ---------- Graphics reset recovery ----------
  // When an iPad runs low on memory it can take the game's graphics away ("WebGL context
  // lost"). The engine can't rebuild them, so the picture freezes or goes black while the game
  // keeps running (and new render targets fail with engine error 16321). Instead: save, explain,
  // reload, and step the graphics setting down so it doesn't happen again on this device.
  var GL_STEP_DOWN = { sharp: 'balanced', balanced: 'smooth' };
  var glHandled = false;
  function onGraphicsLost(reason) {
    if (glHandled) return;
    glHandled = true;
    var recent = [];
    try { recent = JSON.parse(localStorage.getItem('__pvz_gl_resets') || '[]'); } catch (e) {}
    var now = Date.now();
    recent = recent.filter(function (t) { return now - t < 5 * 60000; });
    recent.push(now);
    var next = GL_STEP_DOWN[quality];
    try {
      localStorage.setItem('__pvz_gl_resets', JSON.stringify(recent));
      if (next) localStorage.setItem('__pvz_quality', next);
      localStorage.setItem('__pvz_gl_notice', JSON.stringify({ from: quality, to: next || quality, reason: reason }));
    } catch (e) {}
    try { if (window.PVZSave) window.PVZSave.flush(); } catch (e) {}
    var auto = recent.length <= 2; // never loop: after 2 resets in 5 minutes, ask instead
    showGraphicsOverlay(auto);
    if (auto) {
      var go = function () { setTimeout(function () { location.reload(); }, 1200); };
      if (document.visibilityState === 'visible') go();
      else document.addEventListener('visibilitychange', function v() {
        if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', v); go(); }
      });
    }
  }
  function showGraphicsOverlay(auto) {
    var build = function () {
      var el = document.createElement('div');
      el.id = 'pvz-gl-lost';
      el.innerHTML = '<div><p>The iPad reset the game\'s graphics (it was low on memory).</p>' +
        '<p>' + (auto ? 'Reloading… your progress is saved.' : 'Your progress is saved. Close other apps and tabs, then reload.') + '</p>' +
        (auto ? '' : '<button type="button">Reload</button>') + '</div>';
      var b = el.querySelector('button');
      if (b) b.addEventListener('click', function () { location.reload(); });
      document.body.appendChild(el);
    };
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  }
  window.addEventListener('webglcontextlost', function (e) {
    if (e.target && e.target.id === 'GameCanvas') { try { e.preventDefault(); } catch (x) {} onGraphicsLost('context lost'); }
  }, true);
  // Some iPads report it only through the engine's framebuffer errors; confirm it's really lost.
  window.addEventListener('pvz:error', function (e) {
    if (/Error 1631[89]|Error 1632[01]/.test(String(e.detail || ''))) {
      var gl = window.__pvzGL;
      if (gl && gl.isContextLost && gl.isContextLost()) onGraphicsLost('framebuffer error');
    }
  });
  window.__pvzSimulateGraphicsLoss = function () {
    var gl = window.__pvzGL, ext = gl && gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  };

  // ---------- Engine memory setting ----------
  // By default the engine keeps every image in memory twice (the decoded original plus the GPU
  // copy). iPad Safari kills pages that use too much memory, so on touch devices the original
  // is freed after upload (the game never reads image pixels back).
  if (isTouch) (function () {
    function tune(ccObj) {
      try { if (ccObj && ccObj.macro) { ccObj.macro.CLEANUP_IMAGE_CACHE = true; return true; } } catch (e) {}
      return false;
    }
    var stored;
    try {
      Object.defineProperty(window, 'cc', {
        configurable: true, enumerable: true,
        get: function () { return stored; },
        set: function (v) {
          stored = v;
          // macro is filled in later in the same engine start-up, so check again shortly.
          if (!tune(v)) Promise.resolve().then(function () { if (!tune(v)) setTimeout(function () { tune(v); }, 0); });
        }
      });
    } catch (e) {
      var iv = setInterval(function () { if (tune(window.cc)) clearInterval(iv); }, 50);
      setTimeout(function () { clearInterval(iv); }, 60000);
    }
  })();

  // ---------- Error log (shown in the ⚙ panel; iPad has no easy console) ----------
  var errors = window.__pvzErrors = [];
  function logError(msg) {
    msg = String(msg || 'Unknown error').slice(0, 300);
    // Normal before the first tap: browsers block sound until the user interacts.
    if (/user didn't interact|NotAllowedError|not allowed by the user agent|play failed/i.test(msg)) return;
    // Cloud sync failures (often a school network blocking Google) don't affect the game.
    if (/@firebase|firestore|googleapis|apis\.google\.com|gstatic\.com\/firebasejs/i.test(msg)) {
      msg = 'Cloud sync can\'t reach Firebase (network may block it). Saves are still kept on this iPad.';
    }
    if (errors.length >= 20 || errors.indexOf(msg) !== -1) return;
    errors.push(msg);
    try { window.dispatchEvent(new CustomEvent('pvz:error', { detail: msg })); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) {
      logError('Failed to load ' + (e.target.src || e.target.href));
    } else {
      logError((e.message || 'Script error') + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : ''));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    logError('Unhandled: ' + (r && (r.stack || r.message) ? (r.message || r.stack) : r));
  });
  var origConsoleError = console.error;
  console.error = function () {
    if (errors.length < 20) try {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        parts.push(a && a.message ? a.message : typeof a === 'string' ? a : (function () { try { return JSON.stringify(a); } catch (x) { return String(a); } })());
      }
      logError(parts.join(' '));
    } catch (e) {}
    return origConsoleError.apply(console, arguments);
  };

  // ---------- Audio unlock ----------
  // Constructors are wrapped with plain factory functions (not `class extends`), because
  // Safari can refuse to subclass built-in media constructors. Any failure falls back to the
  // original constructor, so the game's audio can never be broken by this file.
  function wrapConstructor(name, onCreate) {
    var Orig = window[name];
    if (typeof Orig !== 'function') return;
    function Wrapped() {
      var obj;
      switch (arguments.length) {
        case 0: obj = new Orig(); break;
        case 1: obj = new Orig(arguments[0]); break;
        default: obj = new Orig(arguments[0], arguments[1]);
      }
      try { onCreate(obj); } catch (e) {}
      return obj;
    }
    try {
      Wrapped.prototype = Orig.prototype;
      Object.setPrototypeOf(Wrapped, Orig); // keep static members (e.g. AudioContext.prototype checks)
      window[name] = Wrapped;
    } catch (e) {
      window[name] = Orig;
    }
  }

  var audioContexts = [];
  wrapConstructor('AudioContext', function (ctx) { audioContexts.push(ctx); });
  wrapConstructor('webkitAudioContext', function (ctx) { audioContexts.push(ctx); });

  function unlockAudio() {
    audioContexts.forEach(function (ctx) {
      if (ctx.state === 'running' || ctx.state === 'closed') return;
      try {
        ctx.resume();
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {}
    });
  }
  // HTML <audio> elements (this game's audio engine pools 60 of them). iOS only lets an
  // element play from script after it has played once during a user gesture, so on the
  // first touch every idle, source-less element plays a silent clip muted, then resets.
  var SILENT_WAV = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
  var audioElements = [];
  wrapConstructor('Audio', function (el) { audioElements.push(el); });
  var elementsUnlocked = false;
  function unlockAudioElements() {
    if (elementsUnlocked) return;
    elementsUnlocked = true;
    audioElements.forEach(function (el) {
      var src = el.getAttribute('src');
      if (!el.paused || (src && src !== SILENT_WAV)) return; // never touch the game's sounds
      el.muted = true;
      el.src = SILENT_WAV;
      var p = el.play();
      var reset = function () {
        el.muted = false; // always restore, even if the game took the element over meanwhile
        if (el.getAttribute('src') !== SILENT_WAV) return;
        el.pause();
        el.removeAttribute('src');
        el.load();
      };
      if (p && p.then) p.then(reset, reset);
      else reset();
    });
  }

  // Kept permanently: iOS suspends ("interrupted") audio after backgrounding.
  function onGesture() { unlockAudio(); unlockAudioElements(); }
  ['touchend', 'pointerup', 'mouseup', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, onGesture, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') unlockAudio();
  });

  // ---------- Touch → mouse bridge ----------
  // The game was built for PC: seed packets, planting, sun, shovel etc. listen for MOUSE
  // events, which the engine never produces from finger touches. Here touches on the game
  // canvas are turned into the mouse events a PC would send, and the original touch events
  // are stopped so nothing is handled twice (the engine already turns mouse into touch for
  // its own buttons and scroll views).
  //   1 finger: left button (tap = click, drag = drag)
  //   2-finger tap: right button   ·   2-finger swipe / pinch: mouse wheel
  (function () {
    var PRESS_DELAY_MS = 60;   // a held finger presses after this (if no second finger joined)
    var TWO_FINGER_WINDOW_MS = 120; // a second finger within this = 2-finger gesture
    var RESTING_MS = 300;      // a finger held still this long yields to a new finger
    var MOVE_SLOP_PX = 6;      // moving further than this presses immediately
    var TAP_SLOP_PX = 15;      // 2-finger tap must move less than this
    var TAP_MAX_MS = 500;
    var WHEEL_PER_PX = 2;      // wheel delta per finger pixel
    var DROP_MIN_PX = 30;      // a drag this long while holding a seed/shovel drops it on release

    // Is the player holding something (seed, shovel, Plant Food, Zen Garden glove/cart)?
    // The PC game places items with a click; this lets a drag-and-release place them too.
    var holders = null, holdersScene = null;
    function holdingSomething() {
      var cc = window.cc;
      if (!cc || !cc.director || !cc.Component) return false;
      var scene = cc.director.getScene();
      if (!scene) return false;
      if (scene !== holdersScene || !holders || holders.some(function (c) { return !c.isValid; })) {
        holdersScene = scene;
        holders = scene.getComponentsInChildren(cc.Component).filter(function (c) {
          return c && (c.plantInHandLayer || c.gloveInHand || c.cartInHand);
        });
      }
      return holders.some(function (c) {
        var layer = c.plantInHandLayer;
        if (layer && layer.children && layer.children.some(function (n) { return n.active; })) return true;
        return !!((c.gloveInHand && c.gloveInHand.active) || (c.cartInHand && c.cartInHand.active));
      });
    }

    // ---- World map swiping. The world picker (one icon per world) only changes world on a
    // tap or mouse-wheel step, and the level map only scrolls when a drag starts on empty
    // sea (islands/level buttons swallow the drag). On those two screens a sideways swipe is
    // handled here directly; taps still click as before.
    var SWIPE_START_PX = 12;   // sideways movement that starts a swipe
    var SWIPE_HOLD_MS = 250;   // on swipe screens, a finger held this long presses instead
    var CHOOSER_STEP_PX = 260; // world picker: one world per this much swipe (short swipes: 1)
    var LATE_SWIPE_MS = 800;   // a sideways swipe this soon after touching still counts
    var mapCache = { scene: null, mgr: null };
    function mapManager() {
      var cc = window.cc;
      if (!cc || !cc.director || !cc.Component) return null;
      var scene = cc.director.getScene();
      if (!scene) return null;
      if (mapCache.scene !== scene || (mapCache.mgr && !mapCache.mgr.isValid)) {
        mapCache.scene = scene;
        mapCache.mgr = null;
        var all = scene.getComponentsInChildren(cc.Component);
        for (var i = 0; i < all.length; i++) {
          var c = all[i];
          if (c && c.WMSlot && c.WMChooserSlot && typeof c.TouchMove === 'function') { mapCache.mgr = c; break; }
        }
      }
      return mapCache.mgr;
    }
    function swipeTarget() {
      try {
        var mgr = mapManager();
        if (!mgr || !mgr.enabledInHierarchy) return null;
        var cc = window.cc, i, list;
        if (mgr.WMChooserSlot && mgr.WMChooserSlot.node && mgr.WMChooserSlot.node.activeInHierarchy) {
          list = mgr.WMChooserSlot.getComponentsInChildren(cc.Component);
          for (i = 0; i < list.length; i++) {
            var ch = list[i];
            if (ch.icons && ch.mid && typeof ch.moveBy === 'function' && ch.node.activeInHierarchy) {
              return ch.entering ? null : { kind: 'chooser', c: ch };
            }
          }
        }
        if (mgr.WMSlot && mgr.WMSlot.node && mgr.WMSlot.node.activeInHierarchy) {
          list = mgr.WMSlot.getComponentsInChildren(cc.Component);
          for (i = 0; i < list.length; i++) {
            if (list[i].levelIslands && typeof list[i].moveBy === 'function' && list[i].node.activeInHierarchy) {
              return { kind: 'map', c: mgr };
            }
          }
        }
      } catch (e) {}
      return null;
    }
    var pendingMapDx = 0, mapTarget = null;
    function flushMapSwipe() {
      if (!pendingMapDx || !mapTarget) return;
      var d = pendingMapDx * ((window.cc && window.cc.screen && window.cc.screen.devicePixelRatio) || window.devicePixelRatio || 1);
      pendingMapDx = 0;
      // Same call the game makes for a mouse drag on the sea, so its own momentum applies.
      try { mapTarget.TouchMove({ preventSwallow: false, getDeltaX: function () { return d; } }); } catch (e) {}
    }
    function swipeMove(p) {
      var dx = p.x - p.lastSwipeX;
      p.lastSwipeX = p.x;
      if (p.swipe.kind === 'map') {
        mapTarget = p.swipe.c;
        pendingMapDx += dx;
        schedule();
      } else {
        var total = p.x - p.sx;
        var want = -Math.sign(total) * Math.floor(Math.abs(total) / CHOOSER_STEP_PX);
        if (want !== p.steps) { try { p.swipe.c.moveBy(want - p.steps); } catch (e) {} p.steps = want; }
      }
    }
    function swipeEnd(p) {
      if (p.swipe.kind === 'map') { flushNow(); return; }
      var total = p.x - p.sx;
      if (p.steps === 0 && Math.abs(total) > 40) { try { p.swipe.c.moveBy(-Math.sign(total)); } catch (e) {} }
    }

    var canvas = null;
    var primary = null;        // the finger acting as the mouse
    var multi = null;          // 2-finger gesture { a, b (touch ids), start, moved, lastMid, lastDist, rx, ry }

    function isGameTarget(e) {
      if (!canvas || !canvas.isConnected) canvas = document.getElementById('GameCanvas');
      return !!canvas && e.target === canvas;
    }

    function mouse(type, x, y, button, buttons) {
      lastSent = { x: x, y: y };
      var ev = new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window, composed: true,
        clientX: x, clientY: y, screenX: x, screenY: y,
        button: button, buttons: buttons
      });
      canvas.dispatchEvent(ev);
    }

    function wheel(x, y, dx, dy) {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, view: window,
        clientX: x, clientY: y, deltaX: dx, deltaY: dy, deltaMode: 0
      }));
    }

    // Touch screens report movement up to 120-240 times a second at uneven intervals. The game
    // (and its level-map momentum) expects one smooth cursor update per frame, so moves and
    // wheel steps are merged and sent once per animation frame.
    var pendingMove = null, pendingWheel = null, rafId = 0, lastSent = null;
    var STEP_PX = 40; // fill in long jumps so fast sweeps don't skip over sun
    function schedule() { if (!rafId) rafId = requestAnimationFrame(flushInput); }
    function flushInput() {
      rafId = 0;
      if (pendingMove) {
        var m = pendingMove; pendingMove = null;
        if (lastSent) {
          var dist = Math.hypot(m.x - lastSent.x, m.y - lastSent.y);
          var steps = Math.min(8, Math.floor(dist / STEP_PX));
          for (var i = 1; i <= steps; i++) {
            var f = i / (steps + 1);
            mouse('mousemove', lastSent.x + (m.x - lastSent.x) * f, lastSent.y + (m.y - lastSent.y) * f, 0, m.buttons);
          }
        }
        mouse('mousemove', m.x, m.y, 0, m.buttons);
      }
      if (pendingWheel) { var w = pendingWheel; pendingWheel = null; wheel(w.x, w.y, w.dx, w.dy); }
      flushMapSwipe();
    }
    function flushNow() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } flushInput(); }
    function queueMove(x, y, buttons) { pendingMove = { x: x, y: y, buttons: buttons }; schedule(); }
    function queueWheel(x, y, dx, dy) {
      if (pendingWheel) { pendingWheel.x = x; pendingWheel.y = y; pendingWheel.dx += dx; pendingWheel.dy += dy; }
      else pendingWheel = { x: x, y: y, dx: dx, dy: dy };
      schedule();
    }

    function press() {
      if (!primary || primary.pressed) return;
      clearTimeout(primary.timer);
      primary.pressed = true;
      pendingMove = null;
      // Press where the finger first touched (like clicking where the cursor was), then
      // catch up to where it is now.
      mouse('mousemove', primary.sx, primary.sy, 0, 0);
      mouse('mousedown', primary.sx, primary.sy, 0, 1);
      if (primary.x !== primary.sx || primary.y !== primary.sy) queueMove(primary.x, primary.y, 1);
    }

    function find(list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }

    function pairState(a, b) {
      return {
        mid: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      };
    }

    // Work still owed to the game when a new touch begins (a very quick tap waiting for the
    // game to see the cursor, or a drag-and-drop click). It runs right away instead of being
    // dropped, so rapid taps never get lost.
    var owed = null;
    function settleOwed() { if (owed) { var f = owed; owed = null; f(); } }

    function releaseOffscreen() {
      // Let go outside the game: the engine turns a release outside the pressed button into a
      // "cancel", so nothing gets clicked. (No move first: that would yank a dragged map.)
      pendingMove = null;
      mouse('mouseup', -10000, -10000, 0, 0);
    }

    function cancelPrimary() {
      if (!primary) return;
      clearTimeout(primary.timer);
      primary.onReady = null;
      pendingMove = null;
      if (primary.pressed) releaseOffscreen();
      primary = null;
    }

    // Recover from touches the system never finished (app switched, notification, system
    // swipe, rotation): anything we track that is no longer on the screen is released.
    function dropStale(e) {
      if (primary && !find(e.touches, primary.id)) cancelPrimary();
      if (multi && (!find(e.touches, multi.a) || !find(e.touches, multi.b))) multi = null;
    }
    function resetAll() {
      owed = null;
      cancelPrimary();
      multi = null;
      pendingWheel = null;
    }

    function startMulti(a, b, rx, ry) {
      var st = pairState(a, b);
      multi = { a: a.identifier, b: b.identifier, start: Date.now(), moved: 0,
                lastMid: st.mid, lastDist: st.dist, rx: rx, ry: ry };
    }

    function rightClick(x, y) {
      mouse('mousemove', x, y, 0, 0);
      mouse('mousedown', x, y, 2, 2);
      mouse('mouseup', x, y, 2, 0);
    }

    function onStart(e) {
      if (!isGameTarget(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      unlockAudio(); unlockAudioElements();
      dropStale(e);
      var now = Date.now();
      var ch = e.changedTouches;

      if (multi) return; // extra fingers during a 2-finger gesture are ignored

      if (primary && primary.pressed && now - primary.t0 > RESTING_MS &&
          Math.hypot(primary.x - primary.sx, primary.y - primary.sy) <= MOVE_SLOP_PX) {
        // The current finger has been sitting still (a thumb resting on the glass while
        // holding the iPad): let it go without clicking, and the new finger takes over.
        cancelPrimary();
      }

      if (primary) {
        // A second finger shortly after the first (before it pressed) = 2-finger gesture.
        // Other extra fingers while one is actively dragging are ignored.
        if (!primary.pressed && now - primary.t0 <= TWO_FINGER_WINDOW_MS) {
          var first = find(e.touches, primary.id);
          if (first && ch[0]) {
            var rx = primary.sx, ry = primary.sy;
            clearTimeout(primary.timer);
            primary.onReady = null;
            primary = null;
            pendingMove = null;
            startMulti(first, ch[0], rx, ry);
          }
        }
        return;
      }

      settleOwed();
      if (ch.length >= 2) { startMulti(ch[0], ch[1], ch[0].clientX, ch[0].clientY); return; }

      // New primary finger. Other fingers already resting on the screen don't matter.
      var t = ch[0];
      var p = primary = { id: t.identifier, t0: now, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY,
                          pressed: false, ready: false, onReady: null, timer: 0,
                          swipe: swipeTarget(), swiping: false, lastSwipeX: t.clientX, steps: 0 };
      mouse('mousemove', t.clientX, t.clientY, 0, 0); // hover first, like a real cursor
      // The game finds the lawn tile under the cursor once per frame: let two frames pass
      // after the hover before any click, or a quick tap can land before the game "sees" it.
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        p.ready = true;
        if (p.onReady) { var f = p.onReady; p.onReady = null; f(); }
      }); });
      p.timer = setTimeout(function () {
        if (primary !== p) return;
        if (p.ready) press(); else p.onReady = function () { if (primary === p) press(); };
      }, p.swipe ? SWIPE_HOLD_MS : PRESS_DELAY_MS);
    }

    function onMove(e) {
      if (!isGameTarget(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      if (multi) {
        var a = find(e.touches, multi.a), b = find(e.touches, multi.b);
        if (!a || !b) return;
        var st = pairState(a, b);
        var dx = st.mid.x - multi.lastMid.x, dy = st.mid.y - multi.lastMid.y;
        var dd = st.dist - multi.lastDist;
        multi.moved += Math.abs(dx) + Math.abs(dy) + Math.abs(dd);
        if (multi.moved >= TAP_SLOP_PX) {
          if (Math.abs(dd) > Math.abs(dy) && Math.abs(dd) > Math.abs(dx)) {
            queueWheel(st.mid.x, st.mid.y, 0, -dd * WHEEL_PER_PX);                  // pinch out = zoom in
          } else if (dx || dy) {
            queueWheel(st.mid.x, st.mid.y, -dx * WHEEL_PER_PX, -dy * WHEEL_PER_PX); // natural scrolling
          }
        }
        multi.lastMid = st.mid; multi.lastDist = st.dist;
        return;
      }

      if (!primary) return;
      var t = find(e.changedTouches, primary.id);
      if (!t) return;
      primary.x = t.clientX; primary.y = t.clientY;
      if (primary.swiping) { swipeMove(primary); return; }
      var mdx = t.clientX - primary.sx, mdy = t.clientY - primary.sy;
      if (primary.pressed && primary.swipe && Date.now() - primary.t0 < LATE_SWIPE_MS &&
          Math.abs(mdx) > SWIPE_START_PX && Math.abs(mdx) > 1.2 * Math.abs(mdy)) {
        // Pressed already (finger held a moment, or a slow frame delayed the movement) but it
        // is clearly a sideways swipe: cancel the press without clicking and swipe instead.
        // Whatever the game already scrolled from the press-drag counts; continue from there.
        var already = lastSent ? lastSent.x : primary.sx;
        releaseOffscreen();
        primary.pressed = false;
        primary.swiping = true;
        primary.lastSwipeX = already;
        swipeMove(primary);
        return;
      }
      if (!primary.pressed && primary.swipe) {
        if (Math.abs(mdx) > SWIPE_START_PX && Math.abs(mdx) > 1.2 * Math.abs(mdy)) {
          clearTimeout(primary.timer);
          primary.onReady = null;
          primary.swiping = true;
          primary.lastSwipeX = primary.sx;
          swipeMove(primary);
        } else if (Math.abs(mdy) > SWIPE_START_PX) {
          press();
        }
        return;
      }
      if (!primary.pressed && Math.hypot(mdx, mdy) > MOVE_SLOP_PX) press();
      else queueMove(t.clientX, t.clientY, primary.pressed ? 1 : 0);
    }

    function onEnd(e) {
      var onGame = isGameTarget(e);
      if (!onGame && !primary && !multi) return;
      if (onGame) { e.preventDefault(); e.stopImmediatePropagation(); }

      if (multi) {
        // Finish as soon as either finger lifts, so a finger left on the glass can't freeze it.
        if (find(e.touches, multi.a) && find(e.touches, multi.b)) return;
        flushNow();
        var m = multi;
        multi = null;
        if (e.type === 'touchend' && Date.now() - m.start <= TAP_MAX_MS && m.moved < TAP_SLOP_PX) rightClick(m.rx, m.ry);
        return;
      }

      if (!primary) return;
      var t = find(e.changedTouches, primary.id);
      if (!t) return;
      if (e.type === 'touchcancel') { cancelPrimary(); return; }

      primary.x = t.clientX; primary.y = t.clientY;
      if (primary.swiping) { swipeMove(primary); swipeEnd(primary); primary = null; return; }
      if (!primary.pressed && !primary.ready) {
        // Very quick tap: finish it once the game has seen the cursor arrive (or right away if
        // another touch starts first).
        var tp = primary;
        clearTimeout(tp.timer);
        primary = null;
        var finishTap = function () {
          if (owed !== finishTap) return;
          owed = null;
          primary = tp; press(); flushNow();
          mouse('mouseup', tp.x, tp.y, 0, 0);
          primary = null;
        };
        owed = finishTap;
        tp.onReady = finishTap;
        return;
      }

      var wasPressed = primary.pressed;
      press();
      if (wasPressed) queueMove(t.clientX, t.clientY, 1);
      flushNow();
      mouse('mouseup', t.clientX, t.clientY, 0, 0);
      var dragged = Math.hypot(t.clientX - primary.sx, t.clientY - primary.sy) > DROP_MIN_PX;
      primary = null;
      if (dragged) {
        // Drag-and-drop: if a seed/shovel/Plant Food is held, click where the finger lifted.
        // The game works out the tile under the cursor once per frame, so hover first and
        // click a couple of frames later, the way a real mouse click arrives.
        var x = t.clientX, y = t.clientY;
        mouse('mousemove', x, y, 0, 0);
        var drop = function () {
          if (owed !== drop) return;
          owed = null;
          var held = false;
          try { held = holdingSomething(); } catch (err) {}
          if (!held) return;
          mouse('mousemove', x, y, 0, 0);
          mouse('mousedown', x, y, 0, 1);
          mouse('mouseup', x, y, 0, 0);
        };
        owed = drop;
        setTimeout(drop, 50);
      }
    }

    // Start fresh whenever the game is interrupted mid-touch.
    window.addEventListener('blur', resetAll);
    window.addEventListener('pagehide', resetAll);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') resetAll(); });
    window.addEventListener('orientationchange', resetAll);

    var opts = { capture: true, passive: false };
    window.addEventListener('touchstart', onStart, opts);
    window.addEventListener('touchmove', onMove, opts);
    window.addEventListener('touchend', onEnd, opts);
    window.addEventListener('touchcancel', onEnd, opts);
  })();

  // ---------- Touch scrolling for wheel-only lists ----------
  // Some lists (Settings and others) use "ScrollViewWithoutTouchevent", a scroll view with
  // dragging switched off because on PC you scroll it with the mouse wheel. On touch screens
  // the normal finger-drag scrolling (with flick momentum) is switched back on.
  if (isTouch) (function () {
    var tries = 0;
    var iv = setInterval(function () {
      var cc = window.cc;
      if (++tries > 1200) { clearInterval(iv); return; }
      if (!cc || !cc.js || !cc.ScrollView || !cc.js.getClassByName) return;
      var C = cc.js.getClassByName('ScrollViewWithoutTouchevent');
      if (!C) return;
      clearInterval(iv);
      ['_onTouchBegan', '_onTouchMoved', '_onTouchEnded', '_onTouchCancelled'].forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(C.prototype, k)) delete C.prototype[k];
      });
      try {
        var scene = cc.director && cc.director.getScene && cc.director.getScene();
        if (scene) scene.getComponentsInChildren(C).forEach(function (sv) {
          if (sv.enabledInHierarchy) { try { sv._unregisterEvent(); sv._registerEvent(); } catch (e) {} }
        });
      } catch (e) {}
    }, 100);
  })();

  // ---------- Zoom / gesture blocking ----------
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

  // ---------- Re-fit ----------
  var dispatching = false;

  function viewportSize() {
    var vv = window.visualViewport;
    return {
      w: Math.round(vv ? vv.width : window.innerWidth),
      h: Math.round(vv ? vv.height : window.innerHeight)
    };
  }

  // ---------- Aspect ratio ----------
  // The game is laid out for 16:10 or wider. On a squarer screen (an iPad in full screen is
  // about 4:3) the engine fills the height and crops the right side: the end of the lawn, the
  // pause button and incoming zombies go off-screen. Below 16:10 we let the engine letterbox
  // (thin black bars top and bottom) so the whole game is always visible; at 16:10 or wider
  // it keeps filling the screen as before.
  var letterboxed = null;
  function designRatio(cc) {
    try { var d = cc.view.getDesignResolutionSize(); if (d.width && d.height) return d.width / d.height; } catch (e) {}
    return 1.6;
  }
  function wantsLetterbox(cc) {
    var w = window.innerWidth, h = window.innerHeight;
    return h > 0 && w / h < designRatio(cc) - 0.01;
  }
  function applyAspect() {
    var cc = window.cc;
    if (!cc || !cc.view || !cc.ResolutionPolicy || !cc.ResolutionPolicy.ContainerStrategy) return false;
    if (!cc.view.getDesignResolutionSize || !cc.view.getResolutionPolicy) return false;
    // Wait until the engine has started (design size set, first scene running).
    try {
      var d = cc.view.getDesignResolutionSize();
      if (!d.width || !d.height || !cc.director || !cc.director.getScene || !cc.director.getScene()) return false;
    } catch (e) { return false; }
    var want = wantsLetterbox(cc);
    var RP = cc.ResolutionPolicy;
    var cur = cc.view.getResolutionPolicy();
    // Read the engine's real state: the game may set its own policy after ours.
    var isOn = !!(cur && cur._containerStrategy === RP.ContainerStrategy.PROPORTION_TO_FRAME);
    letterboxed = isOn;
    if (want === isOn) return false;
    try {
      var content = (cur && cur._contentStrategy) || RP.ContentStrategy.SHOW_ALL;
      cc.view.setResolutionPolicy(new RP(want ? RP.ContainerStrategy.PROPORTION_TO_FRAME : RP.ContainerStrategy.EQUAL_TO_FRAME, content));
      letterboxed = want;
      document.documentElement.classList.toggle('pvz-letterbox', want);
      return true;
    } catch (e) { return false; }
  }
  window.__pvzLetterboxed = function () { return !!letterboxed; };

  function refit() {
    applyAspect();
    var s = viewportSize();
    var root = document.documentElement.style;
    root.setProperty('--pvz-vw', s.w + 'px');
    root.setProperty('--pvz-vh', s.h + 'px');

    // iOS can leave the page scrolled after rotation.
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);

    // Prefer the engine's own fit API when the global `cc` is exposed.
    var cc = window.cc;
    if (cc && cc.view) {
      try {
        if (typeof cc.view.resizeWithBrowserSize === 'function') cc.view.resizeWithBrowserSize(true);
      } catch (e) {}
    }

    // Let the engine (and anything else) re-read the new size.
    if (!dispatching) {
      dispatching = true;
      try { window.dispatchEvent(new Event('resize')); } finally { dispatching = false; }
    }
  }

  var timers = [];
  function scheduleRefit() {
    if (dispatching) return;
    timers.forEach(clearTimeout);
    // iOS reports final dimensions late after rotation / toolbar animation.
    timers = [0, 120, 350, 700].map(function (d) { return setTimeout(refit, d); });
  }

  window.addEventListener('resize', scheduleRefit);
  window.addEventListener('orientationchange', scheduleRefit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleRefit);
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', scheduleRefit);
  }
  window.addEventListener('pageshow', scheduleRefit);
  // Entering/leaving full screen changes the window size, sometimes without a resize event,
  // and iPad Safari reports the final size only after its animation.
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      scheduleRefit();
      [1000, 1600].forEach(function (d) { setTimeout(refit, d); });
    });
  });

  // ---------- Layout watchdog ----------
  // Safari doesn't always send a resize when full screen, the toolbar or the Home Screen app
  // changes the window. Twice a second the drawn game is compared with the real window; if
  // they disagree, the game is re-fitted. If the page got zoomed in, the zoom is reset.
  function layoutMismatch() {
    var c = document.getElementById('GameCanvas');
    var ccObj = window.cc;
    if (!c || !ccObj || !ccObj.screen) return false;
    var r = c.getBoundingClientRect();
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = ccObj.screen.devicePixelRatio || 1;
    var ew = w, eh = h;
    if (letterboxed) {
      var ratio = designRatio(ccObj);
      if (w / h < ratio) eh = w / ratio; else ew = h * ratio;
    }
    var off = Math.abs(r.width - ew) > 2 || Math.abs(r.height - eh) > 2 ||
      Math.abs(r.left - (w - ew) / 2) > 2 || Math.abs(r.top - (h - eh) / 2) > 2;
    var buf = Math.abs(c.width - r.width * dpr) > 4 || Math.abs(c.height - r.height * dpr) > 4;
    return off || buf;
  }
  function resetZoom() {
    var vv = window.visualViewport;
    if (!vv || vv.scale <= 1.01) return;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    var content = meta.getAttribute('content');
    meta.setAttribute('content', content + ',maximum-scale=1.0001');
    setTimeout(function () { meta.setAttribute('content', content); }, 50);
  }
  var strikes = 0;
  window.__pvzLayoutFixes = 0;
  var recentFixes = [];
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    if (isTouch && window.innerHeight > window.innerWidth) return; // portrait: rotate screen shown
    resetZoom();
    if (applyAspect()) { strikes = 0; scheduleRefit(); return; }
    if (layoutMismatch()) {
      var now = Date.now();
      recentFixes = recentFixes.filter(function (t) { return now - t < 10000; });
      if (++strikes >= 2 && recentFixes.length < 3) { // back off if re-fitting doesn't help
        strikes = 0;
        recentFixes.push(now);
        window.__pvzLayoutFixes++;
        refit();
      }
    } else strikes = 0;
  }, 500);

  // ---------- Rotate overlay ----------
  function addOverlay() {
    if (document.getElementById('pvz-rotate')) return;
    var el = document.createElement('div');
    el.id = 'pvz-rotate';
    el.setAttribute('role', 'alert');
    el.innerHTML =
      '<div class="pvz-rotate-icon" aria-hidden="true"></div>' +
      '<p>Rotate your iPad to landscape to play</p>';
    document.body.appendChild(el);
    scheduleRefit();
  }
  if (document.body) addOverlay();
  else document.addEventListener('DOMContentLoaded', addOverlay);
})();
