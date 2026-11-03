import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGameBranding } from './branding-injection.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const gameCollection = resolve(root, 'Octo-Industries');
const output = resolve(root, 'Octo-Industries', 'BehindTheScenes', 'hub', 'catalog.js');
const excludedDirectories = new Set(['.git', '.octo-data', '.vscode', 'node_modules', 'dist']);
const gamesToRegister = [];

let previousCatalog = [];
if (existsSync(output)) {
  const source = readFileSync(output, 'utf8');
  const match = /Object\.freeze\(([\s\S]*)\);\s*$/.exec(source);
  if (!match) throw new Error('The generated game catalog has an invalid format.');
  previousCatalog = JSON.parse(match[1]);
  if (!Array.isArray(previousCatalog)) throw new Error('The generated game catalog must be an array.');
}
const previousAddedAt = new Map(previousCatalog
  .filter((game) => Number.isFinite(Date.parse(game.addedAt || '')))
  .map((game) => [game.id, game.addedAt]));
const syncDate = new Date().toISOString();

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || excludedDirectories.has(entry.name)) continue;

    const gameDirectory = resolve(directory, entry.name);
    const manifest = resolve(gameDirectory, 'game.json');
    if (existsSync(manifest)) {
      gamesToRegister.push({ gameDirectory, manifest });
    } else if (directory === gameCollection && existsSync(resolve(gameDirectory, 'index.html'))) {
      gamesToRegister.push({ gameDirectory, manifest: null });
    }
    walk(gameDirectory);
  }
}

function inferGameMetadata(gameDirectory) {
  const folderName = basename(gameDirectory);
  const title = folderName
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b[a-z]/gi, (letter) => letter.toUpperCase());
  const id = folderName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const thumbnail = discoverScreenshots(gameDirectory)[0] || [
    'logo.svg',
    'logo.png',
    'logo.webp',
    'logo.jpg',
    'logo.jpeg',
    'cover.webp',
    'cover.png',
    'cover.jpg',
    'cover.jpeg',
    'title.svg',
    'title.png',
    'title.webp',
    'icon.svg',
    'icon.png',
    'icon.webp',
    'icon.jpg',
    'icon.jpeg',
  ].find((file) => {
    const candidate = resolve(gameDirectory, file);
    return existsSync(candidate) && statSync(candidate).isFile();
  }) || '';

  return {
    id,
    title,
    description: `Play ${title} in the Octo Industries Game Hub.`,
    category: 'Other',
    tags: folderName.split(/[-_]+/).filter(Boolean).map((tag) => tag.toLowerCase()),
    launch: 'index.html',
    thumbnail,
  };
}

function discoverScreenshots(gameDirectory) {
  const directory = resolve(gameDirectory, 'screenshots');
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:avif|gif|jpe?g|png|webp)$/i.test(entry.name))
    .map((entry) => `screenshots/${entry.name}`)
    .sort((first, second) => first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' }));
}

function screenshotReferences(gameDirectory, configuredScreenshots) {
  if (configuredScreenshots !== undefined && !Array.isArray(configuredScreenshots)) {
    throw new Error(`Screenshots for ${gameDirectory} must be an array of image paths`);
  }
  const screenshots = configuredScreenshots ?? discoverScreenshots(gameDirectory);
  return screenshots.map((value) => {
    if (typeof value !== 'string') throw new Error(`Invalid screenshot path for ${gameDirectory}: ${value}`);
    if (!/\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)) {
      throw new Error(`Unsupported screenshot format for ${gameDirectory}: ${value}`);
    }
    const file = resolveGameFile(gameDirectory, value);
    if (!file) throw new Error(`Screenshot does not exist for ${gameDirectory}: ${value}`);
    return versionedAssetReference(file);
  });
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function assetReference(gameDirectory, value) {
  if (!value) return '';
  const file = resolveGameFile(gameDirectory, value);
  if (!file) throw new Error(`Banner artwork does not exist for ${gameDirectory}: ${value}`);
  const assetPath = resolve(root, ...file.split('/').map(decodeURIComponent));
  const mimeType = ({
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  })[extname(assetPath).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported banner artwork format for ${gameDirectory}: ${value}`);
  return `data:${mimeType};base64,${readFileSync(assetPath).toString('base64')}`;
}

function bannerSvg(game, gameDirectory) {
  const accent = /^#[\da-f]{6}$/i.test(game.accent || '') ? game.accent : '#65e6e3';
  const title = xmlEscape(game.title);
  const source = assetReference(gameDirectory, game.bannerSource || game.thumbnail || '');
  const fit = game.bannerFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
  const artwork = source
    ? `<rect width="1200" height="675" fill="#000"/><image href="${xmlEscape(source)}" x="0" y="0" width="1200" height="675" preserveAspectRatio="${fit}"/>`
    : `<rect width="1200" height="675" fill="#08111a"/><circle cx="900" cy="330" r="330" fill="${accent}" fill-opacity=".13"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${title} game artwork">
  <defs>
    <linearGradient id="vignette" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071019" stop-opacity=".16"/><stop offset=".5" stop-color="#071019" stop-opacity="0"/><stop offset="1" stop-color="#071019" stop-opacity=".22"/></linearGradient>
  </defs>
  ${artwork}
  <rect width="1200" height="675" fill="url(#vignette)"/>
</svg>\n`;
}

function resolveGameFile(gameDirectory, value) {
  const collectionDirectory = dirname(gameDirectory);
  for (const candidate of [
    resolve(gameDirectory, value),
    resolve(collectionDirectory, value),
    resolve(root, value),
  ]) {
    if (candidate.startsWith(`${root}${sep}`) && existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(root, candidate).split(sep).map(encodeURIComponent).join('/');
    }
  }
  return '';
}

function versionedAssetReference(file) {
  const assetPath = resolve(root, ...file.split('/').map(decodeURIComponent));
  if (!assetPath.startsWith(`${root}${sep}`) || !existsSync(assetPath) || !statSync(assetPath).isFile()) {
    throw new Error(`Image asset does not exist: ${file}`);
  }
  const version = createHash('sha256').update(readFileSync(assetPath)).digest('hex').slice(0, 16);
  return `/${file}?v=${version}`;
}

walk(gameCollection);

const games = gamesToRegister.map(({ gameDirectory, manifest }) => {
  const game = manifest
    ? JSON.parse(readFileSync(manifest, 'utf8'))
    : inferGameMetadata(gameDirectory);
  const source = manifest || gameDirectory;
  const sourceFile = relative(root, manifest || resolve(gameDirectory, 'index.html')).split(sep).join('/');
  for (const field of ['id', 'title', 'description', 'category', 'launch']) {
    if (!game[field]) throw new Error(`${source} is missing ${field}`);
  }

  const launch = resolveGameFile(gameDirectory, game.launch);
  if (!launch) throw new Error(`${game.title} has no valid launch file: ${game.launch}`);
  const launchFile = resolve(root, ...launch.split('/').map(decodeURIComponent));
  if (/\.html?$/i.test(launchFile)) {
    const launchHtml = readFileSync(launchFile, 'utf8');
    const brandedHtml = ensureGameBranding(launchHtml, launchFile, root);
    if (brandedHtml !== launchHtml) writeFileSync(launchFile, brandedHtml);
  }

  const bannerPath = resolve(gameDirectory, 'hub-banner.svg');
  writeFileSync(bannerPath, bannerSvg(game, gameDirectory));
  const {
    bannerSource,
    bannerFit,
    thumbnailDirect,
    screenshots: configuredScreenshots,
    ...metadata
  } = game;
  const directThumbnail = thumbnailDirect ? resolveGameFile(gameDirectory, game.thumbnail || '') : '';
  const banner = versionedAssetReference(relative(root, bannerPath).split(sep).map(encodeURIComponent).join('/'));
  if (thumbnailDirect && !directThumbnail) {
    throw new Error(`Direct thumbnail does not exist for ${game.title}: ${game.thumbnail}`);
  }

  return {
    ...metadata,
    sourceFile,
    banner,
    addedAt: Number.isFinite(Date.parse(game.addedAt || ''))
      ? game.addedAt
      : previousAddedAt.get(game.id) || syncDate,
    launch: `/${launch}`,
    thumbnail: directThumbnail
      ? versionedAssetReference(directThumbnail)
      : banner,
    screenshots: screenshotReferences(gameDirectory, configuredScreenshots),
    tags: Array.isArray(game.tags) ? game.tags : [],
    featured: game.featured === true,
  };
}).sort((first, second) => first.title.localeCompare(second.title));

if (!games.length) throw new Error(`No games found beneath ${gameCollection}`);
const gameIds = new Set();
for (const game of games) {
  if (gameIds.has(game.id)) throw new Error(`Duplicate game id: ${game.id}`);
  for (const field of ['id', 'title', 'description', 'category', 'launch', 'thumbnail', 'banner', 'sourceFile']) {
    if (typeof game[field] !== 'string' || !game[field].trim()) {
      throw new Error(`Registration failed for ${game.title || game.id || 'unknown game'}: ${field} is missing.`);
    }
  }
  if (!Number.isFinite(Date.parse(game.addedAt)) || !Array.isArray(game.tags) || !Array.isArray(game.screenshots)) {
    throw new Error(`Registration failed for ${game.title}: metadata is incomplete.`);
  }
  gameIds.add(game.id);
}

await import('node:fs/promises').then(({ mkdir }) => mkdir(dirname(output), { recursive: true }));
writeFileSync(output, `window.OCTO_GAMES = Object.freeze(${JSON.stringify(games, null, 2)});\n`);
console.log(`Discovered ${games.length} games. Catalog written to ${relative(root, output)}.`);
for (const game of games) {
  console.log(`  ${game.title}: ${game.launch}${game.thumbnail ? '' : ' (using artwork fallback)'}`);
}