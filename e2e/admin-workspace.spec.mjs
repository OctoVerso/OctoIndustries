import { test, expect } from '@playwright/test';

const path = '/Octo-Industries/BehindTheScenes/admin/';
async function setup(page, options = {}) {
  const writes = [], errors = [];
  const now = new Date().toISOString();
  const games = [{ id: 'alpha', title: 'Alpha', description: 'Test game description', category: 'Action', tags: [], status: 'published', offlineReady: false }];
  const tickets = [{ id: 'a'.repeat(32), ticketNumber: 42, type: 'issue', gameId: 'alpha', message: '<img src=x onerror=alert(1)> Test inquiry', status: 'new', priority: 'critical', createdAt: now, updatedAt: now, archived: false, userAccessEnabled: true, adminNotes: '' }, { id: 'b'.repeat(32), ticketNumber: 43, type: 'suggestion', message: 'Second inquiry', status: 'new', priority: 'medium', createdAt: now, updatedAt: now, archived: false }];
  const roadmap = [{ id: 'feature-a', title: 'Keyboard controls', description: 'Improve controls', status: 'planned', category: 'games', priority: 'normal', internalNotes: '', createdAt: now, updatedAt: now }];
  let expired = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('octoAdminToken', 'test-session'));
  await page.route('**/functions/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), body = request.postData() ? request.postDataJSON() : {};
    const endpoint = url.pathname.replace(/^.*\/functions\/v1/, '');
    if (request.method() !== 'GET') writes.push({ endpoint, body });
    if (expired) return route.fulfill({ status: 401, json: { error: 'Session expired.' } });
    if (endpoint === '/admin/session') return route.fulfill({ json: { authenticated: true, expiresAt: '2027-01-01' } });
    if (endpoint === '/admin/dashboard') {
      if (options.malformed) return route.fulfill({ json: { games: null } });
      if (options.unavailable) return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
      return route.fulfill({ json: { counts: { total: games.length, published: games.filter((g) => g.status === 'published').length, drafts: games.filter((g) => g.status !== 'published').length, offlineReady: 0, failedJobs: 1 }, games, roadmap, jobs: [{ id: 'job-a', type: 'health', status: 'failed', message: 'Launch check failed', createdAt: now, logs: [] }], activity: [{ message: 'Reviewed library', createdAt: now }], proposals: [], capabilities: { aiChat: true, changeProposals: false } } });
    }
    if (endpoint === '/admin/feedback') return route.fulfill({ json: tickets });
    if (endpoint.endsWith('/conversation')) return route.fulfill({ json: { conversation: [{ author: 'user', message: tickets[0].message, createdAt: now }], activity: [] } });
    if (endpoint === '/admin/feedback/bulk') {
      await new Promise((resolve) => setTimeout(resolve, 100));
      tickets[0].status = body.status || tickets[0].status;
      return route.fulfill({ json: { updated: 1, updatedIds: [tickets[0].id], failedIds: [tickets[1].id] } });
    }
    if (endpoint === '/admin/chat') return route.fulfill({ json: { answer: '**Library reviewed.** No changes were made.' } });
    if (endpoint === '/jobs/acquisitions') return route.fulfill({ status: 503, json: { error: 'Acquisition queue unavailable.' } });
    if (endpoint.startsWith('/admin/games/')) {
      if (endpoint.endsWith('/publish')) games[0].status = body.published ? 'published' : 'draft';
      else Object.assign(games[0], body);
      return route.fulfill({ json: games[0] });
    }
    if (endpoint.startsWith('/roadmap')) {
      if (request.method() === 'DELETE') roadmap.splice(0,1);
      else if (endpoint === '/roadmap') roadmap.push({ ...body, id: 'feature-b', createdAt: now, updatedAt: now });
      else Object.assign(roadmap.find((r) => endpoint.endsWith(r.id)) || roadmap[0], body);
      return route.fulfill({ json: { ...body, id: 'feature-b', updated: 1 } });
    }
    if (endpoint === '/admin/logout') return route.fulfill({ json: { authenticated: false } });
    return route.fulfill({ status: 404, json: { error: 'Unexpected test endpoint.' } });
  });
  await page.goto(path);
  await expect(page.locator('#dashboard-view')).toBeVisible();
  if (!options.malformed && !options.unavailable) await expect(page.locator('#metric-total')).toHaveText('1');
  return { writes, errors, expire: () => { expired = true; } };
}
async function navigate(page, view) {
  const drawer = page.locator('#sidebar-drawer-toggle');
  if (await drawer.isVisible()) await drawer.click();
  await page.locator(`#admin-sidebar [data-admin-view="${view}"]`).first().click();
  await expect(page.locator(`[data-admin-panel="${view}"]`)).toBeVisible();
}

test('static preview explains unavailable admin access without offering a dead sign-in form', async ({ page }) => {
  await page.addInitScript(() => { window.OCTO_CONFIG = { functionsUrl: '' }; });
  await page.goto(path);
  await expect(page.locator('#login-title')).toHaveText('Admin preview only');
  await expect(page.locator('#login-form')).toBeHidden();
  await expect(page.locator('#login-preview-unavailable')).toBeVisible();
  await expect(page.locator('#login-preview-unavailable')).toContainText('approved staging-backed preview');
});

test('workspace navigation, keyboard commands, themes and personalization persist', async ({ page }) => {
  const state = await setup(page);
  await page.locator('#theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#widget-settings-open').click();
  await page.locator('[data-widget-visible="jobs"]').uncheck();
  await page.locator('[data-widget-move="activity"][data-direction="-1"]').click();
  await page.locator('#widget-settings [data-close-dialog]').click();
  await expect(page.locator('[data-widget="jobs"]')).toBeHidden();
  await page.keyboard.press('Control+k');
  await page.locator('#global-admin-search').fill('Game Library');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('[data-admin-panel="games"]')).toBeVisible();
  for (const view of ['roadmap', 'operations', 'ai', 'community', 'overview']) await navigate(page, view);
  await page.reload(); await expect(page.locator('#metric-total')).toHaveText('1');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-widget="jobs"]')).toBeHidden();
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('notifications deduplicate snapshots and track unread state', async ({ page }) => {
  const state = await setup(page); await expect(page.locator('#notification-count')).toHaveText('3');
  await navigate(page, 'operations'); await page.locator('#diagnostics-refresh').click();
  await expect(page.locator('#notification-count')).toHaveText('3');
  await page.locator('#notifications-open').click(); await page.locator('#notifications-read').click();
  await page.locator('#notification-filter').selectOption('unread');
  await expect(page.locator('#notification-list')).toContainText('No notifications');
  await expect(page.locator('#notification-count')).toHaveText('0'); expect(state.writes).toEqual([]);
});
test('opening inquiries and diagnostics is read-only and unsaved drafts survive refresh', async ({ page }) => {
  const state = await setup(page); await navigate(page, 'community');
  const card = page.locator('[data-feedback-card]').first();
  await card.locator('[data-ticket-conversation] > summary').click();
  await card.locator('[data-feedback-details] > summary').click();
  await card.locator('[data-feedback-notes]').fill('Unsaved private draft');
  await card.locator('[data-admin-reply] textarea').fill('Unsaved reply');
  await navigate(page, 'operations'); await page.locator('#diagnostics-refresh').click();
  await navigate(page, 'community');
  await expect(card.locator('[data-feedback-status]')).toHaveValue('new');
  await expect(card.locator('[data-feedback-notes]')).toHaveValue('Unsaved private draft');
  await expect(card.locator('[data-admin-reply] textarea')).toHaveValue('Unsaved reply');
  expect(await card.locator('.feedback-message img').count()).toBe(0);
  expect(state.writes).toEqual([]); expect(state.errors).toEqual([]);
});
test('partial bulk changes preserve failed selections and identify unconfirmed records', async ({ page }) => {
  const state = await setup(page); await navigate(page, 'community'); page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#feedback-select-all').check(); await page.locator('#feedback-bulk-status').selectOption('closed');
  await page.locator('#feedback-bulk-apply').click();
  await expect(page.locator('#toast')).toContainText('1 of 2 tickets updated');
  await expect(page.locator(`[data-feedback-select="${'b'.repeat(32)}"]`)).toBeChecked();
  await expect(page.locator(`[data-feedback-select="${'a'.repeat(32)}"]`)).not.toBeChecked();
  expect(state.writes.filter((write) => write.endpoint.endsWith('/bulk'))).toHaveLength(1);
});
test('game editing, publication and roadmap editing use existing APIs', async ({ page }) => {
  const state = await setup(page); await navigate(page, 'games');
  await page.locator('[data-action="edit"]').click(); await page.locator('#edit-title').fill('Updated Alpha');
  await page.locator('#edit-form button[type="submit"]').click(); await expect(page.locator('#game-list')).toContainText('Updated Alpha');
  page.on('dialog', (dialog) => dialog.accept()); await page.locator('[data-action="publish"]').click();
  await expect(page.locator('.game-status')).toHaveText('draft');
  await navigate(page, 'roadmap'); await page.locator('[data-roadmap-action="edit"]').click();
  await page.locator('#roadmap-title-input').fill('Accessible controls'); await page.locator('#roadmap-save').click();
  await expect(page.locator('#roadmap-list')).toContainText('Accessible controls');
  await page.locator('[data-roadmap-action="archive"]').click(); await expect(page.locator('.roadmap-table .roadmap-status')).toHaveText('Archived');
  expect(state.errors).toEqual([]);
});
test('AI response is rendered safely and session expiry clears private state', async ({ page }) => {
  const state = await setup(page); await navigate(page, 'ai');
  await page.locator('#chat-input').fill('Review library'); await page.locator('#chat-send').click();
  await expect(page.locator('#chat-transcript')).toContainText('Library reviewed.');
  await navigate(page, 'operations');
  state.expire();
  await page.locator('#diagnostics-refresh').click();
  await expect(page.locator('#login-view')).toBeVisible();
  await expect(page.locator('#chat-transcript')).toBeEmpty();
  expect(await page.evaluate(() => sessionStorage.getItem('octoAdminToken'))).toBe(null);
  expect(state.errors).toEqual([]);
});
test('iPad portrait, landscape and split-view layouts stay contained', async ({ page }) => {
  await setup(page);
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1180, height: 820 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#dashboard-view')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const drawer = page.locator('#sidebar-drawer-toggle');
    if (await drawer.isVisible()) {
      await drawer.click();
      await expect(page.locator('#admin-sidebar')).toBeVisible();
      await page.locator('#sidebar-scrim').click({ force: true }).catch(() => {});
    }
  }
});
test('external keyboard search and trackpad-style navigation remain usable', async ({ page, browserName }) => {
  await setup(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await expect(page.locator('#command-dialog')).toBeVisible();
  await page.locator('#global-admin-search').fill('Game Library');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-admin-panel="games"]')).toBeVisible();
  await page.mouse.move(20, 20);
  if (browserName !== 'webkit') await page.mouse.wheel(0, 240);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const mode of ['malformed', 'unavailable']) test(`${mode} dashboard responses remain visibly unavailable`, async ({ page }) => {
  const state = await setup(page, { [mode]: true }); await expect(page.locator('#dashboard-error')).toBeVisible();
  await expect(page.locator('#metric-total')).toHaveText('Unavailable'); expect(state.writes).toEqual([]);
});
