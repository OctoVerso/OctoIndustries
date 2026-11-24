const PERSISTENCE_VERSION = 1;
const DATABASE_NAME = 'octo-industries-persistence';
const DATABASE_VERSION = 1;
const DATABASE_STORE = 'state';
const STATE_RECORD_KEY = 'hub';
const STATE_STORAGE_KEY = 'octo-industries.persistence';
const LEGACY_KEYS = Object.freeze({
  recent: 'octo-industries.recent',
  playCounts: 'octo-industries.play-counts',
  tickets: 'octo-industries.tickets',
});

export const SAVE_LEVELS = Object.freeze({
  none: 0,
  settings: 1,
  checkpoint: 2,
  progression: 3,
});

export const DEFAULT_SAVE_SLOT = 'default';
export const SAVE_FORMAT = 'octo-industries-save';

function copy(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through to JSON */ }
  }
  return JSON.parse(JSON.stringify(value));
}

function parseJson(value, fallback) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function readStorage(storage, key, fallback) {
  try { return parseJson(storage?.getItem(key), fallback); } catch { return fallback; }
}

function writeStorage(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeRecent(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanId).filter(Boolean))].slice(0, 50);
}

function normalizePlayCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [gameId, raw] of Object.entries(value)) {
    const id = cleanId(gameId);
    if (!id) continue;
    const count = typeof raw === 'number' ? raw : raw && typeof raw === 'object' ? raw.count : 0;
    const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
    if (!normalizedCount) continue;
    const lastPlayedAt = raw && typeof raw === 'object' && typeof raw.lastPlayedAt === 'string'
      ? raw.lastPlayedAt
      : '';
    result[id] = { count: normalizedCount, lastPlayedAt };
  }
  return result;
}

function normalizeStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [gameId, raw] of Object.entries(value)) {
    const id = cleanId(gameId);
    if (!id || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    result[id] = {
      playCount: Number.isFinite(Number(raw.playCount)) ? Math.max(0, Math.floor(Number(raw.playCount))) : 0,
      totalTimeMs: Number.isFinite(Number(raw.totalTimeMs)) ? Math.max(0, Math.floor(Number(raw.totalTimeMs))) : 0,
      lastPlayedAt: typeof raw.lastPlayedAt === 'string' ? raw.lastPlayedAt : '',
      completed: raw.completed === true,
      progress: raw.progress && typeof raw.progress === 'object' && !Array.isArray(raw.progress) ? copy(raw.progress) : null,
      updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    };
  }
  return result;
}

function normalizeTickets(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((ticket) => ticket && typeof ticket === 'object' && !Array.isArray(ticket))
    .slice(0, 50)
    .map((ticket) => copy(ticket));
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const gameId = cleanId(record.gameId);
  const slotId = cleanId(record.slotId) || DEFAULT_SAVE_SLOT;
  if (!gameId) return null;
  return {
    gameId,
    slotId,
    version: Number.isFinite(Number(record.version)) ? Number(record.version) : 1,
    savedAt: typeof record.savedAt === 'string' ? record.savedAt : new Date(0).toISOString(),
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0,
    checksum: typeof record.checksum === 'string' ? record.checksum : '',
    metadata: record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? copy(record.metadata) : {},
    payload: copy(record.payload),
  };
}

function normalizeRecordMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const raw of Object.values(value)) {
    const record = normalizeRecord(raw);
    if (record) result[`${record.gameId}:${record.slotId}`] = record;
  }
  return result;
}

function normalizeBackupMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};
  for (const [key, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    result[key] = entries.map(normalizeRecord).filter(Boolean).slice(0, 10);
  }
  return result;
}

function normalizeState(value = {}) {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    schemaVersion: PERSISTENCE_VERSION,
    updatedAt: Number.isFinite(Number(state.updatedAt)) ? Number(state.updatedAt) : 0,
    recent: normalizeRecent(state.recent),
    playCounts: normalizePlayCounts(state.playCounts),
    favorites: normalizeRecent(state.favorites),
    stats: normalizeStats(state.stats),
    tickets: normalizeTickets(state.tickets),
    saves: normalizeRecordMap(state.saves),
    backups: normalizeBackupMap(state.backups),
  };
}

function mergeStates(primary, legacy) {
  const normalizedPrimary = normalizeState(primary);
  const normalizedLegacy = normalizeState(legacy);
  const playCounts = { ...normalizedPrimary.playCounts };
  for (const [gameId, legacyEntry] of Object.entries(normalizedLegacy.playCounts)) {
    const current = playCounts[gameId];
    if (!current
      || legacyEntry.count > current.count
      || (legacyEntry.count === current.count && Date.parse(legacyEntry.lastPlayedAt || '') > Date.parse(current.lastPlayedAt || ''))) {
      playCounts[gameId] = legacyEntry;
    }
  }
  const tickets = [...normalizedPrimary.tickets];
  for (const ticket of normalizedLegacy.tickets) {
    if (!tickets.some((entry) => entry.ticketId && entry.ticketId === ticket.ticketId)) tickets.push(ticket);
  }
  return {
    ...normalizedPrimary,
    recent: normalizeRecent([...normalizedPrimary.recent, ...normalizedLegacy.recent]),
    playCounts,
    tickets: normalizeTickets(tickets),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fallbackDigest(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function digest(value, cryptoObject) {
  const serialized = stableValue(value);
  if (cryptoObject?.subtle?.digest && typeof TextEncoder === 'function') {
    const bytes = await cryptoObject.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    return `sha256-${[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return fallbackDigest(serialized);
}

function validateGameId(value) {
  const id = cleanId(value);
  if (!id || !/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new Error(`Invalid game ID: ${value}`);
  return id;
}

function validateSlotId(value) {
  const id = cleanId(value) || DEFAULT_SAVE_SLOT;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`Invalid save slot: ${value}`);
  return id;
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function openDatabase(indexedDB) {
  if (!indexedDB?.open) return Promise.reject(new Error('IndexedDB unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DATABASE_STORE)) request.result.createObjectStore(DATABASE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open persistence database.'));
  });
}

function readDatabaseState(database) {
  return idbRequest(database.transaction(DATABASE_STORE, 'readonly').objectStore(DATABASE_STORE).get(STATE_RECORD_KEY));
}

function writeDatabaseState(database, state) {
  const transaction = database.transaction(DATABASE_STORE, 'readwrite');
  transaction.objectStore(DATABASE_STORE).put(copy(state), STATE_RECORD_KEY);
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not write persistence database.'));
    transaction.onabort = () => reject(transaction.error || new Error('Persistence database write aborted.'));
  });
}

/**
 * Define the adapter contract used by games that opt into hub-managed saves.
 *
 * An adapter may implement:
 * - capture(): Promise<JSON value> | JSON value
 * - restore(payload): Promise<void> | void
 * - reset(): Promise<void> | void
 * - migrate(payload, fromVersion): Promise<JSON value> | JSON value
 * - progress(payload): JSON summary for cards/detail pages
 */
export function createGameAdapter({
  version = 1,
  saveLevel = SAVE_LEVELS.none,
  capture,
  restore,
  reset,
  migrate,
  progress,
} = {}) {
  if (!Number.isInteger(version) || version < 1) throw new Error('Game adapter version must be a positive integer.');
  if (!Number.isInteger(saveLevel) || saveLevel < 0 || saveLevel > SAVE_LEVELS.progression) {
    throw new Error('Game adapter saveLevel must be between 0 and 3.');
  }
  for (const [name, callback] of Object.entries({ capture, restore, reset, migrate, progress })) {
    if (callback !== undefined && typeof callback !== 'function') throw new Error(`Game adapter ${name} must be a function.`);
  }
  return Object.freeze({ version, saveLevel, capture, restore, reset, migrate, progress });
}

export function createPersistence(options = {}) {
  const runtime = options.windowRef || (typeof window !== 'undefined' ? window : globalThis);
  let storage = options.storage;
  if (storage === undefined) {
    try { storage = runtime?.localStorage; } catch { storage = null; }
  }
  const indexedDB = options.indexedDB === undefined ? runtime?.indexedDB : options.indexedDB;
  const cryptoObject = options.cryptoObject === undefined ? runtime?.crypto : options.cryptoObject;
  const now = options.now || (() => Date.now());
  const adapters = new Map();
  const legacyState = {
    recent: readStorage(storage, LEGACY_KEYS.recent, []),
    playCounts: readStorage(storage, LEGACY_KEYS.playCounts, {}),
    tickets: readStorage(storage, LEGACY_KEYS.tickets, []),
  };
  let state = mergeStates(readStorage(storage, STATE_STORAGE_KEY, {}), legacyState);
  let database = null;
  let writeQueue = Promise.resolve();

  function emitChange(reason) {
    try {
      runtime?.dispatchEvent?.(new runtime.CustomEvent('octo:persistence-change', { detail: { reason } }));
    } catch { /* CustomEvent is unavailable in some test runtimes. */ }
  }

  function persist(reason = 'state') {
    state.updatedAt = Math.max(Number(now()) || 0, state.updatedAt + 1);
    writeStorage(storage, STATE_STORAGE_KEY, state);
    // Keep the old keys live so older hub builds and existing user data continue to work.
    writeStorage(storage, LEGACY_KEYS.recent, state.recent);
    writeStorage(storage, LEGACY_KEYS.playCounts, state.playCounts);
    writeStorage(storage, LEGACY_KEYS.tickets, state.tickets);
    if (database) {
      writeQueue = writeQueue.then(() => writeDatabaseState(database, state)).catch(() => undefined);
    }
    emitChange(reason);
  }

  async function hydrate() {
    try {
      database = await openDatabase(indexedDB);
      const stored = await readDatabaseState(database);
      if (stored && Number(stored.updatedAt) > state.updatedAt) {
        state = mergeStates(stored, state);
        writeStorage(storage, STATE_STORAGE_KEY, state);
        writeStorage(storage, LEGACY_KEYS.recent, state.recent);
        writeStorage(storage, LEGACY_KEYS.playCounts, state.playCounts);
        writeStorage(storage, LEGACY_KEYS.tickets, state.tickets);
        emitChange('hydrate');
      } else {
        await writeDatabaseState(database, state);
      }
    } catch {
      database = null;
      // The localStorage mirror is the durable fallback when IndexedDB is
      // blocked (private browsing, embedded frames, or older Safari modes).
      writeStorage(storage, STATE_STORAGE_KEY, state);
      writeStorage(storage, LEGACY_KEYS.recent, state.recent);
      writeStorage(storage, LEGACY_KEYS.playCounts, state.playCounts);
      writeStorage(storage, LEGACY_KEYS.tickets, state.tickets);
    }
    return api;
  }

  function getSaveKey(gameId, slotId = DEFAULT_SAVE_SLOT) {
    return `${validateGameId(gameId)}:${validateSlotId(slotId)}`;
  }

  function getStats(gameId) {
    const id = validateGameId(gameId);
    return copy(state.stats[id] || {
      playCount: 0,
      totalTimeMs: 0,
      lastPlayedAt: '',
      completed: false,
      progress: null,
      updatedAt: 0,
    });
  }

  async function saveGame(gameId, slotId, payload, { version = 1, metadata = {} } = {}) {
    const id = validateGameId(gameId);
    const slot = validateSlotId(slotId);
    if (!Number.isInteger(version) || version < 1) throw new Error('Save version must be a positive integer.');
    const key = `${id}:${slot}`;
    const previous = state.saves[key];
    if (previous) state.backups[key] = [previous, ...(state.backups[key] || [])].slice(0, 10);
    const timestamp = new Date(now()).toISOString();
    const record = {
      gameId: id,
      slotId: slot,
      version,
      savedAt: timestamp,
      updatedAt: Number(now()) || Date.now(),
      checksum: await digest(payload, cryptoObject),
      metadata: copy(metadata) || {},
      payload: copy(payload),
    };
    state.saves[key] = record;
    persist('save');
    return copy(record);
  }

  async function verifyRecord(record) {
    if (!record) return null;
    const normalized = normalizeRecord(record);
    if (!normalized) return null;
    const checksum = await digest(normalized.payload, cryptoObject);
    return { ...copy(normalized), integrity: checksum === normalized.checksum ? 'valid' : 'invalid' };
  }

  const api = {
    ready: null,
    getState: () => copy(state),
    getRecent: (limit = Infinity) => state.recent.slice(0, Number.isFinite(limit) ? Math.max(0, limit) : undefined),
    getPlayCounts: () => copy(state.playCounts),
    getFavorites: () => [...state.favorites],
    isFavorite: (gameId) => state.favorites.includes(validateGameId(gameId)),
    setFavorite: (gameId, favorite = true) => {
      const id = validateGameId(gameId);
      state.favorites = favorite
        ? [...new Set([id, ...state.favorites])]
        : state.favorites.filter((entry) => entry !== id);
      persist('favorite');
      return state.favorites.includes(id);
    },
    toggleFavorite: (gameId) => {
      const id = validateGameId(gameId);
      return api.setFavorite(id, !state.favorites.includes(id));
    },
    markPlayed: (gameId) => {
      const id = validateGameId(gameId);
      const timestamp = new Date(now()).toISOString();
      const previous = state.playCounts[id] || { count: 0, lastPlayedAt: '' };
      const count = Number(previous.count) || 0;
      state.recent = [id, ...state.recent.filter((entry) => entry !== id)].slice(0, 50);
      state.playCounts[id] = { count: count + 1, lastPlayedAt: timestamp };
      const stats = getStats(id);
      state.stats[id] = { ...stats, playCount: stats.playCount + 1, lastPlayedAt: timestamp, updatedAt: Number(now()) || 0 };
      persist('play');
      return copy(state.playCounts[id]);
    },
    recordTime: (gameId, durationMs) => {
      const id = validateGameId(gameId);
      const duration = Number.isFinite(Number(durationMs)) ? Math.max(0, Math.floor(Number(durationMs))) : 0;
      const stats = getStats(id);
      state.stats[id] = { ...stats, totalTimeMs: stats.totalTimeMs + duration, updatedAt: Number(now()) || 0 };
      persist('time');
      return getStats(id);
    },
    recordProgress: (gameId, progress) => {
      const id = validateGameId(gameId);
      const stats = getStats(id);
      state.stats[id] = { ...stats, progress: copy(progress), updatedAt: Number(now()) || 0 };
      persist('progress');
      return getStats(id);
    },
    markCompleted: (gameId, completed = true) => {
      const id = validateGameId(gameId);
      const stats = getStats(id);
      state.stats[id] = { ...stats, completed: completed === true, updatedAt: Number(now()) || 0 };
      persist('completion');
      return getStats(id);
    },
    getStats,
    getTickets: () => copy(state.tickets),
    setTickets: (tickets) => {
      state.tickets = normalizeTickets(tickets);
      persist('tickets');
      return copy(state.tickets);
    },
    saveTicket: (ticket) => {
      state.tickets = normalizeTickets([ticket, ...state.tickets.filter((entry) => entry.ticketId !== ticket?.ticketId)]).slice(0, 50);
      persist('tickets');
      return copy(ticket);
    },
    registerAdapter: (gameId, adapter) => {
      const id = validateGameId(gameId);
      if (!adapter || typeof adapter !== 'object') throw new Error('A game adapter is required.');
      const normalized = createGameAdapter(adapter);
      adapters.set(id, normalized);
      return normalized;
    },
    getAdapter: (gameId) => adapters.get(validateGameId(gameId)) || null,
    saveGame,
    getSave: async (gameId, slotId = DEFAULT_SAVE_SLOT) => verifyRecord(state.saves[getSaveKey(gameId, slotId)]),
    listSaves: async (gameId) => {
      const id = validateGameId(gameId);
      return Promise.all(Object.values(state.saves).filter((record) => record.gameId === id).map(verifyRecord));
    },
    listBackups: (gameId, slotId = DEFAULT_SAVE_SLOT) => {
      const key = getSaveKey(gameId, slotId);
      return copy(state.backups[key] || []);
    },
    deleteSave: (gameId, slotId = DEFAULT_SAVE_SLOT) => {
      const key = getSaveKey(gameId, slotId);
      if (!state.saves[key]) return false;
      state.backups[key] = [state.saves[key], ...(state.backups[key] || [])].slice(0, 10);
      delete state.saves[key];
      persist('delete-save');
      return true;
    },
    resetGame: async (gameId) => {
      const id = validateGameId(gameId);
      for (const key of Object.keys(state.saves)) {
        if (state.saves[key].gameId === id) {
          state.backups[key] = [state.saves[key], ...(state.backups[key] || [])].slice(0, 10);
          delete state.saves[key];
        }
      }
      const adapter = adapters.get(id);
      if (adapter?.reset) await adapter.reset();
      persist('reset-save');
    },
    restoreBackup: async (gameId, slotId = DEFAULT_SAVE_SLOT, index = 0) => {
      const key = getSaveKey(gameId, slotId);
      const backup = state.backups[key]?.[Number(index) || 0];
      if (!backup) return null;
      return saveGame(gameId, slotId, backup.payload, { version: backup.version, metadata: backup.metadata });
    },
    exportGame: async (gameId) => {
      const id = validateGameId(gameId);
      const saves = await api.listSaves(id);
      return {
        format: SAVE_FORMAT,
        schemaVersion: PERSISTENCE_VERSION,
        gameId: id,
        exportedAt: new Date(now()).toISOString(),
        saves: saves.map(({ integrity, ...record }) => ({ ...record, integrity })),
      };
    },
    importGame: async (payload, { replace = false } = {}) => {
      if (!payload || payload.format !== SAVE_FORMAT || !Array.isArray(payload.saves)) throw new Error('Invalid Octo Industries save file.');
      const id = validateGameId(payload.gameId);
      if (replace) {
        for (const key of Object.keys(state.saves)) if (state.saves[key].gameId === id) delete state.saves[key];
      }
      const imported = [];
      for (const raw of payload.saves) {
        if (raw?.gameId !== id) throw new Error('Save file contains a different game.');
        const expected = await digest(raw.payload, cryptoObject);
        if (expected !== raw.checksum) throw new Error(`Save integrity check failed for ${id}.`);
        imported.push(await saveGame(id, raw.slotId, raw.payload, { version: raw.version, metadata: raw.metadata }));
      }
      return imported;
    },
    capture: async (gameId, slotId = DEFAULT_SAVE_SLOT, metadata = {}) => {
      const id = validateGameId(gameId);
      const adapter = adapters.get(id);
      if (!adapter?.capture) throw new Error(`Game ${id} has no capture adapter.`);
      const payload = await adapter.capture();
      return saveGame(id, slotId, payload, { version: adapter.version, metadata });
    },
    continue: async (gameId, slotId = DEFAULT_SAVE_SLOT) => {
      const id = validateGameId(gameId);
      const adapter = adapters.get(id);
      const record = await api.getSave(id, slotId);
      if (!record) return { status: 'missing', record: null };
      if (record.integrity !== 'valid') return { status: 'invalid', record };
      if (!adapter?.restore) return { status: 'available', record };
      let payload = record.payload;
      if (record.version !== adapter.version) {
        if (!adapter.migrate) return { status: 'version-mismatch', record };
        payload = await adapter.migrate(payload, record.version);
      }
      await adapter.restore(payload);
      return { status: 'restored', record };
    },
  };

  api.ready = hydrate();
  return api;
}

