import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoExternalRuntimeAssets, externalCssAssetSources, externalRuntimeAssetSources } from './local-runtime-policy.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const collection = resolve(root, 'Octo-Industries');
const catalogFile = resolve(collection, 'BehindTheScenes/hub/catalog.js');

async function readCatalog() {
  const source = await readFile(catalogFile, 'utf8');
  const match = /Object\.freeze\(([\s\S]*)\);\s*$/.exec(source);
  assert.ok(match, 'generated catalog uses the expected format');
  const catalog = JSON.parse(match[1]);
  assert.ok(Array.isArray(catalog), 'generated catalog is an array');
  return catalog;
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function gameRuntimeFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!['.git', 'dist', 'node_modules'].includes(entry.name)) {
        files.push(...await gameRuntimeFiles(resolve(directory, entry.name)));
      }
    } else if (entry.isFile() && /\.(?:css|html?)$/i.test(entry.name)) {
      files.push(resolve(directory, entry.name));
    }
  }
  return files;
}

test('the generated main registry includes every importable game folder with complete metadata and assets', async () => {
  const entries = await readdir(collection, { withFileTypes: true });
  const importable = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const directory = resolve(collection, entry.name);
    if (await isFile(resolve(directory, 'game.json')) || await isFile(resolve(directory, 'index.html'))) {
      importable.push(directory);
    }
  }

  const catalog = await readCatalog();
  const gameIds = new Set(catalog.map((game) => game.id));
  assert.equal(gameIds.size, catalog.length, 'game IDs are unique');
  assert.equal(catalog.length, importable.length, 'every importable top-level game folder is registered');

  for (const directory of importable) {
    const manifestPath = resolve(directory, 'game.json');
    const manifestExists = await isFile(manifestPath);
    const manifest = manifestExists ? JSON.parse(await readFile(manifestPath, 'utf8')) : null;
    const game = catalog.find((entry) => entry.id === manifest?.id
      || entry.sourceFile === `${directory.slice(collection.length + 1)}/index.html`);
    assert.ok(game, `${directory} is in the generated main registry`);
    for (const field of ['title', 'description', 'category', 'addedAt', 'launch', 'thumbnail', 'banner', 'sourceFile']) {
      assert.ok(typeof game[field] === 'string' && game[field].trim(), `${game.title} has ${field}`);
    }
    assert.ok(Array.isArray(game.tags), `${game.title} has searchable tags`);
    assert.ok(['local-payload', 'local-wrapper', 'external-only', 'unverified'].includes(game.acquisitionStatus), `${game.title} has acquisition classification`);
    assert.ok(['local', 'external-required', 'unverified'].includes(game.runtimeStatus), `${game.title} has runtime classification`);
    assert.ok(['not-required', 'optional', 'required', 'unverified'].includes(game.networkDependency), `${game.title} has dependency classification`);
    assert.ok(game.saveLevel === null || (Number.isInteger(game.saveLevel) && game.saveLevel >= 0 && game.saveLevel <= 3), `${game.title} has save level classification`);
    assert.ok(['game-managed', 'hub-adapter', 'unsupported', 'unverified'].includes(game.saveStatus), `${game.title} has save classification`);
    assert.ok(['verified', 'partial', 'not-run', 'unverified'].includes(game.testStatus), `${game.title} has test classification`);

    for (const asset of [game.launch, game.thumbnail, game.banner]) {
      const assetPath = decodeURIComponent(new URL(asset, 'https://octo.invalid').pathname)
        .split('/')
        .filter(Boolean);
      assert.ok(await isFile(resolve(root, ...assetPath)), `${game.title} asset exists: ${asset}`);
    }

    for (const runtimeFile of await gameRuntimeFiles(directory)) {
      assertNoExternalRuntimeAssets(await readFile(runtimeFile, 'utf8'), `${game.title} (${runtimeFile})`);
    }

    const bannerPath = resolve(directory, 'hub-banner.svg');
    assert.ok(await isFile(bannerPath), `${game.title} generated banner exists`);
    const banner = await readFile(bannerPath, 'utf8');
    assert.ok(banner.trim().length > 0, `${game.title} generated banner is not empty`);
    assert.match(banner, /^<svg[\s\S]*<\/svg>\s*$/, `${game.title} banner has valid SVG structure`);
    assert.match(banner, /width="1200"[\s\S]*height="675"|height="675"[\s\S]*width="1200"/, `${game.title} banner is 16:9`);
    assert.match(banner, /(?:data:image\/|href="#octo-artwork")/, `${game.title} banner contains embedded or referenced artwork`);
  }

  const tinyFishing = catalog.find((game) => game.id === 'tiny-fishing');
  assert.equal(tinyFishing?.acquisitionStatus, 'local-payload');
  assert.equal(tinyFishing?.runtimeStatus, 'local');
  assert.equal(tinyFishing?.networkDependency, 'not-required');
  assert.ok(await isFile(resolve(collection, 'Tiny-Fishing/html5game/TinyFishing.js')));
  assert.ok(await isFile(resolve(collection, 'Tiny-Fishing/html5game/TinyFishing_texture_0.png')));
  const brotato = catalog.find((game) => game.id === 'brotato');
  assert.equal(brotato?.acquisitionStatus, 'local-payload');
  assert.equal(brotato?.runtimeStatus, 'local');
  assert.equal(brotato?.networkDependency, 'optional');
  assert.ok(await isFile(resolve(collection, 'Brotato/payload/index.js')));
  assert.ok(await isFile(resolve(collection, 'Brotato/payload/index.pck.part1')));
  assert.ok(await isFile(resolve(collection, 'Brotato/payload/index.wasm.part1')));
  assert.ok(await isFile(resolve(collection, 'Brotato/LICENSE.coi-serviceworker.txt')));
  assert.equal(catalog.find((game) => game.id === 'turball')?.networkDependency, 'required');
  assert.equal(catalog.find((game) => game.id === 'pvz2-gardendless')?.saveLevel, 3);

  const ironSnout = catalog.find((game) => game.id === 'iron-snout');
  assert.equal(ironSnout?.acquisitionStatus, 'local-payload');
  assert.equal(ironSnout?.runtimeStatus, 'local');
  assert.equal(ironSnout?.networkDependency, 'not-required');
  assert.ok(await isFile(resolve(collection, 'Iron-Snout/html5game/IronSnout.js')));
  assert.ok(await isFile(resolve(collection, 'Iron-Snout/LICENSE.third-party.txt')));
});

test('external runtime assets are rejected while local game assets are allowed', () => {
  assert.deepEqual(externalRuntimeAssetSources('<iframe src="https://games.example/play"></iframe>'), ['https://games.example/play']);
  assert.deepEqual(externalRuntimeAssetSources('<script src="//cdn.example/game.js"></script>'), ['//cdn.example/game.js']);
  assert.deepEqual(externalRuntimeAssetSources('<iframe src="game/index.html"></iframe><script src="/local.js"></script>'), []);
  assert.deepEqual(externalRuntimeAssetSources('<a href="https://games.example">external navigation</a>'), []);
  assert.deepEqual(externalRuntimeAssetSources('<style>@import url("https://cdn.example/game.css");</style>'), ['https://cdn.example/game.css']);
  assert.deepEqual(externalCssAssetSources('@import url(https://cdn.example/font.css); body{background:url("//cdn.example/bg.png")}'), [
    'https://cdn.example/font.css',
    '//cdn.example/bg.png',
  ]);
  assert.throws(() => assertNoExternalRuntimeAssets('@import "https://cdn.example/font.css";', 'game.css'), /externally hosted runtime assets/);
  assert.throws(() => assertNoExternalRuntimeAssets('<iframe src="https://games.example/play"></iframe>', 'launch.html'), /externally hosted runtime assets/);
});
