import { bumpRateLimit, clientKey, httpError, logActivity, randomHex } from './http.js';

export const jobTypeToDb = { standalone: 'build', build: 'build', analysis: 'analysis', health: 'health' };

export function gameFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    version: row.version,
    category: row.category,
    tags: row.tags || [],
    featured: row.featured === true,
    launch: row.launch,
    thumbnail: row.thumbnail,
    accent: row.accent,
    bannerSource: row.banner_source,
    bannerFit: row.banner_fit,
    screenshots: row.screenshots || [],
    offlineReady: row.offline_ready === true,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicGame(row) {
  const { status, createdAt, updatedAt, ...visible } = gameFromRow(row);
  return visible;
}

export function jobFromRow(row) {
  return {
    id: row.id,
    type: row.type === 'build' ? 'standalone' : row.type,
    gameId: row.game_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    logs: row.logs || [],
    result: row.result ?? null,
  };
}

export function proposalFromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    status: row.status,
    diff: row.diff || '',
    manifestPath: row.manifest_path || '',
    manifest: row.manifest || null,
    pullRequest: row.pr_url ? { url: row.pr_url, number: row.pr_number, branch: row.pr_branch } : null,
    lastError: row.last_error || '',
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    dismissedAt: row.dismissed_at,
  };
}

export function roadmapFromRow(row, includeInternal) {
  const item = {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    category: row.category,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeInternal) item.internalNotes = row.internal_notes || '';
  return item;
}

export function must({ data, error }, message = 'Database request failed.') {
  if (error) {
    console.error(message, error);
    throw httpError('The database request failed.', 502);
  }
  return data;
}

export async function addJob(db, type, gameId = null, result = null, message = 'Completed') {
  const now = new Date().toISOString();
  const row = {
    id: randomHex(10),
    type: jobTypeToDb[type],
    game_id: gameId,
    status: 'completed',
    message,
    logs: [message],
    result,
    created_at: now,
    updated_at: now,
  };
  must(await db.from('jobs').insert(row), 'Could not create job.');
  await logActivity(db, message);
  return jobFromRow(row);
}

export async function listJobs(db, limit = 100) {
  const rows = must(await db.from('jobs').select('*').order('created_at', { ascending: false }).limit(limit));
  return rows.map(jobFromRow);
}

export async function enforceRateLimit(db, request, prefix, windowSeconds, maximum, message) {
  const count = await bumpRateLimit(db, `${prefix}:${await clientKey(request)}`, windowSeconds);
  if (count > maximum) throw httpError(message, 429);
}
