export const bytesToHex = (bytes) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
export const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16));

export async function digest(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export function randomHex(byteLength = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  const origin = request.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info, x-ticket-access-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function bodyJson(request) {
  const text = await request.text();
  if (text.length > 96 * 1024) throw httpError('Request body is too large.', 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError('Request body must be valid JSON.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError('Request body must be a JSON object.', 400);
  return body;
}

export async function clientKey(request) {
  const forwarded = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return digest(forwarded || request.headers.get('x-real-ip') || 'unknown');
}

export function routePath(request, name) {
  const { pathname } = new URL(request.url);
  const match = new RegExp(`^(?:/functions/v1)?/${name}(/.*)?$`).exec(pathname.replace(/\/+$/, '') || '/');
  return match ? match[1] || '/' : null;
}

export async function bumpRateLimit(db, key, windowSeconds) {
  const { data, error } = await db.rpc('bump_rate_limit', { p_key: key, p_window_seconds: windowSeconds });
  if (error) throw new Error(`Rate limiter failed: ${error.message}`);
  return Number(data);
}

export async function logActivity(db, message) {
  const { error } = await db.from('activity').insert({ message, created_at: new Date().toISOString() });
  if (error) throw new Error(`Could not record activity: ${error.message}`);
  const { data, error: readError } = await db.from('activity').select('id').order('id', { ascending: false }).range(100, 1099);
  if (readError) throw new Error(`Could not trim activity history: ${readError.message}`);
  if (data?.length) {
    const { error: deleteError } = await db.from('activity').delete().in('id', data.map((row) => row.id));
    if (deleteError) throw new Error(`Could not trim activity history: ${deleteError.message}`);
  }
}

// Wraps a route handler with CORS, preflight handling and uniform error responses.
export function serve(name, handler) {
  return async (request, env, db) => {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let response;
    try {
      const path = routePath(request, name);
      response = path === null
        ? json({ error: 'Not found.' }, 404)
        : await handler({ request, env, db, path, method: request.method });
    } catch (error) {
      if (error.status) response = json({ error: error.message }, error.status);
      else {
        console.error(`${name} function failed:`, error);
        response = json({ error: 'The service could not complete the request.' }, 500);
      }
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  };
}
