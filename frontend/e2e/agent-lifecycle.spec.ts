import { test, expect } from '@playwright/test';
import { cleanupAllAgents } from './helpers/cleanup';
import { waitForProvidersLoaded } from './helpers/providerHelper';
import { TestContext, verifyTestIsolation } from './helpers/testIsolation';

const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5174'; // Dev E2E port (from playwright.config.ts webServer)

/**
 * E2E Tests: Agent Lifecycle (WITH ISOLATION FRAMEWORK)
 * Tests the complete lifecycle of launching and managing agents
 * Based on User Story 1: Launch Single Agent
 *
 * ENHANCED with test isolation to prevent:
 * - State leakage between tests
 * - Race conditions from overlapping execution
 * - Unreliable test results
 */
test.describe('Agent Lifecycle', () => {
  test.beforeEach(async ({ page, request, context }) => {
    console.log('\n🔧 Setting up test environment...');

    // STEP 1: Clear cookies first (before any page load)
    await context.clearCookies();
    console.log('   ✅ Cookies cleared');

    // STEP 2: Reset database for test isolation
    await request.post(`${BACKEND_URL}/api/test/reset-database`);
    console.log('   ✅ Database reset');

    // STEP 3: Navigate to page
    await page.goto(FRONTEND_URL);

    // STEP 4: Clear all browser storage IMMEDIATELY after page load
    // This ensures Redux starts fresh without any persisted state
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Clear IndexedDB if used
      if (window.indexedDB && window.indexedDB.databases) {
        window.indexedDB.databases().then((dbs) => {
          dbs.forEach((db) => {
            if (db.name) window.indexedDB.deleteDatabase(db.name);
          });
        });
      }
    });

    // STEP 5: Hard reload to reinitialize Redux with clean state
    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log('   ✅ Page loaded with clean storage');

    // STEP 4: Wait for app to load
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 10000 });
    console.log('   ✅ App loaded');

    // STEP 5: Wait for initial agents fetch (ensures Redux synced with clean database)
    await page.waitForResponse((resp) => resp.url().endsWith('/api/agents'), { timeout: 5000 });
    // Give extra time for Redux to process the empty response
    await page.waitForTimeout(500);
    console.log('   ✅ Initial agents fetch complete');

    // STEP 6: Verify test isolation (database only - Redux state will sync after page load)
    // NOTE: We skip Redux validation here because the store is a singleton that persists
    // across page reloads within the same worker. The database is the source of truth.
    const agentsResponse = await request.get(`${BACKEND_URL}/api/agents`);
    const agents = await agentsResponse.json();
    if (agents.length > 0) {
      throw new Error(`Test isolation violation: ${agents.length} agents exist in database`);
    }
    console.log('   ✅ Test isolation verified (database clean)\n');
  });

  test.afterEach(async ({ request }) => {
    console.log('\n🧹 Cleaning up after test...');

    try {
      await cleanupAllAgents(request, {
        maxRetries: 3,
        retryDelay: 1000,
        throwOnFailure: false, // Don't fail on cleanup issues (agents in "terminated" state can't be deleted)
      });
      console.log('   ✅ Cleanup completed\n');
    } catch (error) {
      // Log but don't throw - terminated agents won't affect next test
      console.warn('   ⚠️ Cleanup had issues (non-fatal):', error);
    }
  });
  test('User can launch a single agent', async ({ page, request }) => {
    const context = new TestContext('Launch single agent');

    // Page already loaded in beforeEach, no need to navigate again
    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Fill in the launch form
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Write a hello world function');

    // Launch the agent and wait for POST request to complete
    const [launchResponse] = await Promise.all([
      // Wait for the launch POST request
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST'
      ),
      // Click the button
      page.click('button:has-text("Launch Agent")'),
    ]);

    // Verify launch was successful
    expect(launchResponse.status()).toBe(201);

    // Extract agent ID from response
    const launchData = await launchResponse.json();
    const agentId = launchData.id;
    context.registerAgent(agentId);
    console.log('🚀 Agent launched and registered:', agentId);

    // Prompt should be cleared
    await expect(page.locator('textarea#agent-prompt')).toHaveValue('');

    // Agent should appear in the list (with agent ID verification)
    const agentCard = page.locator(`[data-agent-id="${agentId}"]`);
    await expect(agentCard).toBeVisible({ timeout: 10000 });

    // Should show agent type
    await expect(page.locator('text=/claude-code/i').first()).toBeVisible();

    console.log('✅ Test PASSED: Agent launched and visible in UI');
    context.complete();
  });

  test('User can view connection status', async ({ page }) => {
    const context = new TestContext('View connection status');

    // Page already loaded in beforeEach
    // Should show connection status
    await expect(
      page.locator('text=/Connected|Disconnected/i')
    ).toBeVisible({ timeout: 5000 });

    console.log('✅ Test PASSED: Connection status visible');
    context.complete();
  });

  test('User sees validation error for empty prompt', async ({ page }) => {
    const context = new TestContext('Validation error for empty prompt');

    // Page already loaded in beforeEach
    // Try to launch without prompt
    await page.click('button:has-text("Launch Agent")');

    // Should show validation error
    await expect(page.locator('text=/Prompt is required/i')).toBeVisible({ timeout: 5000 });

    console.log('✅ Test PASSED: Validation error shown for empty prompt');
    context.complete(); // No agents created
  });

  test('Empty state shows when no agents exist', async ({ page, request }) => {
    const context = new TestContext('Empty state validation');

    // Page already loaded in beforeEach, agents already fetched
    // Database was reset, so there should be NO agents

    // ✅ Wait for UI to stabilize
    await page.waitForTimeout(500);

    // Verify NO agents in database (this validates isolation worked!)
    const response = await request.get(`${BACKEND_URL}/api/agents`);
    expect(response.ok()).toBe(true);
    const agents = await response.json();
    expect(agents.length).toBe(0);
    console.log('✅ Database confirmed empty (isolation working)');

    // Verify NO agents in UI
    const agentCount = await page.locator('[data-agent-id]').count();
    expect(agentCount).toBe(0);
    console.log('✅ UI confirmed empty (no agent cards)');

    // Should show empty state message
    await expect(page.locator('text=/No active agents/i')).toBeVisible({ timeout: 5000 });
    console.log('✅ Empty state message visible');

    console.log('✅ Test PASSED: Empty state correctly shown (proves cleanup works!)');
    context.complete();
  });

  test('Agent count updates when agents exist', async ({ page, request }) => {
    const context = new TestContext('Agent count updates');

    // Page already loaded in beforeEach, agents already fetched
    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Should show agents count in title (should be 0 after cleanup)
    await expect(page.locator('h3').filter({ hasText: /Active Agents \(\d+\)/i })).toBeVisible();

    // Get current count (should be 0)
    const currentCountText = await page.locator('h3').filter({ hasText: /Active Agents/i }).textContent();
    const currentCount = parseInt(currentCountText?.match(/\((\d+)\)/)?.[1] || '0');
    expect(currentCount).toBe(0); // Verify isolation worked
    console.log('✅ Current count is 0 (clean state verified)');

    // Launch a new agent
    await page.fill('textarea#agent-prompt', 'Test agent for count');

    const [launchResponse] = await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST'),
      page.click('button:has-text("Launch Agent")'),
    ]);

    // Extract and register agent ID
    const launchData = await launchResponse.json();
    const agentId = launchData.id;
    context.registerAgent(agentId);
    console.log('🚀 Agent launched and registered:', agentId);

    // Wait for the count to increment to 1
    await expect(async () => {
      const newCountText = await page.locator('h3').filter({ hasText: /Active Agents/i }).textContent();
      const newCount = parseInt(newCountText?.match(/\((\d+)\)/)?.[1] || '0');
      expect(newCount).toBe(1);
    }).toPass({ timeout: 10000 });

    console.log('✅ Test PASSED: Count correctly updated from 0 to 1');
    context.complete();
  });
});
