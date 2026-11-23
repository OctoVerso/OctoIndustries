
import { test, expect } from '@playwright/test';

test('admin dashboard automatically syncs newly added catalog games', async ({ page }) => {
  const syncRequests = [];
  const consoleErrors = [];
  let dashboardGames;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.addInitScript(() =>
    sessionStorage.setItem('octoAdminToken', 'test-session')
  );

  await page.route('**/functions/v1/admin/**', async (route) => {
    const { pathname } = new URL(route.request().url());

    if (pathname.endsWith('/admin/session')) {
      await route.fulfill({
        json: {
          authenticated: true,
          expiresAt: '2027-01-01T00:00:00Z',
        },
      });
      return;
    }

    if (pathname.endsWith('/admin/dashboard')) {
      const catalog = await route.request().frame().evaluate(
        () => window.OCTO_GAMES
      );

      dashboardGames ||= [
        { ...catalog[0], status: 'published', offlineReady: true },
      ];

      await route.fulfill({
        json: {
          counts: {
            total: dashboardGames.length,
            published: dashboardGames.length,
            drafts: 0,
            offlineReady: dashboardGames.length,
            failedJobs: 0,
          },
          games: dashboardGames,
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
      const request = {
        method: route.request().method(),
        headers: route.request().headers(),
        body: JSON.parse(route.request().postData()),
      };

      syncRequests.push(request);

      dashboardGames.push(
        ...request.body.games.map((game) => ({
          ...game,
          status: 'published',
          offlineReady: false,
        }))
      );

      await route.fulfill({
        json: { synced: request.body.games.length },
      });
      return;
    }

    await route.fulfill({
      status: 404,
      json: { error: 'Unexpected admin endpoint.' },
    });
  });

  await page.goto('/Octo-Industries/BehindTheScenes/admin/index.html');

  const catalogGames = await page.evaluate(() => window.OCTO_GAMES);

  await expect(page.locator('#metric-total')).toHaveText(
    String(catalogGames.length)
  );

  await expect.poll(() => syncRequests.length).toBeGreaterThan(0);

  await expect(page.locator('#toast')).toHaveText(
    /Catalog sync complete:/
  );

  const firstGame = catalogGames[0];

  const drawerToggle = page.locator('#sidebar-drawer-toggle');

  if (await drawerToggle.isVisible()) {
    await drawerToggle.click();
  }

  await page.locator(
    '#admin-sidebar summary[data-admin-view="games"]'
  ).click();

  await expect(page.locator('#game-list')).toContainText(
    firstGame.title
  );

  await expect(
    page.locator('#catalog-sync-button')
  ).toBeVisible();

  expect(consoleErrors).toEqual([]);

  expect(
    syncRequests
      .flatMap((request) => request.body.games)
      .map((game) => game.id)
      .sort()
  ).toEqual(
    catalogGames.slice(1).map((game) => game.id).sort()
  );

  for (const request of syncRequests) {
    expect(request.method).toBe('POST');

    expect(request.headers['content-type']).toContain(
      'application/json'
    );

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
