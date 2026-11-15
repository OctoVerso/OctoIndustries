import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { nativeUuidKey } from './generate-resource-codec-policy.mjs';

const IMAGE_RULES = [
    {
        assetClass: 'character-atlas',
        prefixes: ['plants/', 'zombies/', 'projectiles/', 'tombstones/', 'armors/', 'dinosaurs/'],
        decision: { mode: 'lossy', quality: 95 },
    },
    {
        assetClass: 'environment-art',
        prefixes: ['worldmaps/', 'lawns/', 'stages/'],
        decision: { mode: 'lossy', quality: 90 },
    },
    {
        assetClass: 'ui-sensitive',
        prefixes: ['note/', 'ui/', 'font/', 'fonts/'],
        exactPrefixes: ['cursor'],
        decision: { mode: 'lossless' },
    },
];

async function listFiles(root) {
    const files = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) files.push(...await listFiles(entryPath));
        else if (entry.isFile()) files.push(entryPath);
    }
    return files;
}

export function classifyLogicalPath(logicalPath) {
    for (const rule of IMAGE_RULES) {
        if (rule.prefixes.some((prefix) => logicalPath.startsWith(prefix))) return rule.assetClass;
        if (rule.exactPrefixes?.some((prefix) => logicalPath.startsWith(prefix))) return rule.assetClass;
    }
    return 'unknown';
}

export function recommendImageDecision(logicalPaths, evidenceKinds = []) {
    const pathClasses = logicalPaths.map(classifyLogicalPath);
    const uniqueClasses = [...new Set(pathClasses)];
    const assetClass = logicalPaths.length === 0
        ? 'unmapped'
        : uniqueClasses.length === 1 ? uniqueClasses[0] : 'mixed';
    const rule = IMAGE_RULES.find((entry) => entry.assetClass === assetClass);

    let confidence = 'none';
    if (rule && evidenceKinds.includes('image-path')) confidence = 'high';
    else if (rule && logicalPaths.length === 1) confidence = 'medium';
    else if (rule) confidence = 'low';

    return {
        assetClass,
        confidence,
        decision: {
            approved: false,
            ...(rule?.decision ?? { mode: null }),
        },
        reviewReason: logicalPaths.length === 0
            ? 'No logical path could be recovered from this build output.'
            : rule
                ? 'Build-output inference must be checked against the original Cocos asset.'
                : 'Logical paths are unknown or span multiple semantic classes.',
    };
}

function addEvidence(evidenceByNative, nativeUuid, logicalPath, kind, truncatedNativeUuids = null) {
    let paths = evidenceByNative.get(nativeUuid);
    if (!paths) {
        paths = new Map();
        evidenceByNative.set(nativeUuid, paths);
    }
    let kinds = paths.get(logicalPath);
    if (!kinds) {
        if (paths.size >= 64) {
            truncatedNativeUuids?.add(nativeUuid);
            return;
        }
        kinds = new Set();
        paths.set(logicalPath, kinds);
    }
    kinds.add(kind);
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

export async function auditImageSemantics({ input }) {
    const inputRoot = path.resolve(input);
    const bundleRoot = path.join(inputRoot, 'assets', 'resources');
    const config = JSON.parse(await readFile(path.join(bundleRoot, 'config.json'), 'utf8'));
    const packCache = new Map();

    async function readPack(packId) {
        if (!packCache.has(packId)) {
            const packPath = path.join(bundleRoot, 'import', packId.slice(0, 2), `${packId}.json`);
            packCache.set(packId, JSON.parse(await readFile(packPath, 'utf8')));
        }
        return packCache.get(packId);
    }

    const textureToNative = new Map();
    const dependencyGraph = new Map();
    for (const [packId, uuidIndexes] of Object.entries(config.packs ?? {})) {
        const pack = await readPack(packId);
        if (pack?.type === 'cc.Texture2D') {
            for (let position = 0; position < uuidIndexes.length; position += 1) {
                const nativeUuid = pack.data?.[position]?.[1]?.[0];
                if (typeof nativeUuid === 'string') {
                    textureToNative.set(config.uuids[uuidIndexes[position]], nativeUuid);
                }
            }
        }
        if (Array.isArray(pack) && Array.isArray(pack[1])) {
            for (const uuidIndex of uuidIndexes) {
                dependencyGraph.set(config.uuids[uuidIndex], pack[1]);
            }
        }
    }

    const evidenceByNative = new Map();
    const truncatedNativeUuids = new Set();
    for (const [uuidIndex, pathEntry] of Object.entries(config.paths ?? {})) {
        const assetType = config.types[pathEntry[1]];
        const assetUuid = config.uuids[Number(uuidIndex)];
        if (assetType === 'cc.ImageAsset') {
            addEvidence(evidenceByNative, assetUuid, pathEntry[0], 'image-path');
        }
        if (assetType === 'cc.Texture2D' && textureToNative.has(assetUuid)) {
            addEvidence(evidenceByNative, textureToNative.get(assetUuid), pathEntry[0], 'texture-path');
        }

        const queue = [[assetUuid, 0]];
        const seenDepth = new Map([[assetUuid, 0]]);
        while (queue.length > 0) {
            const [uuid, depth] = queue.shift();
            const nativeUuid = textureToNative.get(uuid);
            if (nativeUuid && depth > 0) {
                addEvidence(
                    evidenceByNative,
                    nativeUuid,
                    pathEntry[0],
                    `dependency-depth-${depth}`,
                    truncatedNativeUuids,
                );
                continue;
            }
            if (depth >= 4) continue;
            for (const dependencyUuid of dependencyGraph.get(uuid) ?? []) {
                if ((seenDepth.get(dependencyUuid) ?? Number.POSITIVE_INFINITY) <= depth + 1) continue;
                seenDepth.set(dependencyUuid, depth + 1);
                queue.push([dependencyUuid, depth + 1]);
            }
        }
    }

    const imageFiles = (await listFiles(path.join(bundleRoot, 'native')))
        .filter((filePath) => path.extname(filePath).toLowerCase() === '.png');
    const images = [];
    for (const filePath of imageFiles) {
        const uuid = path.basename(filePath, '.png');
        const evidence = evidenceByNative.get(nativeUuidKey(uuid)) ?? new Map();
        const logicalPaths = [...evidence.keys()].sort();
        const evidenceKinds = [...new Set([...evidence.values()].flatMap((kinds) => [...kinds]))].sort();
        const sourceBytes = (await stat(filePath)).size;
        images.push({
            uuid,
            bundle: 'resources',
            sourceBytes,
            logicalPaths,
            evidenceKinds,
            ...recommendImageDecision(logicalPaths, evidenceKinds),
        });
    }
    images.sort((left, right) => left.uuid.localeCompare(right.uuid));

    const byClass = {};
    const byConfidence = {};
    for (const image of images) {
        byClass[image.assetClass] ??= { files: 0, bytes: 0 };
        byClass[image.assetClass].files += 1;
        byClass[image.assetClass].bytes += image.sourceBytes;
        byConfidence[image.confidence] ??= { files: 0, bytes: 0 };
        byConfidence[image.confidence].files += 1;
        byConfidence[image.confidence].bytes += image.sourceBytes;
    }

    const withLogicalPaths = images.filter((image) => image.logicalPaths.length > 0);
    const withoutLogicalPaths = images.filter((image) => image.logicalPaths.length === 0);

    return {
        version: 1,
        kind: 'resource-codec-image-classification',
        generatedAt: new Date().toISOString(),
        source: inputRoot,
        sourceLevelMetadataAvailable: false,
        summary: {
            images: images.length,
            sourceBytes: images.reduce((total, image) => total + image.sourceBytes, 0),
            withLogicalPaths: withLogicalPaths.length,
            withLogicalPathBytes: withLogicalPaths.reduce((total, image) => total + image.sourceBytes, 0),
            withoutLogicalPaths: withoutLogicalPaths.length,
            withoutLogicalPathBytes: withoutLogicalPaths.reduce((total, image) => total + image.sourceBytes, 0),
            truncatedLogicalPathSets: truncatedNativeUuids.size,
            approved: 0,
            byClass,
            byConfidence,
        },
        images,
    };
}

async function main() {
    const args = parseArguments(process.argv.slice(2));
    const audit = await auditImageSemantics({ input: args.input });
    const outputPath = path.resolve(args.output);
    await writeFile(outputPath, `${JSON.stringify(audit, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(audit.summary));
    console.log(`Classification candidate: ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
