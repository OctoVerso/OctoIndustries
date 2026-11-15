/*!
 * PvZ2 Gardendless – Firebase cloud save sync
 * - Anonymous Auth (no login screen): one uid per browser/device.
 * - Firestore doc: users/{uid}/saves/main  { data, updatedAt, deviceId, saveVersion }
 * - Syncs on: start, `online`, tab visible, tab hidden (if dirty), and every 60 s while dirty.
 * - Conflict: newest updatedAt wins. The losing copy is stored as users/{uid}/saves/backup_{ts}
 *   whenever it holds changes not already in the winner (last 3 backups kept).
 * - Never blocks gameplay; all network work is async with timeouts.
 *
 * LOAD ORDER: <script type="module" src="sync/cloud-sync.js"> at the end of <body>,
 * after sync/firebase-config.js and save-store.js.
 */

const SDK_VERSION = '10.14.1'; // keep in sync with FIREBASE_SDK in sw.js
const SDK = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

const SYNC_INTERVAL_MS = 5 * 60_000; // plus on app hide/show and reconnect
// Downloaded community-level cache: re-downloadable, so kept local only (keeps uploads small).
const CLOUD_EXCLUDE = /^PvZ2_GitHubLevels/;
const MAX_UPLOAD_BYTES = 900 * 1024; // Firestore hard limit is 1 MiB per document
const KEEP_BACKUPS = 3;
const NET_TIMEOUT_MS = 15_000;

function setStatus(state, detail = '') {
  window.__pvzCloud = { state, detail, at: Date.now() };
  window.dispatchEvent(new CustomEvent('pvz:cloudstatus', { detail: { state, detail } }));
}

function withTimeout(promise, ms = NET_TIMEOUT_MS) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new Error('Network timeout')), ms); })
  ]).finally(() => clearTimeout(t));
}

function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

const config = window.PVZ_FIREBASE_CONFIG;
const configured = config && config.apiKey && !String(config.apiKey).startsWith('YOUR_');

if (!configured) {
  setStatus('disabled', 'Add sync/firebase-config.js');
  console.info('[PVZCloud] No Firebase config found – cloud sync disabled.');
} else {
  boot();
}

// Load the SDK; if offline and not yet cached, retry when the connection returns.
function boot() {
  setStatus('starting');
  start().catch((err) => {
    console.warn('[PVZCloud] Could not start:', err);
    setStatus(navigator.onLine ? 'error' : 'offline', navigator.onLine ? err.message : '');
    window.addEventListener('online', boot, { once: true });
  });
}

async function start() {
  const save = window.PVZSave;
  if (!save) throw new Error('save-store.js is not loaded');
  await save.ready;

  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore-lite.js`) // REST only: no background connection
  ]);
  const { initializeApp, getApps } = appMod;
  const { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInAnonymously, onAuthStateChanged } = authMod;
  const { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } = fsMod;

  const app = getApps().length ? getApps()[0] : initializeApp(config);
  // initializeAuth without a popup/redirect resolver: getAuth() would also load
  // apis.google.com/js/api.js, which school networks often block (and we never use popups).
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = getFirestore(app);

  // Wait for the persisted session (works offline).
  await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(); });
  });

  async function ensureUid() {
    if (auth.currentUser) return auth.currentUser.uid;
    if (!navigator.onLine) return null;
    const cred = await withTimeout(signInAnonymously(auth));
    return cred.user.uid;
  }

  let syncing = false;
  let firstSync = true;
  let offeredRemoteAt = 0;

  async function writeBackup(uid, copy, reason) {
    const id = `backup_${Date.now()}`;
    await withTimeout(setDoc(doc(db, 'users', uid, 'saves', id), {
      data: copy.data,
      updatedAt: copy.updatedAt || 0,
      deviceId: copy.deviceId || '',
      saveVersion: copy.saveVersion || 0,
      backedUpAt: Date.now(),
      reason
    }));
    return id;
  }

  async function pruneBackups(uid) {
    const snap = await withTimeout(getDocs(collection(db, 'users', uid, 'saves')));
    const backups = snap.docs
      .filter((d) => d.id.startsWith('backup_'))
      .sort((a, b) => Number(b.id.slice(7)) - Number(a.id.slice(7)));
    await Promise.all(backups.slice(KEEP_BACKUPS).map((d) => deleteDoc(d.ref)));
  }

  function cloudPart(data) {
    const out = {};
    Object.keys(data).sort().forEach((k) => { if (!CLOUD_EXCLUDE.test(k)) out[k] = data[k]; });
    return out;
  }

  async function applyRemote(remote) {
    const merged = JSON.parse(remote.data);
    const local = save.getSnapshot().data;
    Object.keys(local).forEach((k) => { if (CLOUD_EXCLUDE.test(k)) merged[k] = local[k]; });
    await save.applySnapshot(merged, remote.updatedAt);
    location.reload();
  }

  async function syncNow(reason = 'manual') {
    if (syncing) return;
    if (!navigator.onLine) { setStatus('offline'); return; }
    syncing = true;
    setStatus('syncing', reason);
    let madeBackup = false;
    try {
      const uid = await ensureUid();
      if (!uid) { setStatus('offline'); return; }

      const mainRef = doc(db, 'users', uid, 'saves', 'main');
      const snapAll = save.getSnapshot();
      const cloudData = cloudPart(snapAll.data);
      const cloudJson = JSON.stringify(cloudData);
      const local = { ...snapAll, data: cloudData, json: cloudJson, hasData: cloudJson !== '{}' };
      const meta = save.getMeta();
      const snap = await withTimeout(getDoc(mainRef));
      const remote = snap.exists() ? snap.data() : null;
      const isFirstSync = firstSync;
      firstSync = false; // first sync that actually reached the server

      if (remote && remote.updatedAt > local.updatedAt) {
        // ----- Remote is newer -----
        if (local.dirty && local.hasData && local.json !== remote.data) {
          await writeBackup(uid, { data: local.json, updatedAt: local.updatedAt,
            deviceId: local.deviceId, saveVersion: local.saveVersion }, 'local-overwritten-by-cloud');
          madeBackup = true;
        }
        const nothingPlayedYet = save.writesSinceBoot() === 0;
        if (isFirstSync && nothingPlayedYet) {
          await applyRemote(remote); // reloads the page
          return;
        }
        // Mid-session: never swap the save under a running game. Ask instead.
        if (offeredRemoteAt !== remote.updatedAt) {
          offeredRemoteAt = remote.updatedAt;
          window.PVZUI?.toast('A newer cloud save was found.', 'Load it', () => {
            applyRemote(remote).catch((e) => console.warn('[PVZCloud] apply failed', e));
          }, { sticky: true });
        }
        setStatus('pending', 'Newer cloud save available');
      } else if (!remote || local.updatedAt > remote.updatedAt) {
        // ----- Local is newer (or cloud empty) -----
        if (!local.hasData) { setStatus('synced'); return; }
        if (remote && remote.data === local.json) { // only local-only keys changed
          save.markSynced(local.updatedAt);
          setStatus('synced');
          return;
        }
        const size = byteLength(local.json);
        if (size > MAX_UPLOAD_BYTES) {
          console.warn(`[PVZCloud] Save is ${(size / 1024).toFixed(0)} KB, over the ` +
            `${MAX_UPLOAD_BYTES / 1024} KB limit. Upload skipped. Narrow SAVE_KEYS in save-store.js.`);
          setStatus('error', `Save too large (${(size / 1024).toFixed(0)} KB)`);
          return;
        }
        // Back up the cloud copy only if it contains changes we never synced
        // (i.e. it is not the version this device last synced with).
        if (remote && remote.updatedAt !== meta.lastSyncedAt && remote.data !== local.json) {
          await writeBackup(uid, remote, 'cloud-overwritten-by-local');
          madeBackup = true;
        }
        await withTimeout(setDoc(mainRef, {
          data: local.json,
          updatedAt: local.updatedAt,
          deviceId: local.deviceId,
          saveVersion: local.saveVersion
        }));
        save.markSynced(local.updatedAt);
        if (offeredRemoteAt) { offeredRemoteAt = 0; window.PVZUI?.hideToast(); } // offer is stale now
        setStatus('synced');
      } else {
        // ----- Same timestamp: already in sync -----
        save.markSynced(local.updatedAt);
        setStatus('synced');
      }

      if (madeBackup) await pruneBackups(uid).catch((e) => console.warn('[PVZCloud] prune failed', e));
    } catch (err) {
      console.warn('[PVZCloud] Sync failed:', err);
      setStatus(navigator.onLine ? 'error' : 'offline', err.message || String(err));
    } finally {
      syncing = false;
    }
  }

  window.PVZCloud = { syncNow };

  // ---------- triggers ----------
  window.addEventListener('online', () => syncNow('online'));
  window.addEventListener('offline', () => setStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow('visible');
    else if (save.getMeta().dirty) syncNow('hidden');
  });
  window.addEventListener('pvz:localsave', () => {
    if (window.__pvzCloud?.state === 'synced') setStatus('pending');
  });
  setInterval(() => {
    if (navigator.onLine && save.getMeta().dirty) syncNow('interval');
  }, SYNC_INTERVAL_MS);

  syncNow('start');
}
