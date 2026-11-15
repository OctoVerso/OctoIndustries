// Game audio engine (same API as the 0.16.0 Electron renderer pool the game calls through
// window.audioEngine), tuned for iPad Safari:
//
// - Sound effects (audio/Sounds/...) play through Web Audio: each clip is fetched and decoded
//   once, kept in a memory-capped cache, and replayed with an AudioBufferSourceNode. The old
//   way re-loaded a media file into an <audio> element for every pea, chomp and groan, which
//   on iPad Safari is slow, stalls frames and gets worse the busier a level is.
// - Music (audio/Music/...) keeps using <audio> elements: one long track at a time, and
//   decoding whole songs into memory would use far too much RAM.
// - If Web Audio is unavailable, everything falls back to <audio> elements.

const DEFAULT_VOLUME = 0.9;
const MUSIC_POOL_SIZE = 8;          // <audio> elements for music (and fallback)
const FALLBACK_POOL_SIZE = 60;      // original pool size when Web Audio is unavailable
const MAX_SFX_VOICES = 48;          // concurrent sound effects
const SFX_CACHE_BYTES = 32 * 1048576; // decoded PCM kept in memory (least recently used evicted)
const RAW_CACHE_BYTES = 9 * 1048576;  // compressed clips kept in memory (all short sounds ≈ 7 MB)
const LONG_CLIP_BYTES = 350 * 1024; // longer clips (ambience loops) stream via <audio> instead
const STALE_START_S = 0.35;          // a one-shot queued while audio was blocked is dropped after this

// Sound that iPadOS blocks until the first tap. Remember what tried to play meanwhile.
const GESTURE_EVENTS = ['touchend', 'pointerup', 'mouseup', 'keydown'];
function onEveryGesture(fn) {
    GESTURE_EVENTS.forEach(ev => window.addEventListener(ev, fn, { capture: true, passive: true }));
}

function clamp01(v) { return Math.min(1, Math.max(0, Number(v) || 0)); }

// ---------------------------------------------------------------- <audio> element pool
// iPadOS ignores the volume of <audio> elements (it's read-only there), so fades, the music
// slider and muting one track under another did nothing. When Web Audio is available each
// element is routed through its own gain node, which does work.
class ElementPool {
    constructor(size, graph) {
        this.pool = [];
        this.graph = graph || null;
        for (let i = 0; i < size; i++) {
            const el = new Audio();
            el.preload = 'auto';
            el.preservesPitch = false;
            el.webkitPreservesPitch = false;
            let gain = null;
            if (this.graph) {
                try {
                    const node = this.graph.ctx.createMediaElementSource(el);
                    gain = this.graph.ctx.createGain();
                    node.connect(gain);
                    gain.connect(this.graph.master);
                } catch (e) { gain = null; }
            }
            this.pool.push({
                kind: 'el', el, gain, id: null, gen: 0, playing: false, blocked: false, fading: false,
                speed: 1, volume: DEFAULT_VOLUME, restartBeforeEnd: null, restartTimer: null, fadeTimer: null,
            });
        }
        // A track that iPadOS refused to start (no tap yet) starts on the next tap.
        onEveryGesture(() => this.retryBlocked());
    }

    applyVolume(slot, volume) {
        const v = clamp01(volume);
        if (slot.gain) {
            const g = slot.gain.gain;
            try { g.cancelScheduledValues(this.graph.ctx.currentTime); } catch (e) { }
            g.value = v;
            slot.el.volume = 1;
        } else {
            slot.el.volume = v;
        }
    }

    startElement(engine, slot) {
        const gen = slot.gen;
        const el = slot.el;
        let p;
        try { p = el.play(); } catch (e) { p = Promise.reject(e); }
        if (!p || !p.then) return;
        p.then(() => { if (slot.gen === gen) slot.blocked = false; }, (err) => {
            if (slot.gen !== gen || !slot.playing) return; // an older play() of a reused slot
            if (err && err.name === 'NotAllowedError') { slot.blocked = true; return; }
            if (err && err.name === 'AbortError') return; // paused/seeked before it started
            this.release(engine, slot);
        });
    }

    retryBlocked() {
        for (const slot of this.pool) {
            if (slot.playing && slot.blocked && !slot.paused) {
                slot.blocked = false;
                this.startElement(this.engine, slot);
            }
        }
    }

    play(engine, src, speed, volume, forcedId) {
        const slot = this.pool.find(s => !s.playing);
        if (!slot) return null;
        const el = slot.el;
        if (slot.restartTimer) { clearTimeout(slot.restartTimer); slot.restartTimer = null; }
        if (slot.fadeTimer) { clearInterval(slot.fadeTimer); slot.fadeTimer = null; }
        this.engine = engine;
        slot.gen++;
        el.pause();
        el.src = src;
        el.playbackRate = speed;
        el.defaultPlaybackRate = speed;
        el.preservesPitch = false;
        el.webkitPreservesPitch = false;
        this.applyVolume(slot, volume);
        slot.id = forcedId || engine.nextId++;
        slot.playing = true;
        slot.paused = false;
        slot.blocked = false;
        slot.fading = false;
        slot.speed = speed;
        slot.volume = clamp01(volume);
        slot.restartBeforeEnd = null;
        engine.byId.set(slot.id, slot);
        const gen = slot.gen;
        el.onended = () => { if (slot.gen === gen) this.release(engine, slot); };
        el.onerror = () => {
            if (slot.gen !== gen || !el.getAttribute('src')) return;
            console.warn('[audio] load error:', src);
            this.release(engine, slot);
        };
        this.startElement(engine, slot);
        return slot.id;
    }

    release(engine, slot) {
        if (!slot.playing) return;
        slot.gen++;
        slot.playing = false;
        slot.blocked = false;
        slot.paused = false;
        slot.fading = false;
        slot.restartBeforeEnd = null;
        if (slot.restartTimer) { clearTimeout(slot.restartTimer); slot.restartTimer = null; }
        if (slot.fadeTimer) { clearInterval(slot.fadeTimer); clearTimeout(slot.fadeTimer); slot.fadeTimer = null; }
        const el = slot.el;
        el.onended = null;
        el.onerror = null;
        el.pause();
        el.removeAttribute('src');
        el.load();
        if (slot.id !== null) engine.byId.delete(slot.id);
        slot.id = null;
    }

    setVolume(slot, volume) {
        const v = clamp01(volume);
        if (slot.fading) { slot.volume = v; return; } // don't undo a fade-out in progress
        if (v === slot.volume) return;
        slot.volume = v;
        this.applyVolume(slot, v);
    }

    setPlaying(slot, playing) {
        slot.paused = !playing;
        if (playing) this.startElement(this.engine, slot);
        else { slot.blocked = false; slot.el.pause(); }
    }

    seek(slot, seconds) {
        const el = slot.el;
        const target = Math.max(0, seconds);
        const apply = () => { if (el.seekable.length > 0) el.currentTime = Math.min(target, el.duration || target); };
        if (el.readyState >= 1 && el.seekable.length > 0) apply();
        else el.addEventListener('loadedmetadata', apply, { once: true });
    }

    getPosition(slot) {
        const el = slot.el;
        return [el.currentTime, isFinite(el.duration) ? el.duration : null];
    }

    getDuration(slot) { return isFinite(slot.el.duration) ? slot.el.duration : null; }

    fadeOut(engine, slot, durationMs) {
        if (slot.fading) return;
        slot.fading = true;
        const ms = Math.max(10, Number(durationMs) || 2000);
        if (slot.gain) {
            const ctx = this.graph.ctx, g = slot.gain.gain, now = ctx.currentTime;
            g.cancelScheduledValues(now);
            g.setValueAtTime(g.value, now);
            g.linearRampToValueAtTime(0, now + ms / 1000);
            const gen = slot.gen;
            slot.fadeTimer = setTimeout(() => {
                slot.fadeTimer = null;
                if (slot.gen === gen) this.release(engine, slot);
            }, ms);
            return;
        }
        durationMs = ms;
        const startVol = slot.el.volume;
        const steps = 30;
        let i = 0;
        slot.fadeTimer = setInterval(() => {
            i++;
            slot.el.volume = Math.max(0, startVol * (1 - i / steps));
            if (i >= steps) {
                clearInterval(slot.fadeTimer);
                slot.fadeTimer = null;
                this.release(engine, slot);
            }
        }, durationMs / steps);
    }

    setRestartBeforeEnd(slot, beforeMs) {
        slot.restartBeforeEnd = beforeMs / 1000;
        const schedule = () => {
            if (!slot.playing || slot.restartBeforeEnd === null) return;
            const el = slot.el;
            if (!isFinite(el.duration)) { slot.restartTimer = setTimeout(schedule, 100); return; }
            const target = el.duration - slot.restartBeforeEnd / slot.speed;
            const remaining = (target - el.currentTime) * 1000 / slot.speed;
            if (remaining <= 0) {
                el.currentTime = 0;
                schedule();
            } else {
                slot.restartTimer = setTimeout(() => {
                    if (!slot.playing) return;
                    el.currentTime = 0;
                    schedule();
                }, remaining);
            }
        };
        schedule();
    }

    cleanupFinished(engine) {
        let count = 0;
        for (const slot of this.pool) {
            if (!slot.playing && slot.el.src) {
                slot.el.removeAttribute('src');
                slot.el.load();
                if (slot.id !== null) engine.byId.delete(slot.id);
                slot.id = null;
                count++;
            }
        }
        return count;
    }
}

// ---------------------------------------------------------------- Web Audio sound effects
class SfxEngine {
    constructor() {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.cache = new Map();   // url -> { buffer, bytes, used }
        this.longClips = new Set(); // clips too long to decode into memory: played via <audio>
        this.loading = new Map(); // url -> Promise<AudioBuffer>
        this.bytes = 0;
        this.voices = new Set();
        this.clock = 0;

        // Play through the silent switch like <audio> did (Safari 17+), and stop the audio
        // clock while the game is in the background.
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.ctx.suspend().catch(() => { });
            else this.wake();
        });
        // iPadOS can also stop the audio clock by itself ("interrupted": a call, Siri, another
        // app's sound). Wake it on the next tap.
        onEveryGesture(() => this.wake());
        this.raw = new Map();      // url -> compressed bytes (for re-decoding evicted clips)
        this.rawBytes = 0;
        this.decoders = new Map(); // sample rate -> OfflineAudioContext used for decoding
        this.stats = { played: 0, decoded: 0, evicted: 0, dropped: 0, late: 0 };
        this.wasRunning = this.ctx.state === 'running';
        this.ctx.onstatechange = () => {
            const running = this.ctx.state === 'running';
            if (running && !this.wasRunning) this.dropStale();
            this.wasRunning = running;
        };
    }

    wake() {
        if (document.visibilityState !== 'visible') return;
        if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => { });
    }

    // One-shot sounds queued while audio was blocked would otherwise all fire at once the
    // moment it unblocks (a burst of old clicks and groans). Loops are kept.
    dropStale() {
        const now = performance.now();
        for (const v of [...this.voices]) {
            if (v.queuedAt && v.loopEnd === null && now - v.queuedAt > STALE_START_S * 1000) {
                this.stats.dropped++;
                this.release(this.engine, v);
            }
        }
    }

    // MP3 sample rate from the first frame header (skipping an ID3v2 tag). Clips are decoded at
    // their own rate instead of the context's 48 kHz: most game sounds are 16-32 kHz, so this
    // roughly halves the memory each decoded sound takes. Playback resamples automatically.
    mp3Rate(data) {
        try {
            const b = new Uint8Array(data, 0, Math.min(data.byteLength, 65536));
            let i = 0;
            if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
                i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
            }
            for (; i + 3 < b.length; i++) {
                if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
                const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, idx = (b[i + 2] >> 2) & 3;
                if (ver === 1 || layer === 0 || idx === 3) continue;
                const base = [44100, 48000, 32000][idx];
                return ver === 3 ? base : ver === 2 ? base / 2 : base / 4;
            }
        } catch (e) { }
        return 0;
    }

    decoderFor(rate) {
        if (!rate || rate >= this.ctx.sampleRate) return this.ctx;
        let d = this.decoders.get(rate);
        if (d === undefined) {
            const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            try { d = Off ? new Off(1, 1, rate) : null; } catch (e) { d = null; }
            this.decoders.set(rate, d);
        }
        return d || this.ctx;
    }

    decodeWith(ctx, data) {
        return new Promise((resolve, reject) => {
            const p = ctx.decodeAudioData(data, resolve, reject);
            if (p && typeof p.then === 'function') p.then(resolve, reject);
        });
    }

    decode(data) {
        const dec = this.decoderFor(this.mp3Rate(data));
        if (dec === this.ctx) return this.decodeWith(this.ctx, data);
        const copy = data.slice(0); // decodeAudioData detaches its input
        return this.decodeWith(dec, data).catch(() => this.decodeWith(this.ctx, copy));
    }

    keepRaw(url, data) {
        if (this.raw.has(url) || data.byteLength > RAW_CACHE_BYTES / 4) return;
        this.raw.set(url, data);
        this.rawBytes += data.byteLength;
        for (const [k, d] of this.raw) {
            if (this.rawBytes <= RAW_CACHE_BYTES) break;
            this.raw.delete(k);
            this.rawBytes -= d.byteLength;
        }
    }

    // Load every short sound's (compressed) file into memory in the background, so the first
    // time a sound plays it only needs a quick decode, not a download: otherwise early cues in
    // a level (groans, Ready-Set-Plant, the first pea) come in late.
    prefetch(urls) {
        const queue = urls.filter(u => !this.raw.has(u) && !this.cache.has(u) && !this.longClips.has(u));
        const next = () => {
            if (!queue.length || this.rawBytes >= RAW_CACHE_BYTES * 0.95) return;
            const url = queue.shift();
            if (this.raw.has(url) || this.cache.has(url) || this.loading.has(url)) { next(); return; }
            this.fetchBytes(url).then(d => { if (d && d.long) this.longClips.add(url); }, () => { })
                .then(() => setTimeout(next, 15));
        };
        next(); next();
    }

    fetchBytes(url) {
        const kept = this.raw.get(url);
        if (kept) {
            this.raw.delete(url); this.raw.set(url, kept); // most recently used last
            return Promise.resolve(kept);
        }
        return fetch(url).then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const len = Number(r.headers.get('content-length')) || 0;
            if (len > LONG_CLIP_BYTES) {
                try { if (r.body && r.body.cancel) r.body.cancel(); } catch (e) { }
                return { long: true };
            }
            return r.arrayBuffer().then(data => {
                if (data.byteLength > LONG_CLIP_BYTES) return { long: true };
                this.keepRaw(url, data);
                return data;
            });
        });
    }

    load(url) {
        const hit = this.cache.get(url);
        if (hit) { hit.used = ++this.clock; return Promise.resolve(hit.buffer); }
        let p = this.loading.get(url);
        if (p) return p;
        p = this.fetchBytes(url)
            .then(data => {
                if (data && data.long) {
                    this.longClips.add(url);
                    const err = new Error('long clip');
                    err.longClip = true;
                    throw err;
                }
                return this.decode(data.slice(0));
            })
            .then(buffer => {
                this.stats.decoded++;
                const bytes = buffer.length * buffer.numberOfChannels * 4;
                this.cache.set(url, { buffer, bytes, used: ++this.clock });
                this.bytes += bytes;
                this.evict();
                return buffer;
            })
            .finally(() => this.loading.delete(url));
        this.loading.set(url, p);
        return p;
    }

    cached(url) {
        const hit = this.cache.get(url);
        if (!hit) return null;
        hit.used = ++this.clock;
        return hit.buffer;
    }

    evict() {
        if (this.bytes <= SFX_CACHE_BYTES) return;
        const inUse = new Set();
        for (const v of this.voices) if (v.url) inUse.add(v.url);
        const entries = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
        for (const [url, entry] of entries) {
            if (this.bytes <= SFX_CACHE_BYTES * 0.8) break;
            if (inUse.has(url)) continue;
            this.cache.delete(url);
            this.bytes -= entry.bytes;
            this.stats.evicted++;
        }
    }

    play(engine, url, speed, volume) {
        this.engine = engine;
        if (this.voices.size >= MAX_SFX_VOICES) { this.stats.dropped++; return null; }
        if (this.ctx.state !== 'running') this.wake();
        this.stats.played++;
        const gain = this.ctx.createGain();
        gain.gain.value = clamp01(volume);
        gain.connect(this.master);
        const v = {
            kind: 'sfx', id: engine.nextId++, url, gain, speed: speed || 1, volume,
            buffer: null, src: null, startedAt: 0, offset: 0, paused: false, dead: false,
            loopEnd: null, restartBefore: null, fadeTimer: null,
            queuedAt: this.ctx.state === 'running' ? 0 : performance.now(), askedAt: performance.now(),
        };
        this.voices.add(v);
        engine.byId.set(v.id, v);
        const buffer = this.cached(url);
        if (buffer) {
            v.buffer = buffer;
            this.start(engine, v, 0);
        } else {
            this.load(url).then(b => {
                if (v.dead) return;
                v.buffer = b;
                if (performance.now() - v.askedAt > 150) this.stats.late++;
                this.applyLoop(v);
                if (!v.paused) this.start(engine, v, v.offset);
            }).catch((err) => {
                const wasDead = v.dead;
                const id = v.id, loopBefore = v.restartBefore;
                this.release(engine, v);
                if (wasDead || !err || !err.longClip) return;
                // Too long to keep decoded: hand the same id over to an <audio> element.
                const got = engine.elements.play(engine, url, v.speed, v.volume, id);
                if (got != null && loopBefore != null) {
                    const slot = engine.getSlot(id);
                    if (slot) engine.elements.setRestartBeforeEnd(slot, loopBefore * 1000);
                }
            });
        }
        return v.id;
    }

    start(engine, v, offset) {
        const dur = v.buffer.duration;
        if (!(dur > 0)) { this.release(engine, v); return; }
        const src = this.ctx.createBufferSource();
        src.buffer = v.buffer;
        src.playbackRate.value = v.speed;
        if (v.loopEnd !== null) { src.loop = true; src.loopStart = 0; src.loopEnd = v.loopEnd; }
        src.connect(v.gain);
        src.onended = () => { if (v.src === src) this.release(engine, v); };
        const at = Math.max(0, Math.min(offset, dur - 0.001));
        src.start(0, at);
        if (this.ctx.state === 'running') v.queuedAt = 0;
        else if (!v.queuedAt) v.queuedAt = performance.now();
        v.src = src;
        v.offset = at;
        v.startedAt = this.ctx.currentTime;
    }

    stopSource(v) {
        const src = v.src;
        v.src = null;
        if (!src) return;
        src.onended = null;
        try { src.stop(); } catch (e) { }
        try { src.disconnect(); } catch (e) { }
    }

    position(v) {
        if (!v.buffer) return v.offset;
        let pos = v.offset;
        if (v.src) pos += (this.ctx.currentTime - v.startedAt) * v.speed;
        if (v.loopEnd !== null && pos > v.loopEnd) pos = pos % v.loopEnd;
        return Math.min(pos, v.buffer.duration);
    }

    release(engine, v) {
        if (v.dead) return;
        v.dead = true;
        if (v.fadeTimer) { clearTimeout(v.fadeTimer); v.fadeTimer = null; }
        this.stopSource(v);
        try { v.gain.disconnect(); } catch (e) { }
        this.voices.delete(v);
        engine.byId.delete(v.id);
    }

    setVolume(v, volume) {
        v.volume = clamp01(volume);
        const g = v.gain.gain;
        g.cancelScheduledValues(this.ctx.currentTime);
        g.value = v.volume;
    }

    setPlaying(engine, v, playing) {
        if (playing) {
            if (!v.paused) return;
            v.paused = false;
            if (v.buffer) this.start(engine, v, v.offset);
        } else {
            if (v.paused) return;
            v.offset = this.position(v);
            v.paused = true;
            this.stopSource(v);
        }
    }

    seek(engine, v, seconds) {
        v.offset = Math.max(0, seconds);
        if (v.buffer && !v.paused) { this.stopSource(v); this.start(engine, v, v.offset); }
    }

    fadeOut(engine, v, durationMs) {
        if (v.fadeTimer) return;
        const g = v.gain.gain;
        const now = this.ctx.currentTime;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(0, now + Math.max(0.01, durationMs / 1000));
        v.fadeTimer = setTimeout(() => { v.fadeTimer = null; this.release(engine, v); }, durationMs);
    }

    applyLoop(v) {
        if (v.restartBefore === null || !v.buffer) return;
        const end = v.buffer.duration - v.restartBefore / v.speed;
        v.loopEnd = end > 0.01 ? end : v.buffer.duration;
        if (v.src) { v.src.loop = true; v.src.loopStart = 0; v.src.loopEnd = v.loopEnd; }
    }

    setRestartBeforeEnd(v, beforeMs) {
        v.restartBefore = beforeMs / 1000;
        this.applyLoop(v);
    }
}

// ---------------------------------------------------------------- public engine
export class AudioEngine {
    constructor(manifest, audioRoot) {
        this.audioRoot = audioRoot;
        this.manifest = manifest;
        this.nextId = 1;
        this.byId = new Map();
        this.sfx = null;
        this.elements = null;
    }

    async init() {
        try {
            if (window.AudioContext || window.webkitAudioContext) this.sfx = new SfxEngine();
        } catch (e) {
            console.warn('[audio] Web Audio unavailable, using <audio> elements:', e);
            this.sfx = null;
        }
        this.elements = new ElementPool(this.sfx ? MUSIC_POOL_SIZE : FALLBACK_POOL_SIZE,
            this.sfx ? { ctx: this.sfx.ctx, master: this.sfx.master } : null);
        this.elements.engine = this;
    }

    // For the ⚙ panel's Device box.
    status() {
        const sfx = this.sfx;
        const music = this.elements ? this.elements.pool : [];
        return {
            state: sfx ? sfx.ctx.state : 'no Web Audio',
            rate: sfx ? sfx.ctx.sampleRate : 0,
            musicVolumeWorks: music.length ? !!music[0].gain : false,
            musicPlaying: music.filter(s => s.playing && !s.blocked).length,
            musicBlocked: music.filter(s => s.blocked).length,
            cachedMB: sfx ? Math.round(sfx.bytes / 1048576) : 0,
            stats: sfx ? Object.assign({}, sfx.stats) : null,
        };
    }

    nameToPath(name) {
        return this.manifest[name] ?? null;
    }

    play(name, speed = 1, volume = DEFAULT_VOLUME) {
        const relPath = this.nameToPath(name);
        if (!relPath) {
            console.warn('[audio] unknown clip:', name);
            return null;
        }
        const src = new URL(relPath.split('/').map(encodeURIComponent).join('/'), this.audioRoot).href;
        if (this.sfx && !relPath.startsWith('Music/') && !this.sfx.longClips.has(src)) return this.sfx.play(this, src, speed, volume);
        return this.elements.play(this, src, speed, volume);
    }

    getSlot(id) {
        return this.byId.get(id) || null;
    }

    setVolume(id, volume) {
        const s = this.getSlot(id);
        if (!s) return;
        if (s.kind === 'sfx') this.sfx.setVolume(s, volume); else this.elements.setVolume(s, volume);
    }

    setPlaying(id, playing) {
        const s = this.getSlot(id);
        if (!s) return;
        if (s.kind === 'sfx') this.sfx.setPlaying(this, s, playing); else this.elements.setPlaying(s, playing);
    }

    seek(id, seconds) {
        const s = this.getSlot(id);
        if (!s) return;
        if (s.kind === 'sfx') this.sfx.seek(this, s, seconds); else this.elements.seek(s, seconds);
    }

    getPosition(id) {
        const s = this.getSlot(id);
        if (!s) return [0, null];
        if (s.kind === 'sfx') return [this.sfx.position(s), s.buffer ? s.buffer.duration : null];
        return this.elements.getPosition(s);
    }

    getDuration(id) {
        const s = this.getSlot(id);
        if (!s) return null;
        if (s.kind === 'sfx') return s.buffer ? s.buffer.duration : null;
        return this.elements.getDuration(s);
    }

    fadeOut(id, durationMs) {
        const s = this.getSlot(id);
        if (!s) return;
        if (s.kind === 'sfx') this.sfx.fadeOut(this, s, durationMs); else this.elements.fadeOut(this, s, durationMs);
    }

    setRestartBeforeEnd(id, beforeMs) {
        const s = this.getSlot(id);
        if (!s) return;
        if (s.kind === 'sfx') this.sfx.setRestartBeforeEnd(s, beforeMs); else this.elements.setRestartBeforeEnd(s, beforeMs);
    }

    destroy(id) {
        const s = this.getSlot(id);
        if (!s) return;
        if (s.kind === 'sfx') this.sfx.release(this, s); else this.elements.release(this, s);
    }

    cleanupFinished() {
        return this.elements ? this.elements.cleanupFinished(this) : 0;
    }

    listClips() {
        return Object.keys(this.manifest);
    }
}

export async function initializeGameAudio() {
    const audioRoot = new URL('audio/', document.baseURI);
    const response = await fetch(new URL('manifest.json', audioRoot));
    if (!response.ok) throw new Error(`Audio manifest HTTP ${response.status}`);
    const engine = new AudioEngine(await response.json(), audioRoot);
    await engine.init();
    window.audioEngine = engine;
    // Start preloading sounds once the game has finished its own start-up loading.
    if (engine.sfx) {
        const urls = Object.values(engine.manifest)
            .filter(p => p && !p.startsWith('Music/'))
            .map(p => new URL(p.split('/').map(encodeURIComponent).join('/'), audioRoot).href);
        const begin = () => engine.sfx.prefetch(urls);
        const wait = () => {
            const cc = window.cc;
            if (cc && cc.director && cc.director.getScene && cc.director.getScene()) setTimeout(begin, 4000);
            else setTimeout(wait, 1000);
        };
        setTimeout(wait, 3000);
    }
}
