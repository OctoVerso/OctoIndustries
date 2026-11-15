import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { patchWebIndexForAvif } from '../scripts/resource-codec.mjs';
import { buildWebLite, parseWebLiteArguments, validateWebLitePaths } from '../scripts/build-web-lite.mjs';

const webEntry = `<script>
    import('./game-audio.js')
      .then(function (audio) { return audio.initializeGameAudio(); })
      .then(function () { return System.import('./index.js'); })
      .catch(function (err) { console.error(err); });
  </script>`;

test('Web Lite preserves audio initialization before AVIF registration and game launch', async () => {
    for (const registrationFails of [false, true]) {
        const events = [];
        const system = { import: async name => { events.push(name); return {}; } };
        const patched = patchWebIndexForAvif(webEntry);
        const source = patched.slice('<script>'.length, -'</script>'.length).replace(/(?<!\.)\bimport\(/g, 'importModule(');
        await vm.runInNewContext(source, {
            System: system, window: { System: system }, URL, document: { baseURI: 'https://game.test/releases/x/' },
            console: { error: error => events.push(error.message) },
            importModule: async name => {
                events.push(name);
                return name.endsWith('game-audio.js')
                    ? { initializeGameAudio: async () => { events.push('audio-ready'); } }
                    : { registerAvifSupport: () => {
                        events.push('avif-ready');
                        if (registrationFails) throw new Error('registration-failed');
                    } };
            },
        });
        assert.deepEqual(events, ['./game-audio.js', 'audio-ready', 'https://game.test/releases/x/resource-codec-avif-support.js', 'cc', 'avif-ready',
            registrationFails ? 'registration-failed' : './index.js']);
    }
    assert.throws(() => patchWebIndexForAvif('<html></html>'), /exactly one/);
    assert.throws(() => patchWebIndexForAvif(webEntry + webEntry), /exactly one/);
});

test('Web Lite rejects overlapping source/output and invalid arguments', () => {
    const input = path.resolve('/game/docs');
    for (const output of [input, path.join(input, 'lite'), path.dirname(input)]) {
        assert.throws(() => validateWebLitePaths(input, output), /separate/);
    }
    assert.throws(() => parseWebLiteArguments(['--output']), /followed by a path/);
    assert.throws(() => parseWebLiteArguments(['--variant', 'lite']), /followed by a path/);
});

test('Web build preserves original files and web integration; failures leave no partial output', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'web-lite-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const input = path.join(root, 'original');
    const output = path.join(root, 'lite');
    const files = {
        'index.html': webEntry,
        'assets/resources/config.json': JSON.stringify({ paths: {}, packs: {}, uuids: [], types: [] }),
        'audio/manifest.json': '{"intro":"Music/intro.mp3"}',
        'game-audio.js': 'export async function initializeGameAudio() {}',
        'tmpPatch.js': 'window.electronAPI = {};',
        'CNAME': 'play.pvzge.com',
        '.nojekyll': '',
    };
    await mkdir(path.join(input, 'assets/resources/native'), { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(input, name)), { recursive: true });
        await writeFile(path.join(input, name), content);
    }
    const result = await buildWebLite({ input, output });
    assert.equal(result.converted, 0);
    for (const [name, content] of Object.entries(files)) {
        assert.equal(await readFile(path.join(input, name), 'utf8'), content);
        assert.equal(await readFile(path.join(output, name), 'utf8'), content);
    }
    await assert.rejects(readFile(path.join(output, 'resource-codec-report.json')), { code: 'ENOENT' });
    await assert.rejects(buildWebLite({ input, output }), /already exists/);
    await symlink(input, path.join(root, 'source-link'));
    await assert.rejects(buildWebLite({ input, output: path.join(root, 'source-link/lite') }), /separate/);
    await assert.rejects(buildWebLite({ input, output: path.join(root, 'source-link/new-parent/lite') }), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(input, 'new-parent')), { code: 'ENOENT' });
    await rm(path.join(input, 'assets/resources/config.json'));
    await assert.rejects(buildWebLite({ input, output: path.join(root, 'failed') }), { code: 'ENOENT' });
    assert.deepEqual((await readdir(root)).sort(), ['lite', 'original', 'source-link']);
});
