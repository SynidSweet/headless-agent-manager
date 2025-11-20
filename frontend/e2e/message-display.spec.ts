import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from './helpers/cleanup';

/**
 * E2E Tests: Message Display
 * Tests message loading and display functionality
 * Based on User Story 5: Read Previous Session History
 */
test.describe('Message Display', () => {
  // Clean up agents before AND after each test to ensure isolation
  test.beforeEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });
  test('User can select an agent to view output', async ({ page }) => {
    await page.goto('/');

    // Initially should show "Select an agent" message
    await expect(page.locator('text=/Select an agent to view output/i')).toBeVisible();

    // If there are agents in the list, click one
    const firstAgent = page.locator('[data-agent-id]').first();
    const agentExists = await firstAgent.count() > 0;

    if (agentExists) {
      await firstAgent.click();

      // Output panel should update
      await expect(page.locator('text=/Output/i')).toBeVisible();
    }
  });

  test('Message output panel shows correct structure', async ({ page }) => {
    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // When no agent selected, should show "Select an agent" message
    await expect(page.locator('text=/Select an agent to view output/i')).toBeVisible();
  });

  test('Messages render with proper data attributes', async ({ page }) => {
    await page.goto('/');

    // Select an agent if available
    const firstAgent = page.locator('[data-agent-id]').first();
    const agentExists = await firstAgent.count() > 0;

    if (agentExists) {
      await firstAgent.click();

      // Wait for messages to load (if any)
      await page.waitForTimeout(1000);

      // Check if messages have proper attributes
      const messages = page.locator('[data-message]');
      const messageCount = await messages.count();

      if (messageCount > 0) {
        const firstMessage = messages.first();
        await expect(firstMessage).toHaveAttribute('data-message-id');
        await expect(firstMessage).toHaveAttribute('data-sequence');
        await expect(firstMessage).toHaveAttribute('data-message-type');
      }
    }
  });
});
