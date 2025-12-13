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
  retries: process.env.CI ? 2 : 0, // No retries in dev (fail fast to detect issues)
  workers: 1, // Single worker for consistent server state
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  globalSetup: './e2e/global-setup.ts', // Verify backend is running before tests
  timeout: 60000, // 60s timeout per test (allows for isolation delays)
  use: {
    baseURL: 'http://localhost:5174', // Dev frontend port
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
   * Note: Backend should be running separately on port 3001 (dev) */
  webServer: {
    command: 'vite --config vite.config.e2e.ts', // Use E2E-specific config (no HMR)
    url: 'http://localhost:5174', // Dev frontend port
    timeout: 120000, // 2 minutes to start
    reuseExistingServer: !process.env.CI, // Allow reuse in dev for faster iteration
    stdout: 'pipe', // ✅ Capture stdout for debugging
    stderr: 'pipe', // ✅ Capture stderr for debugging
  },
});
