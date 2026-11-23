import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard initialization automatically syncs missing generated catalog games', async () => {
  const source = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
  assert.equal((source.match(/api\(['"]\/api\/admin\/catalog\/sync['"]/g) || []).length, 1);
  assert.match(source, /async function syncCatalogGames\(games\)/);
  assert.match(source, /const missingGames = window\.OCTO_GAMES\.filter\(\(game\) => !knownIds\.has\(game\.id\)\)/);
  assert.match(source, /const synced = await syncCatalogGames\(missingGames\)/);
  assert.match(source, /games\.slice\(index,\s*index\s*\+\s*25\)/);
  assert.match(source, /#catalog-sync-button/);
  assert.match(source, /window\.confirm/);
});
