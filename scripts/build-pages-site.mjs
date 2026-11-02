import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Builds the static GitHub Pages site into ./dist. All dynamic behaviour lives in Supabase Edge Functions.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'dist');
const maximumFileBytes = 100 * 1024 * 1024;
const excludedNames = new Set(['node_modules', '.git', '.vscode', '.DS_Store']);

const sync = spawnSync('npm', ['--prefix', 'Octo-Industries/BehindTheScenes', 'run', 'sync'], { cwd: root, stdio: 'inherit' });
if (sync.status !== 0) throw new Error('Game catalog sync failed.');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'index.html'), join(output, 'index.html'));
await cp(join(root, 'Octo-Industries'), join(output, 'Octo-Industries'), {
  recursive: true,
  filter: (source) => {
    const path = relative(root, source).split('\\').join('/');
    const name = path.split('/').pop();
    return !excludedNames.has(name)
      && !path.startsWith('Octo-Industries/BehindTheScenes/scripts')
      && path !== 'Octo-Industries/BehindTheScenes/package.json'
      && !/\.zip$/i.test(name);
  },
});

const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL || (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1` : '');
if (functionsUrl) {
  if (!/^https:\/\/[a-z0-9.-]+\/functions\/v1$/.test(functionsUrl)) throw new Error('SUPABASE_FUNCTIONS_URL must look like https://<ref>.supabase.co/functions/v1');
  const configPath = join(output, 'Octo-Industries/BehindTheScenes/hub/config.js');
  const config = await readFile(configPath, 'utf8');
  const updated = config.replace(/functionsUrl: '[^']*'/, `functionsUrl: '${functionsUrl}'`);
  if (updated === config && !config.includes(functionsUrl)) throw new Error('Could not set functionsUrl in config.js.');
  await writeFile(configPath, updated);
}

// Short admin URL: <site>/admin/ forwards to the admin dashboard.
await mkdir(join(output, 'admin'), { recursive: true });
await writeFile(join(output, 'admin/index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../Octo-Industries/BehindTheScenes/admin/"><title>Octo Industries Admin</title><a href="../Octo-Industries/BehindTheScenes/admin/">Open the admin dashboard</a>\n');
await writeFile(join(output, '.nojekyll'), '');

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if ((await stat(path)).size > maximumFileBytes) {
      throw new Error(`${relative(output, path)} exceeds the GitHub Pages 100 MB file limit.`);
    }
  }
}
await walk(output);
console.log(`GitHub Pages site written to ${relative(root, output)}/`);
