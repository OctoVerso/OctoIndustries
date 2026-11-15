import { createServer } from 'node:http';

const canonicalOrigin = 'https://octo-industries-hub-web.onrender.com';

export function createLegacyDomainRedirectServer() {
  return createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', canonicalOrigin);
    if (request.method === 'GET' && requestUrl.pathname === '/healthz') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    const destination = new URL(canonicalOrigin);
    destination.pathname = requestUrl.pathname;
    destination.search = requestUrl.search;
    response.writeHead(['GET', 'HEAD'].includes(request.method || '') ? 308 : 307, {
      'Cache-Control': 'no-store',
      Location: destination.href,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end();
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT) || 3000;
  createLegacyDomainRedirectServer().listen(port, '0.0.0.0', () => {
    console.log(`Legacy-domain redirect listening on port ${port}`);
  });
}
