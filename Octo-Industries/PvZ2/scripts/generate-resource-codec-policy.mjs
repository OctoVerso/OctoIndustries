import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compressNativeUuid } from './resource-codec.mjs';

const LARGE_IMAGE_BYTES = 1024 * 1024;

async function listFiles(root) {
    const files = [];
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await listFiles(entryPath));
        else if (entry.isFile()) files.push(entryPath);
    }
    return files;
}

export function classifyImage(sourceSize) {
    if (sourceSize > LARGE_IMAGE_BYTES) {
        return { mode: 'lossy', quality: 90 };
    }
    return { mode: 'lossless' };
}

export function buildMusicUuidSet(config) {
    const musicUuids = new Set();
    for (const [uuidIndex, pathEntry] of Object.entries(config.paths ?? {})) {
        if (!String(pathEntry?.[0] ?? '').startsWith('music/')) continue;
        const uuid = config.uuids?.[Number(uuidIndex)];
        if (uuid) musicUuids.add(uuid);
    }
    return musicUuids;
}

export function nativeUuidKey(uuid) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:@.*)?$/i.test(uuid)
        ? compressNativeUuid(uuid)
        : uuid;
}

export function compileReviewedImages(inventory, classification) {
    if (classification?.version !== 1 || classification?.kind !== 'resource-codec-image-classification') {
        throw new Error('Classification must be a version 1 resource-codec-image-classification file');
    }
    const decisions = new Map();
    for (const image of classification.images ?? []) {
        if (decisions.has(image.uuid)) throw new Error(`Duplicate image classification UUID: ${image.uuid}`);
        decisions.set(image.uuid, image);
    }

    const inventoryUuids = new Set(inventory.map((image) => image.uuid));
    const extra = [...decisions.keys()].filter((uuid) => !inventoryUuids.has(uuid));
    if (extra.length > 0) throw new Error(`Classification contains ${extra.length} unknown image UUID(s): ${extra.slice(0, 3).join(', ')}`);

    const unresolved = [];
    const compiled = [];
    for (const image of inventory) {
        const reviewed = decisions.get(image.uuid);
        const decision = reviewed?.decision;
        if (reviewed && reviewed.sourceBytes !== image.sourceSize) {
            throw new Error(
                `Classification is stale for ${image.uuid}: expected ${image.sourceSize} bytes, got ${reviewed.sourceBytes}`,
            );
        }
        if (!reviewed || decision?.approved !== true || !['lossy', 'lossless'].includes(decision.mode)) {
            unresolved.push(image.uuid);
            continue;
        }
        if (decision.mode === 'lossy' && (!Number.isFinite(decision.quality) || decision.quality < 0 || decision.quality > 100)) {
            throw new Error(`Reviewed lossy image must have quality 0-100: ${image.uuid}`);
        }
        compiled.push({
            uuid: image.uuid,
            bundle: image.bundle,
            mode: decision.mode,
            ...(decision.mode === 'lossy' ? { quality: decision.quality } : {}),
        });
    }
    if (unresolved.length > 0) {
        throw new Error(`Classification has ${unresolved.length} unapproved or invalid image decision(s): ${unresolved.slice(0, 3).join(', ')}`);
    }
    return compiled;
}

export function compileTarget300Images(inventory, classification) {
    if (classification?.version !== 1 || classification?.kind !== 'resource-codec-image-classification') {
        throw new Error('Target-300 preset requires a version 1 resource-codec-image-classification file');
    }
    const classifications = new Map(classification.images.map((image) => [image.uuid, image]));
    const compiled = [];
    for (const image of inventory) {
        const classified = classifications.get(image.uuid);
        if (!classified) throw new Error(`Target-300 classification is missing image: ${image.uuid}`);
        if (classified.sourceBytes !== image.sourceSize) {
            throw new Error(
                `Classification is stale for ${image.uuid}: expected ${image.sourceSize} bytes, got ${classified.sourceBytes}`,
            );
        }
        compiled.push(classified.assetClass === 'ui-sensitive'
            ? { uuid: image.uuid, bundle: image.bundle, codec: 'webp', mode: 'lossless' }
            : {
                uuid: image.uuid,
                bundle: image.bundle,
                codec: 'avif',
                mode: 'lossy',
                quality: 50,
                alphaQuality: 70,
                speed: 8,
            });
    }
    return compiled;
}

export async function generatePolicy({ input, classification, preset = 'quality-safe' }) {
    if (!['quality-safe', 'target-300'].includes(preset)) {
        throw new Error(`Unknown resource codec preset: ${preset}`);
    }
    const inputRoot = path.resolve(input);
    const bundle = 'resources';
    const nativeRoot = path.join(inputRoot, 'assets', bundle, 'native');
    const config = JSON.parse(await readFile(path.join(inputRoot, 'assets', bundle, 'config.json'), 'utf8'));
    const musicUuids = buildMusicUuidSet(config);
    const nativeFiles = await listFiles(nativeRoot);

    const imageInventory = [];
    const audio = [];
    let keptMusic = 0;

    for (const filePath of nativeFiles) {
        const extension = path.extname(filePath).toLowerCase();
        if (extension !== '.png' && extension !== '.mp3') continue;
        const uuid = path.basename(filePath, extension);

        if (extension === '.png') {
            const sourceSize = (await stat(filePath)).size;
            imageInventory.push({ uuid, bundle, sourceSize });
            continue;
        }

        if (musicUuids.has(nativeUuidKey(uuid))) {
            keptMusic += 1;
            continue;
        }
        audio.push(preset === 'target-300'
            ? { uuid, bundle, monoBitrateKbps: 80, stereoBitrateKbps: 112 }
            : { uuid, bundle });
    }

    imageInventory.sort((left, right) => left.uuid.localeCompare(right.uuid));
    audio.sort((left, right) => left.uuid.localeCompare(right.uuid));

    const reviewedClassification = classification
        ? JSON.parse(await readFile(path.resolve(classification), 'utf8'))
        : null;
    const images = preset === 'target-300'
        ? compileTarget300Images(imageInventory, reviewedClassification)
        : reviewedClassification
            ? compileReviewedImages(imageInventory, reviewedClassification)
            : imageInventory.map(({ sourceSize, ...image }) => ({ ...image, ...classifyImage(sourceSize) }));

    return {
        version: 1,
        name: preset === 'target-300'
            ? 'target-300-avif-aac-trial'
            : reviewedClassification
            ? 'quality-safe-v1-reviewed-classification'
            : 'quality-safe-v1-build-output-trial',
        generatedAt: new Date().toISOString(),
        trialOnly: preset === 'target-300' || !reviewedClassification,
        rules: {
            images: preset === 'target-300'
                ? 'non-UI: AVIF 10-bit YUV444 q50 alpha70; UI-sensitive: lossless WebP'
                : reviewedClassification
                ? 'reviewed per-resource image classification'
                : '>1 MiB: WebP q90 with lossless alpha; <=1 MiB: lossless WebP',
            audio: preset === 'target-300'
                ? 'non-music MP3: AAC-LC 80 kbps mono / 112 kbps stereo when smaller'
                : 'non-music MP3: AAC-LC 128 kbps mono / 160 kbps stereo when smaller',
            music: 'resources with logical paths under music/ remain MP3',
        },
        summary: {
            images: images.length,
            avifImages: images.filter((entry) => entry.codec === 'avif').length,
            webpImages: images.filter((entry) => (entry.codec ?? 'webp') === 'webp').length,
            lossyImages: images.filter((entry) => entry.mode === 'lossy').length,
            losslessImages: images.filter((entry) => entry.mode === 'lossless').length,
            audio: audio.length,
            keptMusic,
        },
        images,
        audio,
    };
}

function parseArguments(argv) {
    const values = {};
    for (let index = 0; index < argv.length; index += 2) {
        const name = argv[index];
        const value = argv[index + 1];
        if (!name?.startsWith('--') || !value) throw new Error(`Invalid argument near ${name ?? '<end>'}`);
        values[name.slice(2)] = value;
    }
    for (const required of ['input', 'output']) {
        if (!values[required]) throw new Error(`Missing --${required}`);
    }
    return values;
}

async function main() {
    const args = parseArguments(process.argv.slice(2));
    const policy = await generatePolicy({
        input: args.input,
        classification: args.classification,
        preset: args.preset,
    });
    const outputPath = path.resolve(args.output);
    await writeFile(outputPath, `${JSON.stringify(policy, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(policy.summary));
    console.log(`Policy: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
