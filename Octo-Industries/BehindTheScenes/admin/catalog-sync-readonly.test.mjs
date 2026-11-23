import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dashboard initialization contains no automatic catalog sync POST', async () => {
  const source = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
  const init = source.slice(source.indexOf('async function refreshDashboardData()'), source.indexOf('dashboard = payload'));
  assert.doesNotMatch(init, /\/api\/admin\/catalog\/sync[\s\S]*method:\s*['"]POST['"]/i);
  assert.equal((source.match(/api\(['"]\/api\/admin\/catalog\/sync['"]/g) || []).length, 1);
  assert.match(source, /body:\s*JSON\.stringify\(\{\s*games:\s*missingGames\.slice\(index,\s*index\s*\+\s*25\)\s*\}\)/);
  assert.match(source, /#catalog-sync-button/);
  assert.match(source, /window\.confirm/);
});
