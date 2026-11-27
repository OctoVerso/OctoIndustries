import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPublicPath } from './publication-policy.mjs';

export function createStaticServer(directory, prefix = '') {
  const root = resolve(directory);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.xml': 'application/xml' };
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (process.env.OCTO_PREVIEW_API_PROXY === '1' && /^\/functions\/v1\/(?:admin|jobs|catalog|feedback|proposals|roadmap)(?:\/|$)/.test(pathname)) {
        if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) { response.writeHead(405).end(); return; }
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers)) {
          if (['connection', 'content-length', 'host', 'transfer-encoding'].includes(name.toLowerCase())) continue;
          if (typeof value === 'string') headers.set(name, value);
          else if (Array.isArray(value)) headers.set(name, value.join(', '));
        }
        const chunks = [];
        let bodySize = 0;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
          for await (const chunk of request) {
            bodySize += chunk.length;
            if (bodySize > 128 * 1024) {
              response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
              response.end(JSON.stringify({ error: 'Preview API request body is too large.' }));
              return;
            }
            chunks.push(chunk);
          }
        }
        let upstream;
        try {
          upstream = await fetch(`http://127.0.0.1:54321${requestUrl.pathname}${requestUrl.search}`, {
            method: request.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
            signal: AbortSignal.timeout(30_000),
          });
        } catch {
          response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ error: 'The isolated admin preview API is unavailable.' }));
          return;
        }
        response.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(Buffer.from(await upstream.arrayBuffer()));
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      if (prefix && !pathname.startsWith(prefix + '/')) { response.writeHead(404).end(); return; }
      pathname = pathname.slice(prefix.length).replace(/^\/+/, '');
      if (!isPublicPath(pathname)) { response.writeHead(404).end(); return; }
      let file = resolve(root, pathname);
      if (file !== root && !file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
      let metadata = await stat(file);
      if (metadata.isDirectory()) { file = resolve(file, 'index.html'); metadata = await stat(file); }
      const real = await realpath(file), realRoot = await realpath(root);
      if (!real.startsWith(realRoot + sep)) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': metadata.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      if (request.method === 'HEAD') response.end();
      else createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createStaticServer(process.argv[2] || 'dist', process.env.STATIC_PREFIX || '');
  const port = Number(process.env.PORT || 4173);
  server.listen(port, '0.0.0.0', () => console.log(`Static preview: http://127.0.0.1:${port}${process.env.STATIC_PREFIX || ''}/`));
}
