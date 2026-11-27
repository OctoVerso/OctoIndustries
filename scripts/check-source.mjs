import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const roots = ['scripts', 'supabase/functions/_shared', 'Octo-Industries/BehindTheScenes/admin', 'Octo-Industries/BehindTheScenes/hub'];
let checked = 0;
for (const root of roots) for (const entry of await readdir(root)) {
  if (!/\.[cm]?js$/.test(entry) || entry.includes('.backup')) continue;
  const path = join(root, entry); const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exitCode = 1; }
  checked++;
}
const html = await readFile('Octo-Industries/BehindTheScenes/admin/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
if (new Set(ids).size !== ids.length) { console.error('Duplicate admin element IDs'); process.exitCode = 1; }
console.log(`Checked syntax in ${checked} source files and unique admin IDs.`);
