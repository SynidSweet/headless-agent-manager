import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from './helpers/cleanup';

/**
 * E2E Tests: WebSocket Connection
 * Tests WebSocket connection status and behavior
 * Based on User Story 7: Handle WebSocket Disconnections Gracefully
 */
test.describe('WebSocket Connection', () => {
  // Clean up agents before AND after each test to ensure isolation
  test.beforeEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });
  test('Connection status indicator is visible', async ({ page }) => {
    await page.goto('/');

    // Should show connection status
    const connectionStatus = page.locator('text=/Connected|Disconnected/i');
    await expect(connectionStatus).toBeVisible();
  });

  test('Application shows connected status on load', async ({ page }) => {
    await page.goto('/');

    // Wait for WebSocket to connect
    await page.waitForTimeout(1000);

    // Should show "Connected" status
    const connectedText = page.locator('text=/Connected/i').first();
    await expect(connectedText).toBeVisible({ timeout: 5000 });

    // Should show green status dot
    const statusDot = page.locator('span').filter({
      has: page.locator('xpath=..').filter({ hasText: /Connected|Disconnected/i }),
    }).first();

    // The dot should exist
    await expect(statusDot).toBeVisible();
  });

  test('Page loads and renders without WebSocket errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Should not have critical WebSocket errors
    const criticalErrors = errors.filter(
      (err) => err.includes('WebSocket') && err.includes('failed')
    );

    expect(criticalErrors.length).toBe(0);
  });

  test('Application continues to function after page load', async ({ page }) => {
    await page.goto('/');

    // Wait for everything to load
    await page.waitForLoadState('domcontentloaded');

    // Form should be interactive
    const promptInput = page.locator('textarea#agent-prompt');
    await expect(promptInput).toBeEnabled();

    // Can type in the form
    await promptInput.fill('Test input');
    await expect(promptInput).toHaveValue('Test input');
  });
});
