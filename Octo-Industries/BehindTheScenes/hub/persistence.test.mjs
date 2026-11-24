import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAdapter, createPersistence, SAVE_FORMAT, SAVE_LEVELS } from './persistence.mjs';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('persistence migrates legacy recent, play-count, and ticket keys', async () => {
  const storage = memoryStorage({
    'octo-industries.recent': JSON.stringify(['alpha', 'alpha', 'beta']),
    'octo-industries.play-counts': JSON.stringify({ alpha: 2 }),
    'octo-industries.tickets': JSON.stringify([{ ticketId: 'ticket' }]),
  });
  const persistence = createPersistence({ storage, indexedDB: null, now: () => 1000 });
  await persistence.ready;

  assert.deepEqual(persistence.getRecent(), ['alpha', 'beta']);
  assert.deepEqual(persistence.getPlayCounts(), { alpha: { count: 2, lastPlayedAt: '' } });
  assert.deepEqual(persistence.getTickets(), [{ ticketId: 'ticket' }]);
  assert.deepEqual(JSON.parse(storage.getItem('octo-industries.persistence')).recent, ['alpha', 'beta']);
});

test('favorites and play statistics persist through the compatibility storage', async () => {
  const storage = memoryStorage();
  const persistence = createPersistence({ storage, indexedDB: null, now: () => 2000 });
  await persistence.ready;

  assert.equal(persistence.toggleFavorite('alpha'), true);
  assert.equal(persistence.isFavorite('alpha'), true);
  persistence.markPlayed('alpha');
  persistence.recordTime('alpha', 1234);
  persistence.recordProgress('alpha', { level: 4 });
  persistence.markCompleted('alpha');

  assert.deepEqual(persistence.getStats('alpha'), {
    playCount: 1,
    totalTimeMs: 1234,
    lastPlayedAt: '1970-01-01T00:00:02.000Z',
    completed: true,
    progress: { level: 4 },
    updatedAt: 2000,
  });
  assert.deepEqual(persistence.getFavorites(), ['alpha']);
});

test('save records are checksummed, backed up, and isolated by game and slot', async () => {
  const persistence = createPersistence({ storage: memoryStorage(), indexedDB: null, now: () => 3000 });
  await persistence.ready;
  await persistence.saveGame('alpha', 'main', { level: 1 }, { version: 1 });
  await persistence.saveGame('alpha', 'main', { level: 2 }, { version: 1 });
  await persistence.saveGame('beta', 'main', { level: 9 }, { version: 1 });

  assert.equal((await persistence.getSave('alpha', 'main')).integrity, 'valid');
  assert.deepEqual((await persistence.getSave('alpha', 'main')).payload, { level: 2 });
  assert.deepEqual((await persistence.getSave('beta', 'main')).payload, { level: 9 });
  assert.deepEqual(persistence.listBackups('alpha', 'main').map((entry) => entry.payload), [{ level: 1 }]);
});

test('game adapter contract supports capture, migration, restore, reset, and export/import', async () => {
  const restored = [];
  let resetCount = 0;
  const persistence = createPersistence({ storage: memoryStorage(), indexedDB: null, now: () => 4000 });
  await persistence.ready;
  const adapter = createGameAdapter({
    version: 2,
    saveLevel: SAVE_LEVELS.progression,
    capture: () => ({ level: 3 }),
    migrate: (payload) => ({ ...payload, migrated: true }),
    restore: (payload) => restored.push(payload),
    reset: () => { resetCount += 1; },
  });
  assert.equal(adapter.saveLevel, 3);
  persistence.registerAdapter('alpha', adapter);
  await persistence.capture('alpha');
  assert.equal((await persistence.continue('alpha')).status, 'restored');
  assert.deepEqual(restored, [{ level: 3 }]);
  const exported = await persistence.exportGame('alpha');
  assert.equal(exported.format, SAVE_FORMAT);
  await persistence.resetGame('alpha');
  assert.equal(resetCount, 1);
  await persistence.importGame(exported);
  assert.equal((await persistence.getSave('alpha')).integrity, 'valid');
});

test('save imports reject tampered payloads', async () => {
  const persistence = createPersistence({ storage: memoryStorage(), indexedDB: null });
  await persistence.ready;
  await assert.rejects(
    persistence.importGame({
      format: SAVE_FORMAT,
      gameId: 'alpha',
      saves: [{ gameId: 'alpha', slotId: 'default', version: 1, payload: { level: 99 }, checksum: 'bad' }],
    }),
    /integrity check failed/,
  );
});
