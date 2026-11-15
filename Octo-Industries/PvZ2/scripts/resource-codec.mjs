import { execFile } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const UUID_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const IMAGE_CONCURRENCY = 8;
const AUDIO_CONCURRENCY = 8;
const AVIF_RUNTIME_FILE = 'resource-codec-avif-support.js';
const AVIF_RUNTIME_SOURCE = fileURLToPath(new URL('./avif-support.js', import.meta.url));

const IMAGE_FORMATS = {
    webp: { extension: '.webp', nativeFormat: '4' },
    avif: { extension: '.avif', nativeFormat: '8' },
};

export function compressUuid(uuid) {
    const hex = uuid.replaceAll('-', '');
    if (!/^[0-9a-f]{32}$/i.test(hex)) {
        throw new Error(`Invalid UUID: ${uuid}`);
    }

    let compressed = hex.slice(0, 2);
    for (let index = 2; index < 32; index += 3) {
        const value = Number.parseInt(hex.slice(index, index + 3), 16);
        compressed += UUID_BASE64[value >> 6] + UUID_BASE64[value & 63];
    }
    return compressed;
}

export function compressNativeUuid(uuid) {
    const separator = uuid.indexOf('@');
    if (separator < 0) return compressUuid(uuid);
    return `${compressUuid(uuid.slice(0, separator))}${uuid.slice(separator)}`;
}

function visit(value, callback) {
    callback(value);
    if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, callback));
    } else if (value && typeof value === 'object') {
        Object.values(value).forEach((entry) => visit(entry, callback));
    }
}

export function patchImageImport(importData, nativeFormat = IMAGE_FORMATS.webp.nativeFormat) {
    let imageAssets = 0;
    visit(importData, (value) => {
        if (!value || Array.isArray(value) || typeof value !== 'object') return;
        if (!Object.hasOwn(value, 'fmt') || !Object.hasOwn(value, 'w') || !Object.hasOwn(value, 'h')) return;
        imageAssets += 1;
        const formats = String(value.fmt).split('_');
        let pngFormats = 0;
        value.fmt = formats.map((format) => {
            const [sourceFormat] = format.split('@', 1);
            if (sourceFormat !== '0') return format;
            pngFormats += 1;
            return nativeFormat;
        }).join('_');
        if (pngFormats !== 1) {
            throw new Error(`Expected exactly one PNG format in ImageAsset fmt, got ${JSON.stringify(value.fmt)}`);
        }
    });
    if (imageAssets !== 1) {
        throw new Error(`Expected exactly one ImageAsset fmt field, found ${imageAssets}`);
    }
    return importData;
}

export function patchAudioEntry(entry) {
    let changes = 0;
    visit(entry, (value) => {
        if (!Array.isArray(value)) return;
        for (let index = 0; index < value.length; index += 1) {
            if (value[index] === '.mp3') {
                value[index] = '.m4a';
                changes += 1;
            }
        }
    });
    if (changes !== 1) {
        throw new Error(`Expected exactly one AudioClip .mp3 field, found ${changes}`);
    }
    return entry;
}

export function findPackedAsset(config, uuid) {
    const uuidIndex = config.uuids.indexOf(compressNativeUuid(uuid));
    if (uuidIndex < 0) {
        throw new Error(`UUID is missing from bundle config: ${uuid}`);
    }

    for (const [packId, uuidIndexes] of Object.entries(config.packs ?? {})) {
        const position = uuidIndexes.indexOf(uuidIndex);
        if (position >= 0) return { packId, position, uuidIndex };
    }
    return null;
}

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, data) {
    const temporaryPath = `${filePath}.resource-codec.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data));
    await rename(temporaryPath, filePath);
}

export function patchWebIndexForAvif(html) {
    const launchPattern = /\bSystem\.import\((['"])\.\/index\.js\1\)/g;
    if ([...html.matchAll(launchPattern)].length !== 1) {
        throw new Error('Web index must contain exactly one Cocos launch import');
    }
    // Replace only the launcher expression so the web audio initialization stays first.
    // Absolute URL from document.baseURI: Safari can resolve import() in inline scripts
    // against the page URL instead of <base href>, which breaks the Pages release layout.
    return html.replace(launchPattern, `import(new URL('${AVIF_RUNTIME_FILE}', document.baseURI).href)
      .then(function (runtime) { return System.import('cc').then(function (cc) {
        runtime.registerAvifSupport(cc);
        return window.System.import('./index.js');
      }); })`);
}

async function installAvifWebRuntime(root) {
    const indexPath = path.join(root, 'index.html');
    const html = await readFile(indexPath, 'utf8');
    await writeFile(indexPath, patchWebIndexForAvif(html));
    await copyFile(AVIF_RUNTIME_SOURCE, path.join(root, AVIF_RUNTIME_FILE));
    return {
        kind: 'pre-game-web-bootstrap',
        index: path.relative(root, indexPath),
        module: AVIF_RUNTIME_FILE,
    };
}

async function fileExists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

async function mapWithConcurrency(entries, concurrency, callback) {
    const results = new Array(entries.length);
    let nextIndex = 0;
    let failure = null;

    async function worker() {
        while (!failure && nextIndex < entries.length) {
            const index = nextIndex;
            nextIndex += 1;
            try {
                results[index] = await callback(entries[index]);
            } catch (error) {
                failure ??= error;
            }
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(concurrency, entries.length) },
        () => worker(),
    ));
    if (failure) throw failure;
    return results;
}

function nativePath(root, bundle, uuid, extension) {
    return path.join(root, 'assets', bundle, 'native', uuid.slice(0, 2), `${uuid}${extension}`);
}

function importPath(root, bundle, uuid) {
    return path.join(root, 'assets', bundle, 'import', uuid.slice(0, 2), `${uuid}.json`);
}

function packImportPath(root, bundle, packId) {
    return path.join(root, 'assets', bundle, 'import', packId.slice(0, 2), `${packId}.json`);
}

function bundleConfigPath(root, bundle) {
    return path.join(root, 'assets', bundle, 'config.json');
}

async function run(command, args) {
    try {
        await execFileAsync(command, args, { maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
        const detail = error.stderr?.trim() || error.message;
        throw new Error(`${command} failed: ${detail}`);
    }
}

let metadataPatchQueue = Promise.resolve();

function serializeMetadataPatch(callback) {
    const operation = metadataPatchQueue.then(callback, callback);
    metadataPatchQueue = operation.catch(() => {});
    return operation;
}

async function patchMetadata(root, bundle, uuid, patcher, assetType) {
    const directImportPath = importPath(root, bundle, uuid);
    if (await fileExists(directImportPath)) {
        const importData = await readJson(directImportPath);
        await writeJsonAtomic(directImportPath, patcher(importData));
        return { kind: 'direct', file: path.relative(root, directImportPath) };
    }

    const config = await readJson(bundleConfigPath(root, bundle));
    const packedAsset = findPackedAsset(config, uuid);
    if (!packedAsset) {
        throw new Error(`${assetType} metadata is neither direct nor packed: ${uuid}`);
    }

    const packedImportPath = packImportPath(root, bundle, packedAsset.packId);
    const packedImport = await readJson(packedImportPath);
    if (!Array.isArray(packedImport[5]) || packedImport[5].length !== config.packs[packedAsset.packId].length) {
        throw new Error(`Unsupported Cocos JSON pack layout: ${packedAsset.packId}`);
    }
    patcher(packedImport[5][packedAsset.position]);
    await writeJsonAtomic(packedImportPath, packedImport);
    return {
        kind: 'packed',
        file: path.relative(root, packedImportPath),
        position: packedAsset.position,
    };
}

async function patchAudioMetadata(root, bundle, uuid) {
    return serializeMetadataPatch(
        () => patchMetadata(root, bundle, uuid, patchAudioEntry, 'AudioClip'),
    );
}

async function patchImageMetadata(root, bundle, uuid, nativeFormat) {
    return serializeMetadataPatch(
        () => patchMetadata(
            root,
            bundle,
            uuid,
            (importData) => patchImageImport(importData, nativeFormat),
            'ImageAsset',
        ),
    );
}

async function convertImage(root, entry) {
    const bundle = entry.bundle ?? 'resources';
    const codec = entry.codec ?? 'webp';
    const imageFormat = IMAGE_FORMATS[codec];
    if (!imageFormat) {
        throw new Error(`Image ${entry.uuid} codec must be "webp" or "avif"`);
    }
    if (!['lossy', 'lossless'].includes(entry.mode)) {
        throw new Error(`Image ${entry.uuid} must use mode "lossy" or "lossless"`);
    }
    if (entry.mode === 'lossy' && ((entry.quality ?? 90) < 0 || (entry.quality ?? 90) > 100)) {
        throw new Error(`Image ${entry.uuid} quality must be between 0 and 100`);
    }
    if (codec === 'avif' && entry.mode !== 'lossy') {
        throw new Error(`Image ${entry.uuid} AVIF trial must use mode "lossy"`);
    }
    if (codec === 'avif' && ((entry.alphaQuality ?? 70) < 0 || (entry.alphaQuality ?? 70) > 100)) {
        throw new Error(`Image ${entry.uuid} alphaQuality must be between 0 and 100`);
    }
    const sourcePath = nativePath(root, bundle, entry.uuid, '.png');
    const destinationPath = nativePath(root, bundle, entry.uuid, imageFormat.extension);
    const sourceSize = (await stat(sourcePath)).size;
    if (codec === 'avif') {
        await run('avifenc', [
            '-j', '2', '-s', String(entry.speed ?? 8), '-d', '10', '-y', '444',
            '-q', String(entry.quality ?? 50), '--qalpha', String(entry.alphaQuality ?? 70),
            sourcePath, destinationPath,
        ]);
    } else {
        const args = entry.mode === 'lossless'
            ? ['-quiet', '-lossless', '-z', '9', '-exact', sourcePath, '-o', destinationPath]
            : [
                '-quiet', '-q', String(entry.quality ?? 90), '-alpha_q', '100',
                '-exact', '-m', '6', sourcePath, '-o', destinationPath,
            ];
        await run('cwebp', args);
    }
    const destinationSize = (await stat(destinationPath)).size;
    if (destinationSize >= sourceSize) {
        await unlink(destinationPath);
        return {
            type: 'image', codec, uuid: entry.uuid, status: 'kept-original', sourceSize, destinationSize,
        };
    }

    const metadata = await patchImageMetadata(root, bundle, entry.uuid, imageFormat.nativeFormat);
    await unlink(sourcePath);
    return {
        type: 'image',
        codec,
        uuid: entry.uuid,
        status: 'converted',
        sourceSize,
        destinationSize,
        savedBytes: sourceSize - destinationSize,
        ...(codec === 'avif' ? { alphaQuality: entry.alphaQuality ?? 70 } : {}),
        metadata,
    };
}

async function probeAudio(filePath) {
    const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=channels,bit_rate:format=duration',
        '-of', 'json',
        filePath,
    ]);
    const probe = JSON.parse(stdout);
    return {
        channels: Number(probe.streams?.[0]?.channels),
        bitRate: Number(probe.streams?.[0]?.bit_rate),
        duration: Number(probe.format?.duration),
    };
}

async function convertAudio(root, entry) {
    const bundle = entry.bundle ?? 'resources';
    const sourcePath = nativePath(root, bundle, entry.uuid, '.mp3');
    const destinationPath = nativePath(root, bundle, entry.uuid, '.m4a');
    const sourceSize = (await stat(sourcePath)).size;
    const probe = await probeAudio(sourcePath);
    const targetKbps = selectAudioBitrate(entry, probe.channels);

    if (Number.isFinite(probe.bitRate) && probe.bitRate <= targetKbps * 1000) {
        return {
            type: 'audio', uuid: entry.uuid, status: 'kept-low-bitrate', sourceSize,
            sourceBitRate: probe.bitRate, targetKbps,
        };
    }

    await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-i', sourcePath,
        '-vn', '-c:a', 'aac', '-b:a', `${targetKbps}k`, '-movflags', '+faststart',
        destinationPath,
    ]);
    const destinationSize = (await stat(destinationPath)).size;
    if (destinationSize >= sourceSize) {
        await unlink(destinationPath);
        return { type: 'audio', uuid: entry.uuid, status: 'kept-original', sourceSize, destinationSize };
    }

    const metadata = await patchAudioMetadata(root, bundle, entry.uuid);
    await unlink(sourcePath);
    return {
        type: 'audio',
        uuid: entry.uuid,
        status: 'converted',
        sourceSize,
        destinationSize,
        savedBytes: sourceSize - destinationSize,
        sourceBitRate: probe.bitRate,
        targetKbps,
        metadata,
    };
}

export function selectAudioBitrate(entry, channels) {
    if (entry.bitrateKbps != null) return entry.bitrateKbps;
    if (channels === 1) return entry.monoBitrateKbps ?? 128;
    return entry.stereoBitrateKbps ?? 160;
}

function parseArguments(argv) {
    const values = {};
    for (let index = 0; index < argv.length; index += 2) {
        const name = argv[index];
        const value = argv[index + 1];
        if (!name?.startsWith('--') || !value) throw new Error(`Invalid argument near ${name ?? '<end>'}`);
        values[name.slice(2)] = value;
    }
    for (const required of ['input', 'output', 'policy']) {
        if (!values[required]) throw new Error(`Missing --${required}`);
    }
    return values;
}

export async function buildCompressedOutput({ input, output, policy: policyPath, installAvifRuntime = true }) {
    const inputRoot = path.resolve(input);
    const outputRoot = path.resolve(output);
    const relativeOutput = path.relative(inputRoot, outputRoot);
    if (relativeOutput === '' || (!relativeOutput.startsWith('..') && !path.isAbsolute(relativeOutput))) {
        throw new Error('Output must be separate from and outside the input directory');
    }
    if (await fileExists(outputRoot)) {
        throw new Error(`Output already exists: ${outputRoot}`);
    }

    const policy = await readJson(path.resolve(policyPath));
    if (policy.version !== 1 || !Array.isArray(policy.images) || !Array.isArray(policy.audio)) {
        throw new Error('Policy must use version 1 and contain images/audio arrays');
    }

    const imageCodecs = new Set(policy.images.map((entry) => entry.codec ?? 'webp'));
    if (imageCodecs.has('webp')) await run('cwebp', ['-version']);
    if (imageCodecs.has('avif')) await run('avifenc', ['--version']);
    if (policy.audio.length > 0) {
        await run('ffmpeg', ['-version']);
        await run('ffprobe', ['-version']);
    }

    await mkdir(path.dirname(outputRoot), { recursive: true });
    await cp(inputRoot, outputRoot, { recursive: true, errorOnExist: true, force: false });
    const avifRuntime = imageCodecs.has('avif') && installAvifRuntime
        ? await installAvifWebRuntime(outputRoot)
        : null;

    const results = await mapWithConcurrency(
        policy.images,
        IMAGE_CONCURRENCY,
        (entry) => convertImage(outputRoot, entry),
    );
    results.push(...await mapWithConcurrency(
        policy.audio,
        AUDIO_CONCURRENCY,
        (entry) => convertAudio(outputRoot, entry),
    ));

    const report = {
        version: 1,
        policy: policy.name ?? path.basename(policyPath),
        createdAt: new Date().toISOString(),
        input: inputRoot,
        output: outputRoot,
        avifRuntime,
        results,
    };
    await writeJsonAtomic(path.join(outputRoot, 'resource-codec-report.json'), report);
    return report;
}

async function main() {
    const args = parseArguments(process.argv.slice(2));
    const report = await buildCompressedOutput(args);
    const converted = report.results.filter((result) => result.status === 'converted');
    const savedBytes = converted.reduce((total, result) => total + result.savedBytes, 0);
    console.log(`Converted ${converted.length}/${report.results.length} policy resources; saved ${savedBytes} bytes.`);
    console.log(`Output: ${report.output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
