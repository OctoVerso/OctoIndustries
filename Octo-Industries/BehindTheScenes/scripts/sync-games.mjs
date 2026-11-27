import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureGameBranding } from './branding-injection.mjs';
import { assertNoExternalRuntimeAssets } from './local-runtime-policy.mjs';
import { assertCatalogPreservesPreviousEntries } from '../hub/registry-integrity.mjs';
import { normalizeRegistryMetadata } from '../hub/registry-metadata.mjs';

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
      console.warn(`No game.json found for ${relative(root, gameDirectory)}; inferring game metadata.`);
      gamesToRegister.push({ gameDirectory, manifest: null });
    }
    walk(gameDirectory);
  }
}

function gameRuntimeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : gameRuntimeFiles(file);
    return entry.isFile() && /\.(?:css|html?)$/i.test(entry.name) ? [file] : [];
  });
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
    bannerSource: thumbnail,
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
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  })[extname(assetPath).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported banner artwork format for ${gameDirectory}: ${value}`);
  const bytes = readFileSync(assetPath);
  if (!bytes.length) throw new Error(`Banner artwork is empty for ${gameDirectory}: ${value}`);
  const extension = extname(assetPath).toLowerCase();
  const detectedMimeType = (() => {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
    if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
    if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') return 'image/avif';
    if (extension === '.svg') {
      const svg = bytes.toString('utf8').trim();
      return /^(?:<\?xml[\s\S]*?\?>\s*)?<svg(?:\s|>)/i.test(svg) && /<\/svg>\s*$/.test(svg) ? 'image/svg+xml' : '';
    }
    return '';
  })();
  if (!detectedMimeType) throw new Error(`Banner artwork has an invalid ${extension || 'image'} signature or structure for ${gameDirectory}: ${value}`);
  return `data:${detectedMimeType};base64,${bytes.toString('base64')}`;
}

function bannerSvg(game, gameDirectory) {
  const accent = /^#[\da-f]{6}$/i.test(game.accent || '') ? game.accent : '#65e6e3';
  const title = xmlEscape(game.title);
  if (typeof game.bannerSource !== 'string' || !game.bannerSource.trim()) {
    throw new Error(`${game.title} must define bannerSource with authentic game artwork or its logo.`);
  }
  const source = assetReference(gameDirectory, game.bannerSource);
  if (!source) {
    throw new Error(`${game.title} has no valid bannerSource: ${game.bannerSource}`);
  }
  const fit = game.bannerFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
  const artwork = source
    ? `<rect width="1200" height="675" fill="#071019"/><use href="#octo-artwork" x="-180" y="-100" width="1560" height="875" preserveAspectRatio="xMidYMid slice" filter="url(#backdrop)"/><rect width="1200" height="675" fill="#071019" fill-opacity=".18"/><use href="#octo-artwork" x="0" y="0" width="1200" height="675" preserveAspectRatio="${fit}"/>`
    : `<rect width="1200" height="675" fill="#08111a"/><circle cx="900" cy="330" r="330" fill="${accent}" fill-opacity=".13"/><text x="600" y="355" fill="#eaf3ef" font-family="Georgia, serif" font-size="84" font-weight="700" text-anchor="middle">${title}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${title} game artwork">
  <defs>
    ${source ? `<image id="octo-artwork" href="${xmlEscape(source)}" width="1200" height="675" preserveAspectRatio="${fit}"/>` : ''}
    <linearGradient id="vignette" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071019" stop-opacity=".16"/><stop offset=".5" stop-color="#071019" stop-opacity="0"/><stop offset="1" stop-color="#071019" stop-opacity=".22"/></linearGradient>
    <filter id="backdrop" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28"/><feColorMatrix type="saturate" values=".82"/></filter>
  </defs>
  ${artwork}
  <rect width="1200" height="675" fill="url(#vignette)"/>
</svg>\n`;
}

function validateBannerSvg(svg) {
  if (typeof svg !== 'string' || !svg.trim()) throw new Error('Generated banner SVG is empty.');
  if (!/^<svg\b[\s\S]*<\/svg>\s*$/.test(svg.trim())) throw new Error('Generated banner SVG has invalid structure.');
  if (!/<svg[^>]*\bwidth="1200"[^>]*\bheight="675"/.test(svg) && !/<svg[^>]*\bheight="675"[^>]*\bwidth="1200"/.test(svg)) {
    throw new Error('Generated banner SVG must have 1200x675 dimensions.');
  }
  if (!/(?:data:image\/(?:png|jpeg|jpg|gif|svg\+xml|webp|avif|x-icon);base64,|href="#octo-artwork")/.test(svg)) {
    throw new Error('Generated banner SVG does not contain valid artwork.');
  }
}

function resolveGameFile(gameDirectory, value) {
  const collectionDirectory = dirname(gameDirectory);
  const candidates = [
    resolve(gameDirectory, value),
    resolve(collectionDirectory, value),
    resolve(root, value),
  ];
  for (const candidate of candidates) {
    if (candidate.startsWith(`${root}${sep}`) && existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(root, candidate).split(sep).map(encodeURIComponent).join('/');
    }
  }
  console.error('Could not resolve game asset path.', {
    game: relative(root, gameDirectory),
    path: value,
    candidates: candidates.map((candidate) => relative(root, candidate)),
  });
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
  let game;
  try {
    game = manifest
      ? JSON.parse(readFileSync(manifest, 'utf8'))
      : inferGameMetadata(gameDirectory);
  } catch (error) {
    throw new Error(`Could not load game manifest ${relative(root, manifest || gameDirectory)}: ${error.message}`, { cause: error });
  }
  const source = manifest || gameDirectory;
  const sourceFile = relative(root, manifest || resolve(gameDirectory, 'index.html')).split(sep).join('/');
  for (const field of ['id', 'title', 'description', 'category', 'launch']) {
    if (!game[field]) throw new Error(`${source} is missing ${field}`);
  }

  const launch = resolveGameFile(gameDirectory, game.launch);
  if (!launch) throw new Error(`${game.title} has no valid launch file: ${game.launch}`);
  const launchFile = resolve(root, ...launch.split('/').map(decodeURIComponent));
  for (const runtimeFile of gameRuntimeFiles(gameDirectory)) {
    assertNoExternalRuntimeAssets(readFileSync(runtimeFile, 'utf8'), relative(root, runtimeFile));
  }
  if (/\.html?$/i.test(launchFile)) {
    const launchHtml = readFileSync(launchFile, 'utf8');
    const brandedHtml = ensureGameBranding(launchHtml, launchFile, root);
    if (brandedHtml !== launchHtml) writeFileSync(launchFile, brandedHtml);
  }

  const bannerPath = resolve(gameDirectory, 'hub-banner.svg');
  const generatedBanner = bannerSvg(game, gameDirectory);
  validateBannerSvg(generatedBanner);
  writeFileSync(bannerPath, generatedBanner);
  const {
    bannerSource,
    bannerFit,
    thumbnailDirect,
    screenshots: configuredScreenshots,
    ...metadata
  } = game;
  const registryMetadata = normalizeRegistryMetadata(game);
  const directThumbnail = thumbnailDirect ? resolveGameFile(gameDirectory, game.thumbnail || '') : '';
  const banner = versionedAssetReference(relative(root, bannerPath).split(sep).map(encodeURIComponent).join('/'));
  if (thumbnailDirect && !directThumbnail) {
    throw new Error(`Direct thumbnail does not exist for ${game.title}: ${game.thumbnail}`);
  }

  return {
    ...metadata,
    version: typeof metadata.version === 'string' && metadata.version.trim()
      ? metadata.version.trim().slice(0, 120)
      : '1.0.0',
    ...registryMetadata,
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
assertCatalogPreservesPreviousEntries(previousCatalog, games);
const gameIds = new Set();
for (const game of games) {
  if (gameIds.has(game.id)) throw new Error(`Duplicate game id: ${game.id}`);
  for (const field of ['id', 'title', 'description', 'category', 'launch', 'thumbnail', 'banner', 'sourceFile', 'version']) {
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
