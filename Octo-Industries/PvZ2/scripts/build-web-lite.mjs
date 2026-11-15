import { lstat, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { auditImageSemantics } from './audit-resource-codec-semantics.mjs';
import { generatePolicy } from './generate-resource-codec-policy.mjs';
import { buildCompressedOutput, patchWebIndexForAvif } from './resource-codec.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function parseWebLiteArguments(argv) {
    const args = {
        input: path.resolve(ROOT, 'docs'),
        output: path.resolve(ROOT, '.web-lite-build'),
    };
    for (let index = 0; index < argv.length; index += 2) {
        const option = argv[index];
        const value = argv[index + 1];
        if (!['--input', '--output'].includes(option) || !value || value.startsWith('--')) {
            throw new Error(`Expected --input or --output followed by a path: ${option}`);
        }
        args[option.slice(2)] = path.resolve(value);
    }
    return args;
}

export function validateWebLitePaths(input, output) {
    const contains = (parent, child) => {
        const relative = path.relative(parent, child);
        return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    };
    if (contains(input, output) || contains(output, input)) {
        throw new Error('Web Lite output must be separate from and must not contain the original game');
    }
}

async function directoryBytes(root) {
    let bytes = 0;
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const file = path.join(root, entry.name);
        bytes += entry.isDirectory() ? await directoryBytes(file) : (await stat(file)).size;
    }
    return bytes;
}

export async function buildWebLite({ input, output }) {
    input = await realpath(input);
    output = path.resolve(output);
    validateWebLitePaths(input, output);
    output = path.join(await realpath(path.dirname(output)), path.basename(output));
    validateWebLitePaths(input, output);
    try {
        await lstat(output);
        throw new Error(`Output already exists; choose a new directory: ${output}`);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    // Check the web entry before starting expensive conversion work.
    patchWebIndexForAvif(await readFile(path.join(input, 'index.html'), 'utf8'));
    const temporary = await mkdtemp(path.join(path.dirname(output), '.web-lite-'));
    try {
        const classification = path.join(temporary, 'classification.json');
        const policy = path.join(temporary, 'policy.json');
        const site = path.join(temporary, 'site');
        await writeFile(classification, JSON.stringify(await auditImageSemantics({ input })));
        await writeFile(policy, JSON.stringify(await generatePolicy({ input, classification, preset: 'target-300' })));
        console.log('Converting Web Lite resources (AVIF/WebP/AAC); the original game stays unchanged.');
        const report = await buildCompressedOutput({ input, output: site, policy });
        await rm(path.join(site, 'resource-codec-report.json'));
        const summary = {
            inputBytes: await directoryBytes(input),
            outputBytes: await directoryBytes(site),
            converted: report.results.filter(entry => entry.status === 'converted').length,
            resources: report.results.length,
        };
        await rename(site, output);
        console.log(JSON.stringify(summary));
        console.log(`Web Lite output: ${output}`);
        return summary;
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    buildWebLite(parseWebLiteArguments(process.argv.slice(2))).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
