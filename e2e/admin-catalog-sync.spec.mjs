import { test, expect } from '@playwright/test';

test('admin dashboard and game library load read-only; manual catalog sync sends JSON', async ({ page }) => {
  const syncRequests = [];
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.addInitScript(() => sessionStorage.setItem('octoAdminToken', 'test-session'));
  await page.route('**/functions/v1/admin/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/admin/session')) {
      await route.fulfill({ json: { authenticated: true, expiresAt: '2027-01-01T00:00:00Z' } });
      return;
    }
    if (pathname.endsWith('/admin/dashboard')) {
      const game = await route.request().frame().evaluate(() => window.OCTO_GAMES[0]);
      await route.fulfill({
        json: {
          counts: { total: 1, published: 1, drafts: 0, offlineReady: 1, failedJobs: 0 },
          games: [{ ...game, status: 'published', offlineReady: true }],
          jobs: [],
          activity: [],
          roadmap: [],
          proposals: [],
        },
      });
      return;
    }
    if (pathname.endsWith('/admin/feedback')) {
      await route.fulfill({ json: [] });
      return;
    }
    if (pathname.endsWith('/admin/catalog/sync')) {
      syncRequests.push({
        method: route.request().method(),
        headers: route.request().headers(),
        body: JSON.parse(route.request().postData()),
      });
      await route.fulfill({ json: { synced: 1 } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: 'Unexpected admin endpoint.' } });
  });

  await page.goto('/Octo-Industries/BehindTheScenes/admin/index.html');
  await expect(page.locator('#metric-total')).toHaveText('1');
  expect(syncRequests).toHaveLength(0);

  const firstGame = await page.evaluate(() => window.OCTO_GAMES[0]);
  await page.locator('#admin-sidebar summary[data-admin-view="games"]').click();
  await expect(page.locator('#game-list')).toContainText(firstGame.title);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#catalog-sync-button').click();
  await expect.poll(() => syncRequests.length).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);

  for (const request of syncRequests) {
    expect(request.method).toBe('POST');
    expect(request.headers['content-type']).toContain('application/json');
    expect(Array.isArray(request.body.games)).toBe(true);
    expect(request.body.games.length).toBeGreaterThan(0);
    for (const game of request.body.games) {
      expect(game).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        category: expect.any(String),
        tags: expect.any(Array),
        featured: expect.any(Boolean),
        launch: expect.stringMatching(/^\/?Octo-Industries\//),
        thumbnail: expect.stringMatching(/^\/?Octo-Industries\//),
      });
    }
  }
});
