import {
  bumpRateLimit, bytesToHex, clientKey, hexToBytes, httpError, json, logActivity, randomHex,
} from './http.js';

const sessionSeconds = 8 * 60 * 60;
const challengeSeconds = 2 * 60;
const encoder = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function constantTimeEqual(first, second) {
  const left = encoder.encode(first || '');
  const right = encoder.encode(second || '');
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function parsePasswordHash(value) {
  // Tolerate a pasted "NAME=value" line, surrounding quotes and whitespace from the admin:hash output.
  const cleaned = String(value || '').trim().replace(/^OCTO_ADMIN_PASSWORD_HASH\s*=\s*/, '').replace(/^(['"])(.*)\1$/, '$2').trim();
  const match = /^pbkdf2\$(\d{5,7})\$([a-f\d]{32})\$([a-f\d]{128})$/.exec(cleaned);
  return match ? { iterations: Number(match[1]), salt: match[2], expected: hexToBytes(match[3]) } : null;
}

// Names the failed validation using only shape and lengths, never the secret itself.
export function describePasswordHashProblem(value) {
  if (!value) return { code: 'value_missing', detail: 'secret is empty or unset' };
  const cleaned = String(value).trim().replace(/^OCTO_ADMIN_PASSWORD_HASH\s*=\s*/, '').replace(/^(['"])(.*)\1$/, '$2').trim();
  const parts = cleaned.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return { code: 'part_count_invalid', detail: `expected pbkdf2 plus 3 "$"-separated parts, found ${parts.length} part(s)` };
  const [, iterations, salt, hash] = parts;
  if (!/^\d{5,7}$/.test(iterations)) return { code: 'iterations_invalid', detail: `iterations must be 5-7 digits, found length ${iterations.length}` };
  if (salt.length !== 32) return { code: 'salt_length_invalid', detail: `salt must be 32 characters, found ${salt.length}` };
  if (!/^[a-f\d]{32}$/.test(salt)) return { code: 'salt_characters_invalid', detail: 'salt must be lowercase hex' };
  if (hash.length !== 128) return { code: 'hash_length_invalid', detail: `hash must be 128 characters, found ${hash.length}` };
  if (!/^[a-f\d]{128}$/.test(hash)) return { code: 'hash_characters_invalid', detail: 'hash must be lowercase hex' };
  return { code: 'unknown', detail: 'unknown' };
}

function notConfigured(value) {
  const { code, detail } = describePasswordHashProblem(value);
  return Object.assign(httpError(`Admin login is not configured. Set a valid OCTO_ADMIN_PASSWORD_HASH secret. Reason: ${detail}.`, 503), { reason: code });
}

function sessionSecret(env) {
  const length = String(env.ADMIN_SESSION_SECRET || '').length;
  if (length < 32) {
    const reason = length === 0 ? 'missing_session_secret' : 'invalid_session_secret';
    throw Object.assign(httpError(`Admin login is not configured. Set a random ADMIN_SESSION_SECRET of at least 32 characters. Reason: ${reason} (length ${length}).`, 503), { reason });
  }
  return env.ADMIN_SESSION_SECRET;
}

export async function createSession(env, db, now = Date.now()) {
  const secret = sessionSecret(env);
  const expiresAt = Math.floor(now / 1000) + sessionSeconds;
  const payload = `${expiresAt}.${randomHex(16)}`;
  const { error: cleanupError } = await db.from('admin_sessions').delete()
    .lt('expires_at', new Date(now).toISOString());
  if (cleanupError) throw new Error(`Could not clean up expired admin sessions: ${cleanupError.message}`);
  const { error } = await db.from('admin_sessions').insert({
    session_id: payload,
    expires_at: new Date(expiresAt * 1000).toISOString(),
  });
  if (error) throw new Error(`Could not create admin session: ${error.message}`);
  return { token: `${payload}.${await hmac(secret, `session:${payload}`)}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export async function readSession(request, env, db, now = Date.now()) {
  const match = /^Bearer (\d{10}\.[a-f\d]{32})\.([a-f\d]{64})$/.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  const [, payload, signature] = match;
  if (!constantTimeEqual(await hmac(sessionSecret(env), `session:${payload}`), signature)) return null;
  const expiresAt = Number(payload.split('.')[0]);
  if (expiresAt * 1000 <= now) return null;
  const { data, error } = await db.from('admin_sessions').select('session_id').eq('session_id', payload).maybeSingle();
  if (error) throw new Error(`Could not validate admin session: ${error.message}`);
  return data ? { expiresAt: new Date(expiresAt * 1000).toISOString(), id: payload } : null;
}

export async function requireAdmin({ request, env, db }) {
  const session = await readSession(request, env, db);
  if (!session) throw httpError('Admin authentication required.', 401);
  const count = await bumpRateLimit(db, `admin:${session.id}`, 60);
  if (count > 120) throw httpError('Too many admin requests. Wait a minute and try again.', 429);
  return session;
}

export async function loginChallenge({ request, env, db }) {
  const configured = parsePasswordHash(env.OCTO_ADMIN_PASSWORD_HASH);
  if (!configured) throw notConfigured(env.OCTO_ADMIN_PASSWORD_HASH);
  const secret = sessionSecret(env);
  const key = await clientKey(request);
  if (await bumpRateLimit(db, `login-challenge:${key}`, 60) > 10) {
    throw httpError('Too many login requests. Wait a minute and try again.', 429);
  }
  const expires = Math.floor(Date.now() / 1000) + challengeSeconds;
  const challengeId = `${expires.toString(16).padStart(8, '0')}${randomHex(28)}`;
  const nonce = await hmac(secret, `challenge:${challengeId}:${key}`);
  return json({ challengeId, nonce, salt: configured.salt, iterations: configured.iterations });
}

export async function login({ request, env, db }, body) {
  const configured = parsePasswordHash(env.OCTO_ADMIN_PASSWORD_HASH);
  if (!configured) throw notConfigured(env.OCTO_ADMIN_PASSWORD_HASH);
  const secret = sessionSecret(env);
  const key = await clientKey(request);
  if (await bumpRateLimit(db, `login-attempt:${key}`, 15 * 60) > 5) {
    throw httpError('Too many login attempts. Try again later.', 429);
  }
  if (typeof body.challengeId !== 'string' || !/^[a-f\d]{64}$/.test(body.challengeId)
    || typeof body.proof !== 'string' || !/^[a-f\d]{64}$/.test(body.proof)) {
    throw httpError('Login challenge is missing or invalid. Request a new challenge and try again.', 400);
  }
  const expires = Number.parseInt(body.challengeId.slice(0, 8), 16);
  if (expires * 1000 <= Date.now() || await bumpRateLimit(db, `challenge-used:${body.challengeId}`, 3600) > 1) {
    throw httpError('Login challenge expired or was already used. Try again.', 400);
  }
  const nonce = await hmac(secret, `challenge:${body.challengeId}:${key}`);
  const verifier = await crypto.subtle.importKey('raw', configured.expected, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', verifier, hexToBytes(body.proof), encoder.encode(`${body.challengeId}\n${nonce}`));
  if (!valid) throw httpError('Invalid admin password.', 401);
  const { token, expiresAt } = await createSession(env, db);
  await logActivity(db, 'Admin signed in');
  return json({ authenticated: true, token, expiresAt });
}
