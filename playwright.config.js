import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1920, height: 1080 },
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node scripts/dev-server.mjs',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 30000
  }
});
