import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPagesLite } from '../scripts/build-pages-lite.mjs';

test('Pages uses a revision namespace without changing the complete game input', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pages-lite-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = path.join(root, 'docs'), output = path.join(root, 'pages');
    const revision = 'a'.repeat(40);
    const files = {
        'index.html': '<html><head></head><body><script>System.import(\'./index.js\')</script></body></html>',
        'assets/resources/config.json': '{"paths":{},"packs":{},"uuids":[],"types":[]}',
        'game-audio.js': 'export function initializeGameAudio() {}',
        'audio/manifest.json': '{}',
        'CNAME': 'play.pvzge.com', '.nojekyll': '', 'ads.txt': 'ads',
    };
    await mkdir(path.join(input, 'assets/resources/native'), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(input, name)), { recursive: true });
        await writeFile(path.join(input, name), content);
    }
    await buildPagesLite({ input, output, revision });
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    assert.ok(html.indexOf('<base href=') > html.indexOf('<head>'));
    assert.ok(html.includes(`<base href="releases/${revision}/">`));
    const info = JSON.parse(await readFile(path.join(output, 'build-info.json'), 'utf8'));
    assert.deepEqual(info, { edition: 'lite', revision, assetBase: `releases/${revision}/` });
    for (const page of ['https://play.pvzge.com/', 'https://someone.github.io/pvzge_web/']) {
        const base = new URL(info.assetBase, page);
        assert.equal(new URL('audio/manifest.json', base).href, `${page}releases/${revision}/audio/manifest.json`);
    }
    for (const [name, content] of Object.entries(files)) {
        assert.equal(await readFile(path.join(input, name), 'utf8'), content);
        assert.equal(await readFile(path.join(output, 'releases', revision, name), 'utf8'), content);
    }
    assert.equal(await readFile(path.join(output, 'ads.txt'), 'utf8'), 'ads');
    await assert.rejects(buildPagesLite({ input, output, revision }), /already exists/);
    await assert.rejects(buildPagesLite({ input, output: path.join(root, 'bad'), revision: 'master' }), /full Git commit/);
    await writeFile(path.join(input, 'index.html'), '<script>System.import(\'./index.js\')</script>');
    await assert.rejects(buildPagesLite({ input, output: path.join(root, 'failed'), revision }), /Expected a Web index/);
    assert.deepEqual((await readdir(root)).sort(), ['docs', 'pages']);
});

test('Pages installs offline support at the site root and works without CNAME', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pages-offline-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = path.join(root, 'docs'), output = path.join(root, 'pages');
    const revision = 'b'.repeat(40);
    const files = {
        'index.html': '<html><head></head><body><script>System.import(\'./index.js\')</script></body></html>',
        'assets/resources/config.json': '{"paths":{},"packs":{},"uuids":[],"types":[]}',
        'game-audio.js': 'export function initializeGameAudio() {}',
        'audio/manifest.json': '{}',
        'audio/a b.mp3': 'x',
        'sw.js': "const CACHE_VERSION = 'v1';\nconst RELEASE = '';\nself.x = 1;",
        'manifest.webmanifest': '{"name":"PvZ","start_url":"./","scope":"./"}',
        '.nojekyll': '', 'ads.txt': 'ads',
    };
    await mkdir(path.join(input, 'assets/resources/native'), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(input, name)), { recursive: true });
        await writeFile(path.join(input, name), content);
    }
    await buildPagesLite({ input, output, revision });
    const sw = await readFile(path.join(output, 'sw.js'), 'utf8');
    assert.ok(sw.includes(`const CACHE_VERSION = '${revision.slice(0, 12)}';`));
    assert.ok(sw.includes(`const RELEASE = 'releases/${revision}/';`));
    const payload = path.join(output, 'releases', revision);
    const manifest = JSON.parse(await readFile(path.join(payload, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.start_url, '../../');
    assert.equal(new URL(manifest.start_url, `https://u.github.io/repo/releases/${revision}/manifest.webmanifest`).href, 'https://u.github.io/repo/');
    const list = JSON.parse(await readFile(path.join(payload, 'asset-list.json'), 'utf8'));
    const paths = list.files.map(f => f.p);
    assert.ok(paths.includes('audio/a%20b.mp3'));
    assert.ok(paths.includes('index.html'));
    assert.ok(!paths.includes('sw.js'));
    assert.ok(!paths.includes('asset-list.json'));
    const mp3 = list.files.find(f => f.p === 'audio/a%20b.mp3');
    assert.equal(mp3.s, 1);
    assert.match(mp3.h, /^[0-9a-f]{16}$/);
    await assert.rejects(readFile(path.join(output, 'CNAME'), 'utf8'), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(input, 'manifest.webmanifest'), 'utf8'), files['manifest.webmanifest']);
});
