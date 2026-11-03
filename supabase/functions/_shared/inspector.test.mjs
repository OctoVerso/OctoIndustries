import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGamePage, inspectGame, isPublicAddress } from './inspector.js';

const page = (body, init = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
const publicDns = async () => ['93.184.216.34'];

test('private, loopback, link-local and mapped addresses are rejected', () => {
  for (const address of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '0.0.0.0', '::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fd00::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress('93.184.216.34'), true);
  assert.equal(isPublicAddress('2606:2800:220:1::1'), true);
});

test('unsafe URLs are refused before any request is made', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return page(''); };
  for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'https://user:pw@example.com/', 'ftp://example.com/', 'https://example.com:8443/', 'http://169.254.169.254/latest']) {
    await assert.rejects(fetchGamePage(url, { resolve: publicDns, fetcher }), (error) => error.status === 400, url);
  }
  await assert.rejects(fetchGamePage('https://rebind.example/', { resolve: async () => ['10.0.0.5'], fetcher }), (error) => error.status === 400);
  assert.equal(calls, 0);
});

test('redirects are re-validated and capped', async () => {
  const fetcher = async (url) => (url.hostname === 'start.example'
    ? new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })
    : page('x'));
  await assert.rejects(fetchGamePage('https://start.example/', { resolve: publicDns, fetcher }), (error) => error.status === 400);
  const loop = async () => new Response(null, { status: 302, headers: { location: 'https://loop.example/' } });
  await assert.rejects(fetchGamePage('https://loop.example/', { resolve: publicDns, fetcher: loop }), /redirected too many times/);
});

test('non-HTML, error statuses and oversized pages are rejected', async () => {
  const options = (response) => ({ resolve: publicDns, fetcher: async () => response });
  await assert.rejects(fetchGamePage('https://a.example/', options(new Response('{}', { headers: { 'content-type': 'application/json' } }))), /HTML/);
  await assert.rejects(fetchGamePage('https://a.example/', options(page('x', { status: 404 }))), /HTTP 404/);
  await assert.rejects(fetchGamePage('https://a.example/', options(page('x'.repeat(1024 * 1024 + 1)))), /1 MB/);
});

test('page scan reports title, engine and resources', async () => {
  const html = '<title>Cool &amp; Game</title><script src="game.js"></script><img src="https://cdn.example/a.png"><script>var p="Phaser"</script>';
  const result = await inspectGame('https://games.example/play/', { resolve: publicDns, fetcher: async () => page(html) });
  assert.equal(result.title, 'Cool & Game');
  assert.equal(result.engine, 'Phaser');
  assert.equal(result.resourceCount, 2);
  assert.equal(result.externalCount, 1);
  assert.equal(result.resources[0].url, 'https://games.example/play/game.js');
});
