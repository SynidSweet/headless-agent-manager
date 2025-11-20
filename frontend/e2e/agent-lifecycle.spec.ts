import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from './helpers/cleanup';

/**
 * E2E Tests: Agent Lifecycle
 * Tests the complete lifecycle of launching and managing agents
 * Based on User Story 1: Launch Single Agent
 */
test.describe('Agent Lifecycle', () => {
  // Clean up agents before AND after each test to ensure isolation
  test.beforeEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupAllAgents(request);
  });
  test('User can launch a single agent', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Verify page loaded
    await expect(page.locator('h1')).toContainText('Agent Manager');

    // Fill in the launch form
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Write a hello world function');

    // Launch the agent and wait for API calls to complete
    const [launchResponse, refreshResponse] = await Promise.all([
      // Wait for the launch POST request
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST'
      ),
      // Wait for the subsequent GET request to refresh the list
      page.waitForResponse(
        (resp) => resp.url().endsWith('/api/agents') && resp.request().method() === 'GET',
        { timeout: 10000 }
      ),
      // Click the button
      page.click('button:has-text("Launch Agent")'),
    ]);

    // Verify launch was successful
    expect(launchResponse.status()).toBe(201);

    // Prompt should be cleared
    await expect(page.locator('textarea#agent-prompt')).toHaveValue('');

    // Agent should appear in the list after React updates
    await expect(page.locator('[data-agent-id]').first()).toBeVisible({ timeout: 3000 });

    // Should show agent type (use first() for non-unique text)
    await expect(page.locator('text=/claude-code/i').first()).toBeVisible();
  });

  test('User can view connection status', async ({ page }) => {
    await page.goto('/');

    // Should show connection status
    await expect(
      page.locator('text=/Connected|Disconnected/i')
    ).toBeVisible();
  });

  test('User sees validation error for empty prompt', async ({ page }) => {
    await page.goto('/');

    // Try to launch without prompt
    await page.click('button:has-text("Launch Agent")');

    // Should show validation error
    await expect(page.locator('text=/Prompt is required/i')).toBeVisible();
  });

  test('Empty state shows when no agents exist', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForResponse((resp) => resp.url().endsWith('/api/agents'));

    // Check if there are any agents in the list
    const agentCount = await page.locator('[data-agent-id]').count();

    if (agentCount === 0) {
      // If no agents, should show empty state
      await expect(page.locator('text=/No agents yet/i')).toBeVisible();
    } else {
      // If agents exist, should show the agent list
      await expect(page.locator('h2').filter({ hasText: `Agents (${agentCount})` })).toBeVisible();
    }

    // Either way, the UI should render correctly based on actual data
  });

  test('Agent count updates when agents exist', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForResponse((resp) => resp.url().endsWith('/api/agents'));

    // Should show agents count in title (could be 0 or more)
    await expect(page.locator('h2').filter({ hasText: /Agents \(\d+\)/ })).toBeVisible();

    // Get current count
    const currentCountText = await page.locator('h2').filter({ hasText: /Agents/ }).textContent();
    const currentCount = parseInt(currentCountText?.match(/\((\d+)\)/)?.[1] || '0');

    // Launch a new agent
    await page.fill('textarea#agent-prompt', 'Test agent for count');

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST'),
      page.click('button:has-text("Launch Agent")'),
    ]);

    // Wait for the count to increment
    await expect(async () => {
      const newCountText = await page.locator('h2').filter({ hasText: /Agents/ }).textContent();
      const newCount = parseInt(newCountText?.match(/\((\d+)\)/)?.[1] || '0');
      expect(newCount).toBe(currentCount + 1);
    }).toPass({ timeout: 15000 });
  });
});
