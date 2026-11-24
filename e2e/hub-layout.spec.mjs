import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const source = readFileSync(new URL('../Octo-Industries/BehindTheScenes/hub/catalog.js', import.meta.url), 'utf8');
const catalog = JSON.parse(source.match(/Object\.freeze\(([\s\S]*)\);\s*$/)[1]);
const cube = catalog.find((game) => game.id === 'b-cubed');

test.beforeEach(async ({ page }) => {
  // Exercise the real static hub with a public catalog subset; no live backend writes.
  await page.route('**/functions/v1/**', (route) => route.fulfill({
    json: route.request().url().endsWith('/catalog') ? catalog.slice(0, 17) : [],
  }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('home keeps the compact dashboard and the full collection without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const catalogResponse = page.waitForResponse('**/functions/v1/catalog');
  await page.goto('/');
  await catalogResponse;
  await expect(page.locator('#boot-screen')).toBeHidden();
  await expect(page.locator('#home-page')).toBeVisible();
  await expect(page.locator('#game-grid .game-card')).toHaveCount(catalog.length);
  await expect(page.locator('#overview-total')).toHaveText(String(catalog.length));
  await expect(page.locator('#favorites-page')).toBeHidden();
  await expect(page.locator('#game-detail-page')).toBeHidden();
  const layout = await page.evaluate(() => {
    const home = document.querySelector('#home-page');
    const modules = [...home.querySelectorAll('.dashboard-row-main > section, .dashboard-row-main > aside')];
    return {
      moduleTitles: modules.map((module) => module.getAttribute('aria-label') || module.querySelector('h2').textContent),
      collectionGap: document.querySelector('#games-page').getBoundingClientRect().top - home.getBoundingClientRect().bottom,
    };
  });
  expect(layout.moduleTitles).toEqual(["Editor's pick", 'Recently Added', 'Continue Playing', 'Trending']);
  expect(layout.collectionGap).toBeLessThanOrEqual(24);
  expect(errors).toEqual([]);
});

test('card actions stay inside every card at narrow, tablet and desktop widths', async ({ page }, testInfo) => {
  await page.goto('/#/games');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(catalog.length);
  const widths = testInfo.project.name === 'desktop' ? [1440, 1920] : testInfo.project.name === 'mobile' ? [390, 540] : [768, 1024];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    const clipped = await page.locator('#game-grid .game-card').evaluateAll((cards) => cards.flatMap((card) => {
      const bounds = card.getBoundingClientRect();
      return [...card.querySelectorAll('.game-card-foot a, .game-card-foot button')]
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return rect.left < bounds.left || rect.right > bounds.right || rect.bottom > bounds.bottom;
        }).map((control) => `${card.dataset.gameId}: ${control.textContent.trim()}`);
    }));
    expect(clipped, `clipped controls at ${width}px`).toEqual([]);
    expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('search, filter, sort, and gallery remain usable on the restored cards', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/games');
  await page.locator('#game-search').fill('b-cubed');
  await expect(page.locator('#game-grid .game-card')).toHaveCount(1);
  await page.locator('#game-grid [data-gallery-id="b-cubed"]').click();
  await expect(page.locator('#screenshot-gallery')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#search-clear').click();
  await page.locator('#filter-games').click();
  await page.locator('#filter-category-options [data-category="Puzzle"]').click();
  await expect(page.locator('#game-grid .game-card')).toHaveCount(catalog.filter((game) => game.category === 'Puzzle').length);
  await page.locator('#game-sort').selectOption('title-desc');
  const titles = await page.locator('#game-grid h3').allTextContents();
  expect(titles).toEqual([...titles].sort((a, b) => b.localeCompare(a)));
  expect(errors).toEqual([]);
});

test('details and favorites work without adding panels to the homepage', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#/games');
  await page.locator('#game-grid').getByRole('link', { name: `Details for ${cube.title}`, exact: true }).click();
  await expect(page.locator('#game-detail-heading')).toHaveText(cube.title);
  await expect(page.locator('#home-page')).toBeHidden();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'mobile') {
    expect(await page.locator('.game-detail-hero').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  }
  await page.locator('#game-detail-content [data-favorite-id]').click();
  await expect(page.locator('#game-detail-content [data-favorite-id]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#game-detail-content [data-favorite-id]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#menu-toggle').click();
  await page.locator('#primary-nav [data-route="/favorites"]').click();
  await expect(page.locator('#favorites-grid .game-card')).toHaveCount(1);
  await expect(page).toHaveTitle('Favorites | Octo Industries');
  await page.locator('#favorites-grid .game-title-link').click();
  await expect(page.locator('#game-detail-heading')).toHaveText(cube.title);
  await page.goBack();
  await expect(page.locator('#favorites-page')).toBeVisible();
  await page.locator('.brand').click();
  await expect(page.locator('#home-page')).toBeVisible();
  await expect(page.locator('#game-grid .game-card')).toHaveCount(catalog.length);
  expect(errors).toEqual([]);
});

test('featured Play navigates to the actual game and records the play', async ({ page }) => {
  await page.goto('/');
  const play = page.locator('#featured-play');
  await expect(play).toHaveAttribute('data-launch-id', /.+/);
  const launchId = await play.getAttribute('data-launch-id');
  const launchUrl = await play.getAttribute('href');
  await page.route(launchUrl, (route) => route.fulfill({ contentType: 'text/html', body: '<title>Game launch</title><h1>Game launch</h1>' }));
  await play.click();
  await expect(page).toHaveURL(launchUrl);
  await page.goBack();
  await expect(page.locator('#continue-list [data-launch-id]').first()).toHaveAttribute('data-launch-id', launchId);
  await expect(page.locator('#overview-trending')).toHaveText('1');
});
