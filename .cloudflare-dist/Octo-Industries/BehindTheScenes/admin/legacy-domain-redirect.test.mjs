import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLegacyDomainRedirectServer } from './legacy-domain-redirect.mjs';

test('legacy domain redirects site paths and queries to the canonical domain', async (t) => {
  const server = createLegacyDomainRedirectServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/admin/?section=inquiries`, {
    redirect: 'manual',
  });

  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://octo-industries-hub-web.onrender.com/admin/?section=inquiries');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('legacy domain health checks stay local and non-GET requests preserve their method', async (t) => {
  const server = createLegacyDomainRedirectServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());

  const address = server.address();
  const health = await fetch(`http://127.0.0.1:${address.port}/healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const response = await fetch(`http://127.0.0.1:${address.port}/api/feedback`, {
    method: 'POST',
    body: '{}',
    redirect: 'manual',
  });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://octo-industries-hub-web.onrender.com/api/feedback');
});
