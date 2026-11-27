import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./config.js', import.meta.url), 'utf8');

function configure(hostname, port = '', override = undefined) {
  const window = {};
  if (override) window.OCTO_CONFIG = override;
  const protocol = hostname.endsWith('.app.github.dev') ? 'https:' : 'http:';
  const origin = `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  runInNewContext(source, {
    window,
    location: { hostname, port, origin },
    document: { currentScript: { src: 'https://preview.example/Octo-Industries/BehindTheScenes/hub/config.js' } },
    URL,
  });
  return window.OCTO_CONFIG;
}

test('Codespaces previews use the same-origin isolated preview proxy', () => {
  const config = configure('codespace-123-8080.app.github.dev');
  assert.equal(config.apiUrl('/api/admin/session'), 'https://codespace-123-8080.app.github.dev/functions/v1/admin/session');
  assert.equal(config.functionsUrl.includes('supabase.co'), false);
});

test('Codespaces preview configuration cannot override the isolated same-origin proxy', () => {
  const config = configure('codespace-123-8080.app.github.dev', '', {
    functionsUrl: 'https://staging-project.supabase.co/functions/v1',
  });
  assert.equal(config.apiUrl('/api/admin/session'), 'https://codespace-123-8080.app.github.dev/functions/v1/admin/session');
});

test('localhost previews retain their local function endpoint', () => {
  const config = configure('localhost', '8080');
  assert.equal(config.apiUrl('/api/admin/session'), 'http://localhost:8080/functions/v1/admin/session');
});

test('localhost previews can explicitly disable their local API proxy', () => {
  const config = configure('localhost', '8080', { functionsUrl: '' });
  assert.throws(() => config.apiUrl('/api/admin/session'), /APIs are disabled/);
});
