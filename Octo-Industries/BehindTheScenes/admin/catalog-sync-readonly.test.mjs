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

test('admin shell provides theme and search interactions without planned navigation', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /id="global-admin-search"/);
  assert.doesNotMatch(html, /is-planned|Reviews, requests &amp; voting|Game DNA|Release Snapshots/);
});
