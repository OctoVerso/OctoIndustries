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

const catalogPath = join(root, 'Octo-Industries/BehindTheScenes/hub/catalog.js');
const catalogSource = await readFile(catalogPath, 'utf8');
const catalogMatch = /^window\.OCTO_GAMES = Object\.freeze\(([\s\S]*)\);\s*$/.exec(catalogSource);
if (!catalogMatch) throw new Error('The generated game catalog has an invalid format.');
const games = JSON.parse(catalogMatch[1]);
if (!Array.isArray(games)) throw new Error('The generated game catalog must be an array.');

const indexHtml = await readFile(join(root, 'index.html'), 'utf8');
const canonicalMatch = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(indexHtml);
if (!canonicalMatch) throw new Error('The site index is missing its canonical URL.');
const siteUrl = new URL(canonicalMatch[1]);
if (!siteUrl.pathname.endsWith('/')) siteUrl.pathname += '/';

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

const rawFunctionsUrl = (process.env.SUPABASE_FUNCTIONS_URL || process.env.SUPABASE_URL || '').trim();
// Accept the project URL, a bare host, or the full functions URL; always end up with https://<host>/functions/v1.
const functionsUrl = rawFunctionsUrl
  ? `${(/^https?:\/\//i.test(rawFunctionsUrl) ? rawFunctionsUrl : `https://${rawFunctionsUrl}`)
    .replace(/\/+$/, '').replace(/\/functions\/v1$/i, '').toLowerCase()}/functions/v1`
  : '';
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
// Project pages return 404.html for unknown paths: forward clean hub URLs such as /OctoIndustries/trending to the hash routes.
await writeFile(join(output, '404.html'), `<!doctype html><meta charset="utf-8"><title>Octo Industries</title><meta name="robots" content="noindex">
<script>
  const base = location.pathname.split('/').slice(0, 2).join('/') + '/';
  const route = location.pathname.slice(base.length).replace(/\\/+$/, '');
  const known = ['games', 'trending', 'recently-added', 'news', 'coming-soon', 'about', 'contact', 'inquiries'];
  if (known.includes(route)) location.replace(base + '#/' + route + location.search);
  else document.addEventListener('DOMContentLoaded', () => { document.body.innerHTML = '<h1>Page not found</h1><p><a href="' + base + '">Back to Octo Industries</a></p>'; });
</script>
`);
await writeFile(join(output, '.nojekyll'), '');
const sitemapUrls = [
  siteUrl.href,
  ...games.map((game) => new URL(String(game.launch || '').replace(/^\/+/, ''), siteUrl).href),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls
  .map((url) => `  <url><loc>${url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</loc></url>`)
  .join('\n')}\n</urlset>\n`;
await writeFile(join(output, 'sitemap.xml'), sitemap);

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
