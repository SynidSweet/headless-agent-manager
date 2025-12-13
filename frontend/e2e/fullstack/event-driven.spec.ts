import { test, expect, request } from '@playwright/test';
import { setupFullStackTest, cleanupAgents } from './setup';
import { waitForWebSocketEvent, getWebSocketStatus } from '../helpers/waitForWebSocketEvent';
import { waitForProvidersLoaded } from '../helpers/providerHelper';

/**
 * PHASE 3: Event-Driven E2E Tests
 *
 * These tests use WebSocket events instead of time-based waiting.
 * This makes tests:
 * - Deterministic (event-based, not time-based)
 * - Fast (no arbitrary 60-90s timeouts)
 * - Reliable (no race conditions)
 *
 * Key Difference from Old Tests:
 * - OLD: await page.waitForTimeout(60000) // Hope it's enough!
 * - NEW: await waitForWebSocketEvent(page, 'agent:created') // Know when it happens!
 */

let env: any;

test.beforeAll(async () => {
  env = await setupFullStackTest();

  // Skip all tests in this file if Python proxy not available
  if (!env.pythonProxyAvailable) {
    console.log('\n⚠️  Python proxy not available - skipping all tests in event-driven.spec.ts');
    console.log('   Start service: cd claude-proxy-service && uvicorn app.main:app --reload\n');
  }
});

test.beforeEach(async ({ page }) => {
  // Skip if Python proxy not available
  test.skip(!env.pythonProxyAvailable, 'Requires Python proxy service on port 8000');

  await cleanupAgents(env.backendUrl);

  // Reload page to clear state
  if (page.url() !== 'about:blank') {
    await page.reload();
    await page.waitForTimeout(1000);
  }
});

test.afterEach(async () => {
  await cleanupAgents(env.backendUrl);
});

test.describe('Event-Driven E2E Tests', () => {
  /**
   * TEST 1: Wait for agent:created Event
   *
   * Verifies that agents appear in UI via WebSocket event, not HTTP polling
   */
  test('agent appears in UI via agent:created event', async ({ page }) => {
    // Navigate to app
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

    // Check WebSocket is connected
    const wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected, 'WebSocket should be connected').toBe(true);
    console.log('✅ WebSocket connected:', wsStatus.id);

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Fill in launch form
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Event-driven test - say hello');

    console.log('🚀 Launching agent...');

    // Click launch button
    await page.click('button:has-text("Launch Agent")');

    // PHASE 3: Wait for agent:created event (not timeout!)
    const createdEvent = await waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000, // Should arrive in < 1 second
    });

    console.log('✅ Received agent:created event');
    console.log('   Agent ID:', createdEvent.agent.id);
    console.log('   Status:', createdEvent.agent.status);

    // Verify event data
    expect(createdEvent.agent.id).toBeDefined();
    expect(createdEvent.agent.type).toBe('claude-code');
    expect(createdEvent.agent.status).toBe('running');

    // Agent should now be in UI (Redux updated via event!)
    await expect(
      page.locator(`[data-agent-id="${createdEvent.agent.id}"]`)
    ).toBeVisible({ timeout: 2000 }); // Should be instant!

    console.log('✅ Agent visible in UI');
  });

  /**
   * TEST 2: Wait for agent:updated Event
   *
   * Verifies that status changes are reflected via events
   */
  test('agent status updates via agent:updated event', async ({ page }) => {
    // Navigate
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Launch agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Count to 3');
    await page.click('button:has-text("Launch Agent")');

    // Wait for agent:created
    const createdEvent = await waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    const agentId = createdEvent.agent.id;
    console.log('✅ Agent created:', agentId);

    // Agent should appear in UI
    await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible();

    // Wait for agent:updated event (when agent completes)
    console.log('⏳ Waiting for agent to complete...');

    const updatedEvent = await waitForWebSocketEvent(
      page,
      'agent:updated',
      {
        timeout: 90000, // Claude can take 5-60 seconds
        predicate: (data) => data.agentId === agentId && data.status === 'completed',
      }
    );

    console.log('✅ Agent completed via event:', updatedEvent);

    // Status should be updated in UI
    const agentElement = page.locator(`[data-agent-id="${agentId}"]`);
    await expect(agentElement).toContainText('completed', { timeout: 2000 });

    console.log('✅ Status updated in UI');
  }, 120000); // Give test enough time for Claude to respond

  /**
   * TEST 3: Multiple Events in Sequence
   *
   * Verifies that we can track complete agent lifecycle via events
   */
  test('tracks complete agent lifecycle via events', async ({ page }) => {
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Launch agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Quick response test');
    await page.click('button:has-text("Launch Agent")');

    console.log('🚀 Launching agent...');

    // Track all events
    const events: string[] = [];

    // 1. agent:created
    const created = await waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });
    events.push('agent:created');
    console.log('✅ Event 1: agent:created');

    const agentId = created.agent.id;

    // Click to select agent (triggers subscription)
    await page.click(`[data-agent-id="${agentId}"]`);

    // 2. agent:message (first message)
    const message = await waitForWebSocketEvent(
      page,
      'agent:message',
      {
        timeout: 90000,
        predicate: (data) => data.agentId === agentId,
      }
    );
    events.push('agent:message');
    console.log('✅ Event 2: agent:message');

    // 3. agent:updated (completion)
    const updated = await waitForWebSocketEvent(
      page,
      'agent:updated',
      {
        timeout: 90000,
        predicate: (data) => data.agentId === agentId && data.status === 'completed',
      }
    );
    events.push('agent:updated');
    console.log('✅ Event 3: agent:updated (completed)');

    // Verify event sequence
    expect(events).toEqual(['agent:created', 'agent:message', 'agent:updated']);

    console.log('✅ Complete lifecycle tracked via events!');
  }, 120000);

  /**
   * TEST 4: Event-Driven Database Verification
   *
   * Combines events with database checks
   */
  test('events match database state', async ({ page }) => {
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

    // ✅ Wait for providers to load before interacting with form
    await waitForProvidersLoaded(page);

    // Launch agent
    await page.selectOption('select#agent-type', 'claude-code');
    await page.fill('textarea#agent-prompt', 'Database sync test');
    await page.click('button:has-text("Launch Agent")');

    // Wait for agent:created event
    const created = await waitForWebSocketEvent(page, 'agent:created');
    const agentId = created.agent.id;

    console.log('✅ Agent created via event:', agentId);

    // Query database immediately
    const apiContext = await request.newContext();
    const response = await apiContext.get(`${env.backendUrl}/api/agents/${agentId}`);
    expect(response.ok()).toBe(true);

    const dbAgent = await response.json();

    // Database should match event data
    expect(dbAgent.id).toBe(created.agent.id);
    expect(dbAgent.type).toBe(created.agent.type);
    expect(dbAgent.status).toBe(created.agent.status);

    console.log('✅ Event data matches database state');

    await apiContext.dispose();
  });
});
