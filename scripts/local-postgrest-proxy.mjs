import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1:54322');
    const match = /^\/rest\/v1(?:\/|$)/.exec(url.pathname);
    if (!match || !['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) {
      response.writeHead(404, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (['connection', 'content-length', 'host', 'transfer-encoding'].includes(name.toLowerCase())) continue;
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 128 * 1024) {
        response.writeHead(413, { 'Cache-Control': 'no-store' }).end('Request too large.');
        return;
      }
      chunks.push(chunk);
    }
    const path = url.pathname.replace(/^\/rest\/v1/, '') || '/';
    const upstream = await fetch(`http://127.0.0.1:54323${path}${url.search}`, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? undefined : Buffer.concat(chunks),
      signal: AbortSignal.timeout(30_000),
    });
    const responseHeaders = new Headers(upstream.headers);
    for (const name of ['connection', 'content-length', 'transfer-encoding']) responseHeaders.delete(name);
    responseHeaders.set('Cache-Control', 'no-store');
    response.writeHead(upstream.status, Object.fromEntries(responseHeaders));
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    if (!response.headersSent) response.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: 'The isolated local database is unavailable.' }));
  }
});

server.listen(54322, '127.0.0.1', () => {
  console.log('Local Supabase REST path adapter listening on 127.0.0.1:54322.');
});

function stop() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.on('error', (error) => {
    console.error(`Local database path adapter failed: ${error.message}`);
    process.exitCode = 1;
  });
}
