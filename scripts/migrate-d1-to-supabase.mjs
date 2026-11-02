#!/usr/bin/env node
// Standalone D1 -> Supabase migration.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/migrate-d1-to-supabase.mjs --state admin_state.json --feedback feedback.json [--roadmap roadmap.json] [--apply]
//
// Without --apply it is a dry run: files are parsed, rows are mapped and counted, nothing is sent.
// Inputs accept raw data or `wrangler d1 execute --json` output.
//
// Column lists in the mappers match the existing Supabase schema exactly.
// proposals and roadmap are not written by the D1 admin code; they are read from state.proposals /
// state.roadmap if present in the export.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const TABLES = { games: 'games', jobs: 'jobs', activity: 'activity', roadmap: 'roadmap', proposals: 'proposals', feedback: 'feedback' };
const BATCH_SIZE = 100;
const EXPECTED = { games: 18, jobs: 10, activity: 100, roadmap: 14, proposals: 0, feedback: 7 };

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const apply = args.includes('--apply');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function unwrapWrangler(data) {
  // wrangler: [{ results: [ ...rows ], success, meta }]
  if (Array.isArray(data) && data[0] && Array.isArray(data[0].results)) return data[0].results;
  return data;
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    return fail(`Cannot read JSON from ${file}: ${error.message}`);
  }
}

function parseState(data) {
  let value = unwrapWrangler(data);
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value.value === 'string') value = value.value; // admin_state row
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object') fail('admin_state export did not contain a state object.');
  return value;
}

const iso = (value) => (value ? new Date(value).toISOString() : null);
const asArray = (value, name) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${name} must be an array in the export.`);
  return value;
};

// Deterministic UUID-shaped id from a string, so re-runs upsert the same rows.
const stableId = (text) => {
  const h = createHash('sha1').update(text).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const importedAt = new Date().toISOString();

// Drop undefined keys so Supabase column defaults apply (the request sends Prefer: missing=default).
const clean = (row) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
const pick = (obj, camel, snake) => obj[camel] ?? obj[snake];

// D1 job types -> Supabase enum (analysis | health | build). 'standalone' generates the hub HTML file, i.e. a build.
const JOB_TYPES = { standalone: 'build', build: 'build', analysis: 'analysis', health: 'health' };
const mapJobType = (type) => JOB_TYPES[type] ?? fail(`Unmapped D1 job type "${type}"; add it to JOB_TYPES.`);

// Mappers: D1 JSON -> exact Supabase columns.
const mappers = {
  // games: id,title,description,version,category,tags,featured,launch,thumbnail,accent,banner_source,
  //        banner_fit,screenshots,offline_ready,status,created_at,updated_at
  // Every game row has the identical key set (PostgREST rejects batches with differing keys, PGRST102).
  games: (g) => {
    const createdAt = iso(pick(g, 'createdAt', 'created_at') ?? g.addedAt) ?? importedAt;
    return {
      id: g.id,
      title: g.title,
      description: g.description || '',
      version: g.version || '1.0.0',
      category: g.category || 'Other',
      tags: Array.isArray(g.tags) ? g.tags : [],
      featured: g.featured === true,
      launch: g.launch || '',
      thumbnail: g.thumbnail || '',
      accent: g.accent || '#7ab4ff',
      banner_source: pick(g, 'bannerSource', 'banner_source') || g.banner || g.thumbnail || g.launch || '',
      banner_fit: pick(g, 'bannerFit', 'banner_fit') || 'cover',
      screenshots: Array.isArray(g.screenshots) ? g.screenshots : [],
      offline_ready: pick(g, 'offlineReady', 'offline_ready') === true,
      status: g.status || 'draft',
      created_at: createdAt,
      updated_at: iso(pick(g, 'updatedAt', 'updated_at')) ?? createdAt,
    };
  },
  // jobs: id,type,game_id,status,message,logs,result,created_at,updated_at
  jobs: (j) => clean({
    id: j.id,
    type: mapJobType(j.type),
    game_id: pick(j, 'gameId', 'game_id') ?? null,
    status: j.status,
    message: j.message,
    logs: j.logs ?? [],
    result: j.result ?? null,
    created_at: iso(pick(j, 'createdAt', 'created_at')),
    // D1 jobs have no updated_at; they are written once.
    updated_at: iso(pick(j, 'updatedAt', 'updated_at') ?? pick(j, 'createdAt', 'created_at')),
  }),
  // activity: id is generated by Supabase and is never sent
  activity: (a) => ({
    message: a.message,
    created_at: iso(a.createdAt),
  }),
  // roadmap: id,title,description,status,category,priority,internal_notes,created_at,updated_at
  roadmap: (r, index) => clean({
    id: r.id ?? stableId(`roadmap|${r.title}|${index}`),
    title: r.title,
    description: r.description,
    status: r.status,
    category: r.category,
    priority: r.priority,
    internal_notes: pick(r, 'internalNotes', 'internal_notes'),
    created_at: iso(pick(r, 'createdAt', 'created_at')),
    updated_at: iso(pick(r, 'updatedAt', 'updated_at')),
  }),
  // proposals: id,kind,title,summary,status,diff,manifest_path,manifest,pr_url,pr_number,pr_branch,
  //            last_error,created_at,approved_at,dismissed_at,updated_at
  proposals: (p, index) => clean({
    id: p.id ?? stableId(`proposal|${p.title}|${index}`),
    kind: p.kind,
    title: p.title,
    summary: p.summary,
    status: p.status,
    diff: p.diff,
    manifest_path: pick(p, 'manifestPath', 'manifest_path'),
    manifest: p.manifest,
    pr_url: pick(p, 'prUrl', 'pr_url'),
    pr_number: pick(p, 'prNumber', 'pr_number'),
    pr_branch: pick(p, 'prBranch', 'pr_branch'),
    last_error: pick(p, 'lastError', 'last_error'),
    created_at: iso(pick(p, 'createdAt', 'created_at')),
    approved_at: iso(pick(p, 'approvedAt', 'approved_at')),
    dismissed_at: iso(pick(p, 'dismissedAt', 'dismissed_at')),
    updated_at: iso(pick(p, 'updatedAt', 'updated_at')),
  }),
  // feedback: id,type,game_id,message,device_info,status,admin_notes,created_at,updated_at
  feedback: (f) => ({
    id: f.id,
    type: f.type,
    game_id: f.game_id ?? null,
    message: f.message,
    device_info: typeof f.device_info === 'string' ? JSON.parse(f.device_info || '{}') : (f.device_info ?? {}),
    status: f.status ?? 'new',
    admin_notes: f.admin_notes ?? '',
    created_at: iso(f.created_at),
    updated_at: iso(f.updated_at),
  }),
};

function assertUnique(name, rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!('id' in row)) continue; // activity: ids are generated by Supabase
    if (row.id === undefined || row.id === null) fail(`${name}: row without id.`);
    if (seen.has(row.id)) fail(`${name}: duplicate id ${row.id}.`);
    seen.add(row.id);
  }
}

async function upsert(table, rows, { withId = true } = {}) {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const response = await fetch(`${base}/rest/v1/${table}${withId ? '?on_conflict=id' : ''}`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: `${withId ? 'resolution=merge-duplicates,' : ''}missing=default,return=minimal`,
      },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) fail(`${table}: batch at ${i} failed (${response.status}): ${await response.text()}`);
  }
}

async function count(table) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${base}/rest/v1/${table}?select=id`, {
    method: 'HEAD',
    headers: { apikey: key, authorization: `Bearer ${key}`, prefer: 'count=exact' },
  });
  if (!response.ok) fail(`${table}: count failed (${response.status}).`);
  return Number(response.headers.get('content-range')?.split('/')[1]);
}

// Preflight: read the live schema from PostgREST's OpenAPI document and check every row against it
// (unknown columns, NOT NULL columns without defaults, enums, types, lengths) before anything is written.
// Check constraints and foreign keys are not exposed by the API and are only caught on insert.
async function fetchSchema() {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${base}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!response.ok) fail(`Cannot read the Supabase schema (${response.status}): ${await response.text()}`);
  const document = await response.json();
  return document.definitions ?? document.components?.schemas ?? fail('Supabase returned no schema definitions.');
}

function checkValue(value, column) {
  const { type, format, enum: allowed, maxLength } = column;
  if (allowed && !allowed.includes(value)) return `"${value}" is not one of [${allowed.join(', ')}]`;
  if (/^jsonb?$/.test(format ?? '')) return null;
  if (type === 'array') return Array.isArray(value) ? null : 'expected an array';
  if (type === 'boolean') return typeof value === 'boolean' ? null : 'expected a boolean';
  if (type === 'integer' || type === 'number') return typeof value === 'number' ? null : 'expected a number';
  if (type === 'string') {
    if (typeof value !== 'string') return 'expected a string';
    if (format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return `"${value}" is not a uuid`;
    if (/^timestamp/.test(format ?? '') && Number.isNaN(Date.parse(value))) return `"${value}" is not a timestamp`;
    if (maxLength && value.length > maxLength) return `longer than ${maxLength} characters`;
  }
  return null;
}

function validateRows(rows, definitions) {
  const problems = [];
  for (const [name, list] of Object.entries(rows)) {
    if (!list.length) continue;
    const definition = definitions[TABLES[name]];
    if (!definition) { problems.push(`${name}: table "${TABLES[name]}" does not exist in Supabase.`); continue; }
    const columns = definition.properties ?? {};
    // PostgREST lists NOT NULL columns without a visible default as required. Identity columns expose no
    // default, so a column is also treated as database-generated when it is an integer primary key that
    // none of the rows send (this is how activity.id is handled).
    const isGenerated = (key) => {
      const column = columns[key] ?? {};
      if (column.default !== undefined) return true;
      const integer = column.type === 'integer' || column.type === 'number' || /int|serial/.test(column.format ?? '');
      return integer && /Primary Key/i.test(column.description ?? '') && !list.some((row) => key in row);
    };
    const required = (definition.required ?? []).filter((key) => !isGenerated(key));
    const seen = new Set();
    list.forEach((row, index) => {
      const label = `${name}[${index}]${row.id ? ` (${row.id})` : ''}`;
      for (const key of Object.keys(row)) {
        if (!columns[key]) problems.push(`${label}: column "${key}" does not exist.`);
      }
      for (const key of required) {
        if (row[key] === undefined || row[key] === null) problems.push(`${label}: required column "${key}" is missing or null.`);
      }
      for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined || !columns[key]) continue;
        const message = checkValue(value, columns[key]);
        if (message) problems.push(`${label}.${key}: ${message}`);
      }
    });
    for (const key of required) if (!list.some((row) => key in row)) seen.add(key);
    for (const key of seen) problems.push(`${name}: required column "${key}" is never sent.`);
  }
  return problems;
}

async function main() {
  const statePath = opt('state');
  const feedbackPath = opt('feedback');
  if (!statePath || !feedbackPath) fail('Both --state <file> and --feedback <file> are required.');
  if (apply && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply.');
  }

  const state = parseState(await readJson(statePath));
  const feedbackRaw = unwrapWrangler(await readJson(feedbackPath));
  if (!Array.isArray(feedbackRaw)) fail('feedback export must be an array of rows.');

  const roadmapPath = opt('roadmap');
  const roadmapRaw = roadmapPath ? unwrapWrangler(await readJson(roadmapPath)) : undefined;

  const rows = {
    games: asArray(state.games, 'games').map(mappers.games),
    jobs: asArray(state.jobs, 'jobs').map(mappers.jobs),
    activity: asArray(state.activity, 'activity').map(mappers.activity),
    roadmap: asArray(roadmapRaw ?? state.roadmap, 'roadmap').map(mappers.roadmap),
    proposals: asArray(state.proposals, 'proposals').map(mappers.proposals),
    feedback: feedbackRaw.map(mappers.feedback),
  };

  for (const [name, list] of Object.entries(rows)) {
    assertUnique(name, list);
    const note = list.length === EXPECTED[name] ? '' : `  (WARNING: expected ${EXPECTED[name]})`;
    console.log(`${name.padEnd(9)} ${list.length}${note}`);
  }
  if (!rows.roadmap.length) console.warn('WARNING: no roadmap found; pass --roadmap <file> or include state.roadmap.');

  // Pre-check foreign keys to games.
  const gameIds = new Set(rows.games.map((g) => g.id));
  for (const name of ['jobs', 'feedback']) {
    const orphans = rows[name].filter((r) => r.game_id && !gameIds.has(r.game_id));
    if (orphans.length) fail(`${name}: ${orphans.length} row(s) reference unknown games: ${[...new Set(orphans.map((r) => r.game_id))].join(', ')}`);
  }

  // Diagnostics: prove which file runs and that validation sees mapped (not raw) job types.
  const scriptFile = fileURLToPath(import.meta.url);
  const fingerprint = createHash('sha1').update(await readFile(scriptFile)).digest('hex').slice(0, 10);
  const rawJobTypes = [...new Set(asArray(state.jobs, 'jobs').map((j) => j.type))];
  const mappedJobTypes = [...new Set(rows.jobs.map((j) => j.type))];
  console.log(`script: ${scriptFile} (sha1 ${fingerprint})`);
  console.log(`jobs.type raw D1: [${rawJobTypes.join(', ')}] -> validated: [${mappedJobTypes.join(', ')}]`);

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const problems = validateRows(rows, await fetchSchema());
    if (problems.length) {
      console.error(`Schema preflight found ${problems.length} problem(s):`);
      for (const problem of problems.slice(0, 100)) console.error(`  - ${problem}`);
      process.exit(1);
    }
    console.log('Schema preflight passed: all rows match the live Supabase schema.');
  } else {
    console.warn('Schema preflight SKIPPED: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to validate against the live schema.');
  }

  if (!apply) {
    console.log('Dry run complete. Re-run with --apply to write to Supabase.');
    return;
  }

  // Parents first: games, then dependants.
  for (const name of ['games', 'roadmap', 'proposals', 'jobs', 'feedback', 'activity']) {
    if (!rows[name].length) continue;
    if (name === 'activity') {
      // No ids are sent, so a re-run would duplicate rows: refuse to import into a non-empty table.
      const existing = await count(TABLES.activity);
      if (existing > 0) fail(`activity already has ${existing} row(s); refusing to insert duplicates.`);
      await upsert(TABLES.activity, rows.activity, { withId: false });
    } else {
      await upsert(TABLES[name], rows[name]);
    }
    console.log(`Imported ${name}`);
  }

  let ok = true;
  for (const name of Object.keys(rows)) {
    const actual = await count(TABLES[name]);
    const match = name === 'activity' ? actual === rows[name].length : actual >= rows[name].length;
    ok &&= match;
    console.log(`verify ${name}: supabase=${actual} source=${rows[name].length} ${match ? 'OK' : 'MISMATCH'}`);
  }
  if (!ok) process.exit(1);
}

main().catch((error) => fail(error.stack || String(error)));
