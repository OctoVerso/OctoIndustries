export const ACQUISITION_ACTIONS = Object.freeze(['acquire', 'update']);
export const ACQUISITION_STATES = Object.freeze([
  'proposed',
  'source-review',
  'acquiring',
  'awaiting-evidence',
  'awaiting-approval',
  'approved',
  'imported',
  'update-available',
  'updating',
  'rejected',
  'failed',
]);
export const ACQUISITION_APPROVAL_STATES = Object.freeze(['not-requested', 'pending', 'approved', 'rejected']);
export const ACQUISITION_STATUSES = Object.freeze(['local-payload', 'local-wrapper', 'external-only', 'unverified']);

const gameIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const evidenceKinds = new Set(['source', 'artifact', 'screenshot', 'test', 'note']);
const transitions = {
  proposed: ['source-review', 'rejected'],
  'source-review': ['acquiring', 'awaiting-evidence', 'rejected'],
  acquiring: ['awaiting-evidence', 'failed'],
  'awaiting-evidence': ['awaiting-approval', 'failed'],
  'awaiting-approval': ['approved', 'rejected'],
  approved: ['imported', 'failed'],
  imported: ['update-available'],
  'update-available': ['updating', 'rejected'],
  updating: ['awaiting-evidence', 'failed'],
  rejected: ['proposed'],
  failed: ['proposed', 'acquiring'],
};

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function optionalText(value, maxLength, field) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > maxLength) throw invalid(`${field} must be a string no longer than ${maxLength} characters.`);
  return value.trim();
}

function validateUrl(value, field) {
  const url = optionalText(value, 2048, field);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
  } catch {
    throw invalid(`${field} must be a valid HTTP or HTTPS URL.`);
  }
  return url;
}

export function normalizeEvidence(value) {
  if (value === undefined || value === null || value === '') return [];
  let entries = value;
  if (typeof value === 'string') {
    entries = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((url) => ({ kind: 'note', label: url, url }));
  }
  if (!Array.isArray(entries) || entries.length > 50) throw invalid('Evidence must contain between 1 and 50 entries.');
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw invalid(`Evidence entry ${index + 1} is invalid.`);
    const kind = typeof entry.kind === 'string' ? entry.kind.trim().toLowerCase() : 'note';
    if (!evidenceKinds.has(kind)) throw invalid(`Evidence entry ${index + 1} has an unsupported kind.`);
    const label = optionalText(entry.label, 240, `Evidence entry ${index + 1} label`);
    const url = validateUrl(entry.url, `Evidence entry ${index + 1} URL`);
    const sha256 = optionalText(entry.sha256, 64, `Evidence entry ${index + 1} checksum`).toLowerCase();
    if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) throw invalid(`Evidence entry ${index + 1} checksum must be a SHA-256 hex digest.`);
    const capturedAt = optionalText(entry.capturedAt, 40, `Evidence entry ${index + 1} timestamp`);
    if (capturedAt && !Number.isFinite(Date.parse(capturedAt))) throw invalid(`Evidence entry ${index + 1} timestamp is invalid.`);
    if (!label && !url && !sha256) throw invalid(`Evidence entry ${index + 1} needs a label, URL, or checksum.`);
    return { kind, label, url, sha256, capturedAt };
  });
}

function normalizeStatus(value) {
  if (value === undefined || value === null || value === '') return 'unverified';
  if (typeof value !== 'string' || !ACQUISITION_STATUSES.includes(value)) throw invalid('acquisitionStatus is invalid.');
  return value;
}

export function validateAcquisitionCreate(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Acquisition request must be an object.');
  const gameId = optionalText(body.gameId, 80, 'gameId');
  if (!gameIdPattern.test(gameId)) throw invalid('gameId must be a lowercase slug.');
  const title = optionalText(body.title, 160, 'title');
  if (!title) throw invalid('title is required.');
  const action = body.action || 'acquire';
  if (!ACQUISITION_ACTIONS.includes(action)) throw invalid('action must be acquire or update.');
  return {
    gameId,
    title,
    action,
    sourceUrl: validateUrl(body.sourceUrl, 'sourceUrl'),
    requestedVersion: optionalText(body.requestedVersion, 120, 'requestedVersion'),
    notes: optionalText(body.notes, 4000, 'notes'),
    acquisitionStatus: normalizeStatus(body.acquisitionStatus),
    evidence: normalizeEvidence(body.evidence),
  };
}

export function validateAcquisitionPatch(current, body = {}) {
  if (!current || typeof current !== 'object') throw invalid('Current acquisition item is required.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Acquisition update must be an object.');
  const allowed = new Set(['state', 'evidence', 'notes', 'requestedVersion', 'sourceUrl', 'acquisitionStatus']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw invalid('Only acquisition state, evidence, notes, version, source URL, and classification can be updated.');
  const update = {};
  if (body.state !== undefined) {
    if (!ACQUISITION_STATES.includes(body.state)) throw invalid('Acquisition state is invalid.');
    if (body.state !== current.state && !(transitions[current.state] || []).includes(body.state)) {
      throw invalid(`Acquisition cannot move from ${current.state} to ${body.state}.`);
    }
    const evidence = normalizeEvidence(body.evidence ?? current.evidence);
    if (body.state === 'approved' && (current.acquisitionStatus === 'external-only' || !evidence.length)) {
      throw invalid('An external-only item cannot be approved and approval requires evidence.');
    }
    update.state = body.state;
  }
  if (body.evidence !== undefined) update.evidence = normalizeEvidence(body.evidence);
  if (body.notes !== undefined) update.notes = optionalText(body.notes, 4000, 'notes');
  if (body.requestedVersion !== undefined) update.requestedVersion = optionalText(body.requestedVersion, 120, 'requestedVersion');
  if (body.sourceUrl !== undefined) update.sourceUrl = validateUrl(body.sourceUrl, 'sourceUrl');
  if (body.acquisitionStatus !== undefined) update.acquisitionStatus = normalizeStatus(body.acquisitionStatus);
  if (update.state === 'approved' && update.acquisitionStatus === 'external-only') throw invalid('An external-only item cannot be approved.');
  return update;
}

export function approvalStateFor(state) {
  if (state === 'awaiting-approval') return 'pending';
  if (state === 'approved' || state === 'imported' || state === 'update-available' || state === 'updating') return 'approved';
  if (state === 'rejected') return 'rejected';
  return 'not-requested';
}
