/* Workspace preferences contain no credentials, conversation text or operational records. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const preferencesKey = 'octo-admin.workspace.v1';
  const widgetNames = { insights: 'Operational pulse', jobs: 'Recent jobs', activity: 'Recent activity', feedback: 'Recent inquiries', roadmap: 'Roadmap overview' };
  let preferences;
  try { preferences = JSON.parse(safeStorageGet(preferencesKey) || '{}'); } catch { preferences = {}; }
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
  const order = Array.isArray(preferences.order) ? preferences.order.filter((id) => Object.hasOwn(widgetNames, id)) : [];
  preferences.order = [...new Set([...order, ...Object.keys(widgetNames)])];
  preferences.hidden = Array.isArray(preferences.hidden) ? preferences.hidden.filter((id) => Object.hasOwn(widgetNames, id)) : [];
  const save = () => safeStorageSet(preferencesKey, JSON.stringify(preferences));
  const notifications = new Map();
  let searchIndex = -1;
  let updatedAt = null;

  function openDialog(selector) {
    const dialog = $(selector);
    if (!dialog.open) dialog.showModal();
    if (selector === '#command-dialog') { renderGlobalSearch(); $('#global-admin-search').focus(); }
  }
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#command-open').addEventListener('click', () => openDialog('#command-dialog'));
  $('#notifications-open').addEventListener('click', () => { renderNotifications(); openDialog('#notifications-dialog'); });
  $('#widget-settings-open').addEventListener('click', () => { renderWidgetControls(); openDialog('#widget-settings'); });

  function themeButton() {
    const light = document.documentElement.dataset.theme === 'light';
    $('#theme-toggle').textContent = light ? 'Dark theme' : 'Light theme';
    $('#theme-toggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
    document.querySelector('meta[name="theme-color"]').content = light ? '#f1f5fa' : '#080e1b';
  }
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    safeStorageSet('octo-admin.theme', next);
    themeButton();
  });
  themeButton();

  function applyWidgets() {
    for (const id of preferences.order) {
      const widget = document.querySelector(`[data-widget="${id}"]`);
      widget.hidden = preferences.hidden.includes(id);
      $('#overview-grid').append(widget);
    }
  }
  function renderWidgetControls() {
    $('#widget-controls').innerHTML = preferences.order.map((id, index) => `<div class="widget-control"><label class="check-label"><input type="checkbox" data-widget-visible="${id}" ${preferences.hidden.includes(id) ? '' : 'checked'}> ${widgetNames[id]}</label><button class="small-button" type="button" data-widget-move="${id}" data-direction="-1" aria-label="Move ${widgetNames[id]} up" ${index === 0 ? 'disabled' : ''}>↑</button><button class="small-button" type="button" data-widget-move="${id}" data-direction="1" aria-label="Move ${widgetNames[id]} down" ${index === preferences.order.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('');
  }
  $('#widget-controls').addEventListener('change', (event) => {
    const id = event.target.dataset.widgetVisible;
    if (!id) return;
    preferences.hidden = preferences.hidden.filter((key) => key !== id);
    if (!event.target.checked) preferences.hidden.push(id);
    save(); applyWidgets();
  });
  $('#widget-controls').addEventListener('click', (event) => {
    const button = event.target.closest('[data-widget-move]');
    if (!button) return;
    const index = preferences.order.indexOf(button.dataset.widgetMove), next = index + Number(button.dataset.direction);
    if (next < 0 || next >= preferences.order.length) return;
    [preferences.order[index], preferences.order[next]] = [preferences.order[next], preferences.order[index]];
    save(); applyWidgets(); renderWidgetControls();
    document.querySelector(`[data-widget-move="${button.dataset.widgetMove}"][data-direction="${button.dataset.direction}"]`)?.focus();
  });
  $('#widgets-reset').addEventListener('click', () => { preferences.order = Object.keys(widgetNames); preferences.hidden = []; save(); applyWidgets(); renderWidgetControls(); });
  applyWidgets();

  function renderInsights() {
    if (!dashboard) { $('#overview-insights').textContent = 'Operational data is unavailable. Use Retry to load a fresh snapshot.'; return; }
    const total = dashboard.counts.total;
    const bars = [['Published', dashboard.counts.published], ['Draft or needs attention', dashboard.counts.drafts], ['Offline verified', dashboard.counts.offlineReady]];
    const days = Number($('#chart-period').value);
    const trend = OctoAdminCore.trend(feedbackEntries, days);
    const max = Math.max(1, ...trend.map((entry) => entry.count));
    $('#overview-insights').innerHTML = `<div class="pulse-layout"><div class="pulse-breakdown"><p class="muted">Library snapshot · ${total} games</p>${bars.map(([label, count]) => `<div><div class="pulse-bar-label"><span>${label}</span><strong>${count}</strong></div><div class="pulse-track"><i style="width:${total ? Math.min(100, count / total * 100) : 0}%"></i></div></div>`).join('')}</div><div><strong>Inquiry arrivals</strong><p class="muted">${days} days · UTC · loaded, non-deleted inquiries</p>${feedbackLoadError ? '<p class="notice">Inquiry data unavailable. No trend can be calculated.</p>' : `<div class="trend-chart" role="img" aria-label="${trend.map((entry) => `${entry.date}: ${entry.count} inquiries`).join('; ')}">${trend.map((entry) => `<div class="trend-column" title="${entry.date}: ${entry.count} inquiries"><span>${entry.count}</span><i style="height:${entry.count / max * 90}px"></i><span>${entry.date.slice(8)}</span></div>`).join('')}</div><details><summary>View accessible data table</summary><table class="game-table" style="min-width:0"><caption>Inquiry arrivals by UTC date</caption><thead><tr><th scope="col">Date</th><th scope="col">Inquiries</th></tr></thead><tbody>${trend.map((entry) => `<tr><th scope="row">${entry.date}</th><td>${entry.count}</td></tr>`).join('')}</tbody></table></details>`}</div></div>`;
  }
  $('#chart-period').addEventListener('change', renderInsights);

  function collectNotifications() {
    const add = (id, value) => {
      const previous = notifications.get(id);
      notifications.set(id, { ...value, read: previous?.read || false });
    };
    if (preferences.jobs !== false) for (const job of dashboard?.jobs || []) {
      if (job.status === 'failed') add(`job:${job.id}:${job.createdAt}`, { title: `Failed ${job.type} job`, priority: 'high', view: 'operations', time: job.createdAt });
    }
    if (!feedbackLoadError && preferences.inquiries !== false) for (const ticket of feedbackEntries) {
      if (!ticket.archived && (ticket.status === 'new' || ticket.priority === 'critical')) {
        add(`ticket:${ticket.id}:${ticket.status}:${ticket.priority}`, { title: `${ticket.priority === 'critical' ? 'Critical' : 'New'} inquiry #${ticket.ticketNumber || '—'}`, priority: ticket.priority === 'critical' ? 'high' : 'normal', view: 'community', time: ticket.updatedAt || ticket.createdAt });
      }
    }
    while (notifications.size > 100) notifications.delete(notifications.keys().next().value);
    renderNotifications();
  }
  function renderNotifications() {
    const filter = $('#notification-filter').value;
    const entries = [...notifications.entries()].sort((a, b) => Date.parse(b[1].time) - Date.parse(a[1].time));
    $('#notification-count').textContent = entries.filter(([, item]) => !item.read).length;
    const visible = entries.filter(([, item]) => filter === 'all' || (filter === 'unread' ? !item.read : item.priority === 'high'));
    $('#notification-list').innerHTML = visible.length ? visible.map(([id, item]) => `<button type="button" class="notification-item ${item.read ? '' : 'is-unread'}" data-notification="${escapeHtml(id)}"><strong>${escapeHtml(item.title)}</strong><small>${item.priority === 'high' ? 'High priority' : 'Update'} · ${escapeHtml(formatDate(item.time))} · ${item.read ? 'Read' : 'Unread'}</small></button>`).join('') : `<p class="overview-empty muted">${dashboard ? 'No notifications match this view.' : 'Notifications are unavailable until dashboard data loads.'}</p>`;
  }
  $('#notification-filter').addEventListener('change', renderNotifications);
  $('#notifications-read').addEventListener('click', () => { for (const item of notifications.values()) item.read = true; renderNotifications(); });
  $('#notification-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-notification]');
    if (!button) return;
    const item = notifications.get(button.dataset.notification);
    item.read = true; renderNotifications(); $('#notifications-dialog').close(); setAdminView(item.view);
  });
  for (const type of ['jobs', 'inquiries']) {
    $(`#notify-${type}`).checked = preferences[type] !== false;
    $(`#notify-${type}`).addEventListener('change', (event) => { preferences[type] = event.target.checked; save(); collectNotifications(); });
  }

  function renderSystem() {
    const cards = [
      ['Dashboard API', dashboard ? 'Snapshot received' : 'Unavailable', dashboard ? `Last successful read: ${formatDate(updatedAt)}` : 'Retry the dashboard. Check the endpoint and request ID in the error panel.'],
      ['Community API', feedbackLoadError ? 'Unavailable' : dashboard ? 'Snapshot received' : 'Not checked', feedbackLoadError ? 'Retry before changing tickets. Existing records have not been replaced.' : 'Inquiries are loaded through the authenticated API.'],
      ['AI assistant', dashboard?.capabilities?.aiChat === true ? 'Configured' : dashboard?.capabilities?.aiChat === false ? 'Not configured' : 'Not verified', 'Provider availability is checked when a question is sent. Configuration alone does not prove health.'],
      ['GitHub proposals', dashboard?.capabilities?.changeProposals === true ? 'Configured' : dashboard?.capabilities?.changeProposals === false ? 'Not configured' : 'Not verified', 'Existing review workflow. Approval can create a pull request; it does not deploy this site.'],
      ['GitHub Pages', 'Static hosting', 'This session cannot establish deployment health or database backup availability.'],
      ['Data protection', 'Server authorization required', 'Session checks and database policies remain enforced by Supabase. No credentials are stored in workspace preferences.'],
    ];
    $('#system-status').innerHTML = cards.map(([name, status, note]) => `<article class="system-card"><strong>${name}</strong><span>${status}</span><p>${escapeHtml(note)}</p></article>`).join('');
  }
  $('#diagnostics-refresh').addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { await refreshDashboard(); } finally { button.disabled = false; }
  });
  document.addEventListener('octo:snapshot', () => {
    updatedAt = new Date().toISOString();
    $('#snapshot-time').textContent = `Last updated ${formatDate(updatedAt)} · live API snapshot`;
    renderInsights(); renderSystem(); collectNotifications();
  });
  document.addEventListener('octo:data-error', () => { $('#snapshot-time').textContent = 'Data unavailable. Retry to obtain a verified snapshot.'; renderInsights(); renderSystem(); });
  document.addEventListener('octo:signout', () => { notifications.clear(); updatedAt = null; renderNotifications(); });
  renderSystem();

  $('#global-admin-search').addEventListener('input', () => { searchIndex = -1; });
  $('#global-admin-search').addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const options = [...$('#global-search-results').querySelectorAll('[role="option"]')];
    if (!options.length) return;
    searchIndex = (searchIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === searchIndex)));
    $('#global-admin-search').setAttribute('aria-activedescendant', options[searchIndex].id);
    options[searchIndex].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !dashboardView.hidden) { event.preventDefault(); openDialog('#command-dialog'); }
    if (event.key === 'Escape' && dashboardView.classList.contains('drawer-open')) { setDrawerOpen(false); $('#sidebar-drawer-toggle').focus(); }
    if (event.key === 'Tab' && dashboardView.classList.contains('drawer-open')) {
      const items = [...document.querySelectorAll('#admin-sidebar button:not(:disabled), #admin-sidebar summary')].filter((item) => item.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
})();

// Existing acquisition API, loaded only when requested. Missing schema is an explicit state.
(() => {
  let loading = false;
  const form = document.querySelector('#acquisition-form');
  const list = document.querySelector('#acquisition-list');
  const refresh = document.querySelector('#acquisition-refresh');
  async function load() {
    if (loading) return; loading = true; refresh.disabled = true;
    list.textContent = 'Loading acquisition queue…';
    try {
      const entries = await api('/api/admin/jobs/acquisitions');
      if (!Array.isArray(entries)) throw new Error('The acquisition API returned invalid data.');
      form.querySelector('button[type="submit"]').disabled = false;
      list.innerHTML = entries.length ? entries.map((item) => `<article class="job-item"><strong>${escapeHtml(item.title)}</strong><p class="muted">${escapeHtml(item.action)} · ${escapeHtml(item.state)} · ${escapeHtml(item.acquisitionStatus)}</p><details><summary>Evidence and notes</summary><p class="muted">${escapeHtml(item.notes || 'No notes recorded.')}</p><ul>${(item.evidence || []).map((entry) => `<li>${escapeHtml(entry.label || entry.url || entry.kind)}</li>`).join('')}</ul></details></article>`).join('') : '<p class="muted overview-empty">No acquisition requests recorded.</p>';
      showMessage(document.querySelector('#acquisition-message'), '');
    } catch (error) {
      list.textContent = 'Acquisition queue unavailable. Check the existing acquisition migration and function deployment with a maintainer, then retry. No records were changed.';
      form.querySelector('button[type="submit"]').disabled = true;
    } finally { loading = false; refresh.disabled = false; }
  }
  refresh.addEventListener('click', load);
  document.addEventListener('octo:view', (event) => { if (event.detail === 'operations' && !list.textContent) load(); });
  document.addEventListener('octo:signout', () => { list.textContent = ''; form.reset(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    const data = new FormData(form);
    try {
      const body = Object.fromEntries(data);
      body.evidence = String(body.evidence || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => ({ kind: /^https?:\/\//.test(line) ? 'source' : 'note', label: line, url: /^https?:\/\//.test(line) ? line : '' }));
      await api('/api/admin/jobs/acquisitions', { method: 'POST', body: JSON.stringify(body) });
      form.reset(); showToast('Acquisition request saved. No game files were imported.'); await load();
    } catch (error) { showMessage(document.querySelector('#acquisition-message'), error.message); }
    finally { submit.disabled = false; }
  });
})();
