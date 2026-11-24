import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const catalogSource = await readFile(new URL('../Octo-Industries/BehindTheScenes/hub/catalog.js', import.meta.url), 'utf8');
const catalogMatch = /^window\.OCTO_GAMES = Object\.freeze\(([\s\S]*)\);\s*$/.exec(catalogSource);
if (!catalogMatch) throw new Error('Generated catalog has an invalid format.');
const generatedCatalog = JSON.parse(catalogMatch[1]);

test('homepage loads with catalog content and no loading placeholders', async ({ page }) => {
  const consoleErrors = [];
  const failedRequests = [];
  await page.route('**/functions/v1/catalog', (route) => route.fulfill({ json: generatedCatalog }));
  await page.route('**/functions/v1/roadmap', (route) => route.fulfill({ json: [] }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));

  await page.goto('/');
  await expect(page.locator('#game-grid .game-card').first()).toBeVisible();
  await expect(page.locator('#featured-title')).not.toHaveText('');
  await expect(page.locator('#overview-total')).not.toHaveText('0');
  await expect(page.locator('#dashboard-recently-added-list')).not.toContainText('Loading');
  await expect(page.locator('#trending-list')).not.toContainText('Loading');

  const loadingText = await page.locator('body').innerText();
  expect(loadingText).not.toContain('Loading…');
  expect(consoleErrors.filter((message) =>
    !message.includes('third-party')
    && !message.includes('Unable to load the public roadmap')
    && !message.includes('Unknown API path')
  )).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('navigation and direct hash routes work', async ({ page }) => {
  await page.goto('/');
  for (const route of ['/games', '/trending', '/recently-added', '/news', '/coming-soon', '/about', '/contact', '/inquiries']) {
    await page.goto(`/#${route}`);
    await expect(page.locator('body')).toBeVisible();
  }
  await page.goBack();
  await page.goForward();
});

test('game search, category filters, sorting, and clearing work', async ({ page }) => {
  await page.goto('/#games');
  const search = page.locator('#game-search');
  await search.fill('zzzz-no-such-game');
  await expect(page.locator('#empty-state')).toBeVisible();
  await page.locator('#search-clear').click();
  await expect(search).toHaveValue('');

  await page.locator('#filter-games').click();
  const options = page.locator('#filter-category-options [data-category]');
  if (await options.count()) await options.first().click();
  await page.locator('#game-sort').selectOption('title-desc');
  await expect(page.locator('#game-grid')).not.toHaveAttribute('aria-busy', 'true');
});

test('play-count ranking updates consistently', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('octo-industries.play-counts'));
  await page.goto('/#trending');
  await expect(page.locator('#trending-page-grid')).toContainText('No games have recorded plays yet');

  await page.evaluate(() => {
    const game = window.OCTO_GAMES?.[0];
    if (!game) return;
    localStorage.setItem('octo-industries.play-counts', JSON.stringify({
      [game.id]: { count: 8, lastPlayedAt: '2026-01-01T00:00:00Z' },
    }));
  });
  await page.reload();
  await page.goto('/#trending');
  await expect(page.locator('#trending-page-grid .game-card').first()).toBeVisible();
  const titles = await page.locator('#trending-page-grid .game-heading-line h3').allTextContents();
  expect(titles[0]).toBeTruthy();
});

test('gallery control opens eligible screenshots and supports keyboard close', async ({ page }) => {
  await page.goto('/#games');
  const galleryButton = page.locator('[data-gallery-id]').first();
  if (await galleryButton.count()) {
    await galleryButton.click();
    await expect(page.locator('#screenshot-gallery')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    await expect(page.locator('#screenshot-gallery')).not.toBeVisible();
  }
});

test('Shadow Fight banner ads do not refresh after initial load', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    let now = 1000;
    let displayCount = 0;
    const intervals = [];
    const refreshes = [];
    const listeners = {};
    const slot = {
      addService() { return this; },
      setTargeting() { return this; },
    };
    const pubads = {
      addEventListener(name, callback) { listeners[name] = callback; },
      refresh(adSlots) { refreshes.push(adSlots); },
    };

    Date.now = () => now;
    window.setInterval = (callback, delay) => {
      intervals.push({ callback, delay });
      return intervals.length;
    };
    window.GameInterface = { _offsetListeners: [], _triggerOffsetChange() {} };
    window.googletag = {
      cmd: { push(callback) { callback(); } },
      pubads: () => pubads,
      defineSlot: () => slot,
      enableServices() {},
      display() { displayCount += 1; },
      destroySlots() {},
    };

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/Octo-Industries/Shadow-Fight-2/bnr-test-inject-261010.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    listeners.slotRenderEnded?.({ slot, isEmpty: false });
    now += 60_000;
    intervals.forEach(({ callback }) => callback());

    return { displayCount, refreshCount: refreshes.length };
  });

  expect(result.displayCount).toBeGreaterThan(0);
  expect(result.refreshCount).toBe(0);
});

test('Shadow Fight does not show interstitial ads between rounds', async ({ request }) => {
  const response = await request.get('/Octo-Industries/Shadow-Fight-2/famobi.json');
  expect(response.ok()).toBe(true);

  const config = await response.json();
  expect(config.ads.interstitial.eventIds).not.toContain('break:round');
});

test('Shadow Fight loading assets include the menu music', async ({ request }) => {
  const response = await request.get('/Octo-Industries/Shadow-Fight-2/res/audio/menu_music.a8d8d29d.m4a');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('audio');
});
