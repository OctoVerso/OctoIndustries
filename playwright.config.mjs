import { defineConfig, devices } from '@playwright/test';

const existingServer = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: existingServer || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    ...(process.env.PLAYWRIGHT_ALL_BROWSERS ? [
      { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      { name: 'ipad-mini-webkit', use: { ...devices['iPad Mini'], browserName: 'webkit', viewport: { width: 768, height: 1024 } } },
      { name: 'ipad-pro-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit', viewport: { width: 1024, height: 768 } } },
    ] : []),
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'ipad-mini-portrait', use: { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 } } },
    { name: 'ipad-air-landscape', use: { ...devices['iPad (gen 7)'], viewport: { width: 1180, height: 820 } } },
    { name: 'ipad-pro-split-view', use: { ...devices['iPad Pro 11'], viewport: { width: 1024, height: 768 } } },
    { name: 'stage-manager', use: { viewport: { width: 1366, height: 768 }, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: existingServer ? undefined : {
    command: 'node scripts/serve-static.mjs dist',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
