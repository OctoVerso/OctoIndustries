const loginView = document.querySelector('#login-view');
const dashboardView = document.querySelector('#dashboard-view');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
const toast = document.querySelector('#toast');
let sessionToken = sessionStorage.getItem('octoAdminToken') || '';

function storeToken(token) {
  sessionToken = token || '';
  if (sessionToken) sessionStorage.setItem('octoAdminToken', sessionToken);
  else sessionStorage.removeItem('octoAdminToken');
}
let dashboard;
const chatHistory = [];
let refreshTimer;
let toastTimer;
let feedbackEntries = [];
let roadmapItems = [];
const openedFeedback = new Set();
const selectedFeedback = new Set();

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
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (sessionToken) headers.set('Authorization', `Bearer ${sessionToken}`);
  const response = await fetch(window.OCTO_CONFIG.apiUrl(path), { ...options, headers });
  const body = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/admin/login') showLogin();
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  return body;
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

function showLogin(message = '') {
  clearInterval(refreshTimer);
  storeToken('');
  dashboardView.hidden = true;
  loginView.hidden = false;
  logoutButton.hidden = true;
  showMessage(loginMessage, message);
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutButton.hidden = false;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function updateMetrics(counts) {
  document.querySelector('#metric-total').textContent = counts.total;
  document.querySelector('#metric-published').textContent = counts.published;
  document.querySelector('#metric-drafts').textContent = counts.drafts;
  document.querySelector('#metric-offline').textContent = counts.offlineReady;
  document.querySelector('#metric-failed').textContent = counts.failedJobs;
}

function renderGames() {
  const container = document.querySelector('#game-list');
  const query = document.querySelector('#game-filter').value.trim().toLocaleLowerCase();
  const status = document.querySelector('#status-filter').value;
  const games = dashboard.games.filter((game) => {
    const searchable = [game.title, game.category, game.description, ...(game.tags || [])].join(' ').toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (status === 'all' || game.status === status);
  });
  document.querySelector('#library-count').textContent = `${games.length} of ${dashboard.games.length}`;
  container.innerHTML = games.length ? games.map((game) => `
    <article class="game-row">
      <div><p class="game-title">${escapeHtml(game.title)}</p><span class="game-meta">${escapeHtml(game.category)} · ${escapeHtml(game.status)}${game.offlineReady === true ? ' · offline verified' : ''}</span></div>
      <div class="game-actions">
        <button class="small-button" type="button" data-action="edit" data-id="${escapeHtml(game.id)}">Edit</button>
        <button class="small-button" type="button" data-action="health" data-id="${escapeHtml(game.id)}">Health check</button>
        <button class="small-button ${game.status === 'published' ? 'is-published' : ''}" type="button" data-action="publish" data-published="${game.status !== 'published'}" data-id="${escapeHtml(game.id)}">${game.status === 'published' ? 'Unpublish' : 'Publish'}</button>
      </div>
    </article>`).join('') : '<p class="muted">No games match these filters.</p>';
}

function renderJobs() {
  const container = document.querySelector('#job-list');
  container.innerHTML = dashboard.jobs.length ? dashboard.jobs.slice(0, 12).map((job) => {
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
  section.hidden = false;
  document.querySelector('#proposal-capability').hidden = dashboard?.capabilities?.changeProposals !== false;
  container.replaceChildren();
  if (!proposals.length) {
    container.innerHTML = '<p class="muted">No proposals awaiting review.</p>';
  }
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
  new: '🆕 New',
  seen: '👁️ Seen',
  working: '🔧 Working On It',
  resolved: '✅ Resolved',
  important: '📌 Important',
  archived: '🗄️ Archived',
};

function formatFeedbackDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  }).format(date);
}

function renderFeedback() {
  const games = new Map((dashboard?.games || []).map((game) => [game.id, game.title]));
  const query = document.querySelector('#feedback-search').value.trim().toLocaleLowerCase();
  const type = document.querySelector('#feedback-type-filter').value;
  const status = document.querySelector('#feedback-status-filter').value;
  const gameId = document.querySelector('#feedback-game-filter').value;
  const sorting = document.querySelector('#feedback-sort').value;
  const filtered = feedbackEntries.filter((entry) => {
    const searchable = [
      entry.message, games.get(entry.gameId) || '', entry.type,
      entry.deviceInfo?.deviceType, entry.deviceInfo?.operatingSystem, entry.deviceInfo?.browser,
      entry.deviceInfo?.screenResolution, entry.deviceInfo?.octoVersion,
    ].join(' ').toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (type === 'all' || entry.type === type)
      && (status === 'all' || entry.status === status)
      && (gameId === 'all' || (gameId === 'none' ? !entry.gameId : entry.gameId === gameId));
  });
  const statusOrder = ['new', 'important', 'working', 'seen', 'resolved', 'archived'];
  filtered.sort((first, second) => {
    if (sorting === 'oldest') return first.createdAt.localeCompare(second.createdAt);
    if (sorting === 'updated') return second.updatedAt.localeCompare(first.updatedAt);
    if (sorting === 'status') return statusOrder.indexOf(first.status) - statusOrder.indexOf(second.status);
    if (sorting === 'type') return first.type.localeCompare(second.type) || second.createdAt.localeCompare(first.createdAt);
    if (sorting === 'game') return (games.get(first.gameId) || '').localeCompare(games.get(second.gameId) || '');
    return second.createdAt.localeCompare(first.createdAt);
  });
  const newCount = feedbackEntries.filter((entry) => entry.status === 'new').length;
  const seenCount = feedbackEntries.filter((entry) => entry.status === 'seen').length;
  const visibleIds = new Set(filtered.map((entry) => entry.id));
  for (const id of selectedFeedback) {
    if (!feedbackEntries.some((entry) => entry.id === id)) selectedFeedback.delete(id);
  }
  document.querySelector('#feedback-new-count').textContent = `${newCount} New · ${seenCount} Seen`;
  const gameFilter = document.querySelector('#feedback-game-filter');
  const selectedGame = gameFilter.value;
  gameFilter.replaceChildren(new Option('All games', 'all'), new Option('Not related to a game', 'none'));
  for (const game of dashboard?.games || []) gameFilter.add(new Option(game.title, game.id));
  if ([...gameFilter.options].some((option) => option.value === selectedGame)) gameFilter.value = selectedGame;

  const container = document.querySelector('#feedback-list');
  container.innerHTML = filtered.length ? filtered.map((entry) => {
    const device = entry.deviceInfo || {};
    const deviceSummary = [device.deviceType, device.operatingSystem, device.browser].filter(Boolean).join(' · ') || 'Unknown device';
    const technical = [
      device.screenResolution && `Screen: ${device.screenResolution}`,
      device.octoVersion && `Build: ${device.octoVersion}`,
    ].filter(Boolean).join(' · ');
    return `<article class="feedback-card${entry.status === 'new' ? ' is-new' : ''}" data-feedback-card="${entry.id}">
      <div class="feedback-card-top">
        <label class="feedback-select-label"><input type="checkbox" data-feedback-select="${entry.id}"${selectedFeedback.has(entry.id) ? ' checked' : ''} aria-label="Select this feedback"></label>
        <div class="feedback-title"><span class="feedback-type" data-type="${entry.type}">${entry.type === 'issue' ? '🐛 ISSUE' : '💡 SUGGESTION'}</span><span class="feedback-game">${escapeHtml(entry.gameId ? games.get(entry.gameId) || 'Unknown game' : 'Not related to a game')}</span></div>
        <span class="feedback-time">${escapeHtml(formatFeedbackDate(entry.createdAt))}</span>
      </div>
      <p class="feedback-message">${escapeHtml(entry.message)}</p>
      <p class="feedback-device">${escapeHtml(deviceSummary)}${technical ? ` · ${escapeHtml(technical)}` : ''}</p>
      <div class="feedback-controls">
        <label>Status
          <select data-feedback-status="${entry.id}" aria-label="Status for feedback">
            ${Object.entries(feedbackStatusLabels).map(([key, label]) => `<option value="${key}"${entry.status === key ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
        <span class="feedback-updated">Updated ${escapeHtml(formatFeedbackDate(entry.updatedAt))}</span>
      </div>
      <details data-feedback-details="${entry.id}"${openedFeedback.has(entry.id) ? ' open' : ''}>
        <summary>Open feedback and private admin notes</summary>
        <label for="feedback-note-${entry.id}">Private admin notes</label>
        <textarea id="feedback-note-${entry.id}" data-feedback-notes="${entry.id}" rows="3" maxlength="5000">${escapeHtml(entry.adminNotes || '')}</textarea>
        <button class="small-button" type="button" data-save-feedback-notes="${entry.id}">Save private notes</button>
      </details>
    </article>`;
  }).join('') : '<p class="muted feedback-empty">No feedback matches these filters.</p>';
  document.querySelector('#feedback-selection-count').textContent = `${selectedFeedback.size} selected`;
  document.querySelector('#feedback-select-all').checked = visibleIds.size > 0 && [...visibleIds].every((id) => selectedFeedback.has(id));
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

function renderRoadmap() {
  const container = document.querySelector('#roadmap-list');
  container.innerHTML = roadmapItems.length ? roadmapItems.map((item) => `
    <details class="roadmap-item">
      <summary><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.status)} · ${escapeHtml(item.priority)}</span></summary>
      <form class="roadmap-edit" data-roadmap-id="${escapeHtml(item.id)}">
        <label>Title<input name="title" value="${escapeHtml(item.title)}" maxlength="120" required></label>
        <label>Description<textarea name="description" rows="3" maxlength="2000">${escapeHtml(item.description || '')}</textarea></label>
        <div class="roadmap-fields">
          <label>Status<select name="status">${['idea', 'planned', 'in-progress', 'on-hold'].map((value) => `<option value="${value}"${item.status === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>
          <label>Priority<select name="priority">${['high', 'normal', 'low'].map((value) => `<option value="${value}"${item.priority === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>
          <label>Category<input name="category" value="${escapeHtml(item.category || '')}" maxlength="60"></label>
        </div>
        <label>Private notes<textarea name="internalNotes" rows="2" maxlength="5000">${escapeHtml(item.internalNotes || '')}</textarea></label>
        <div class="roadmap-actions"><button class="small-button" type="submit">Save changes</button><button class="small-button" type="button" data-roadmap-delete="${escapeHtml(item.id)}">Delete</button></div>
      </form>
    </details>`).join('') : '<p class="muted">No roadmap items yet.</p>';
}

async function refreshDashboard() {
  dashboard = await api('/api/admin/dashboard');
  [feedbackEntries, roadmapItems] = await Promise.all([
    api('/api/admin/feedback'),
    api('/api/admin/roadmap'),
  ]);
  updateMetrics(dashboard.counts);
  renderGames();
  renderJobs();
  renderActivity();
  renderProposals();
  renderFeedback();
  renderRoadmap();
  if (dashboard.jobs.some((job) => job.status === 'queued' || job.status === 'running')) {
    if (!refreshTimer) refreshTimer = setInterval(() => refreshDashboard().catch((error) => showToast(error.message)), 2200);
  } else {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

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
    showMessage(loginMessage, error.message);
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    showLogin();
  } catch (error) {
    showToast(error.message);
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
    showMessage(message, `Job ${job.id} queued. Watch Recent jobs for progress.`);
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

document.querySelector('#proposal-kind').addEventListener('change', (event) => {
  const isGame = event.currentTarget.value === 'game';
  document.querySelector('[data-proposal-code]').hidden = isGame;
  document.querySelector('[data-proposal-game]').hidden = !isGame;
});

document.querySelector('#proposal-create').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = document.querySelector('#proposal-create-message');
  button.disabled = true;
  showMessage(message, '');
  try {
    const values = Object.fromEntries(new FormData(form));
    const proposal = {
      kind: values.kind,
      title: values.title,
      summary: values.summary,
    };
    if (values.kind === 'game') {
      proposal.manifestPath = values.manifestPath;
      try {
        proposal.manifest = JSON.parse(values.manifest);
      } catch {
        throw new Error('Manifest must be valid JSON.');
      }
    } else {
      proposal.diff = values.diff;
    }
    await api('/api/admin/proposals', { method: 'POST', body: JSON.stringify(proposal) });
    form.reset();
    document.querySelector('#proposal-kind').dispatchEvent(new Event('change'));
    showToast('Proposal added for review.');
    await refreshDashboard();
  } catch (error) {
    showMessage(message, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#roadmap-create').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    await api('/api/admin/roadmap', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    showToast('Roadmap item added.');
    await refreshDashboard();
  } catch (error) {
    showMessage(document.querySelector('#roadmap-message'), error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#roadmap-list').addEventListener('submit', async (event) => {
  const form = event.target.closest('.roadmap-edit');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    await api(`/api/admin/roadmap/${encodeURIComponent(form.dataset.roadmapId)}`, {
      method: 'PATCH',
      body: JSON.stringify(values),
    });
    showToast('Roadmap item saved.');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#roadmap-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-roadmap-delete]');
  if (!button) return;
  if (!window.confirm('Delete this roadmap item?')) return;
  button.disabled = true;
  try {
    await api(`/api/admin/roadmap/${encodeURIComponent(button.dataset.roadmapDelete)}`, { method: 'DELETE' });
    showToast('Roadmap item deleted.');
    await refreshDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

const feedbackList = document.querySelector('#feedback-list');
feedbackList.addEventListener('toggle', async (event) => {
  const details = event.target.closest('details[data-feedback-details]');
  if (!details) return;
  const id = details.dataset.feedbackDetails;
  if (details.open) {
    openedFeedback.add(id);
    const entry = feedbackEntries.find((feedback) => feedback.id === id);
    if (entry?.status === 'new') {
      try {
        await updateFeedbackStatus(id, 'seen');
      } catch (error) {
        showToast(error.message);
      }
    }
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

for (const selector of ['#feedback-search', '#feedback-type-filter', '#feedback-status-filter', '#feedback-game-filter', '#feedback-sort']) {
  document.querySelector(selector).addEventListener(selector === '#feedback-search' ? 'input' : 'change', renderFeedback);
}
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
document.querySelector('#feedback-bulk-apply').addEventListener('click', async (event) => {
  const ids = [...selectedFeedback];
  const status = document.querySelector('#feedback-bulk-status').value;
  if (!ids.length || !status) {
    showToast('Select feedback and choose a status first.');
    return;
  }
  if (status === 'archived' && !window.confirm(`Archive ${ids.length} selected submission${ids.length === 1 ? '' : 's'}? You can restore them later.`)) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api('/api/admin/feedback/bulk', { method: 'POST', body: JSON.stringify({ ids, status }) });
    showToast(`Updated ${result.updated} submission${result.updated === 1 ? '' : 's'}.`);
    if (status === 'new') ids.forEach((id) => openedFeedback.delete(id));
    selectedFeedback.clear();
    document.querySelector('#feedback-select-all').checked = false;
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

document.querySelector('#game-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const game = dashboard.games.find((entry) => entry.id === button.dataset.id);
  if (!game) return;
  button.disabled = true;
  try {
    if (button.dataset.action === 'edit') {
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
      await api(`/api/admin/games/${encodeURIComponent(game.id)}/publish`, {
        method: 'POST',
        body: JSON.stringify({ published }),
      });
      showToast(`${game.title} ${published ? 'published' : 'unpublished'}.`);
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

async function initialize() {
  try {
    const session = await api('/api/admin/session');
    showDashboard();
    await refreshDashboard();
  } catch (error) {
    if (error.message !== 'Admin authentication required.') showMessage(loginMessage, error.message);
  }
}

initialize();
