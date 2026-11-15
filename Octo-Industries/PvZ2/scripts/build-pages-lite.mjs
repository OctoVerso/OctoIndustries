import { copyFile, lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildWebLite, parseWebLiteArguments, validateWebLitePaths } from './build-web-lite.mjs';

export async function buildPagesLite({ input, output, revision }) {
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('A full Git commit SHA is required for the Pages asset namespace');
    input = await realpath(input);
    output = path.join(await realpath(path.dirname(path.resolve(output))), path.basename(output));
    validateWebLitePaths(input, output);
    try {
        await lstat(output);
        throw new Error(`Output already exists: ${output}`);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(output);
    try {
        // Relative, so it works on a custom domain and on <user>.github.io/<repo>/ alike.
        const assetBase = `releases/${revision}/`;
        const releases = path.join(output, 'releases');
        await mkdir(releases);
        const payload = path.join(releases, revision);
        const summary = await buildWebLite({ input, output: payload });
        const html = await readFile(path.join(payload, 'index.html'), 'utf8');
        if (!html.includes('<head>') || /<base\b/i.test(html)) throw new Error('Expected a Web index with one head and no existing base URL');
        await writeFile(path.join(output, 'index.html'), html.replace('<head>', `<head>\n  <base href="${assetBase}">`));
        for (const name of ['CNAME', '.nojekyll', 'ads.txt']) {
            if (await exists(path.join(payload, name))) await copyFile(path.join(payload, name), path.join(output, name));
        }
        await installOfflineSupport({ payload, output, revision });
        await writeFile(path.join(output, 'build-info.json'), `${JSON.stringify({ edition: 'lite', revision, assetBase }, null, 2)}\n`);
        return summary;
    } catch (error) {
        await rm(output, { recursive: true, force: true });
        throw error;
    }
}

async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

async function listFiles(root, dir = root, files = []) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await listFiles(root, file, files);
        else if (entry.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
    }
    return files;
}

// Offline play: the service worker must sit next to the root index.html to control the page,
// the manifest must point back to that page, and "Download all for offline" needs a file list.
export async function installOfflineSupport({ payload, output, revision }) {
    const swPath = path.join(payload, 'sw.js');
    if (!(await exists(swPath))) return;
    const versionPattern = /const CACHE_VERSION = '[^']*';/g;
    const releasePattern = /const RELEASE = '[^']*';/g;
    const sw = await readFile(swPath, 'utf8');
    if ([...sw.matchAll(versionPattern)].length !== 1) throw new Error('sw.js must declare exactly one CACHE_VERSION');
    if ([...sw.matchAll(releasePattern)].length !== 1) throw new Error('sw.js must declare exactly one RELEASE');
    await writeFile(path.join(output, 'sw.js'), sw
        .replace(versionPattern, `const CACHE_VERSION = '${revision.slice(0, 12)}';`)
        .replace(releasePattern, `const RELEASE = 'releases/${revision}/';`));

    const manifestPath = path.join(payload, 'manifest.webmanifest');
    if (await exists(manifestPath)) {
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        manifest.start_url = '../../';
        manifest.scope = '../../';
        await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    const skip = new Set(['sw.js', 'asset-list.json', 'CNAME', '.nojekyll', 'sync/firebase-config.example.js']);
    const files = (await listFiles(payload))
        .filter(name => !skip.has(name) && !name.split('/').some(part => part.startsWith('.')) && !name.endsWith('.map'))
        .sort();
    // Each entry carries a content hash so the service worker can keep unchanged files across
    // deploys instead of downloading the whole game again.
    let bytes = 0;
    const entries = [];
    for (const name of files) {
        const data = await readFile(path.join(payload, name));
        bytes += data.length;
        entries.push({
            p: name.split('/').map(encodeURIComponent).join('/'),
            h: createHash('sha1').update(data).digest('hex').slice(0, 16),
            s: data.length,
        });
    }
    const list = { generatedAt: new Date().toISOString(), count: files.length, bytes, files: entries };
    await writeFile(path.join(payload, 'asset-list.json'), JSON.stringify(list));
    console.log(`Offline pack: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    buildPagesLite({ ...parseWebLiteArguments(process.argv.slice(2)), revision: process.env.GITHUB_SHA }).catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
