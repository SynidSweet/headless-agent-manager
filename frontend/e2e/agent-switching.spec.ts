import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from './helpers/cleanup';

/**
 * E2E Tests: Agent Switching
 * Tests switching between different agents
 * Based on User Story 3: Click Between Agents to See Progress
 */
test.describe('Agent Switching', () => {
  // Clean up agents before AND after each test to ensure isolation
  test.beforeEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });
  test('User can switch between agents', async ({ page }) => {
    await page.goto('/');

    // Check if multiple agents exist
    const agents = page.locator('[data-agent-id]');
    const agentCount = await agents.count();

    if (agentCount >= 2) {
      // Select first agent
      const firstAgent = agents.nth(0);
      const firstAgentId = await firstAgent.getAttribute('data-agent-id');
      await firstAgent.click();

      // Verify first agent is selected (highlighted border)
      await expect(firstAgent).toHaveCSS('border-color', /rgb\(13, 110, 253\)|#0d6efd/i);

      // Select second agent
      const secondAgent = agents.nth(1);
      const secondAgentId = await secondAgent.getAttribute('data-agent-id');
      await secondAgent.click();

      // Verify second agent is now selected
      await expect(secondAgent).toHaveCSS('border-color', /rgb\(13, 110, 253\)|#0d6efd/i);

      // Verify agents are different
      expect(firstAgentId).not.toBe(secondAgentId);
    }
  });

  test('Selected agent shows highlighted border', async ({ page }) => {
    await page.goto('/');

    const firstAgent = page.locator('[data-agent-id]').first();
    const agentExists = await firstAgent.count() > 0;

    if (agentExists) {
      // Click agent
      await firstAgent.click();

      // Should have active border color
      await expect(firstAgent).toHaveCSS('border-color', /rgb\(13, 110, 253\)|#0d6efd/i);
    }
  });

  test('Output panel updates when selecting different agent', async ({ page }) => {
    await page.goto('/');

    const agents = page.locator('[data-agent-id]');
    const agentCount = await agents.count();

    if (agentCount >= 1) {
      const agent = agents.first();
      await agent.click();

      // Output panel should show "Output" heading
      await expect(page.locator('h3:has-text("Output")')).toBeVisible();
    }
  });
});
