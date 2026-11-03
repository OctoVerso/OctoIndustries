export const feedbackStatuses = [
  'new', 'under_review', 'planned', 'in_progress', 'awaiting_user_reply', 'implemented', 'resolved', 'rejected', 'closed',
  // Statuses stored by earlier releases remain valid.
  'seen', 'working', 'important', 'archived',
];
export const feedbackPriorities = ['low', 'medium', 'high', 'critical'];
const legacyStatuses = { seen: 'under_review', working: 'in_progress', important: 'under_review', archived: 'closed' };

const maximumMessageLength = 5000;
const deviceValues = {
  deviceType: new Set(['Desktop', 'Mobile', 'Tablet', 'Unknown']),
  operatingSystem: new Set(['Windows', 'Android', 'iOS', 'macOS', 'Linux', 'Unknown']),
  browser: new Set(['Edge', 'Opera', 'Samsung Internet', 'Firefox', 'Chrome', 'Safari', 'Unknown']),
};

export function validateFeedbackSubmission(body, games) {
  if (!['suggestion', 'issue'].includes(body.type)) {
    throw Object.assign(new Error('Choose Suggestion or Issue.'), { status: 400 });
  }
  if (typeof body.message !== 'string') {
    throw Object.assign(new Error('Message is required and must be 5,000 characters or fewer.'), { status: 400 });
  }
  const message = body.message.replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!message || message.length > maximumMessageLength) {
    throw Object.assign(new Error('Message is required and must be 5,000 characters or fewer.'), { status: 400 });
  }
  if (body.gameId !== undefined && body.gameId !== null && body.gameId !== ''
    && (typeof body.gameId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.gameId))) {
    throw Object.assign(new Error('Choose a valid game from the library.'), { status: 400 });
  }
  const gameId = body.type === 'issue' && typeof body.gameId === 'string' && body.gameId ? body.gameId : null;
  if (gameId && !games.some((game) => game.id === gameId && game.status === 'published')) {
    throw Object.assign(new Error('Choose a game from the current public library.'), { status: 400 });
  }
  const deviceInfo = {};
  if (body.deviceInfo && typeof body.deviceInfo === 'object' && !Array.isArray(body.deviceInfo)) {
    for (const [key, values] of Object.entries(deviceValues)) {
      const value = body.deviceInfo[key];
      if (typeof value === 'string' && values.has(value)) deviceInfo[key] = value;
    }
    const resolution = body.deviceInfo.screenResolution;
    if (typeof resolution === 'string' && /^\d{1,5} × \d{1,5}$/.test(resolution)) deviceInfo.screenResolution = resolution;
    const version = body.deviceInfo.octoVersion;
    if (typeof version === 'string') deviceInfo.octoVersion = version.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 100);
  }
  return { type: body.type, gameId, message, deviceInfo };
}

export function normalizeFeedback(row) {
  return {
    id: row.id,
    ticketNumber: row.ticket_number || null,
    userAccessEnabled: Boolean(row.access_token_hash),
    type: row.type,
    gameId: row.game_id,
    message: row.message,
    deviceInfo: typeof row.device_info === 'string' ? JSON.parse(row.device_info || '{}') : row.device_info || {},
    status: legacyStatuses[row.status] || row.status,
    priority: row.priority || 'medium',
    archived: Boolean(row.archived_at),
    deleted: Boolean(row.deleted_at),
    adminNotes: row.admin_notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateFeedbackPriority(priority) {
  if (!feedbackPriorities.includes(priority)) {
    throw Object.assign(new Error('Choose a valid ticket priority.'), { status: 400 });
  }
  return priority;
}

export function validateConversationMessage(value) {
  const message = typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
    : '';
  if (!message || message.length > maximumMessageLength) {
    throw Object.assign(new Error('A reply is required and must be 5,000 characters or fewer.'), { status: 400 });
  }
  return message;
}

export function validateFeedbackStatus(status) {
  if (!feedbackStatuses.includes(status)) {
    throw Object.assign(new Error('Choose a valid feedback status.'), { status: 400 });
  }
  return status;
}

export function validateAdminNotes(value) {
  if (typeof value !== 'string' || value.length > 5000) {
    throw Object.assign(new Error('Admin notes must be 5,000 characters or fewer.'), { status: 400 });
  }
  return value.trim();
}
