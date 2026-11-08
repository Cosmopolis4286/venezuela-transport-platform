import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests of the web against a running API and web (docs/development/testing.md).
 * Start both first (`pnpm build`, then the API with PAYMENT_PROVIDER=simulated and
 * `pnpm --filter @vtp/web start`), or set WEB_BASE_URL / API_BASE_URL to test other addresses.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  // Creates the company, departure and paid booking through the API (e2e/support/seed.ts).
  globalSetup: './e2e/support/seed.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
