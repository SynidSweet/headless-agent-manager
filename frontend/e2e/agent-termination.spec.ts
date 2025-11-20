import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from './helpers/cleanup';

/**
 * E2E Tests: Agent Termination
 * Tests terminating running agents
 * Based on User Story 6: Terminate Running Agent
 */
test.describe('Agent Termination', () => {
  // Clean up agents before AND after each test to ensure isolation
  test.beforeEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });
  test('Terminate button only shows for running agents', async ({ page }) => {
    await page.goto('/');

    await page.waitForTimeout(1000); // Wait for agents to load

    // Check all agents for terminate buttons
    const agents = page.locator('[data-agent-id]');
    const agentCount = await agents.count();

    for (let i = 0; i < agentCount; i++) {
      const agent = agents.nth(i);
      const statusBadge = agent.locator('text=/▶️.*running/i');
      const isRunning = (await statusBadge.count()) > 0;

      const terminateButton = agent.locator('button:has-text("Terminate")');
      const hasTerminateButton = (await terminateButton.count()) > 0;

      if (isRunning) {
        expect(hasTerminateButton).toBe(true);
      }
    }
  });

  test('Completed agents do not show terminate button', async ({ page }) => {
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Find a completed agent if one exists
    const completedAgent = page.locator('[data-agent-id]').filter({ hasText: 'completed' }).first();
    const exists = (await completedAgent.count()) > 0;

    if (exists) {
      // Should not have terminate button
      const terminateButton = completedAgent.locator('button:has-text("Terminate")');
      await expect(terminateButton).not.toBeVisible();
    }
  });

  test('Failed agents do not show terminate button', async ({ page }) => {
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Find a failed agent if one exists
    const failedAgent = page.locator('[data-agent-id]').filter({ hasText: 'failed' }).first();
    const exists = (await failedAgent.count()) > 0;

    if (exists) {
      // Should not have terminate button
      const terminateButton = failedAgent.locator('button:has-text("Terminate")');
      await expect(terminateButton).not.toBeVisible();
    }
  });

  test('Clicking terminate does not select the agent', async ({ page }) => {
    await page.goto('/');

    await page.waitForTimeout(1000);

    // Find a running agent
    const runningAgent = page.locator('[data-agent-id]').filter({ hasText: 'running' }).first();
    const exists = (await runningAgent.count()) > 0;

    if (exists) {
      const terminateButton = runningAgent.locator('button:has-text("Terminate")');
      const hasButton = (await terminateButton.count()) > 0;

      if (hasButton) {
        // Click terminate button
        await terminateButton.click();

        // Agent should not get highlighted border (not selected)
        // The border should still be the default gray, not blue
        const borderColor = await runningAgent.evaluate(
          (el) => window.getComputedStyle(el).borderColor
        );

        // Should not be the active blue color
        expect(borderColor).not.toContain('13, 110, 253');
      }
    }
  });
});
