import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard initialization syncs catalog games missing from the database', async () => {
  const source = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
  assert.equal((source.match(/api\(['"]\/api\/admin\/catalog\/sync['"]/g) || []).length, 1);
  assert.match(source, /async function syncCatalogGames\(games\)/);
  assert.match(source, /const synced = await syncCatalogGames\(missingGames\)/);
  assert.match(source, /payload = validateDashboardPayload\(await api\(['"]\/api\/admin\/dashboard['"]\)\)/);
  assert.match(source, /Automatic catalog sync failed/);
  assert.match(source, /const missingGames = window\.OCTO_GAMES\.filter\(\(game\) => !knownIds\.has\(game\.id\)\)/);
  assert.match(source, /games\.slice\(index,\s*index\s*\+\s*25\)/);
  assert.match(source, /#catalog-sync-button/);
});
