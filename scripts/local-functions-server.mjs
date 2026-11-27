import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { admin, catalog, feedback, jobs, proposals, roadmap } from '../supabase/functions/_shared/handlers.js';

const envFile = process.env.OCTO_ENV_FILE;
if (!envFile) {
  throw new Error('Set OCTO_ENV_FILE to an isolated local preview configuration; refusing to read supabase/.env.local.');
}
const env = Object.fromEntries(readFileSync(envFile, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
  .filter(Boolean)
  .map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2')]));

const supabaseUrl = env.SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^https?:\/\//i.test(supabaseUrl || '') || !serviceRoleKey) {
  throw new Error(`Local functions require valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${envFile}.`);
}
const url = new URL(supabaseUrl);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '54322') {
  throw new Error('Local preview functions may connect only to the loopback PostgREST service on port 54322.');
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const handlers = { admin, catalog, feedback, jobs, proposals, roadmap };
const port = 54321;
const server = createServer(async (nodeRequest, nodeResponse) => {
  try {
    const chunks = [];
    for await (const chunk of nodeRequest) chunks.push(chunk);
    const url = new URL(nodeRequest.url || '/', `http://127.0.0.1:${port}`);
    const headers = new Headers();
    for (const [name, value] of Object.entries(nodeRequest.headers)) {
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }
    const request = new Request(url, {
      method: nodeRequest.method,
      headers,
      body: nodeRequest.method === 'GET' || nodeRequest.method === 'HEAD'
        ? undefined
        : Buffer.concat(chunks),
    });

    const functionName = /^\/functions\/v1\/([a-z-]+)(?:\/|$)/.exec(url.pathname)?.[1];
    const handler = handlers[functionName];
    const response = handler
      ? await handler(request, env, db)
      : new Response(JSON.stringify({ error: 'Function not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    nodeResponse.statusCode = response.status;
    response.headers.forEach((value, name) => nodeResponse.setHeader(name, value));
    nodeResponse.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('Local function bridge failed:', error);
    nodeResponse.statusCode = 500;
    nodeResponse.setHeader('Content-Type', 'application/json');
    nodeResponse.end(JSON.stringify({ error: 'Local function bridge failed.' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local Supabase-compatible admin function listening on http://127.0.0.1:${port}/functions/v1/admin`);
});

function stop() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
