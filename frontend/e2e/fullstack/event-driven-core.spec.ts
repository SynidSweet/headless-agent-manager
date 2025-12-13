import { test, expect } from '@playwright/test';
import {
  waitForWebSocketEvent,
  getWebSocketStatus,
} from '../helpers/waitForWebSocketEvent';
import {
  launchSyntheticAgent,
  createMessageSchedule,
} from '../helpers/syntheticAgent';
import { selectAgentAndSubscribe } from '../helpers/subscriptionHelpers';
import { cleanupAllAgents } from '../helpers/cleanup';
import {
  TestContext,
  verifyTestIsolation,
  logIsolationStatus,
} from '../helpers/testIsolation';

const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5174'; // Must match playwright.config.ts webServer port

/**
 * Event-Driven Core Tests (WITH ISOLATION GUARDS)
 *
 * These tests verify the fundamental event-driven architecture:
 * 1. Agent launches and appears via agent:created event
 * 2. Synthetic agents emit events on precise schedule
 * 3. WebSocket events match database state
 *
 * All tests are event-based (no arbitrary timeouts!)
 *
 * CRITICAL: Tests MUST NOT receive events from other tests' agents
 * - Pre-test verification ensures clean state
 * - Test context tracks which agents belong to which test
 * - Event filtering only accepts events from OUR agents
 * - Post-test cleanup verification ensures cleanup completed
 */

test.describe('Event-Driven Core', () => {
  test.beforeEach(async ({ page, request }) => {
    console.log('\n🔧 Setting up test environment...');

    // STEP 1: Reset database for test isolation
    await request.post(`${BACKEND_URL}/api/test/reset-database`);
    console.log('   ✅ Database reset');

    // STEP 2: Navigate to app
    await page.goto(FRONTEND_URL);

    // STEP 3: Wait for app to load (h1 element appears, actual text is "CodeStream")
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });
    console.log('   ✅ App loaded');

    // STEP 4: Reload page to fetch fresh data from database (clears stale Redux state)
    await page.reload();
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });
    console.log('   ✅ Page reloaded with fresh data');

    // STEP 5: Verify WebSocket connected
    const wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
    console.log('   ✅ WebSocket connected:', wsStatus.id);

    // STEP 6: CRITICAL - Verify test isolation
    await verifyTestIsolation(request, page);
    console.log('   ✅ Test isolation verified\n');
  });

  test.afterEach(async ({ page, request }) => {
    console.log('\n🧹 Cleaning up after test...');

    // CRITICAL: Ensure clean state for next test
    try {
      await cleanupAllAgents(request, {
        maxRetries: 3,
        retryDelay: 1000,
        throwOnFailure: true,
      });
      console.log('   ✅ Cleanup completed\n');
    } catch (error) {
      console.error('   ❌ Cleanup failed:', error);
      // Log diagnostic info
      await logIsolationStatus(request, page);
      throw error; // Fail the test - don't let next test run with dirty state
    }
  });

  test('Test 1: agent launches and appears via event', async ({ page, request }) => {
    // Create test context for tracking
    const context = new TestContext('Test 1: Event-Driven Agent Launch');

    console.log('\n🧪 Starting isolated test...\n');

    // Log initial state
    await logIsolationStatus(request, page, context);

    // Set up listener BEFORE launching agent (avoid race condition)
    const eventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch synthetic agent with quick schedule (5 seconds total)
    const schedule = createMessageSchedule([1000, 2000], 3000);
    const agentId = await launchSyntheticAgent(BACKEND_URL, schedule, 'Test 1: Event launch (isolated)');

    // Register agent with test context
    context.registerAgent(agentId);
    console.log('🚀 Synthetic agent launched and registered:', agentId);

    // WAIT FOR EVENT (listener was set up before launch!)
    const event = await eventPromise;

    // CRITICAL: Verify event is from OUR agent
    expect(event.agent.id).toBe(agentId);
    expect(event.agent.type).toBe('synthetic');
    expect(event.agent.status).toBe('running');
    expect(event.timestamp).toBeDefined();

    console.log('✅ agent:created event received:', event.timestamp);

    // Agent should appear in UI INSTANTLY
    await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible({
      timeout: 2000,
    });

    console.log('✅ Agent appeared in UI instantly (<2s)!');

    // Verify agent is in database
    const dbResponse = await request.get(`${BACKEND_URL}/api/agents/${agentId}`);
    expect(dbResponse.ok()).toBe(true);

    const dbAgent = await dbResponse.json();
    expect(dbAgent.id).toBe(agentId);
    expect(dbAgent.type).toBe('synthetic');

    console.log('✅ Test 1 PASSED: Agent launched via event-driven flow');

    // Log final state
    await logIsolationStatus(request, page, context);

    // Mark test complete
    context.complete();
  });

  test('Test 2: synthetic agent emits events on schedule', async ({ page, request }) => {
    // Create test context for tracking
    const context = new TestContext('Test 2: Synthetic Agent with Timing');

    console.log('\n🧪 Starting isolated test...\n');

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Launch synthetic agent with 3-second schedule
    const agentId = await launchSyntheticAgent(BACKEND_URL, [
      { delay: 1000, type: 'message', data: { content: 'Message 1' } },
      { delay: 2000, type: 'message', data: { content: 'Message 2' } },
      { delay: 3000, type: 'complete', data: { success: true } },
    ]);

    // Register agent with test context
    context.registerAgent(agentId);
    console.log('🚀 Synthetic agent launched and registered:', agentId);

    // Wait for agent:created (should be immediate)
    const createdEvent = await createdPromise;

    // CRITICAL: Verify event is from OUR agent
    expect(createdEvent.agent.id).toBe(agentId);

    console.log('✅ agent:created received');

    // CRITICAL: Set up message listeners with agent ID filter BEFORE selecting agent
    const msg1Promise = waitForWebSocketEvent(page, 'agent:message', {
      agentId, // Only accept messages from OUR agent
    });
    const msg2Promise = waitForWebSocketEvent(page, 'agent:message', {
      agentId, // Only accept messages from OUR agent
    });

    // Select agent AND wait for subscription to complete
    // This ensures the client is in the agent's room before messages arrive
    await selectAgentAndSubscribe(page, agentId);

    // Wait for first message (arrives at exactly 1s)
    const start = Date.now();
    const msg1 = await msg1Promise;
    const firstMessageTime = Date.now() - start;

    // CRITICAL: Verify message is from OUR agent
    expect(msg1.agentId).toBe(agentId);
    console.log(`✅ First message arrived at ${firstMessageTime}ms`);
    console.log('   Message content:', msg1.message.content);

    // Should arrive around 1000ms (±500ms tolerance for CI)
    expect(firstMessageTime).toBeGreaterThan(500);
    expect(firstMessageTime).toBeLessThan(2000);

    // Wait for second message (arrives at exactly 2s from start)
    const msg2 = await msg2Promise;

    // CRITICAL: Verify message is from OUR agent
    expect(msg2.agentId).toBe(agentId);
    console.log('✅ Second message received:', msg2.message.content);

    // Wait for completion (arrives at exactly 3s from start)
    const completion = await waitForWebSocketEvent(page, 'agent:complete', {
      agentId, // Only accept completion from OUR agent
      timeout: 3000,
    });

    expect(completion.result).toBeDefined();
    console.log('✅ Agent completed:', completion.result);

    console.log('✅ Test 2 PASSED: Complete lifecycle tracked with precise timing!');
    console.log(`   Total test time: ~${Date.now() - start}ms`);

    // Mark test complete
    context.complete();
  });

  test('Test 3: events match database state', async ({ page, request }) => {
    // Create test context for tracking
    const context = new TestContext('Test 3: Database State Matches Events');

    console.log('\n🧪 Starting isolated test...\n');

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Launch synthetic agent with quick schedule
    const agentId = await launchSyntheticAgent(BACKEND_URL, [
      { delay: 500, type: 'message', data: { content: 'Test message' } },
      { delay: 1000, type: 'complete', data: { success: true } },
    ]);

    // Register agent with test context
    context.registerAgent(agentId);
    console.log('🚀 Synthetic agent launched and registered:', agentId);

    // Wait for agent:created event
    const createdEvent = await createdPromise;

    // CRITICAL: Verify event is from OUR agent
    expect(createdEvent.agent.id).toBe(agentId);

    console.log('✅ agent:created event received');

    // CRITICAL: Set up event listeners with agent ID filter BEFORE subscribing
    const messagePromise = waitForWebSocketEvent(page, 'agent:message', {
      agentId, // Only accept messages from OUR agent
      timeout: 3000,
    });
    const completionPromise = waitForWebSocketEvent(page, 'agent:complete', {
      agentId, // Only accept completion from OUR agent
      timeout: 3000,
    });

    // Subscribe to agent to receive messages
    await selectAgentAndSubscribe(page, agentId);

    // Query database immediately
    const response = await request.get(`${BACKEND_URL}/api/agents/${agentId}`);
    expect(response.ok()).toBe(true);

    const dbAgent = await response.json();

    // Event should match database
    expect(createdEvent.agent.id).toBe(dbAgent.id);
    expect(createdEvent.agent.type).toBe(dbAgent.type);
    expect(createdEvent.agent.status).toBe(dbAgent.status);
    expect(createdEvent.agent.session.prompt).toBe(dbAgent.session.prompt);

    console.log('✅ Event data matches database state!');

    // Wait for message event
    const messageEvent = await messagePromise;

    // CRITICAL: Verify message is from OUR agent
    expect(messageEvent.agentId).toBe(agentId);

    console.log('✅ agent:message event received');

    // Verify message in database
    const messagesResponse = await request.get(
      `${BACKEND_URL}/api/agents/${agentId}/messages`
    );
    expect(messagesResponse.ok()).toBe(true);

    const messages = await messagesResponse.json();
    expect(messages.length).toBeGreaterThanOrEqual(1);

    // Find the message we received via event
    const dbMessage = messages.find((m: any) => m.id === messageEvent.message.id);
    expect(dbMessage).toBeDefined();
    expect(dbMessage.content).toBe(messageEvent.message.content);

    console.log('✅ Message event matches database!');

    // Wait for completion (listener was set up earlier)
    await completionPromise;

    // Verify completion in database
    const finalResponse = await request.get(`${BACKEND_URL}/api/agents/${agentId}`);
    const finalAgent = await finalResponse.json();
    expect(finalAgent.status).toBe('completed');

    console.log('✅ Completion event matches database!');
    console.log('✅ Test 3 PASSED: All events match database state');

    // Mark test complete
    context.complete();
  });
});
