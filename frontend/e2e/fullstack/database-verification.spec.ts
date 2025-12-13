import { test, expect, request } from '@playwright/test';
import { setupFullStackTest, cleanupAgents } from './setup';
import { waitForMessages } from './helpers/waitForMessages';
import { waitForProvidersLoaded } from '../helpers/providerHelper';

/**
 * PHASE 4: E2E DATABASE VERIFICATION TESTS
 *
 * These tests verify that the complete system (UI → Backend → Database)
 * works correctly end-to-end:
 * - Messages displayed in UI are actually in database
 * - No foreign key errors during real lifecycle
 * - Messages persist across page reloads
 * - CASCADE DELETE cleanup works
 *
 * Uses REAL infrastructure to catch integration bugs that mocks miss.
 */

let env: any;

test.beforeAll(async () => {
  env = await setupFullStackTest();

  // Skip all tests in this file if Python proxy not available
  if (!env.pythonProxyAvailable) {
    console.log('\n⚠️  Python proxy not available - skipping all tests in database-verification.spec.ts');
    console.log('   Start service: cd claude-proxy-service && uvicorn app.main:app --reload\n');
  }
});

test.beforeEach(async ({ page }) => {
  // Skip if Python proxy not available
  test.skip(!env.pythonProxyAvailable, 'Requires Python proxy service on port 8000');

  await cleanupAgents(env.backendUrl);

  // Reload page to clear Redux state after database reset
  if (page.url() !== 'about:blank') {
    await page.reload();
    await page.waitForTimeout(1000);
  }
});

test.afterEach(async () => {
  await cleanupAgents(env.backendUrl);
});

test.describe('E2E Database Verification', () => {
  /**
   * TEST 1: Messages in UI Actually in Database
   *
   * Critical validation that messages aren't just in memory/WebSocket,
   * but actually persisted to database
   */
  test('messages displayed in UI are actually in database', async ({ page }) => {
    // Navigate to app
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Launch agent with simple prompt
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say hello and tell me the current date');

    // Wait for the POST response to get the agent ID
    const [launchResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.click('button:has-text("Launch Agent")'),
    ]);

    const launchData = await launchResponse.json();
    const agentId = launchData.agentId;

    console.log('✅ Agent launched:', agentId);

    // Wait for agent to appear in UI (increased timeout)
    await page.waitForSelector(`[data-agent-id="${agentId}"]`, { timeout: 20000 });

    // Get agent element
    const agentElement = page.locator(`[data-agent-id="${agentId}"]`);

    console.log('✅ Agent visible in list');

    // Click to select agent
    await agentElement.click();

    console.log('⏳ Waiting for Claude CLI to respond and messages to load...');

    // Wait for messages using robust polling helper
    // This handles async timing: Claude CLI → Python proxy → Database → WebSocket/Fetch → Redux → UI
    await waitForMessages(page, agentId, {
      minMessages: 1,
      timeoutMs: 90000,
      backendUrl: env.backendUrl,
    });

    // Count messages in UI
    const uiMessageCount = await page.locator('[data-message-id]').count();
    console.log(`✅ UI shows ${uiMessageCount} messages`);

    // Query backend API directly for messages
    const apiContext = await request.newContext();
    const response = await apiContext.get(`${env.backendUrl}/api/agents/${agentId}/messages`);
    expect(response.ok()).toBe(true);

    const dbMessages = await response.json();
    console.log(`✅ Database has ${dbMessages.length} messages`);

    // CRITICAL ASSERTIONS:
    // 1. Messages exist in database
    expect(dbMessages.length).toBeGreaterThan(0);

    // 2. UI and DB counts should match (or be close - race conditions)
    expect(dbMessages.length).toBeGreaterThanOrEqual(uiMessageCount - 2);
    expect(dbMessages.length).toBeLessThanOrEqual(uiMessageCount + 2);

    // 3. All messages have valid sequence numbers (not -1)
    expect(dbMessages.every((m: any) => m.sequenceNumber > 0)).toBe(true);

    // 4. No temporary IDs (indicates DB save succeeded)
    expect(dbMessages.every((m: any) => !m.id.startsWith('temp-'))).toBe(true);

    // 5. All messages have UUIDs
    expect(dbMessages.every((m: any) => m.id.match(/^[0-9a-f-]{36}$/))).toBe(true);

    await apiContext.dispose();
  }, 60000);

  /**
   * TEST 2: No Foreign Key Errors During Real Flow
   *
   * Verifies that the bug fix works in production scenario
   */
  test('no database errors during complete agent lifecycle', async ({ page }) => {
    const errors: string[] = [];

    // Capture browser console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('FOREIGN KEY') || text.includes('constraint')) {
          errors.push(text);
        }
      }
    });

    // Launch agent
    await page.goto(env.frontendUrl);

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Count to 5');

    const [launchResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.click('button:has-text("Launch Agent")'),
    ]);

    const launchData = await launchResponse.json();
    const agentId = launchData.agentId;

    // Wait for agent to appear in UI
    await page.waitForSelector(`[data-agent-id="${agentId}"]`, { timeout: 10000 });
    await page.click(`[data-agent-id="${agentId}"]`);

    // Wait for messages using robust polling
    await waitForMessages(page, agentId, {
      minMessages: 1,
      timeoutMs: 90000,
      backendUrl: env.backendUrl,
    });

    // Wait a bit more for agent to complete
    await page.waitForTimeout(10000);

    // CRITICAL: Should have NO foreign key errors
    expect(errors).toHaveLength(0);

    console.log('✅ No foreign key errors during lifecycle');
  }, 60000);

  /**
   * TEST 3: Message Persistence Across Page Reload
   *
   * Verifies messages are truly persisted and can be retrieved
   */
  test('messages persist and reload correctly after page refresh', async ({ page }) => {
    // Launch agent
    await page.goto(env.frontendUrl);

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Say hello');

    const [launchResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.click('button:has-text("Launch Agent")'),
    ]);

    const launchData = await launchResponse.json();
    const agentId = launchData.agentId;

    console.log('✅ Agent launched:', agentId);

    // Wait for agent to appear in UI
    await page.waitForSelector(`[data-agent-id="${agentId}"]`, { timeout: 20000 });

    // Get agent element
    const agentElement = page.locator(`[data-agent-id="${agentId}"]`);

    // Select agent and wait for messages
    await agentElement.click();
    const initialMessageCount = await waitForMessages(page, agentId, {
      minMessages: 1,
      timeoutMs: 90000,
      backendUrl: env.backendUrl,
    });

    console.log(`✅ Initial UI has ${initialMessageCount} messages`);

    // Reload page (fresh state, no in-memory data)
    await page.reload();

    console.log('✅ Page reloaded');

    // Click agent to view messages again
    await page.waitForSelector('[data-agent-id]', { timeout: 15000 });
    await page.click(`[data-agent-id="${agentId}"]`);

    // Messages should reload from database
    await page.waitForSelector('[data-message-id]', { timeout: 15000 });
    const reloadedMessageCount = await page.locator('[data-message-id]').count();

    console.log(`✅ After reload UI has ${reloadedMessageCount} messages`);

    // Counts should match (messages persisted)
    expect(reloadedMessageCount).toBeGreaterThanOrEqual(initialMessageCount - 1);
    expect(reloadedMessageCount).toBeLessThanOrEqual(initialMessageCount + 1);
  }, 60000);

  /**
   * TEST 4: CASCADE DELETE Verification
   *
   * Verifies that deleting an agent properly cleans up all messages
   */
  test('deleting agent cascades to remove all messages', async ({ page }) => {
    // Launch agent
    await page.goto(env.frontendUrl);

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Test cleanup');

    const [launchResponse] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes('/api/agents') && resp.request().method() === 'POST',
        { timeout: 15000 }
      ),
      page.click('button:has-text("Launch Agent")'),
    ]);

    const launchData = await launchResponse.json();
    const agentId = launchData.agentId;

    console.log('✅ Agent ID:', agentId);

    // Wait for agent to appear in UI
    await page.waitForSelector(`[data-agent-id="${agentId}"]`, { timeout: 20000 });

    // Get agent element and click to view messages
    const agentElement = page.locator(`[data-agent-id="${agentId}"]`);
    await agentElement.click();

    // Wait for messages using robust polling
    await waitForMessages(page, agentId, {
      minMessages: 1,
      timeoutMs: 90000,
      backendUrl: env.backendUrl,
    });

    // Query backend to verify messages exist
    const apiContext = await request.newContext();
    let response = await apiContext.get(`${env.backendUrl}/api/agents/${agentId}/messages`);
    expect(response.ok()).toBe(true);

    let messages = await response.json();
    expect(messages.length).toBeGreaterThan(0);

    console.log(`✅ Agent has ${messages.length} messages in database`);

    // Delete agent via API
    const deleteResponse = await apiContext.delete(`${env.backendUrl}/api/agents/${agentId}`);
    expect(deleteResponse.ok()).toBe(true);

    console.log('✅ Agent deleted');

    // Try to get messages again (should fail - CASCADE DELETE)
    response = await apiContext.get(`${env.backendUrl}/api/agents/${agentId}/messages`);

    // Agent no longer exists, so either 404 or empty array
    if (response.ok()) {
      messages = await response.json();
      // If endpoint returns 200, should be empty array
      expect(messages).toEqual([]);
    } else {
      // Or should return 404
      expect(response.status()).toBe(404);
    }

    console.log('✅ Messages cascaded deleted');

    await apiContext.dispose();
  }, 60000);
});
