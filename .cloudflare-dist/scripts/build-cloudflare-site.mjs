import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.cloudflare-dist');
const maximumAssetBytes = 25 * 1024 * 1024;
const gzipAsync = promisify(gzip);
const excludedDirectories = new Set(['.git', '.github', '.vscode', '.octo-data', '.cloudflare-dist', 'node_modules']);
const excludedFiles = new Set([
  '.env',
  '.gitattributes',
  '.gitignore',
  '.gitmodules',
  '.npmrc',
  'README.md',
  'AGENTS.md',
  'render.yaml',
  'wrangler.toml',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'functions',
  'migrations',
]);
const omittedPaths = new Set([
  'Octo-Industries/BehindTheScenes/admin/server.mjs',
  'Octo-Industries/BehindTheScenes/admin/server.test.mjs',
  'Octo-Industries/BehindTheScenes/package.json',
]);

execFileSync('npm', ['--prefix', 'Octo-Industries/BehindTheScenes', 'run', 'sync'], {
  cwd: root,
  stdio: 'inherit',
});
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const compressedAssets = {};

async function copyTree(sourceDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const source = join(sourceDirectory, entry.name);
    const destination = join(outputDirectory, entry.name);
    const pathFromRoot = relative(root, source).split('\\').join('/');
    if (entry.name === '.env' || entry.name.startsWith('.env.') || /\.(?:pem|key)$/i.test(entry.name)) continue;
    if (entry.isDirectory()) {
      if (excludedDirectories.has(entry.name)
        || excludedFiles.has(pathFromRoot)
        || pathFromRoot === 'Octo-Industries/BehindTheScenes/scripts'
        || pathFromRoot === 'Octo-Industries/BehindTheScenes/.vscode') continue;
      await copyTree(source, destination);
      continue;
    }
    if (!entry.isFile()
      || excludedFiles.has(entry.name)
      || omittedPaths.has(pathFromRoot)
      || /\.(?:apk|xapk|aab|apks|obb)$/i.test(entry.name)) continue;
    const fileInfo = await stat(source);
    if (fileInfo.size <= maximumAssetBytes) {
      await copyFile(source, destination);
      continue;
    }
    const compressed = await gzipAsync(await readFile(source), { level: 9 });
    if (compressed.byteLength > maximumAssetBytes) {
      throw new Error(`${pathFromRoot} exceeds Cloudflare Pages' 25 MiB per-file limit even when gzipped; move it to an R2 bucket before deployment.`);
    }
    const compressedPath = `${destination}.cf-gzip`;
    await writeFile(compressedPath, compressed);
    compressedAssets[`/${pathFromRoot}`] = {
      file: `/${relative(output, compressedPath).split('\\').join('/')}`,
      contentType: pathFromRoot.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
      originalSize: fileInfo.size,
    };
    console.log(`Gzipped ${pathFromRoot}: ${fileInfo.size} -> ${compressed.byteLength} bytes`);
  }
}

await copyTree(root, output);
const adminSource = resolve(root, 'Octo-Industries/BehindTheScenes/admin');
const adminOutput = resolve(output, 'admin');
await mkdir(adminOutput, { recursive: true });
for (const file of ['index.html', 'admin.css', 'admin.js']) {
  await copyFile(resolve(adminSource, file), resolve(adminOutput, file));
}
await writeFile(join(output, 'octo-compressed-assets.json'), `${JSON.stringify(compressedAssets)}\n`);
console.log(`Cloudflare Pages output ready at ${relative(root, output)} (${Object.keys(compressedAssets).length} compressed large assets).`);
