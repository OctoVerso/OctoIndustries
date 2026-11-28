const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
if (!window.OCTO_CONFIG?.functionsUrl) {
  document.querySelector('#login-title').textContent = 'Admin preview only';
  document.querySelector('#login-description').textContent = 'The dashboard requires an approved API connection.';
  loginView.classList.add('is-preview-unavailable');
  loginForm.hidden = true;
  document.querySelector('#login-preview-unavailable').hidden = false;
}
const dashboardError = document.querySelector('#dashboard-error');
const dashboardErrorMessage = document.querySelector('#dashboard-error-message');
const dashboardRetryButton = document.querySelector('#dashboard-retry');
const toast = document.querySelector('#toast');
let sessionToken = '';
try { sessionToken = sessionStorage.getItem('octoAdminToken') || ''; } catch { /* Session stays in memory. */ }
let sessionGeneration = 0;
const pendingMutations = new Set();
const feedbackDrafts = new Map();

function storeToken(token) {
  sessionToken = token || '';
  sessionGeneration += 1;
  try {
    if (sessionToken) sessionStorage.setItem('octoAdminToken', sessionToken);
    else sessionStorage.removeItem('octoAdminToken');
  } catch { /* Continue with the in-memory session. */ }
}
let dashboard;
let roadmapItems = [];
const chatHistory = [];
let refreshTimer;
let refreshInterval;
let dashboardRefreshPromise;
let toastTimer;
let feedbackEntries = [];
let feedbackLoadError = null;
const openedFeedback = new Set();
const openedConversations = new Set();
const selectedFeedback = new Set();
const selectedRoadmap = new Set();
const roadmapStatusLabels = {
  idea: 'Idea', planned: 'Planned', 'in-progress': 'In Progress', testing: 'Testing',
  released: 'Released', 'on-hold': 'On Hold', archived: 'Archived',
};
const roadmapPriorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
const adminViews = {
  overview: { title: 'Overview', description: 'A clear view of your library, community and operations.' },
  games: { title: 'Game Library', description: 'Search, filter, update metadata, publish, and run game health checks.' },
  community: { title: 'Community Inbox', description: 'Review suggestions and issues, update status, and save private notes.' },
  operations: { title: 'Operations Center', description: 'Inspect source pages, review background jobs, and monitor admin activity.' },
  ai: { title: 'AI Center', description: 'Ask about the library and review proposed changes before approval.' },
  roadmap: { title: 'Roadmap', description: 'Track, prioritize, and publish platform development updates from one source of truth.' },
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function appendChatInline(parent, text) {
  const tokenPattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
  let offset = 0;
  for (const match of text.matchAll(tokenPattern)) {
    const [token] = match;
    const start = match.index;
    parent.append(document.createTextNode(text.slice(offset, start)));
    let element;
    let content;
    if (token.startsWith('**') || token.startsWith('__')) {
      element = document.createElement('strong');
      content = token.slice(2, -2);
    } else if (token.startsWith('*') || token.startsWith('_')) {
      element = document.createElement('em');
      content = token.slice(1, -1);
    } else if (token.startsWith('~~')) {
      element = document.createElement('del');
      content = token.slice(2, -2);
    } else if (token.startsWith('`')) {
      element = document.createElement('code');
      content = token.slice(1, -1);
    } else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(token);
      const url = new URL(link[2]);
      element = document.createElement('a');
      element.href = url.href;
      element.target = '_blank';
      element.rel = 'noopener noreferrer';
      content = link[1];
    }
    element.textContent = content;
    parent.append(element);
    offset = start + token.length;
  }
  parent.append(document.createTextNode(text.slice(offset)));
}

function renderChatMarkdown(text) {
  const fragment = document.createDocumentFragment();
  const lines = text.split(/\r?\n/);
  let paragraph = [];
  let list = null;
  let codeLines = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const block = document.createElement('p');
    paragraph.forEach((line, index) => {
      if (index) block.append(document.createElement('br'));
      appendChatInline(block, line);
    });
    fragment.append(block);
    paragraph = [];
  };
  const closeList = () => {
    list = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushParagraph();
      closeList();
      if (codeLines) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeLines.join('\n');
        pre.append(code);
        fragment.append(pre);
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const title = document.createElement(`h${heading[1].length + 2}`);
      appendChatInline(title, heading[2]);
      fragment.append(title);
      continue;
    }

    const item = /^\s*([-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (item) {
      flushParagraph();
      const ordered = /^\d/.test(item[1]);
      if (!list || list.tagName === (ordered ? 'UL' : 'OL')) {
        list = document.createElement(ordered ? 'ol' : 'ul');
        fragment.append(list);
      }
      const entry = document.createElement('li');
      appendChatInline(entry, item[2]);
      list.append(entry);
      continue;
    }

    closeList();
    paragraph.push(line);
  }
  flushParagraph();
  if (codeLines) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = codeLines.join('\n');
    pre.append(code);
    fragment.append(pre);
  }
  return fragment;
}

async function api(path, options = {}) {
  const writing = !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase());
  const key = path.split('/').slice(0, 4).join('/');
  if (writing && pendingMutations.has(key)) throw new Error('An action is already running here. Wait for its result before trying again.');
  if (writing) pendingMutations.add(key);
  try { return await requestApi(path, options); }
  finally { if (writing) pendingMutations.delete(key); }
}

async function requestApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  const method = (options.method || 'GET').toUpperCase();
  const record = /^\/api\/admin\/(games|feedback|roadmap)\/([^/]+)(?:\/(publish|status|notes|priority|archive|unarchive))?$/.exec(path);
  if (record && method !== 'GET') {
    const entries = record[1] === 'games' ? dashboard?.games : record[1] === 'feedback' ? feedbackEntries : roadmapItems;
    const current = entries?.find((item) => item.id === decodeURIComponent(record[2]));
    const editorVersion = record[1] === 'games' && method === 'PATCH' ? document.querySelector('#edit-form').dataset.version : record[1] === 'roadmap' && method === 'PATCH' && document.querySelector('#roadmap-dialog').open ? document.querySelector('#roadmap-form').dataset.version : null;
    if (record[1] !== 'games' || (method === 'PATCH' && !record[3])) {
      if (editorVersion || current?.updatedAt) headers.set('x-record-version', editorVersion || current.updatedAt);
    }
  }
  let response;
  const generation = sessionGeneration;
  try {
    response = await fetch(window.OCTO_CONFIG.apiUrl(path), { ...options, headers, signal: options.signal || AbortSignal.timeout(45000) });
    if (generation !== sessionGeneration) throw new Error('Session changed. Discarded an outdated response.');
  } catch (cause) {
    const error = new Error(cause.name === 'TimeoutError' ? 'The request timed out. Refresh to check its outcome before retrying a change.' : cause.message || 'Network request failed.');
    error.endpoint = `${method} ${path}`;
    throw error;
  }
  let body = null;
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/admin/login') showLogin('Your admin session expired. Sign in again to continue.');
    const error = new Error(body?.error || `Request failed (${response.status}).`);
    error.endpoint = `${method} ${path}`;
    error.status = response.status;
    error.requestId = response.headers.get('x-request-id') || body?.requestId || '';
    error.details = body?.details || body?.reason || '';
    throw error;
  }
  if (!body || typeof body !== 'object') throw responseShapeError(path, 'expected a JSON response; refresh before retrying changes');
  if (body.warning) showToast(body.warning);
  return body;
}

async function syncCatalogGames(games) {
  let synced = 0;
  const warnings = [];
  for (let index = 0; index < games.length; index += 25) {
    const batch = games.slice(index, index + 25).map((game) => ({
      ...game,
      version: typeof game?.version === 'string' && game.version.trim()
        ? game.version.trim().slice(0, 120)
        : '1.0.0',
    }));
    const result = await api('/api/admin/catalog/sync', {
      method: 'POST',
      body: JSON.stringify({ games: batch }),
    });
    if (!Number.isInteger(result?.synced) || result.synced < 0) {
      throw responseShapeError('/api/admin/catalog/sync', 'expected a synced game count');
    }
    synced += result.synced;
    if (typeof result.warning === 'string' && result.warning) warnings.push(result.warning);
  }
  return { synced, warnings };
}

async function createLoginProof(password, challenge) {
  if (!Number.isInteger(challenge.iterations) || challenge.iterations < 10000 || challenge.iterations > 500000
    || !/^[a-f\d]{32}$/.test(challenge.salt)) {
    throw new Error('The server returned invalid password-verification settings.');
  }
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const verifier = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-512',
    salt: encoder.encode(challenge.salt),
    iterations: challenge.iterations,
  }, material, 512);
  const proofKey = await crypto.subtle.importKey('raw', verifier, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const proof = await crypto.subtle.sign('HMAC', proofKey, encoder.encode(`${challenge.challengeId}\n${challenge.nonce}`));
  return [...new Uint8Array(proof)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function showUndo(message, undo) {
  showToast(message);
  clearTimeout(toastTimer);
  const button = document.createElement('button'); button.className = 'small-button'; button.type = 'button'; button.textContent = 'Undo';
  button.addEventListener('click', async () => { button.disabled = true; try { await undo(); showToast('Ticket restored.'); } catch (error) { showToast(error.message); } });
  toast.append(' ', button);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 15000);
}

function showLogin(message = '') {
  clearInterval(refreshTimer);
  refreshInterval = null;
  storeToken('');
  dashboard = undefined; roadmapItems = []; feedbackEntries = []; chatHistory.length = 0;
  selectedFeedback.clear(); selectedRoadmap.clear(); openedFeedback.clear(); openedConversations.clear(); feedbackDrafts.clear();
  document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  for (const id of ['#feedback-list', '#game-list', '#roadmap-list', '#job-list', '#activity-list', '#proposal-list', '#chat-transcript', '#global-search-results']) document.querySelector(id)?.replaceChildren();
  document.querySelectorAll('dialog textarea, dialog input:not([type=checkbox]), #chat-input').forEach((input) => { input.value = ''; });
  document.dispatchEvent(new Event('octo:signout'));
  dashboardError.hidden = true;
  setDrawerOpen(false);
  dashboardView.hidden = true;
  loginView.hidden = false;
  logoutButton.hidden = true;
  showMessage(loginMessage, message);
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutButton.hidden = false;
  setAdminView('overview');
  syncSidebarMode();
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function syncSidebarMode() {
  dashboardView.classList.remove('sidebar-collapsed');
  const collapsed = safeStorageGet('octo-admin.groups-collapsed') === 'true';
  document.querySelectorAll('#admin-sidebar .nav-group').forEach((group) => { group.open = !collapsed; });
  document.querySelector('#sidebar-collapse').setAttribute('aria-expanded', String(!collapsed));
  document.querySelector('.collapse-label').textContent = collapsed ? 'Expand groups' : 'Collapse groups';
  if (window.innerWidth > 760) setDrawerOpen(false);
  else document.querySelector('#admin-sidebar').inert = !dashboardView.classList.contains('drawer-open');
}

function setDrawerOpen(open) {
  dashboardView.classList.toggle('drawer-open', open);
  document.querySelector('#admin-sidebar').inert = window.innerWidth <= 760 && !open;
  document.querySelector('.admin-main').inert = window.innerWidth <= 760 && open;
  if (open) document.querySelector('#admin-sidebar button')?.focus();
  const toggle = document.querySelector('#sidebar-drawer-toggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
}

function setAdminView(name, focusTarget = '') {
  const view = adminViews[name] ? name : 'overview';
  const meta = adminViews[view];
  for (const panel of document.querySelectorAll('[data-admin-panel]')) panel.hidden = panel.dataset.adminPanel !== view;
  for (const button of document.querySelectorAll('#admin-sidebar [data-admin-view]')) {
    const active = button.dataset.adminView === view && !button.dataset.focusTarget;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  document.querySelector('#admin-view-title').textContent = meta.title;
  document.querySelector('#admin-view-description').textContent = meta.description;
  document.title = `${meta.title} | Octo Industries`;
  document.dispatchEvent(new CustomEvent('octo:view', { detail: view }));
  setDrawerOpen(false);
  if (focusTarget) window.setTimeout(() => document.querySelector(focusTarget)?.focus({ preventScroll: true }), 40);
  else document.querySelector('#admin-views').focus({ preventScroll: true });
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Bahrain', timeZoneName: 'short',
  }).format(date);
}

function updateMetrics(counts, games, activity) {
  const openFeedback = feedbackEntries.filter((entry) => !entry.archived
    && !['implemented', 'resolved', 'rejected', 'closed'].includes(entry.status)).length;
  const bahrainDay = (value) => new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bahrain',
  }).format(new Date(value));
  const today = bahrainDay(Date.now());
  const activityToday = activity.filter((item) => bahrainDay(item.createdAt) === today).length;
  document.querySelector('#metric-total').textContent = counts.total;
  document.querySelector('#metric-published').textContent = counts.published;
  document.querySelector('#metric-drafts').textContent = counts.drafts;
  document.querySelector('#metric-open-feedback').textContent = feedbackLoadError ? 'Unavailable' : openFeedback;
  document.querySelector('#metric-failed').textContent = counts.failedJobs;
  document.querySelector('#metric-offline').textContent = counts.offlineReady;
  document.querySelector('#metric-categories').textContent = new Set(games.map((game) => game.category).filter(Boolean)).size;
  document.querySelector('#metric-activity-today').textContent = activityToday;
  document.querySelector('#nav-game-count').textContent = games.length;
  document.querySelector('#nav-feedback-count').textContent = feedbackLoadError ? '!' : openFeedback;
  document.querySelector('#nav-failed-count').textContent = counts.failedJobs;
  document.querySelector('#nav-roadmap-count').textContent = roadmapItems.filter((item) => !['released', 'archived'].includes(item.status)).length;
}

function renderOverviewFeedback() {
  const feedback = [...feedbackEntries].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)).slice(0, 4);
  const feedbackContainer = document.querySelector('#overview-feedback');
  if (feedbackLoadError) {
    feedbackContainer.innerHTML = `<p class="muted overview-empty">${escapeHtml(formatLoadError('Recent inquiries', '/api/admin/feedback', feedbackLoadError))}</p>`;
    return;
  }
  const gameTitles = new Map((dashboard?.games || []).map((game) => [game.id, game.title]));
  feedbackContainer.innerHTML = feedback.length ? feedback.map((entry) => `<button class="overview-row" type="button" data-feedback-open="${escapeHtml(entry.id)}">
    <span class="overview-row-copy"><strong>${escapeHtml(entry.type === 'issue' ? 'Issue' : 'Suggestion')} · ${escapeHtml(entry.gameId ? gameTitles.get(entry.gameId) || 'Unknown game' : 'Platform')}</strong><span>${escapeHtml(entry.message.slice(0, 92))}${entry.message.length > 92 ? '…' : ''}</span></span>
    <span class="feedback-type" data-type="${escapeHtml(entry.type)}">${escapeHtml(entry.status)}</span>
  </button>`).join('') : '<p class="muted overview-empty">No inquiries yet.</p>';
}

function renderOverview() {
  const jobs = [...(dashboard?.jobs || [])].sort((first, second) => {
    const failedOrder = Number(second.status === 'failed') - Number(first.status === 'failed');
    return failedOrder || Date.parse(second.createdAt) - Date.parse(first.createdAt);
  }).slice(0, 4);
  const activity = dashboard?.activity || [];
  const jobsContainer = document.querySelector('#overview-jobs');
  const activityContainer = document.querySelector('#overview-activity');

  jobsContainer.innerHTML = jobs.length ? jobs.map((job) => `<button class="overview-row" type="button" data-admin-view="operations">
    <span class="overview-row-copy"><strong>${escapeHtml(job.type)}${job.gameId ? ` · ${escapeHtml(job.gameId)}` : ''}</strong><span>${escapeHtml(job.message)}</span></span>
    <span class="job-status" data-status="${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
  </button>`).join('') : '<p class="muted overview-empty">No recent jobs.</p>';

  activityContainer.innerHTML = activity.length ? activity.slice(0, 4).map((item) => `<button class="overview-row" type="button" data-admin-view="operations">
    <span class="overview-row-copy"><strong>${escapeHtml(item.message)}</strong><span>${escapeHtml(formatDate(item.createdAt))}</span></span>
    <span class="overview-arrow" aria-hidden="true">↗</span>
  </button>`).join('') : '<p class="muted overview-empty">No recent activity.</p>';

  renderOverviewFeedback();

  const summary = document.querySelector('#roadmap-summary');
  const statusOrder = ['idea', 'planned', 'in-progress', 'testing', 'released', 'on-hold', 'archived'];
  summary.innerHTML = statusOrder.map((status) => `<button class="roadmap-summary-item" type="button" data-roadmap-filter="${status}">
    <span>${escapeHtml(roadmapStatusLabels[status])}</span><strong>${roadmapItems.filter((item) => item.status === status).length}</strong>
  </button>`).join('');
  renderRoadmapLabels();
}

function renderRoadmapLabels() {
  const items = new Map(roadmapItems.map((item) => [item.id, item]));
  document.querySelectorAll('[data-roadmap-label]').forEach((label) => {
    const item = items.get(label.dataset.roadmapLabel);
    if (item) {
      label.textContent = roadmapStatusLabels[item.status] || item.status;
      label.dataset.status = item.status;
      label.closest('.nav-item')?.classList.toggle('is-planned', !['in-progress', 'released'].includes(item.status));
    }
  });
}

function renderRoadmap() {
  const query = document.querySelector('#roadmap-search').value.trim().toLocaleLowerCase();
  const status = document.querySelector('#roadmap-status-filter').value;
  const category = document.querySelector('#roadmap-category-filter').value;
  const priority = document.querySelector('#roadmap-priority-filter').value;
  const sorting = document.querySelector('#roadmap-sort').value;
  const filtered = roadmapItems.filter((item) => {
    const searchable = [item.title, item.description, item.category, item.priority, item.status, item.internalNotes].join(' ').toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (status === 'all' || item.status === status)
      && (category === 'all' || item.category === category)
      && (priority === 'all' || item.priority === priority);
  });
  filtered.sort((first, second) => {
    if (sorting === 'title') return first.title.localeCompare(second.title);
    if (sorting === 'created') return second.createdAt.localeCompare(first.createdAt);
    if (sorting === 'priority') return roadmapPriorityOrder[first.priority] - roadmapPriorityOrder[second.priority] || second.updatedAt.localeCompare(first.updatedAt);
    return second.updatedAt.localeCompare(first.updatedAt);
  });
  const list = document.querySelector('#roadmap-list');
  const summaryContainer = document.querySelector('#roadmap-status-summary');
  const summaryStatuses = ['idea', 'planned', 'in-progress', 'testing', 'released', 'on-hold', 'archived'];
  const visibleIds = new Set(filtered.map((item) => item.id));
  for (const id of selectedRoadmap) if (!routeMapHasId(id)) selectedRoadmap.delete(id);
  summaryContainer.innerHTML = summaryStatuses.map((value) => `<button class="roadmap-status-card" type="button" data-roadmap-filter="${value}" aria-pressed="${status === value}">
    <span>${escapeHtml(roadmapStatusLabels[value])}</span><strong>${roadmapItems.filter((item) => item.status === value).length}</strong>
  </button>`).join('');
  list.innerHTML = filtered.length ? filtered.map((item) => `<tr>
    <td><label class="roadmap-select-label"><input type="checkbox" data-roadmap-select="${escapeHtml(item.id)}"${selectedRoadmap.has(item.id) ? ' checked' : ''} aria-label="Select ${escapeHtml(item.title)}"></label></td>
    <td><strong>${escapeHtml(item.title)}</strong><span class="roadmap-description">${escapeHtml(item.description)}</span></td>
    <td><span class="roadmap-status" data-status="${escapeHtml(item.status)}">${escapeHtml(roadmapStatusLabels[item.status])}</span></td>
    <td>${escapeHtml(item.category)}</td>
    <td><span class="roadmap-priority" data-priority="${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span></td>
    <td><time datetime="${escapeHtml(item.createdAt)}">${escapeHtml(formatDate(item.createdAt))}</time></td>
    <td><time datetime="${escapeHtml(item.updatedAt)}">${escapeHtml(formatDate(item.updatedAt))}</time></td>
    <td><div class="roadmap-actions">
      <button class="small-button" type="button" data-roadmap-action="edit" data-id="${escapeHtml(item.id)}" aria-label="Edit ${escapeHtml(item.title)}" title="Edit">Edit</button>
      <button class="small-button" type="button" data-roadmap-action="archive" data-id="${escapeHtml(item.id)}" aria-label="${item.status === 'archived' ? 'Restore' : 'Archive'} ${escapeHtml(item.title)}" title="${item.status === 'archived' ? 'Restore' : 'Archive'}">${item.status === 'archived' ? 'Restore' : 'Archive'}</button>
      <button class="small-button roadmap-delete" type="button" data-roadmap-action="delete" data-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}" title="Delete">Delete</button>
    </div></td>
  </tr>`).join('') : '<tr><td colspan="8"><p class="muted roadmap-empty">No roadmap features match these filters.</p></td></tr>';
  document.querySelector('#roadmap-selection-count').textContent = `${selectedRoadmap.size} selected`;
  document.querySelector('#roadmap-select-all').checked = visibleIds.size > 0 && [...visibleIds].every((id) => selectedRoadmap.has(id));
  document.querySelector('#roadmap-header-select').checked = visibleIds.size > 0 && [...visibleIds].every((id) => selectedRoadmap.has(id));
  document.querySelector('#roadmap-count').textContent = `${filtered.length} of ${roadmapItems.length} features`;
  renderOverview();
}

function routeMapHasId(id) {
  return roadmapItems.some((item) => item.id === id);
}

function searchAdmin(query) {
  const normalized = query.toLocaleLowerCase();
  const commands = Object.entries(adminViews).map(([type, meta]) => ({ type, id: '', title: meta.title, detail: 'Navigate to section' })).filter((item) => item.title.toLocaleLowerCase().includes(normalized));
  if (!query) return commands;
  const gameResults = (dashboard?.games || []).filter((game) => [game.title, game.category, game.description, ...(game.tags || [])]
    .join(' ').toLocaleLowerCase().includes(normalized))
    .map((game) => ({ type: 'games', id: game.id, title: game.title, detail: `Game · ${game.category}` }));
  const feedbackResults = feedbackEntries.filter((entry) => [entry.message, entry.type, entry.status, entry.gameId]
    .join(' ').toLocaleLowerCase().includes(normalized))
    .map((entry) => ({ type: 'community', id: entry.id, title: entry.message.slice(0, 100), detail: `Feedback · ${entry.status}` }));
  const roadmapResults = roadmapItems.filter((item) => [item.title, item.description, item.category, item.status, item.priority, item.internalNotes]
    .join(' ').toLocaleLowerCase().includes(normalized))
    .map((item) => ({ type: 'roadmap', id: item.id, title: item.title, detail: `Roadmap · ${roadmapStatusLabels[item.status]}` }));
  const jobResults = (dashboard?.jobs || []).filter((job) => [job.type, job.gameId, job.status, job.message]
    .join(' ').toLocaleLowerCase().includes(normalized))
    .map((job) => ({ type: 'operations', id: job.id, title: job.message, detail: `Job · ${job.status}` }));
  return [...commands, ...gameResults, ...feedbackResults, ...roadmapResults, ...jobResults].slice(0, 24);
}

function renderGlobalSearch() {
  const input = document.querySelector('#global-admin-search');
  const results = document.querySelector('#global-search-results');
  const matches = searchAdmin(input.value.trim());
  results.innerHTML = matches.length ? matches.map((item, index) => `<button id="search-option-${index}" aria-selected="false" class="global-search-result" type="button" role="option" data-search-view="${item.type}" data-search-id="${escapeHtml(item.id)}" data-search-title="${escapeHtml(item.title)}">
    <span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.detail)}</small>
  </button>`).join('') : input.value.trim() ? '<p class="global-search-empty">No matching games, feedback, roadmap items, or jobs.</p>' : '';
  results.hidden = !matches.length && !input.value.trim();
  input.setAttribute('aria-expanded', String(!results.hidden));
  input.removeAttribute('aria-activedescendant');
}

function renderGames() {
  if (!dashboard) return;
  const container = document.querySelector('#game-list');
  const query = document.querySelector('#game-filter').value.trim().toLocaleLowerCase();
  const status = document.querySelector('#status-filter').value;
  const category = document.querySelector('#category-filter');
  const selectedCategory = category.value;
  const sorting = document.querySelector('#game-sort').value;
  const categories = [...new Set(dashboard.games.map((game) => game.category).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  category.replaceChildren(new Option('All categories', 'all'));
  for (const name of categories) category.add(new Option(name, name));
  if (categories.includes(selectedCategory)) category.value = selectedCategory;
  const games = dashboard.games.filter((game) => {
    const searchable = [game.title, game.category, game.description, ...(game.tags || [])].join(' ').toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (status === 'all' || game.status === status)
      && (category.value === 'all' || game.category === category.value);
  });
  games.sort((first, second) => {
    if (sorting === 'category') return (first.category || '').localeCompare(second.category || '') || first.title.localeCompare(second.title);
    if (sorting === 'status') return first.status.localeCompare(second.status) || first.title.localeCompare(second.title);
    if (sorting === 'date-added') return (Date.parse(second.createdAt || '') || 0) - (Date.parse(first.createdAt || '') || 0) || first.title.localeCompare(second.title);
    return first.title.localeCompare(second.title);
  });
  document.querySelector('#library-count').textContent = `${games.length} of ${dashboard.games.length}`;
  container.innerHTML = games.length ? `<div class="table-wrap"><table class="game-table">
    <caption class="visually-hidden">Manage games in the Octo Industries library</caption>
    <thead><tr><th scope="col">Game</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
    <tbody>${games.map((game) => `<tr>
      <td><span class="game-title">${escapeHtml(game.title)}</span><span class="game-meta">${escapeHtml(game.description || (game.tags || []).join(', '))}</span></td>
      <td>${escapeHtml(game.category || 'Uncategorized')}</td>
      <td><span class="game-status" data-status="${escapeHtml(game.status)}">${escapeHtml(game.status)}</span>${game.offlineReady === true ? '<span class="offline-status">Offline verified</span>' : ''}</td>
      <td><div class="game-actions">
        <button class="small-button" type="button" data-action="edit" data-id="${escapeHtml(game.id)}" aria-label="Edit ${escapeHtml(game.title)}">Edit</button>
        <button class="small-button" type="button" data-action="health" data-id="${escapeHtml(game.id)}" aria-label="Run health check for ${escapeHtml(game.title)}">Health check</button>
        <button class="small-button ${game.status === 'published' ? 'is-published' : ''}" type="button" data-action="publish" data-published="${game.status !== 'published'}" data-id="${escapeHtml(game.id)}" aria-label="${game.status === 'published' ? 'Unpublish' : 'Publish'} ${escapeHtml(game.title)}">${game.status === 'published' ? 'Unpublish' : 'Publish'}</button>
      </div></td>
    </tr>`).join('')}</tbody></table></div>` : '<p class="muted">No games match these filters.</p>';
}

function renderJobs() {
  if (!dashboard) return;
  const container = document.querySelector('#job-list');
  const query = document.querySelector('#job-search').value.trim().toLocaleLowerCase();
  const jobs = [...dashboard.jobs].filter((job) => [job.type, job.gameId, job.status, job.message].join(' ').toLocaleLowerCase().includes(query));
  jobs.sort((first, second) => Number(second.status === 'failed') - Number(first.status === 'failed')
    || Date.parse(second.createdAt) - Date.parse(first.createdAt));
  container.innerHTML = jobs.length ? jobs.slice(0, 30).map((job) => {
    const result = job.result;
    let resultMarkup = '';
    if (result?.resources) {
      resultMarkup = `<details class="job-details"><summary>View source scan report</summary>
        <p>Title: ${escapeHtml(result.title || 'Not found')}<br>Engine hint: ${escapeHtml(result.engine)}<br>Page resources: ${result.resourceCount}<br>External references: ${result.externalCount}<br>Entry page: ${escapeHtml(result.entry)}</p>
        <pre>${escapeHtml(result.resources.map((item) => `${item.type}: ${item.url}${item.external ? ' (external)' : ''}`).join('\n') || 'No page resources found.')}</pre>
        <p>${escapeHtml(result.note)}</p></details>`;
    } else if (result?.checks) {
      resultMarkup = `<details class="job-details"><summary>View file check results</summary><pre>${escapeHtml(result.checks.map((check) => `${check.passed ? 'PASS' : 'FAIL'}  ${check.name}`).join('\n') + `\n\n${result.note}`)}</pre></details>`;
    }
    const download = job.type === 'standalone' && job.status === 'completed'
      ? '<button class="small-button" type="button" data-download-hub>Download hub HTML</button>' : '';
    return `<article class="job-item">
      <div class="job-topline"><span class="job-name">${escapeHtml(job.type)}${job.gameId ? ` · ${escapeHtml(job.gameId)}` : ''}</span><span class="job-status" data-status="${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></div>
      <p class="job-message">${escapeHtml(job.message)}<br><time>${escapeHtml(formatDate(job.createdAt))}</time></p>${resultMarkup}${download}
      ${job.logs?.length ? `<details class="job-details"><summary>Technical log</summary><pre>${escapeHtml(job.logs.join('\n'))}</pre></details>` : ''}
    </article>`;
  }).join('') : '<p class="muted">No admin jobs yet.</p>';
}

function renderActivity() {
  const container = document.querySelector('#activity-list');
  container.innerHTML = dashboard.activity.length ? dashboard.activity.slice(0, 12).map((item) => `
    <div class="activity-item">${escapeHtml(item.message)}<br><time>${escapeHtml(formatDate(item.createdAt))}</time></div>`).join('')
    : '<p class="muted">Admin actions will appear here.</p>';
}

function renderProposals() {
  const section = document.querySelector('#proposal-review');
  const container = document.querySelector('#proposal-list');
  const proposals = (dashboard?.proposals || []).filter((proposal) => ['pending', 'approved'].includes(proposal.status));
  section.hidden = proposals.length === 0;
  document.querySelector('#proposal-capability').hidden = dashboard?.capabilities?.changeProposals !== false;
  container.replaceChildren();
  for (const proposal of proposals) {
    const card = document.createElement('article');
    card.className = 'proposal-card';
    const heading = document.createElement('h4');
    heading.textContent = proposal.title;
    const summary = document.createElement('p');
    summary.textContent = proposal.summary;
    const meta = document.createElement('p');
    meta.className = 'proposal-meta';
    meta.textContent = `${proposal.kind === 'game' ? 'Game registration' : 'Code change'} · ${formatDate(proposal.createdAt)}`;
    card.append(heading, meta, summary);

    const details = document.createElement('details');
    const label = document.createElement('summary');
    label.textContent = proposal.kind === 'game' ? `Review ${proposal.manifestPath}` : 'Review proposed code diff';
    const preview = document.createElement('pre');
    preview.textContent = proposal.kind === 'game'
      ? JSON.stringify(proposal.manifest, null, 2)
      : proposal.diff;
    details.append(label, preview);
    card.append(details);

    if (proposal.status === 'approved' && proposal.pullRequest?.url) {
      const link = document.createElement('a');
      link.className = 'small-button';
      link.href = proposal.pullRequest.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `Review GitHub pull request #${proposal.pullRequest.number}`;
      card.append(link);
    } else {
      const actions = document.createElement('div');
      actions.className = 'proposal-actions';
      const approve = document.createElement('button');
      approve.className = 'small-button proposal-approve';
      approve.type = 'button';
      approve.dataset.proposalAction = 'approve';
      approve.dataset.proposalId = proposal.id;
      approve.textContent = 'Approve and open GitHub PR';
      const dismiss = document.createElement('button');
      dismiss.className = 'small-button';
      dismiss.type = 'button';
      dismiss.dataset.proposalAction = 'dismiss';
      dismiss.dataset.proposalId = proposal.id;
      dismiss.textContent = 'Dismiss';
      actions.append(approve, dismiss);
      card.append(actions);
    }
    container.append(card);
  }
}

const feedbackStatusLabels = {
  new: 'New',
  under_review: 'Under Review',
  awaiting_user: 'Awaiting User',
  planned: 'Planned',
  in_progress: 'In Progress',
  awaiting_user_reply: 'Awaiting User Reply',
  implemented: 'Implemented',
  resolved: 'Resolved',
  rejected: 'Rejected',
  closed: 'Closed',
};
const feedbackPriorityLabels = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

function formatFeedbackDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Bahrain', timeZoneName: 'short',
  }).format(date);
}

function bahrainDateKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bahrain',
  }).format(date);
}

function renderFeedback() {
  for (const control of document.querySelectorAll('#feedback-list textarea')) {
    const id = control.dataset.feedbackNotes || control.closest('[data-admin-reply]')?.dataset.adminReply;
    if (id) feedbackDrafts.set((control.dataset.feedbackNotes ? 'notes:' : 'reply:') + id, control.value);
  }
  if (feedbackLoadError) {
    const container = document.querySelector('#feedback-list');
    container.replaceChildren();
    document.querySelector('#ticket-analytics-metrics').innerHTML =
      '<p class="feedback-empty" role="status">Ticket statistics are unavailable.</p>';
    document.querySelector('#ticket-status-breakdown').replaceChildren();
    const message = document.createElement('p');
    message.className = 'muted feedback-empty';
    message.textContent = formatLoadError('Inquiries', '/api/admin/feedback', feedbackLoadError);
    container.append(message);
    document.querySelector('#feedback-new-count').textContent = 'Unavailable';
    document.querySelector('#feedback-selection-count').textContent = `${selectedFeedback.size} selected`;
    document.querySelector('#feedback-result-count').textContent = '';
    document.querySelector('#feedback-active-filters').replaceChildren();
    document.querySelector('#feedback-clear-filters').hidden = true;
    return;
  }
  const games = new Map((dashboard?.games || []).map((game) => [game.id, game.title]));
  const gameFilter = document.querySelector('#feedback-game-filter');
  const selectedGame = gameFilter.value;
  gameFilter.replaceChildren(new Option('All games', 'all'), new Option('Not related to a game', 'none'));
  for (const game of dashboard?.games || []) gameFilter.add(new Option(game.title, game.id));
  if ([...gameFilter.options].some((option) => option.value === selectedGame)) gameFilter.value = selectedGame;

  const query = document.querySelector('#feedback-search').value.trim().toLocaleLowerCase();
  const type = document.querySelector('#feedback-type-filter').value;
  const status = document.querySelector('#feedback-status-filter').value;
  const priority = document.querySelector('#feedback-priority-filter').value;
  const gameId = document.querySelector('#feedback-game-filter').value;
  const sorting = document.querySelector('#feedback-sort').value;
  const dateFrom = document.querySelector('#feedback-date-from').value;
  const dateTo = document.querySelector('#feedback-date-to').value;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeTickets = feedbackEntries.filter((entry) => !entry.archived);
  const totalTickets = feedbackEntries.length;
  const metrics = [
    { key: 'total', label: 'Total tickets', count: totalTickets },
    { key: 'new', label: 'New', count: activeTickets.filter((entry) => entry.status === 'new').length },
    { key: 'critical', label: 'Critical', count: activeTickets.filter((entry) => entry.priority === 'critical').length },
    { key: 'created-recently', label: 'Created in 30 days', count: feedbackEntries.filter((entry) => {
      const createdAt = Date.parse(entry.createdAt);
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    }).length },
  ];
  document.querySelector('#ticket-analytics-metrics').innerHTML = metrics.map((metric) => `
    <article class="ticket-stat-card" data-stat="${metric.key}" aria-label="${escapeHtml(metric.label)}: ${metric.count}">
      <span>${escapeHtml(metric.label)}</span><strong>${metric.count}</strong>
    </article>`).join('');
  const breakdown = [...Object.entries(feedbackStatusLabels).map(([key, label]) => ({
    key, label, count: activeTickets.filter((entry) => entry.status === key).length,
  })), { key: 'archived', label: 'Archived', count: feedbackEntries.filter((entry) => entry.archived).length }];
  const largestCount = Math.max(1, ...breakdown.map((item) => item.count));
  document.querySelector('#ticket-status-breakdown').innerHTML = breakdown.map((item) => `
    <div class="ticket-status-count" data-status="${item.key}"><span>${item.label}</span><strong>${item.count}</strong>
      <i style="--ticket-status-share:${Math.round(item.count / largestCount * 100)}%"></i></div>`).join('');
  const filtered = feedbackEntries.filter((entry) => {
    const searchable = [
      entry.ticketNumber && `#${entry.ticketNumber}`, entry.message, games.get(entry.gameId) || '', entry.type, entry.priority,
      entry.deviceInfo?.deviceType, entry.deviceInfo?.deviceName, entry.deviceInfo?.operatingSystem,
      entry.deviceInfo?.operatingSystemVersion, entry.deviceInfo?.browser, entry.deviceInfo?.browserVersion,
      entry.deviceInfo?.language, entry.deviceInfo?.timezone, entry.deviceInfo?.screenResolution, entry.deviceInfo?.octoVersion,
    ].join(' ').toLocaleLowerCase();
    const createdDay = bahrainDateKey(entry.createdAt);
    return (!query || searchable.includes(query))
      && (type === 'all' || entry.type === type)
      && (status === 'all' || (status === 'archived' ? entry.archived : entry.status === status))
      && (priority === 'all' || entry.priority === priority)
      && (!dateFrom || createdDay >= dateFrom)
      && (!dateTo || createdDay <= dateTo)
      && (gameId === 'all' || (gameId === 'none' ? !entry.gameId : entry.gameId === gameId));
  });
  const statusOrder = ['new', 'under_review', 'awaiting_user', 'awaiting_user_reply', 'in_progress', 'planned', 'implemented', 'resolved', 'rejected', 'closed'];
  filtered.sort((first, second) => {
    const firstCreated = Date.parse(first.createdAt) || 0;
    const secondCreated = Date.parse(second.createdAt) || 0;
    if (sorting === 'oldest') return firstCreated - secondCreated;
    if (sorting === 'updated') return (Date.parse(second.updatedAt) || 0) - (Date.parse(first.updatedAt) || 0);
    if (sorting === 'status') return (statusOrder.indexOf(first.status) < 0 ? statusOrder.length : statusOrder.indexOf(first.status))
      - (statusOrder.indexOf(second.status) < 0 ? statusOrder.length : statusOrder.indexOf(second.status));
    if (sorting === 'type') return first.type.localeCompare(second.type) || secondCreated - firstCreated;
    if (sorting === 'game') return (games.get(first.gameId) || '').localeCompare(games.get(second.gameId) || '');
    return secondCreated - firstCreated;
  });
  const newCount = feedbackEntries.filter((entry) => entry.status === 'new').length;
  const archivedCount = feedbackEntries.filter((entry) => entry.archived).length;
  const visibleIds = new Set(filtered.map((entry) => entry.id));
  for (const id of selectedFeedback) {
    if (!feedbackEntries.some((entry) => entry.id === id)) selectedFeedback.delete(id);
  }
  document.querySelector('#feedback-new-count').textContent = `${newCount} New · ${archivedCount} Archived`;
  const activeFilters = [];
  if (query) activeFilters.push(['query', `Search: ${document.querySelector('#feedback-search').value.trim()}`]);
  if (type !== 'all') activeFilters.push(['type', type === 'issue' ? 'Issues' : 'Suggestions']);
  if (status !== 'all') activeFilters.push(['status', status === 'archived' ? 'Archived' : feedbackStatusLabels[status] || status]);
  if (priority !== 'all') activeFilters.push(['priority', `${feedbackPriorityLabels[priority] || priority} priority`]);
  if (gameId !== 'all') activeFilters.push(['game', gameId === 'none' ? 'Not related to a game' : games.get(gameId) || 'Unknown game']);
  if (dateFrom) activeFilters.push(['date-from', `From ${dateFrom}`]);
  if (dateTo) activeFilters.push(['date-to', `Through ${dateTo}`]);
  document.querySelector('#feedback-result-count').textContent =
    `${filtered.length} of ${feedbackEntries.length} tickets`;
  document.querySelector('#feedback-active-filters').innerHTML = activeFilters.map(([key, label]) => `
    <button class="filter-chip" type="button" data-clear-feedback-filter="${key}"
      aria-label="Remove filter: ${escapeHtml(label)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join('');
  document.querySelector('#feedback-clear-filters').hidden = activeFilters.length === 0;

  const container = document.querySelector('#feedback-list');
  container.innerHTML = filtered.length ? filtered.map((entry) => {
    const device = entry.deviceInfo || {};
    const statusLabel = feedbackStatusLabels[entry.status] || entry.status.replaceAll('_', ' ');
    const priorityLabel = feedbackPriorityLabels[entry.priority] || 'Medium';
    const message = escapeHtml(entry.message);
    return `<article class="feedback-card${entry.status === 'new' ? ' is-new' : ''}" data-feedback-card="${escapeHtml(entry.id)}">
      <div class="feedback-card-head">
        <label class="feedback-select-label"><input type="checkbox" data-feedback-select="${escapeHtml(entry.id)}"${selectedFeedback.has(entry.id) ? ' checked' : ''} aria-label="Select ticket #${escapeHtml(entry.ticketNumber || '—')}"></label>
        <div class="feedback-card-heading">
          <div class="feedback-ticket-identity">
            <span class="feedback-ticket-number">#${escapeHtml(entry.ticketNumber || '—')}</span>
            <span class="feedback-type" data-type="${escapeHtml(entry.type)}">${entry.type === 'issue' ? 'ISSUE' : 'SUGGESTION'}</span>
          </div>
          <div class="feedback-badges">
            <span class="feedback-status-badge" data-status="${escapeHtml(entry.status)}">${escapeHtml(statusLabel)}</span>
            <span class="feedback-priority-badge" data-priority="${escapeHtml(entry.priority || 'medium')}">${escapeHtml(priorityLabel)}</span>
          </div>
        </div>
        <time class="feedback-time" datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatFeedbackDate(entry.createdAt))}</time>
      </div>
      <div class="feedback-card-body">
        <h3>${entry.type === 'issue' ? 'Issue report' : 'Suggestion'}</h3>
        <p class="feedback-message">${message}</p>
        <details class="feedback-full-message"><summary>Read full inquiry</summary><p>${message}</p></details>
      </div>
      <dl class="feedback-meta">
        <div><dt>Game</dt><dd>${escapeHtml(entry.gameId ? games.get(entry.gameId) || 'Unknown game' : 'Not related to a game')}</dd></div>
        <div><dt>Device</dt><dd>${escapeHtml([device.deviceType, device.deviceName, device.operatingSystem].filter(Boolean).join(' · ') || 'Unknown')}</dd></div>
        <div><dt>Browser</dt><dd>${escapeHtml([device.browser, device.browserVersion].filter(Boolean).join(' ').trim() || 'Unknown')}</dd></div>
        <div><dt>Language</dt><dd>${escapeHtml(device.language || 'Unknown')}</dd></div>
      </dl>
      <div class="feedback-management">
        <label>Status
          <select data-feedback-status="${escapeHtml(entry.id)}" aria-label="Status for ticket #${escapeHtml(entry.ticketNumber || '—')}">
            ${Object.entries(feedbackStatusLabels).map(([key, label]) => `<option value="${key}"${entry.status === key ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <label>Priority
          <select data-feedback-priority="${escapeHtml(entry.id)}" aria-label="Priority for ticket #${escapeHtml(entry.ticketNumber || '—')}">
            ${Object.entries(feedbackPriorityLabels).map(([key, label]) => `<option value="${key}"${entry.priority === key ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <details class="feedback-actions-menu">
          <summary aria-label="More actions for ticket #${escapeHtml(entry.ticketNumber || '—')}" title="More actions">•••</summary>
          <div>
            <button class="small-button" type="button" data-feedback-archive="${escapeHtml(entry.id)}" data-archived="${entry.archived ? 'true' : 'false'}">${entry.archived ? 'Restore ticket' : 'Archive ticket'}</button>
            <button class="small-button feedback-delete-button" type="button" data-feedback-delete="${escapeHtml(entry.id)}">Delete ticket</button>
          </div>
        </details>
      </div>
      <details class="feedback-card-disclosure" data-ticket-conversation="${escapeHtml(entry.id)}"${openedConversations.has(entry.id) ? ' open' : ''}>
        <summary>Conversation and activity</summary>
        <div class="feedback-conversation" data-conversation-list="${escapeHtml(entry.id)}"><p class="subtle">Open to load conversation history.</p></div>
        ${entry.userAccessEnabled ? `<form class="feedback-reply-form" data-admin-reply="${escapeHtml(entry.id)}">
          <label for="feedback-reply-${escapeHtml(entry.id)}">Reply to user</label>
          <textarea id="feedback-reply-${escapeHtml(entry.id)}" name="message" rows="3" maxlength="5000" placeholder="Write a clear reply…" required></textarea>
          <div class="feedback-reply-actions"><button class="small-button" type="submit">Send reply</button>
            <p data-admin-reply-status role="status" aria-live="polite"></p></div>
        </form>` : '<p class="subtle">Legacy inquiry: no user portal access was issued, so replies are unavailable.</p>'}
      </details>
      <details class="feedback-card-disclosure" data-feedback-details="${escapeHtml(entry.id)}"${openedFeedback.has(entry.id) ? ' open' : ''}>
        <summary>Diagnostics and private notes</summary>
        <dl class="feedback-device-details">
          <div><dt>Operating system</dt><dd>${escapeHtml([device.operatingSystem, device.operatingSystemVersion].filter(Boolean).join(' ') || 'Unknown')}</dd></div>
          <div><dt>Timezone</dt><dd>${escapeHtml(device.timezone || 'Unknown')}</dd></div>
          <div><dt>Screen</dt><dd>${escapeHtml(device.screenResolution || 'Unknown')}</dd></div>
          <div><dt>Build</dt><dd>${escapeHtml(device.octoVersion || 'Unknown')}</dd></div>
        </dl>
        <label for="feedback-note-${escapeHtml(entry.id)}">Private admin notes</label>
        <textarea id="feedback-note-${escapeHtml(entry.id)}" data-feedback-notes="${escapeHtml(entry.id)}" rows="3" maxlength="5000">${escapeHtml(entry.adminNotes || '')}</textarea>
        <button class="small-button" type="button" data-save-feedback-notes="${escapeHtml(entry.id)}">Save private notes</button>
      </details>
    </article>`;
  }).join('') : '<p class="muted feedback-empty">No feedback matches these filters.</p>';
  document.querySelector('#feedback-selection-count').textContent = `${selectedFeedback.size} selected`;
  document.querySelector('#feedback-select-all').checked = visibleIds.size > 0 && [...visibleIds].every((id) => selectedFeedback.has(id));
  for (const control of document.querySelectorAll('#feedback-list textarea')) {
    const id = control.dataset.feedbackNotes || control.closest('[data-admin-reply]')?.dataset.adminReply;
    const key = (control.dataset.feedbackNotes ? 'notes:' : 'reply:') + id;
    if (feedbackDrafts.has(key)) control.value = feedbackDrafts.get(key);
  }

}

async function updateFeedbackStatus(id, status) {
  const result = await api(`/api/admin/feedback/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  const entry = feedbackEntries.find((feedback) => feedback.id === id);
  if (entry) {
    entry.status = status;
    entry.updatedAt = result.updatedAt;
  }
  if (status === 'new') openedFeedback.delete(id);
  renderFeedback();
}

async function updateFeedbackPriority(id, priority) {
  const result = await api(`/api/admin/feedback/${encodeURIComponent(id)}/priority`, {
    method: 'PATCH',
    body: JSON.stringify({ priority }),
  });
  const entry = feedbackEntries.find((feedback) => feedback.id === id);
  if (entry) {
    entry.priority = priority;
    entry.updatedAt = result.updatedAt;
  }
  renderFeedback();
}

async function loadFeedbackConversation(id) {
  const container = feedbackList.querySelector(`[data-conversation-list="${id}"]`);
  if (!container) return;
  container.innerHTML = '<p class="subtle">Loading conversation…</p>';
  try {
    const result = await api(`/api/admin/feedback/${encodeURIComponent(id)}/conversation`);
    const messages = result.conversation || [];
    const activity = result.activity || [];
    container.innerHTML = `${messages.length ? `<ol class="feedback-conversation-list">${messages.map((message) => `
      <li data-author="${message.author === 'admin' ? 'admin' : 'user'}"><div><strong>${message.author === 'admin' ? 'Admin' : 'User'}</strong><time>${escapeHtml(formatFeedbackDate(message.createdAt))}</time></div><p>${escapeHtml(message.message)}</p></li>`).join('')}</ol>` : '<p class="subtle">No conversation messages.</p>'}
      ${activity.length ? `<ul class="feedback-activity-list">${activity.map((event) => {
        const action = event.action || '';
        const actor = event.actor_type || event.actorType || 'admin';
        const createdAt = event.created_at || event.createdAt;
        return `<li><span>${escapeHtml(actor === 'user' ? 'User' : 'Admin')} · ${escapeHtml(action.replaceAll('_', ' '))}</span><time>${escapeHtml(formatFeedbackDate(createdAt))}</time></li>`;
      }).join('')}</ul>` : ''}`;
  } catch (error) {
    container.textContent = error.message;
  }
}

function formatLoadError(label, endpoint, error) {
  const status = error.displayStatus || (error.status ? `HTTP ${error.status}` : 'Network error');
  const requestId = error.requestId ? ` Request ID: ${error.requestId}.` : '';
  const technical = error.details || error.message;
  return `Unable to load ${label.toLowerCase()}. Endpoint: GET ${endpoint}. Status: ${status}.${requestId} ${technical} Retry available.`;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function showDashboardError(error) {
  document.dispatchEvent(new Event('octo:data-error'));
  const endpoint = error.endpoint || 'GET /api/admin/dashboard';
  const status = error.displayStatus || (error.status ? `HTTP ${error.status}` : 'Network error');
  if (dashboardErrorMessage) {
    dashboardErrorMessage.textContent =
      `Unable to load dashboard statistics and operations data. Endpoint: ${endpoint}. Status: ${status}.${error.requestId ? ` Request ID: ${error.requestId}.` : ''}`;
  }
  setText('#dashboard-error-details', error.details || error.message || 'The request did not return a response.');
  if (dashboardError) dashboardError.hidden = false;
  for (const selector of ['#metric-total', '#metric-published', '#metric-drafts', '#metric-failed',
    '#metric-offline', '#metric-categories', '#metric-activity-today', '#metric-open-feedback']) {
    setText(selector, 'Unavailable');
  }
  for (const selector of ['#nav-game-count', '#nav-feedback-count', '#nav-failed-count', '#nav-roadmap-count']) {
    setText(selector, '!');
  }
  for (const selector of ['#overview-jobs', '#overview-activity']) {
    const content = document.querySelector(selector);
    content.replaceChildren();
    const message = document.createElement('p');
    message.className = 'muted overview-empty';
    message.textContent = formatLoadError(selector === '#overview-jobs' ? 'Recent jobs' : 'Recent activity', '/api/admin/dashboard', error);
    content.append(message);
  }
  renderOverviewFeedback();
  setText('#roadmap-summary', 'Roadmap data unavailable until dashboard data can be loaded.');
}

function responseShapeError(path, reason) {
  const error = new Error(`The server returned invalid data: ${reason}.`);
  error.endpoint = `GET ${path}`;
  error.displayStatus = 'Invalid response';
  return error;
}

function validateDashboardPayload(payload) {
  const counts = payload?.counts;
  const arrays = ['games', 'jobs', 'activity', 'roadmap', 'proposals'];
  if (!counts || typeof counts !== 'object'
    || !['total', 'published', 'drafts', 'offlineReady', 'failedJobs'].every((key) => Number.isFinite(counts[key]))
    || arrays.some((key) => !Array.isArray(payload[key]) || payload[key].some((entry) => !entry || typeof entry !== 'object'))) {
    throw responseShapeError('/api/admin/dashboard', 'expected counts and games, jobs, activity, roadmap, and proposals arrays');
  }
  return payload;
}

function refreshDashboard() {
  if (!dashboardRefreshPromise) {
    dashboardRefreshPromise = refreshDashboardData().finally(() => {
      dashboardRefreshPromise = null;
    });
  }
  return dashboardRefreshPromise;
}

async function refreshDashboardData() {
  const generation = sessionGeneration;
  if (!dashboard) {
    for (const selector of ['#overview-jobs', '#overview-activity', '#overview-feedback']) {
      const content = document.querySelector(selector);
      content.textContent = 'Loading…';
    }
  }
  const [dashboardResult, feedbackResult] = await Promise.allSettled([
    api('/api/admin/dashboard'),
    api('/api/admin/feedback'),
  ]);
  if (generation !== sessionGeneration) return;
  if ((dashboardResult.status === 'rejected' && dashboardResult.reason?.status === 401) || (feedbackResult.status === 'rejected' && feedbackResult.reason?.status === 401)) {
    showLogin('Your admin session expired. Sign in again to continue.');
    return;
  }
  feedbackLoadError = feedbackResult.status === 'rejected'
    ? feedbackResult.reason
    : !Array.isArray(feedbackResult.value) || feedbackResult.value.some((entry) => !entry
      || typeof entry.id !== 'string' || typeof entry.message !== 'string'
      || typeof entry.status !== 'string' || typeof entry.createdAt !== 'string')
      ? responseShapeError('/api/admin/feedback', 'expected inquiry records with IDs, messages, statuses, and timestamps')
      : null;
  if (feedbackResult.status === 'fulfilled' && !feedbackLoadError) feedbackEntries = feedbackResult.value;
  if (dashboardResult.status === 'rejected') {
    dashboard = undefined;
    showDashboardError(dashboardResult.reason);
    renderFeedback();
    if (!feedbackLoadError) {
      const openInquiries = feedbackEntries.filter((entry) => !entry.archived
        && !['implemented', 'resolved', 'rejected', 'closed'].includes(entry.status)).length;
      document.querySelector('#metric-open-feedback').textContent = openInquiries;
      document.querySelector('#nav-feedback-count').textContent = openInquiries;
    }
    return;
  }
  try {
    const payload = validateDashboardPayload(dashboardResult.value);
    if (!Array.isArray(window.OCTO_GAMES) || !window.OCTO_GAMES.length) {
      throw responseShapeError('/catalog.js', 'the generated game catalog is missing or empty');
    }
    dashboard = payload;
    dashboardError.hidden = true;
    roadmapItems = dashboard.roadmap;
    updateMetrics(dashboard.counts, dashboard.games, dashboard.activity);
    renderGames();
    renderJobs();
    renderActivity();
    renderProposals();
    renderFeedback();
    renderRoadmap();
    renderOverview();
    document.dispatchEvent(new Event('octo:snapshot'));
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    dashboard = undefined;
    roadmapItems = [];
    if (!failure.endpoint) failure.endpoint = 'GET /api/admin/dashboard';
    if (!failure.displayStatus && !failure.status) failure.displayStatus = 'Client rendering error';
    showDashboardError(failure);
    renderFeedback();
    return;
  }
  const pollEvery = dashboard.jobs.some((job) => job.status === 'queued' || job.status === 'running')
    ? 5000
    : 30000;
  if (refreshInterval !== pollEvery) {
    clearInterval(refreshTimer);
    refreshInterval = pollEvery;
    refreshTimer = setInterval(() => { if (!document.hidden && !pendingMutations.size && !document.querySelector('dialog[open]') && !document.activeElement?.matches('input,textarea,select')) refreshDashboard().catch((error) => showToast(error.message)); }, pollEvery);
  }
}

dashboardRetryButton.addEventListener('click', async () => {
  dashboardRetryButton.disabled = true;
  try {
    await refreshDashboard();
  } catch (error) {
    if (error.message !== 'Admin authentication required.') showDashboardError(error);
  } finally {
    dashboardRetryButton.disabled = false;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage(loginMessage, '');
  try {
    const password = document.querySelector('#password').value;
    const challenge = await api('/api/admin/login/challenge', { method: 'POST', body: '{}' });
    showMessage(loginMessage, 'Verifying password securely…');
    const proof = await createLoginProof(password, challenge);
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ challengeId: challenge.challengeId, proof }),
    });
    storeToken(result.token);
    document.querySelector('#password').value = '';
    showMessage(loginMessage, '');
    showDashboard();
    await refreshDashboard();
  } catch (error) {
    document.querySelector('#password').value = '';
    if (dashboardView.hidden) showMessage(loginMessage, error.message);
    else if (error.message !== 'Admin authentication required.') showDashboardError(error);
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    showLogin();
  } catch (error) {
    if (error.status === 401) showLogin('Your admin session expired. Sign in again to continue.');
    else showToast(error.message);
  }
});

document.querySelector('#analyze-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const message = document.querySelector('#agent-message');
  button.disabled = true;
  showMessage(message, 'Queued page scan. This will not download or alter game files.');
  try {
    const job = await api('/api/admin/analyze', {
      method: 'POST',
      body: JSON.stringify({ url: document.querySelector('#game-url').value.trim() }),
    });
    showMessage(message, `Source scan completed. Review job ${job.id} in the job center.`);
    await refreshDashboard();
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
});

function renderChat() {
  const transcript = document.querySelector('#chat-transcript');
  transcript.replaceChildren();
  if (!chatHistory.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = 'Try “Which games are not marked offline-ready?” or “What jobs need attention?”';
    transcript.append(empty);
    return;
  }
  for (const message of chatHistory) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-message';
    bubble.dataset.role = message.role;
    if (message.role === 'assistant') bubble.append(renderChatMarkdown(message.content));
    else bubble.textContent = message.content;
    transcript.append(bubble);
  }
  transcript.scrollTop = transcript.scrollHeight;
}

document.querySelector('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const button = document.querySelector('#chat-send');
  const status = document.querySelector('#chat-message');
  const question = input.value.trim();
  if (!question) return;
  button.disabled = true;
  input.disabled = true;
  showMessage(status, 'Octo AI is thinking…');
  chatHistory.push({ role: 'user', content: question });
  if (chatHistory.length > 20) chatHistory.splice(0, 2);
  input.value = '';
  renderChat();
  try {
    const result = await api('/api/admin/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: chatHistory.slice(-20) }),
    });
    if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('The assistant returned no answer. Your question was not applied as an action.');
    chatHistory.push({ role: 'assistant', content: result.answer });
    if (result.proposal) {
      dashboard.proposals.unshift(result.proposal);
      dashboard.proposals = dashboard.proposals.slice(0, 20);
      renderProposals();
    }
    showMessage(status, '');
    renderChat();
  } catch (error) {
    chatHistory.pop();
    input.value = question;
    renderChat();
    showMessage(status, error.message);
  } finally {
    button.disabled = false;
    input.disabled = false;
    input.focus();
  }
});

document.querySelector('#proposal-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-proposal-action]');
  if (!button) return;
  const { proposalAction: action, proposalId: id } = button.dataset;
  if (action === 'approve' && !window.confirm('Approve this exact proposal and open a GitHub pull request? It will not be merged or deployed.')) return;
  button.disabled = true;
  try {
    await api(`/api/admin/proposals/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' });
    if (action === 'approve') showToast('Pull request opened. Review it on GitHub before merging.');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

const feedbackList = document.querySelector('#feedback-list');
feedbackList.addEventListener('toggle', async (event) => {
  const conversation = event.target.closest('details[data-ticket-conversation]');
  if (conversation) {
    const id = conversation.dataset.ticketConversation;
    if (conversation.open) {
      openedConversations.add(id);
      await loadFeedbackConversation(id);
    } else {
      openedConversations.delete(id);
    }
    return;
  }
  const details = event.target.closest('details[data-feedback-details]');
  if (!details) return;
  const id = details.dataset.feedbackDetails;
  if (details.open) {
    openedFeedback.add(id);
  } else {
    openedFeedback.delete(id);
  }
}, true);

feedbackList.addEventListener('change', async (event) => {
  const status = event.target.closest('[data-feedback-status]');
  if (status) {
    status.disabled = true;
    try {
      await updateFeedbackStatus(status.dataset.feedbackStatus, status.value);
    } catch (error) {
      showToast(error.message);
      renderFeedback();
    }
    return;
  }
  const priority = event.target.closest('[data-feedback-priority]');
  if (priority) {
    priority.disabled = true;
    try {
      await updateFeedbackPriority(priority.dataset.feedbackPriority, priority.value);
    } catch (error) {
      showToast(error.message);
      renderFeedback();
    }
    return;
  }
  if (event.target.matches('[data-feedback-select]')) {
    if (event.target.checked && selectedFeedback.size >= 50) {
      event.target.checked = false;
      showToast('Select up to 50 submissions per bulk action.');
      return;
    }
    if (event.target.checked) selectedFeedback.add(event.target.dataset.feedbackSelect);
    else selectedFeedback.delete(event.target.dataset.feedbackSelect);
    document.querySelector('#feedback-selection-count').textContent = `${selectedFeedback.size} selected`;
  }
});

feedbackList.addEventListener('click', async (event) => {
  const archiveButton = event.target.closest('[data-feedback-archive]');
  if (archiveButton) {
    const id = archiveButton.dataset.feedbackArchive;
    const action = archiveButton.dataset.archived === 'true' ? 'unarchive' : 'archive';
    const entry = feedbackEntries.find((feedback) => feedback.id === id);
    if (action === 'archive'
      && !window.confirm(`Archive ticket #${entry?.ticketNumber || '—'}? You can restore it later.`)) return;
    archiveButton.disabled = true;
    try {
      const result = await api(`/api/admin/feedback/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' });
      if (entry) {
        entry.archived = result.archived;
        entry.updatedAt = result.updatedAt;
      }
      renderFeedback();
    } catch (error) {
      showToast(error.message);
      archiveButton.disabled = false;
    }
    return;
  }
  const deleteButton = event.target.closest('[data-feedback-delete]');
  if (deleteButton) {
    const id = deleteButton.dataset.feedbackDelete;
    if (!window.confirm('Delete this ticket and revoke its user access?')) return;
    deleteButton.disabled = true;
    try {
      await api(`/api/admin/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' });
      feedbackEntries = feedbackEntries.filter((entry) => entry.id !== id);
      showUndo('Ticket deleted; user access revoked.', async () => { await api(`/api/admin/feedback/${encodeURIComponent(id)}/restore`, { method: 'POST', body: '{}' }); await refreshDashboard(); });
      selectedFeedback.delete(id);
      updateMetrics(dashboard.counts, dashboard.games, dashboard.activity);
      renderFeedback();
    } catch (error) {
      showToast(error.message);
      deleteButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest('[data-save-feedback-notes]');
  if (!button) return;
  button.disabled = true;
  const id = button.dataset.saveFeedbackNotes;
  const notes = feedbackList.querySelector(`[data-feedback-notes="${id}"]`).value;
  try {
    const result = await api(`/api/admin/feedback/${encodeURIComponent(id)}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ adminNotes: notes }),
    });
    const entry = feedbackEntries.find((feedback) => feedback.id === id);
    if (entry) {
      entry.adminNotes = notes.trim();
      entry.updatedAt = result.updatedAt;
    }
    showToast('Private notes saved.');
    renderFeedback();
    const details = feedbackList.querySelector(`[data-feedback-details="${id}"]`);
    if (details) details.open = true;
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

feedbackList.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-admin-reply]');
  if (!form) return;
  event.preventDefault();
  const id = form.dataset.adminReply;
  const submit = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-admin-reply-status]');
  submit.disabled = true;
  status.textContent = 'Sending reply…';
  try {
    await api(`/api/admin/feedback/${encodeURIComponent(id)}/reply`, {
      method: 'POST', body: JSON.stringify({ message: form.elements.message.value }),
    });
    form.elements.message.value = '';
    feedbackDrafts.delete('reply:' + id);
    status.textContent = 'Reply sent. Refreshing conversation…';
    openedConversations.add(id);
    await refreshDashboard();
    await loadFeedbackConversation(id);
    showToast('Reply sent to ticket.');
  } catch (error) {
    status.textContent = error.message;
    submit.disabled = false;
  }
});

  for (const selector of ['#feedback-search', '#feedback-type-filter', '#feedback-status-filter', '#feedback-priority-filter', '#feedback-game-filter', '#feedback-sort', '#feedback-date-from', '#feedback-date-to']) {
    document.querySelector(selector).addEventListener(selector === '#feedback-search' ? 'input' : 'change', renderFeedback);
}
document.querySelector('#feedback-clear-filters').addEventListener('click', () => {
  document.querySelector('#feedback-search').value = '';
  for (const selector of ['#feedback-type-filter', '#feedback-status-filter', '#feedback-priority-filter', '#feedback-game-filter']) {
    document.querySelector(selector).value = 'all';
  }
  document.querySelector('#feedback-sort').value = 'newest';
  document.querySelector('#feedback-date-from').value = '';
  document.querySelector('#feedback-date-to').value = '';
  renderFeedback();
});
document.querySelector('#feedback-active-filters').addEventListener('click', (event) => {
  const chip = event.target.closest('[data-clear-feedback-filter]');
  if (!chip) return;
  const selectors = {
    query: '#feedback-search',
    type: '#feedback-type-filter',
    status: '#feedback-status-filter',
    priority: '#feedback-priority-filter',
    game: '#feedback-game-filter',
    'date-from': '#feedback-date-from',
    'date-to': '#feedback-date-to',
  };
  const control = document.querySelector(selectors[chip.dataset.clearFeedbackFilter]);
  if (!control) return;
  control.value = control.matches('select') ? 'all' : '';
  renderFeedback();
});
document.querySelector('#feedback-select-all').addEventListener('change', (event) => {
  feedbackList.querySelectorAll('input[data-feedback-select]').forEach((checkbox) => {
    const id = checkbox.dataset.feedbackSelect;
    if (event.currentTarget.checked) {
      if (selectedFeedback.size < 50 || selectedFeedback.has(id)) {
        checkbox.checked = true;
        selectedFeedback.add(id);
      } else {
        checkbox.checked = false;
      }
    } else {
      checkbox.checked = false;
      selectedFeedback.delete(id);
    }
  });
  const allVisibleSelected = [...feedbackList.querySelectorAll('input[data-feedback-select]')].every((checkbox) => checkbox.checked);
  event.currentTarget.checked = event.currentTarget.checked && allVisibleSelected;
  if (selectedFeedback.size === 50 && !allVisibleSelected) showToast('Select up to 50 submissions per bulk action.');
  document.querySelector('#feedback-selection-count').textContent = `${selectedFeedback.size} selected`;
});
async function runFeedbackBulk(action) {
  const ids = [...selectedFeedback];
  const status = document.querySelector('#feedback-bulk-status').value;
  if (!ids.length || (action === 'status' && !status)) { showToast('Select inquiries and choose an action first.'); return; }
  const description = action === 'status' ? 'Change the status of' : action === 'archive' ? 'Archive' : action === 'restore' ? 'Restore' : 'Delete';
  if (!window.confirm(description + ' ' + ids.length + ' selected tickets' + (action === 'status' ? ' to ' + feedbackStatusLabels[status] : '') + '?' + (action === 'delete' ? ' User ticket access will be revoked. Records are soft-deleted.' : ''))) return;
  const controls = [...document.querySelectorAll('.feedback-bulk button, .feedback-bulk select')];
  controls.forEach((control) => { control.disabled = true; });
  try {
    const body = action === 'status' ? { ids, status } : action === 'delete' ? { ids, deleted: true } : { ids, archived: action === 'archive' };
    const result = await api('/api/admin/feedback/bulk', { method: 'POST', body: JSON.stringify(body) });
    const summary = OctoAdminCore.summarizeBulk(result, ids);
    selectedFeedback.clear(); summary.remaining.forEach((id) => selectedFeedback.add(id));
    document.querySelector('#feedback-select-all').checked = false;
    await refreshDashboard();
    showToast(summary.updated + ' of ' + ids.length + ' tickets updated.' + (summary.failed ? ' ' + summary.failed + ' could not be confirmed; remaining selections retained.' : '') + (result.warning ? ' ' + result.warning : ''));
  } catch (error) { showToast(error.message); }
  finally { controls.forEach((control) => { control.disabled = false; }); }
}
for (const [id, action] of [['apply', 'status'], ['archive', 'archive'], ['restore', 'restore'], ['delete', 'delete']]) {
  document.querySelector('#feedback-bulk-' + id).addEventListener('click', () => runFeedbackBulk(action));
}

document.querySelector('#roadmap-select-all').addEventListener('change', (event) => {
  const visible = [...document.querySelectorAll('#roadmap-list [data-roadmap-select]')].map((checkbox) => checkbox.dataset.roadmapSelect);
  if (event.currentTarget.checked) {
    for (const id of visible) {
      if (selectedRoadmap.size >= 50 && !selectedRoadmap.has(id)) break;
      selectedRoadmap.add(id);
    }
  } else {
    for (const id of visible) selectedRoadmap.delete(id);
  }
  renderRoadmap();
});
document.querySelector('#roadmap-header-select').addEventListener('change', (event) => {
  const visible = [...document.querySelectorAll('#roadmap-list [data-roadmap-select]')].map((checkbox) => checkbox.dataset.roadmapSelect);
  if (event.currentTarget.checked) {
    for (const id of visible) {
      if (selectedRoadmap.size >= 50 && !selectedRoadmap.has(id)) break;
      selectedRoadmap.add(id);
    }
  } else {
    for (const id of visible) selectedRoadmap.delete(id);
  }
  renderRoadmap();
});
document.querySelector('#roadmap-list').addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-roadmap-select]');
  if (!checkbox) return;
  const id = checkbox.dataset.roadmapSelect;
  if (checkbox.checked) {
    if (selectedRoadmap.size >= 50 && !selectedRoadmap.has(id)) {
      checkbox.checked = false;
      showToast('Select up to 50 roadmap items per bulk action.');
      return;
    }
    selectedRoadmap.add(id);
  } else {
    selectedRoadmap.delete(id);
  }
  document.querySelector('#roadmap-selection-count').textContent = `${selectedRoadmap.size} selected`;
  document.querySelector('#roadmap-select-all').checked = [...document.querySelectorAll('#roadmap-list [data-roadmap-select]')].length > 0 && [...document.querySelectorAll('#roadmap-list [data-roadmap-select]')].every((input) => selectedRoadmap.has(input.dataset.roadmapSelect));
  document.querySelector('#roadmap-header-select').checked = [...document.querySelectorAll('#roadmap-list [data-roadmap-select]')].length > 0 && [...document.querySelectorAll('#roadmap-list [data-roadmap-select]')].every((input) => selectedRoadmap.has(input.dataset.roadmapSelect));
});
document.querySelector('#roadmap-bulk-apply').addEventListener('click', async (event) => {
  const ids = [...selectedRoadmap];
  const status = document.querySelector('#roadmap-bulk-status').value;
  if (!ids.length || !status) {
    showToast('Select roadmap items and choose a status first.');
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api('/api/admin/roadmap/bulk', { method: 'POST', body: JSON.stringify({ ids, status }) });
    const summary = OctoAdminCore.summarizeBulk(result, ids);
    showToast(`${summary.updated} of ${ids.length} roadmap items updated.${summary.failed ? ' Unconfirmed selections retained.' : ''}`);
    selectedRoadmap.clear(); summary.remaining.forEach((id) => selectedRoadmap.add(id));
    document.querySelector('#roadmap-bulk-status').value = '';
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('.chat-prompts').addEventListener('click', (event) => {
  const prompt = event.target.closest('[data-chat-prompt]');
  if (!prompt) return;
  const input = document.querySelector('#chat-input');
  input.value = prompt.dataset.chatPrompt;
  input.focus();
});

document.querySelector('#game-filter').addEventListener('input', renderGames);
document.querySelector('#status-filter').addEventListener('change', renderGames);
document.querySelector('#category-filter').addEventListener('change', renderGames);
document.querySelector('#game-sort').addEventListener('change', renderGames);

document.querySelector('#game-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const game = dashboard.games.find((entry) => entry.id === button.dataset.id);
  if (!game) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'edit') {
      document.querySelector('#edit-form').dataset.version = game.updatedAt || '';
    document.querySelector('#edit-id').value = game.id;
      document.querySelector('#edit-title').value = game.title || '';
      document.querySelector('#edit-category').value = game.category || '';
      document.querySelector('#edit-tags').value = (game.tags || []).join(', ');
      document.querySelector('#edit-description').value = game.description || '';
      document.querySelector('#edit-featured').checked = game.featured === true;
      showMessage(document.querySelector('#edit-message'), '');
      document.querySelector('#edit-dialog').showModal();
    } else if (button.dataset.action === 'health') {
      await api(`/api/admin/games/${encodeURIComponent(game.id)}/health`, { method: 'POST', body: '{}' });
      showToast(`File checks queued for ${game.title}.`);
      await refreshDashboard();
    } else {
      const published = button.dataset.published === 'true';
      const action = published ? 'Publish' : 'Unpublish';
      if (!window.confirm(`${action} ${game.title} ${published ? 'to' : 'from'} the public game hub?`)) return;
      const result = await api(`/api/admin/games/${encodeURIComponent(game.id)}/publish`, {
        method: 'POST',
        body: JSON.stringify({ published }),
      });
      if (!result.warning) showToast(`${game.title} ${published ? 'published' : 'unpublished'}.`);
      await refreshDashboard();
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#edit-message');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const tags = document.querySelector('#edit-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
    await api(`/api/admin/games/${encodeURIComponent(document.querySelector('#edit-id').value)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: document.querySelector('#edit-title').value.trim(),
        category: document.querySelector('#edit-category').value.trim(),
        tags,
        description: document.querySelector('#edit-description').value.trim(),
        featured: document.querySelector('#edit-featured').checked,
      }),
    });
    document.querySelector('#edit-dialog').close();
    showToast('Game metadata saved.');
    await refreshDashboard();
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#close-dialog').addEventListener('click', () => document.querySelector('#edit-dialog').close());
document.querySelector('#cancel-edit').addEventListener('click', () => document.querySelector('#edit-dialog').close());
document.querySelector('#catalog-sync-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!dashboard || !Array.isArray(window.OCTO_GAMES)) {
    showToast('Dashboard catalog data is not ready.');
    return;
  }
  const knownIds = new Set(dashboard.games.map((game) => game.id));
  const missingGames = window.OCTO_GAMES.filter((game) => !knownIds.has(game.id));
  if (!missingGames.length) {
    showToast('Catalog preview: no games need synchronisation.');
    return;
  }
  const preview = missingGames.map((game) => game.title).join(', ');
  if (!window.confirm(`Synchronise ${missingGames.length} missing ${missingGames.length === 1 ? 'game' : 'games'}?\n\n${preview}`)) return;
  button.disabled = true;
  try {
    const result = await syncCatalogGames(missingGames);
    showToast(result.warnings.length
      ? result.warnings.join(' ')
      : `Catalog sync complete: ${result.synced} ${result.synced === 1 ? 'game' : 'games'} synchronised.`);
    await refreshDashboard();
  } catch (error) {
    showToast(`Catalog sync failed: ${error.details || error.message}`);
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#build-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const job = await api('/api/admin/build', { method: 'POST', body: '{}' });
    showToast(`Standalone build ${job.id} queued.`);
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function downloadHubHtml() {
  const { apiUrl, siteRoot, assetUrl } = window.OCTO_CONFIG;
  const [catalogResponse, pageResponse] = await Promise.all([fetch(apiUrl('/api/catalog')), fetch(`${siteRoot}index.html`)]);
  if (!catalogResponse.ok || !pageResponse.ok) throw new Error('Unable to load the public hub page or catalog.');
  const games = (await catalogResponse.json()).map((game) => ({
    ...game,
    launch: assetUrl(game.launch),
    thumbnail: assetUrl(game.thumbnail),
    screenshots: (game.screenshots || []).map(assetUrl),
  }));
  const html = await pageResponse.text();
  const inlineCatalog = `<script>window.OCTO_GAMES = Object.freeze(${JSON.stringify(games).replace(/</g, '\\u003c')});</script>`;
  const standalone = html
    .replace(/<script\s+src="Octo-Industries\/BehindTheScenes\/hub\/catalog\.js"\s+defer><\/script>/i, () => inlineCatalog)
    .replace(/<head>/i, () => `<head><base href="${siteRoot}">`);
  if (!standalone.includes('window.OCTO_GAMES = Object.freeze(')) throw new Error('The hub page is missing its generated catalog script.');
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([standalone], { type: 'text/html' })),
    download: 'masterstandalone.html',
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

document.querySelector('#job-list').addEventListener('click', async (event) => {
  if (!event.target.closest('[data-download-hub]')) return;
  try {
    await downloadHubHtml();
  } catch (error) {
    showToast(error.message);
  }
});

async function initialize() {
  try {
    await api('/api/admin/session');
    showDashboard();
  } catch (error) {
    if (error.message !== 'Admin authentication required.') showMessage(loginMessage, error.message);
    return;
  }
  try {
    await refreshDashboard();
  } catch (error) {
    if (error.message !== 'Admin authentication required.') showDashboardError(error);
  }
}

initialize();

document.querySelector('#dashboard-view').addEventListener('click', (event) => {
  const feedbackButton = event.target.closest('[data-feedback-open]');
  if (feedbackButton) {
    const id = feedbackButton.dataset.feedbackOpen;
    openedFeedback.add(id);
    setAdminView('community');
    renderFeedback();
    const details = feedbackList.querySelector(`[data-feedback-details="${id}"]`);
    if (details) details.open = true;
    return;
  }
  const button = event.target.closest('[data-admin-view]');
  if (button && !button.disabled) setAdminView(button.dataset.adminView, button.dataset.focusTarget || '');
});

document.querySelector('#sidebar-drawer-toggle').addEventListener('click', () => {
  setDrawerOpen(!dashboardView.classList.contains('drawer-open'));
});
document.querySelector('#sidebar-scrim').addEventListener('click', () => setDrawerOpen(false));
document.querySelector('#sidebar-collapse').addEventListener('click', () => {
  const collapsed = safeStorageGet('octo-admin.groups-collapsed') !== 'true';
  safeStorageSet('octo-admin.groups-collapsed', String(collapsed));
  syncSidebarMode();
});
window.addEventListener('resize', () => {
  if (!dashboardView.hidden) syncSidebarMode();
});
document.querySelector('#job-search').addEventListener('input', renderJobs);

function openRoadmapEditor(item = null) {
  const form = document.querySelector('#roadmap-form');
  form.reset();
  form.dataset.version = item?.updatedAt || '';
  document.querySelector('#roadmap-id').value = item?.id || '';
  document.querySelector('#roadmap-title-input').value = item?.title || '';
  document.querySelector('#roadmap-description').value = item?.description || '';
  document.querySelector('#roadmap-status').value = item?.status || 'idea';
  document.querySelector('#roadmap-category').value = item?.category || 'platform';
  document.querySelector('#roadmap-priority').value = item?.priority || 'normal';
  document.querySelector('#roadmap-notes').value = item?.internalNotes || '';
  document.querySelector('#roadmap-dialog-title').textContent = item ? 'Edit roadmap feature' : 'Create roadmap feature';
  document.querySelector('#roadmap-save').textContent = item ? 'Save changes' : 'Create feature';
  showMessage(document.querySelector('#roadmap-message'), '');
  document.querySelector('#roadmap-dialog').showModal();
  document.querySelector('#roadmap-title-input').focus();
}

document.querySelector('#roadmap-create').addEventListener('click', () => openRoadmapEditor());
document.querySelector('#roadmap-close').addEventListener('click', () => document.querySelector('#roadmap-dialog').close());
document.querySelector('#roadmap-cancel').addEventListener('click', () => document.querySelector('#roadmap-dialog').close());
document.querySelector('#roadmap-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#roadmap-save');
  const id = document.querySelector('#roadmap-id').value;
  const body = {
    title: document.querySelector('#roadmap-title-input').value.trim(),
    description: document.querySelector('#roadmap-description').value.trim(),
    status: document.querySelector('#roadmap-status').value,
    category: document.querySelector('#roadmap-category').value,
    priority: document.querySelector('#roadmap-priority').value,
    internalNotes: document.querySelector('#roadmap-notes').value.trim(),
  };
  button.disabled = true;
  try {
    await api(id ? `/api/admin/roadmap/${encodeURIComponent(id)}` : '/api/admin/roadmap', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(body),
    });
    document.querySelector('#roadmap-dialog').close();
    showToast(id ? 'Roadmap feature updated.' : 'Roadmap feature created.');
    await refreshDashboard();
  } catch (error) {
    showMessage(document.querySelector('#roadmap-message'), error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#roadmap-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-roadmap-action]');
  if (!button) return;
  const item = roadmapItems.find((entry) => entry.id === button.dataset.id);
  if (!item) return;
  const action = button.dataset.roadmapAction;
  if (action === 'edit') {
    openRoadmapEditor(item);
    return;
  }
  if (action === 'delete' && !window.confirm(`Permanently delete “${item.title}” from the roadmap?`)) return;
  button.disabled = true;
  try {
    if (action === 'delete') {
      await api(`/api/admin/roadmap/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      showToast('Roadmap feature deleted.');
    } else {
      const status = item.status === 'archived' ? 'planned' : 'archived';
      await api(`/api/admin/roadmap/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast(status === 'archived' ? 'Roadmap feature archived.' : 'Roadmap feature restored to Planned.');
    }
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

for (const selector of ['#roadmap-search', '#roadmap-status-filter', '#roadmap-category-filter', '#roadmap-priority-filter', '#roadmap-sort']) {
  document.querySelector(selector).addEventListener(selector === '#roadmap-search' ? 'input' : 'change', renderRoadmap);
}

document.querySelector('#roadmap-status-summary').addEventListener('click', (event) => {
  const button = event.target.closest('[data-roadmap-filter]');
  if (!button) return;
  document.querySelector('#roadmap-status-filter').value = button.dataset.roadmapFilter;
  setAdminView('roadmap');
  renderRoadmap();
});

document.querySelector('#roadmap-summary').addEventListener('click', (event) => {
  const button = event.target.closest('[data-roadmap-filter]');
  if (!button) return;
  document.querySelector('#roadmap-status-filter').value = button.dataset.roadmapFilter;
  setAdminView('roadmap');
  renderRoadmap();
});

const globalSearch = document.querySelector('#global-admin-search');
const globalSearchResults = document.querySelector('#global-search-results');
globalSearch.addEventListener('input', renderGlobalSearch);
globalSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    globalSearch.value = '';
    document.querySelector('#command-dialog').close();
    renderGlobalSearch();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    (globalSearchResults.querySelector('[aria-selected="true"]') || globalSearchResults.querySelector('.global-search-result'))?.click();
  }
});
globalSearchResults.addEventListener('click', (event) => {
  const result = event.target.closest('[data-search-view]');
  if (!result) return;
  const { searchView: view, searchId: id, searchTitle: title } = result.dataset;
  document.querySelector('#command-dialog').close();
  setAdminView(view);
  if (!id) { globalSearch.value = ''; renderGlobalSearch(); return; }
  if (view === 'games') {
    document.querySelector('#game-filter').value = title;
    renderGames();
  } else if (view === 'community') {
    document.querySelector('#feedback-search').value = title;
    openedFeedback.add(id);
    renderFeedback();
    const details = feedbackList.querySelector(`[data-feedback-details="${id}"]`);
    if (details) details.open = true;
  } else if (view === 'roadmap') {
    document.querySelector('#roadmap-search').value = title;
    renderRoadmap();
  } else {
    document.querySelector('#job-search').value = title;
    renderJobs();
  }
  globalSearch.value = '';
  renderGlobalSearch();
});
