import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './admin-core.js';

test('catalog synchronization is available only through the explicit action', async () => {
  const source = await readFile(new URL('./admin.js', import.meta.url), 'utf8');
  const refresh = source.slice(source.indexOf('async function refreshDashboardData'), source.indexOf("dashboardRetryButton.addEventListener"));
  assert.doesNotMatch(refresh, /syncCatalogGames/);
  assert.match(source, /await syncCatalogGames\(missingGames\)/);
});
test('partial bulk confirmations preserve unconfirmed selections', () => {
  assert.deepEqual(OctoAdminCore.summarizeBulk({ updated: 1, updatedIds: ['a'] }, ['a', 'b']), { updated: 1, failed: 1, remaining: ['b'] });
  assert.deepEqual(OctoAdminCore.summarizeBulk({ updated: 1 }, ['a', 'b']).remaining, ['a', 'b']);
  for (const result of [{}, { updated: -1 }, { updated: 3 }, { updated: '2' }]) assert.throws(() => OctoAdminCore.summarizeBulk(result, ['a', 'b']));
});
test('trend includes empty days and UTC boundaries without substituting sample values', () => {
  const result = OctoAdminCore.trend([{ createdAt: '2026-11-26T23:59:00Z' }, { createdAt: '2026-11-27T00:01:00Z' }, { createdAt: 'invalid' }], 3, Date.parse('2026-11-27T14:00:00Z'));
  assert.deepEqual(result, [{ date: '2026-11-25', count: 0 }, { date: '2026-11-26', count: 1 }, { date: '2026-11-27', count: 1 }]);
});
