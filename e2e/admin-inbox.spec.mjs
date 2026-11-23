import { test, expect } from '@playwright/test';

test('admin inquiry filters, analytics, management, and conversation stay in sync', async ({ page }) => {
  const now = Date.now();
  const ticketDate = (daysAgo) => new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const gameId = '8-ball-pool-online';
  const entries = [
    {
      id: 'a'.repeat(32), ticketNumber: 1001, userAccessEnabled: true, type: 'issue', gameId,
      message: 'Chrome freezes on the loading screen.', deviceInfo: { deviceType: 'Mobile', browser: 'Chrome', language: 'en-US' },
      status: 'new', priority: 'critical', archived: false, adminNotes: '',
      createdAt: ticketDate(0), updatedAt: ticketDate(0),
    },
    {
      id: 'b'.repeat(32), ticketNumber: 1002, userAccessEnabled: true, type: 'suggestion', gameId: null,
      message: 'Please add controller support.', deviceInfo: { deviceType: 'Desktop', browser: 'Firefox', language: 'fr-FR' },
      status: 'under_review', priority: 'high', archived: false, adminNotes: '',
      createdAt: ticketDate(2), updatedAt: ticketDate(1),
    },
    {
      id: 'c'.repeat(32), ticketNumber: 1003, userAccessEnabled: true, type: 'issue', gameId,
      message: 'The controls stop responding after a while.', deviceInfo: { deviceType: 'Tablet', browser: 'Safari', language: 'ja-JP' },
      status: 'awaiting_user_reply', priority: 'medium', archived: false, adminNotes: '',
      createdAt: ticketDate(10), updatedAt: ticketDate(9),
    },
    {
      id: 'd'.repeat(32), ticketNumber: 1004, userAccessEnabled: true, type: 'suggestion', gameId: null,
      message: 'An older archived request.', deviceInfo: { deviceType: 'Desktop', browser: 'Edge', language: 'en-GB' },
      status: 'resolved', priority: 'low', archived: true, adminNotes: '',
      createdAt: ticketDate(45), updatedAt: ticketDate(40),
    },
  ];
  const conversations = new Map(entries.map((entry) => [entry.id, [
    { author: 'user', message: entry.message, createdAt: entry.createdAt },
  ]]));
  const consoleErrors = [];
  const confirmations = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('octoAdminToken', 'test-session'));
  await page.route('**/functions/v1/admin/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('/admin/session')) {
      await route.fulfill({ json: { authenticated: true, expiresAt: '2027-01-01T00:00:00Z' } });
      return;
    }
    if (pathname.endsWith('/admin/dashboard')) {
      const games = await request.frame().evaluate(() => window.OCTO_GAMES);
      await route.fulfill({
        json: {
          counts: { total: games.length, published: games.length, drafts: 0, offlineReady: 0, failedJobs: 0 },
          games: games.map((game) => ({ ...game, status: 'published', offlineReady: false })),
          jobs: [], activity: [], roadmap: [], proposals: [],
        },
      });
      return;
    }
    if (pathname.endsWith('/admin/feedback/bulk') && request.method() === 'POST') {
      const body = request.postDataJSON();
      for (const entry of entries.filter((ticket) => body.ids.includes(ticket.id))) {
        if (body.status) entry.status = body.status;
        if (Object.hasOwn(body, 'archived')) entry.archived = body.archived;
        if (Object.hasOwn(body, 'deleted')) entry.deleted = body.deleted;
        entry.updatedAt = new Date().toISOString();
      }
      await route.fulfill({ json: { updated: body.ids.length } });
      return;
    }
    if (pathname.endsWith('/admin/feedback') && request.method() === 'GET') {
      await route.fulfill({ json: entries.filter((entry) => !entry.deleted) });
      return;
    }
    const match = /\/admin\/feedback\/([a-f\d]{32})(?:\/(status|priority|conversation|reply|archive|unarchive|notes))?$/.exec(pathname);
    if (match) {
      const [, id, action] = match;
      const entry = entries.find((ticket) => ticket.id === id);
      if (!entry || entry.deleted) {
        await route.fulfill({ status: 404, json: { error: 'Ticket not found.' } });
        return;
      }
      if (request.method() === 'GET' && action === 'conversation') {
        await route.fulfill({ json: { conversation: conversations.get(id), activity: [] } });
        return;
      }
      if (request.method() === 'PATCH' && action === 'status') {
        entry.status = request.postDataJSON().status;
      } else if (request.method() === 'PATCH' && action === 'priority') {
        entry.priority = request.postDataJSON().priority;
      } else if (request.method() === 'PATCH' && action === 'notes') {
        entry.adminNotes = request.postDataJSON().adminNotes;
      } else if (request.method() === 'POST' && action === 'reply') {
        const { message } = request.postDataJSON();
        conversations.get(id).push({ author: 'admin', message, createdAt: new Date().toISOString() });
        entry.status = 'awaiting_user_reply';
      } else if (request.method() === 'POST' && (action === 'archive' || action === 'unarchive')) {
        entry.archived = action === 'archive';
      } else if (request.method() === 'DELETE' && !action) {
        entry.deleted = true;
      } else {
        await route.fulfill({ status: 405, json: { error: 'Unexpected ticket request.' } });
        return;
      }
      entry.updatedAt = new Date().toISOString();
      await route.fulfill({ json: { id, status: entry.status, priority: entry.priority, archived: entry.archived, updatedAt: entry.updatedAt } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: 'Unexpected admin endpoint.' } });
  });

  await page.goto('/Octo-Industries/BehindTheScenes/admin/index.html');
  page.on('dialog', (dialog) => {
    confirmations.push(dialog.message());
    dialog.accept();
  });
  const drawerToggle = page.locator('#sidebar-drawer-toggle');
  if (await drawerToggle.isVisible()) await drawerToggle.click();
  await page.locator('#admin-sidebar [data-admin-view="community"]').first().click();

  const card = (id) => page.locator(`[data-feedback-card="${id}"]`);
  const analytics = page.locator('#ticket-analytics-metrics .ticket-stat-card');
  await expect(analytics).toHaveCount(13);
  expect(await analytics.evaluateAll((cards) => cards.map((item) => item.dataset.stat))).toEqual([
    'new', 'under_review', 'awaiting_user', 'planned', 'in_progress', 'awaiting_user_reply',
    'implemented', 'resolved', 'rejected', 'closed', 'archived', 'critical', 'created-recently',
  ]);
  for (const [stat, value] of [['new', '1'], ['awaiting_user_reply', '1'], ['archived', '1'], ['critical', '1'], ['created-recently', '3']]) {
    await expect(page.locator(`#ticket-analytics-metrics [data-stat="${stat}"] strong`)).toHaveText(value);
  }

  await page.locator('#feedback-sort').selectOption('oldest');
  await expect(page.locator('#feedback-list article').first()).toHaveAttribute('data-feedback-card', 'd'.repeat(32));
  await page.locator('#feedback-sort').selectOption('newest');
  await expect(page.locator('#feedback-list article').first()).toHaveAttribute('data-feedback-card', 'a'.repeat(32));
  await page.locator('#feedback-search').fill('Firefox');
  await expect(page.locator('#feedback-result-count')).toHaveText('1 of 4 tickets');
  await expect(card('b'.repeat(32))).toBeVisible();
  await page.locator('#feedback-search').fill('ja-JP');
  await expect(card('c'.repeat(32))).toBeVisible();
  await page.locator('#feedback-search').fill('Mobile');
  await expect(card('a'.repeat(32))).toBeVisible();
  await page.locator('#feedback-search').fill('');
  await page.locator('#feedback-status-filter').selectOption('archived');
  await expect(page.locator('#feedback-result-count')).toHaveText('1 of 4 tickets');
  await expect(card('d'.repeat(32))).toBeVisible();
  await page.locator('#feedback-clear-filters').click();

  const filterDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Bahrain',
  }).format(new Date(now));
  await page.locator('#feedback-search').fill('#1001');
  await page.locator('#feedback-type-filter').selectOption('issue');
  await page.locator('#feedback-status-filter').selectOption('new');
  await page.locator('#feedback-priority-filter').selectOption('critical');
  await page.locator('#feedback-game-filter').selectOption(gameId);
  await page.locator('#feedback-date-from').fill(filterDate);
  await page.locator('#feedback-date-to').fill(filterDate);
  await expect(page.locator('#feedback-result-count')).toHaveText('1 of 4 tickets');
  await expect(page.locator('#feedback-active-filters button')).toHaveCount(7);
  await page.locator('#feedback-active-filters [data-clear-feedback-filter="priority"]').click();
  await expect(page.locator('#feedback-result-count')).toHaveText('1 of 4 tickets');
  await page.locator('#feedback-clear-filters').click();
  await expect(page.locator('#feedback-result-count')).toHaveText('4 of 4 tickets');

  await card('a'.repeat(32)).locator('[data-feedback-status]').selectOption('awaiting_user');
  await expect(card('a'.repeat(32)).locator('.feedback-status-badge')).toHaveText('Awaiting User');
  await expect(page.locator('#ticket-analytics-metrics [data-stat="new"] strong')).toHaveText('0');
  await expect(page.locator('#ticket-analytics-metrics [data-stat="awaiting_user"] strong')).toHaveText('1');
  await card('a'.repeat(32)).locator('[data-feedback-priority]').selectOption('high');
  await expect(card('a'.repeat(32)).locator('.feedback-priority-badge')).toHaveText('High');
  await expect(page.locator('#ticket-analytics-metrics [data-stat="critical"] strong')).toHaveText('0');
  await card('a'.repeat(32)).locator('[data-ticket-conversation] > summary').click();
  await expect(card('a'.repeat(32)).locator('.feedback-conversation-list')).toContainText('Chrome freezes on the loading screen.');
  await card('a'.repeat(32)).locator('[data-admin-reply] textarea').fill('Thanks, we are investigating.');
  await card('a'.repeat(32)).locator('[data-admin-reply] button[type="submit"]').click();
  await expect(card('a'.repeat(32)).locator('.feedback-conversation-list')).toContainText('Thanks, we are investigating.');
  await expect(page.locator('#ticket-analytics-metrics [data-stat="awaiting_user_reply"] strong')).toHaveText('2');

  await card('a'.repeat(32)).locator('.feedback-actions-menu > summary').click();
  await card('a'.repeat(32)).locator('[data-feedback-archive]').click();
  await expect(card('a'.repeat(32)).locator('[data-feedback-archive]')).toHaveAttribute('data-archived', 'true');
  await card('a'.repeat(32)).locator('.feedback-actions-menu > summary').click();
  await card('a'.repeat(32)).locator('[data-feedback-archive]').click();
  await expect(card('a'.repeat(32)).locator('[data-feedback-archive]')).toHaveAttribute('data-archived', 'false');

  await card('a'.repeat(32)).locator('[data-feedback-select]').check();
  await card('b'.repeat(32)).locator('[data-feedback-select]').check();
  await page.locator('#feedback-bulk-status').selectOption('closed');
  await page.locator('#feedback-bulk-apply').click();
  await expect(card('a'.repeat(32)).locator('.feedback-status-badge')).toHaveText('Closed');
  await expect(card('b'.repeat(32)).locator('.feedback-status-badge')).toHaveText('Closed');

  await card('a'.repeat(32)).locator('[data-feedback-select]').check();
  await card('b'.repeat(32)).locator('[data-feedback-select]').check();
  await page.locator('#feedback-bulk-archive').click();
  await expect(card('a'.repeat(32)).locator('[data-feedback-archive]')).toHaveAttribute('data-archived', 'true');
  await expect(card('b'.repeat(32)).locator('[data-feedback-archive]')).toHaveAttribute('data-archived', 'true');

  await card('c'.repeat(32)).locator('[data-feedback-select]').check();
  await page.locator('#feedback-bulk-delete').click();
  await expect(card('c'.repeat(32))).toHaveCount(0);
  await card('d'.repeat(32)).locator('.feedback-actions-menu > summary').click();
  await card('d'.repeat(32)).locator('[data-feedback-delete]').click();
  await expect(card('d'.repeat(32))).toHaveCount(0);
  expect(confirmations.some((message) => message.includes('Change the status of 2 selected tickets'))).toBe(true);
  expect(confirmations.some((message) => message.includes('Archive 2 selected tickets'))).toBe(true);
  expect(confirmations.some((message) => message.includes('Delete this ticket'))).toBe(true);
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
