import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests
 * Orchestrates both backend and frontend servers for real integration testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts$/, // Only .spec.ts files (not .test.ts from Vitest)
  testIgnore: ['**/node_modules/**', '**/test/**', '../backend/**'],
  fullyParallel: false, // Run sequentially for stability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1, // Retry once for flaky tests
  workers: 1, // Single worker for consistent server state
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts', // Verify backend is running before tests
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 10000, // 10s for actions
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
          ],
        },
      },
    },
  ],

  /* Run frontend dev server before starting tests
   * Note: Backend should be running separately on port 3000 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
