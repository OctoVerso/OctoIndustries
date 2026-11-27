import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { isPublicPath } from './publication-policy.mjs';
import { createStaticServer } from './serve-static.mjs';
test('publication rejects secrets, backups, tests and server files while preserving game assets', () => {
  for (const path of ['supabase/.env.local', '.git/config', 'Octo-Industries/game/.env', 'Octo-Industries/game/private.key', 'Octo-Industries/game/crash.log', 'Octo-Industries/game/library.map', 'Octo-Industries/game/admin.js.backup.123', 'Octo-Industries/BehindTheScenes/admin/a.test.mjs', 'Octo-Industries/BehindTheScenes/scripts/create-admin-hash.mjs', 'Octo-Industries/../supabase/config.toml']) assert.equal(isPublicPath(path), false, path);
  for (const path of ['index.html', 'Octo-Industries/Game/game.json', 'Octo-Industries/Game/game.wasm', 'Octo-Industries/BehindTheScenes/admin/admin.js', '.nojekyll']) assert.equal(isPublicPath(path), true, path);
});
test('static preview denies repository secrets and supports project subpaths', async (t) => {
  const server = createStaticServer(process.cwd(), '/OctoIndustries'); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close()); const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ['/OctoIndustries/supabase/.env.local', '/OctoIndustries/.git/config', '/index.html', '/OctoIndustries/Octo-Industries/BehindTheScenes/admin/admin.js.backup.1795457583']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/OctoIndustries/Octo-Industries/BehindTheScenes/admin/')).status, 200);
});
