import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createHmac } from 'node:crypto';
import {
  admin, catalog, feedback, jobs, proposals, roadmap,
} from './handlers.js';

function createDb(seed = {}) {
  const tables = { games: [], jobs: [], activity: [], roadmap: [], feedback: [], proposals: [], admin_sessions: [], ...seed };
  const limits = new Map();
  let activityId = 1;
  const builder = (name) => {
    const state = { op: 'select', filters: [], lessThan: [], order: null, range: null, payload: null, count: false, head: false };
    const run = () => {
      const rows = tables[name];
      const matches = (row) => state.filters.every(([column, values]) => values.includes(row[column]))
        && state.lessThan.every(([column, value]) => row[column] < value);
      if (state.op === 'insert') {
        const added = [state.payload].flat().map((row) => (name === 'activity' ? { id: activityId++, ...row } : { ...row }));
        rows.push(...added);
        return { data: added, error: null };
      }
      if (state.op === 'update') {
        rows.filter(matches).forEach((row) => Object.assign(row, state.payload));
        return { data: null, error: null };
      }
      if (state.op === 'delete') {
        tables[name] = rows.filter((row) => !matches(row));
        return { data: null, error: null };
      }
      let selected = rows.filter(matches);
      if (state.order) {
        const [column, ascending] = state.order;
        selected = [...selected].sort((a, b) => (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1));
      }
      if (state.range) selected = selected.slice(state.range[0], state.range[1] + 1);
      return { data: state.head ? null : selected, count: selected.length, error: null };
    };
    const api = {
      select(_columns, options = {}) { state.count = options.count; state.head = options.head; return api; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return api; },
      update(payload) { state.op = 'update'; state.payload = payload; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(column, value) { state.filters.push([column, [value]]); return api; },
      in(column, values) { state.filters.push([column, values]); return api; },
      lt(column, value) { state.lessThan.push([column, value]); return api; },
      order(column, { ascending = true } = {}) { state.order = [column, ascending]; return api; },
      limit(count) { state.range = [0, count - 1]; return api; },
      range(from, to) { state.range = [from, to]; return api; },
      maybeSingle() { const result = run(); return Promise.resolve({ ...result, data: result.data[0] ?? null }); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return api;
  };
  return {
    tables,
    from: builder,
    rpc: async (_name, { p_key: key }) => {
      limits.set(key, (limits.get(key) || 0) + 1);
      return { data: limits.get(key), error: null };
    },
  };
}

const game = (id, status = 'published') => ({
  id, title: id.toUpperCase(), description: 'A game', version: '1.0.0', category: 'Action', tags: ['a'], featured: false,
  launch: `Octo-Industries/${id}/index.html`, thumbnail: 'thumb.svg', accent: '#fff', banner_source: 'thumb.svg',
  banner_fit: 'cover', screenshots: [], offline_ready: true, status, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

const password = 'correct horse battery staple';
const salt = '0123456789abcdef0123456789abcdef';
const iterations = 10000;
const derived = pbkdf2Sync(password, salt, iterations, 64, 'sha512');
const env = {
  ALLOWED_ORIGIN: 'https://octoverso.github.io',
  ADMIN_SESSION_SECRET: 'x'.repeat(40),
  OCTO_ADMIN_PASSWORD_HASH: `pbkdf2$${iterations}$${salt}$${derived.toString('hex')}`,
};
const base = 'https://project.supabase.co/functions/v1';
const call = (handler, name, path, { method = 'GET', body, token, headers = {} } = {}) => handler(new Request(`${base}/${name}${path}`, {
  method,
  headers: {
    Origin: 'https://octoverso.github.io', 'x-forwarded-for': '203.0.113.7', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers,
  },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env, db);

let db;
async function signIn() {
  const challenge = await (await call(admin, 'admin', '/login/challenge', { method: 'POST' })).json();
  const proof = createHmac('sha256', derived).update(`${challenge.challengeId}\n${challenge.nonce}`).digest('hex');
  const response = await call(admin, 'admin', '/login', { method: 'POST', body: { challengeId: challenge.challengeId, proof } });
  return { response, challenge, proof, body: await response.clone().json() };
}

test('catalog returns only published games without internal fields and with CORS', async () => {
  db = createDb({ games: [game('alpha'), game('beta', 'draft')] });
  const response = await call(catalog, 'catalog', '');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://octoverso.github.io');
  const body = await response.json();
  assert.deepEqual(body.map((entry) => entry.id), ['alpha']);
  assert.equal('status' in body[0], false);
  assert.equal(body[0].offlineReady, true);
  assert.equal(body[0].bannerSource, 'thumb.svg');
});

test('CORS preflight is answered and unknown origins get no allow header', async () => {
  db = createDb();
  const ok = await call(catalog, 'catalog', '', { method: 'OPTIONS' });
  assert.equal(ok.status, 204);
  const other = await call(catalog, 'catalog', '', { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('feedback is validated, stored in Supabase and rate limited', async () => {
  db = createDb({ games: [game('alpha')] });
  const bad = await call(feedback, 'feedback', '', { method: 'POST', body: { type: 'issue', message: '' } });
  assert.equal(bad.status, 400);
  const unknownGame = await call(feedback, 'feedback', '', { method: 'POST', body: { type: 'issue', gameId: 'nope', message: 'x' } });
  assert.equal(unknownGame.status, 400);
  const ok = await call(feedback, 'feedback', '', { method: 'POST', body: { type: 'issue', gameId: 'alpha', message: 'It crashed', deviceInfo: { deviceType: 'Tablet', evil: 1 } } });
  assert.equal(ok.status, 201);
  assert.equal(db.tables.feedback.length, 1);
  assert.deepEqual(db.tables.feedback[0].device_info, { deviceType: 'Tablet' });
  assert.equal(db.tables.feedback[0].game_id, 'alpha');
  let last;
  for (let index = 0; index < 5; index += 1) last = await call(feedback, 'feedback', '', { method: 'POST', body: { type: 'suggestion', message: 'More' } });
  assert.equal(last.status, 429);
});

test('admin endpoints reject missing and forged tokens', async () => {
  db = createDb();
  assert.equal((await call(admin, 'admin', '/dashboard')).status, 401);
  assert.equal((await call(admin, 'admin', '/dashboard', { token: `1999999999.${'a'.repeat(32)}.${'b'.repeat(64)}` })).status, 401);
  for (const [handler, name] of [[jobs, 'jobs'], [proposals, 'proposals']]) assert.equal((await call(handler, name, '')).status, 401);
  assert.equal((await call(roadmap, 'roadmap', '/', { method: 'POST', body: { title: 'x' } })).status, 401);
});

test('login verifies the PBKDF2 proof, blocks replay, and issues a bearer session', async () => {
  db = createDb();
  const { response, challenge, proof, body } = await signIn();
  assert.equal(response.status, 200);
  assert.match(body.token, /^\d{10}\.[a-f\d]{32}\.[a-f\d]{64}$/);
  assert.equal(db.tables.activity.at(-1).message, 'Admin signed in');
  const replay = await call(admin, 'admin', '/login', { method: 'POST', body: { challengeId: challenge.challengeId, proof } });
  assert.equal(replay.status, 400);
  const session = await call(admin, 'admin', '/session', { token: body.token });
  assert.equal((await session.json()).authenticated, true);
  const loggedOut = await call(admin, 'admin', '/logout', { method: 'POST', token: body.token });
  assert.equal(loggedOut.status, 200);
  assert.equal((await call(admin, 'admin', '/session', { token: body.token })).status, 401);
  const bad = await (await call(admin, 'admin', '/login/challenge', { method: 'POST' })).json();
  const wrong = await call(admin, 'admin', '/login', { method: 'POST', body: { challengeId: bad.challengeId, proof: '0'.repeat(64) } });
  assert.equal(wrong.status, 401);
});

test('admin dashboard, game edits, publishing, jobs, and activity logging use Supabase rows', async () => {
  db = createDb({ games: [game('alpha'), game('beta', 'draft')], feedback: [{ id: 'f'.repeat(32), status: 'new' }] });
  const { body: { token } } = await signIn();
  const dashboard = await (await call(admin, 'admin', '/dashboard', { token })).json();
  assert.deepEqual(dashboard.counts, { total: 2, published: 1, drafts: 1, offlineReady: 2, needsAttention: 0, failedJobs: 0, newFeedback: 1 });
  assert.equal(dashboard.games[0].offlineReady, true);

  const published = await call(admin, 'admin', '/games/beta/publish', { method: 'POST', token, body: { published: true } });
  assert.equal((await published.json()).status, 'published');
  assert.equal(db.tables.games.find((row) => row.id === 'beta').status, 'published');
  const edited = await call(admin, 'admin', '/games/alpha', { method: 'PATCH', token, body: { title: 'Alpha 2', tags: ['x'], featured: true } });
  assert.equal(edited.status, 200);
  assert.equal(db.tables.games.find((row) => row.id === 'alpha').title, 'Alpha 2');
  assert.equal((await call(admin, 'admin', '/games/alpha', { method: 'PATCH', token, body: { id: 'hack' } })).status, 400);

  const health = await call(admin, 'admin', '/games/alpha/health', { method: 'POST', token });
  assert.equal(health.status, 202);
  assert.equal(db.tables.jobs[0].type, 'health');
  const build = await call(jobs, 'jobs', '/build', { method: 'POST', token });
  assert.equal(build.status, 202);
  assert.equal(db.tables.jobs[1].type, 'build');
  const listed = await (await call(jobs, 'jobs', '', { token })).json();
  assert.equal(listed.some((job) => job.type === 'standalone'), true);
  assert.ok(db.tables.activity.some((row) => row.message === 'Published BETA'));
});

test('activity is trimmed to 100 rows', async () => {
  db = createDb({ games: [game('alpha')] });
  const { body: { token } } = await signIn();
  for (let index = 0; index < 105; index += 1) await call(admin, 'admin', '/games/alpha/publish', { method: 'POST', token, body: { published: true } });
  assert.equal(db.tables.activity.length, 100);
});

test('admin feedback review updates statuses and notes', async () => {
  const id = 'a'.repeat(32);
  db = createDb({ feedback: [{ id, type: 'suggestion', game_id: null, message: 'Hi', device_info: {}, status: 'new', admin_notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] });
  const { body: { token } } = await signIn();
  const list = await (await call(admin, 'admin', '/feedback', { token })).json();
  assert.equal(list[0].message, 'Hi');
  assert.equal((await call(admin, 'admin', `/feedback/${id}/status`, { method: 'PATCH', token, body: { status: 'seen' } })).status, 200);
  assert.equal((await call(admin, 'admin', `/feedback/${id}/notes`, { method: 'PATCH', token, body: { adminNotes: ' note ' } })).status, 200);
  assert.equal(db.tables.feedback[0].status, 'seen');
  assert.equal(db.tables.feedback[0].admin_notes, 'note');
  assert.equal((await call(admin, 'admin', '/feedback/bulk', { method: 'POST', token, body: { ids: [id], status: 'archived' } })).status, 200);
  assert.equal(db.tables.feedback[0].status, 'archived');
  assert.equal((await call(admin, 'admin', `/feedback/${'b'.repeat(32)}/status`, { method: 'PATCH', token, body: { status: 'seen' } })).status, 404);
});

test('roadmap is public without internal notes and admin-managed', async () => {
  db = createDb({ roadmap: [{ id: 'octo-nexus', title: 'Nexus', description: 'd', status: 'planned', category: 'c', priority: 'high', internal_notes: 'secret', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] });
  const publicList = await (await call(roadmap, 'roadmap', '')).json();
  assert.equal('internalNotes' in publicList[0], false);
  const { body: { token } } = await signIn();
  assert.equal((await (await call(roadmap, 'roadmap', '', { token })).json())[0].internalNotes, 'secret');
  const created = await call(roadmap, 'roadmap', '', { method: 'POST', token, body: { title: 'New idea', priority: 'low' } });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await call(roadmap, 'roadmap', `/${id}`, { method: 'PATCH', token, body: { status: 'in-progress' } })).status, 200);
  assert.equal((await call(roadmap, 'roadmap', `/${id}`, { method: 'PATCH', token, body: { status: 'bogus' } })).status, 400);
  assert.equal((await call(roadmap, 'roadmap', '/octo-nexus', { method: 'DELETE', token })).status, 200);
  assert.equal(db.tables.roadmap.some((row) => row.id === 'octo-nexus'), false);
});

test('proposals can be created, listed and dismissed; approval needs GitHub credentials', async () => {
  db = createDb();
  const { body: { token } } = await signIn();
  const manifest = { launch: 'Octo-Industries/New/index.html' };
  const created = await call(proposals, 'proposals', '', {
    method: 'POST', token, body: { kind: 'game', title: 'Add New game', summary: 'Registers the new game.', manifestPath: 'Octo-Industries/New/game.json', manifest },
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await call(proposals, 'proposals', '', { method: 'POST', token, body: { kind: 'code', title: 'Bad path', summary: 'Touch a secret', diff: '--- a/.env\n+++ b/.env' } })).status, 400);
  assert.equal((await call(proposals, 'proposals', `/${id}/approve`, { method: 'POST', token })).status, 503);
  assert.equal((await (await call(proposals, 'proposals', '', { token })).json()).length, 1);
  const dismissed = await call(proposals, 'proposals', `/${id}/dismiss`, { method: 'POST', token });
  assert.equal((await dismissed.json()).status, 'dismissed');
  assert.equal((await call(proposals, 'proposals', `/${id}/dismiss`, { method: 'POST', token })).status, 409);
});

test('inquiry tickets: users track replies with an access token and admins manage the thread', async () => {
  db = createDb({
    games: [game('alpha')], feedback_conversations: [], feedback_activity: [],
  });
  const created = await call(feedback, 'feedback', '', { method: 'POST', body: { type: 'suggestion', message: 'Add co-op' } });
  assert.equal(created.status, 201);
  const { ticketId, accessToken } = await created.json();
  assert.match(accessToken, /^[a-f\d]{64}$/);
  assert.notEqual(db.tables.feedback[0].access_token_hash, accessToken);
  const headers = { 'x-ticket-access-token': accessToken };
  assert.equal((await call(feedback, 'feedback', `/tickets/${ticketId}`, { headers: { 'x-ticket-access-token': 'f'.repeat(64) } })).status, 404);
  assert.equal((await call(feedback, 'feedback', `/tickets/${ticketId}`)).status, 401);
  const view = await (await call(feedback, 'feedback', `/tickets/${ticketId}`, { headers })).json();
  assert.equal(view.conversation.length, 1);
  assert.equal('adminNotes' in view, false);

  const { body: { token } } = await signIn();
  const reply = await call(admin, 'admin', `/feedback/${ticketId}/reply`, { method: 'POST', token, body: { message: 'Thanks!' } });
  assert.equal(reply.status, 201);
  assert.equal(db.tables.feedback[0].status, 'awaiting_user_reply');
  assert.equal((await call(admin, 'admin', `/feedback/${ticketId}/priority`, { method: 'PATCH', token, body: { priority: 'high' } })).status, 200);
  assert.equal((await call(admin, 'admin', `/feedback/${ticketId}/priority`, { method: 'PATCH', token, body: { priority: 'x' } })).status, 400);
  const userReply = await call(feedback, 'feedback', `/tickets/${ticketId}/messages`, { method: 'POST', headers, body: { message: 'Great' } });
  assert.equal(userReply.status, 201);
  const thread = await (await call(admin, 'admin', `/feedback/${ticketId}/conversation`, { token })).json();
  assert.deepEqual(thread.conversation.map((entry) => entry.author), ['user', 'admin', 'user']);
  assert.equal((await call(admin, 'admin', `/feedback/${ticketId}/archive`, { method: 'POST', token })).status, 200);
  assert.equal((await call(feedback, 'feedback', `/tickets/${ticketId}/messages`, { method: 'POST', headers, body: { message: 'Hi' } })).status, 409);
  assert.equal((await call(admin, 'admin', `/feedback/${ticketId}`, { method: 'DELETE', token })).status, 200);
  assert.deepEqual(await (await call(admin, 'admin', '/feedback', { token })).json(), []);
  assert.equal((await call(feedback, 'feedback', `/tickets/${ticketId}`, { headers })).status, 404);
});

test('roadmap supports the full status set, bulk updates, and hides released items publicly', async () => {
  const row = (id, status) => ({ id, title: id, description: 'd', status, category: 'platform', priority: 'normal', internal_notes: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' });
  db = createDb({ roadmap: [row('a', 'planned'), row('b', 'idea'), row('c', 'released')] });
  assert.deepEqual((await (await call(roadmap, 'roadmap', '')).json()).map((item) => item.id).sort(), ['a', 'b']);
  const { body: { token } } = await signIn();
  assert.equal((await call(roadmap, 'roadmap', '/bulk', { method: 'POST', token, body: { ids: ['a', 'b'], status: 'testing' } })).status, 200);
  assert.deepEqual(db.tables.roadmap.map((item) => item.status), ['testing', 'testing', 'released']);
  assert.equal((await call(roadmap, 'roadmap', '/bulk', { method: 'POST', token, body: { ids: ['a'], status: 'nope' } })).status, 400);
  const dashboard = await (await call(admin, 'admin', '/dashboard', { token })).json();
  assert.equal(dashboard.roadmap.length, 3);
});

test('game inspector requires admin, validates URLs and never fetches private hosts', async () => {
  db = createDb();
  assert.equal((await call(admin, 'admin', '/analyze', { method: 'POST', body: { url: 'https://example.com' } })).status, 401);
  const { body: { token } } = await signIn();
  assert.equal((await call(admin, 'admin', '/analyze', { method: 'POST', token, body: { url: 42 } })).status, 400);
  assert.equal((await call(admin, 'admin', '/analyze', { method: 'POST', token, body: { url: 'http://169.254.169.254/' } })).status, 400);
});
