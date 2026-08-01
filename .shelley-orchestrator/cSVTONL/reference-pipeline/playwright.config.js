/**
 * playwright.config.js
 * Ships wired to the src/example/ demo so `npm run test:e2e` works out of
 * the box once you've run `npx playwright install --with-deps chromium`.
 * When you start a real project: change the `webServer.command` below to
 * boot YOUR app, and delete tests/e2e/example + src/example. Everything
 * else here is a reusable default — see
 * agents/03-spec-test/PLAYWRIGHT_SETUP.md for the full explanation of each
 * setting.
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/reports/e2e-report.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // CHANGE THIS for your real project, e.g. 'npm run dev' or 'node src/server.js'
    command: 'node src/example/server.js',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
