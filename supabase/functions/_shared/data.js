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
    acquisitionStatus: row.acquisition_status || 'unverified',
    runtimeStatus: row.runtime_status || 'unverified',
    networkDependency: row.network_dependency || 'unverified',
    saveLevel: Number.isInteger(row.save_level) ? row.save_level : null,
    saveStatus: row.save_status || 'unverified',
    testStatus: row.test_status || 'unverified',
    acquisitionEvidence: Array.isArray(row.acquisition_evidence) ? row.acquisition_evidence : [],
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

export function acquisitionFromRow(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    title: row.title,
    action: row.action,
    state: row.state,
    approvalState: row.approval_state || 'not-requested',
    sourceUrl: row.source_url || '',
    requestedVersion: row.requested_version || '',
    acquisitionStatus: row.acquisition_status || 'unverified',
    evidence: row.evidence || [],
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
  };
}

export async function listAcquisitions(db, limit = 100) {
  const rows = must(await db.from('game_acquisition_queue').select('*').order('created_at', { ascending: false }).limit(limit));
  return rows.map(acquisitionFromRow);
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

export function must({ data, error }, message = 'Database request failed.', exposeReason = false) {
  if (error) {
    console.error(JSON.stringify({ event: 'database_request_failed', code: /^[A-Z0-9_]{1,30}$/.test(error.code || '') ? error.code : 'DATABASE' }));
    const failure = httpError('The database request failed.', 502);
    if (exposeReason) failure.reason = `${message} ${error.message || 'Unknown database error.'}`;
    throw failure;
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

export async function listJobs(db, limit = 100, exposeReason = false) {
  const rows = must(
    await db.from('jobs').select('*').order('created_at', { ascending: false }).limit(limit),
    'Could not load jobs.',
    exposeReason,
  );
  return rows.map(jobFromRow);
}

export async function enforceRateLimit(db, request, prefix, windowSeconds, maximum, message) {
  const count = await bumpRateLimit(db, `${prefix}:${await clientKey(request)}`, windowSeconds);
  if (count > maximum) throw httpError(message, 429);
}
