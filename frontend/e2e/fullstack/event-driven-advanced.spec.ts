import { test, expect } from '@playwright/test';
import {
  waitForWebSocketEvent,
  getWebSocketStatus,
} from '../helpers/waitForWebSocketEvent';
import {
  launchSyntheticAgent,
  createStreamingSchedule,
} from '../helpers/syntheticAgent';
import { selectAgentAndSubscribe } from '../helpers/subscriptionHelpers';
import { cleanupAllAgents } from '../helpers/cleanup';
import {
  TestContext,
  verifyTestIsolation,
  logIsolationStatus,
} from '../helpers/testIsolation';

const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5173';

/**
 * Event-Driven Advanced Tests (WITH ISOLATION GUARDS)
 *
 * This is an ENHANCED version with comprehensive test isolation:
 * 1. Pre-test verification (ensures clean state)
 * 2. Test context tracking (knows which agents belong to which test)
 * 3. Event filtering (only receives events from OUR agents)
 * 4. Fail-fast detection (immediately fails if isolation violated)
 * 5. Post-test cleanup verification (ensures cleanup completed)
 *
 * CRITICAL: Tests MUST NOT receive events from other tests' agents
 *
 * These tests verify advanced event-driven scenarios:
 * 4. Multi-client broadcasting (all clients see same events)
 * 5. Message streaming progression (progressive message delivery)
 * 6. Reconnection sync (state syncs after disconnect/reconnect)
 */

test.describe('Event-Driven Advanced (Isolated)', () => {
  test.beforeEach(async ({ page, request }) => {
    console.log('\n🔧 Setting up test environment...');

    // STEP 1: Reset database for test isolation
    await request.post(`${BACKEND_URL}/api/test/reset-database`);
    console.log('   ✅ Database reset');

    // STEP 2: Navigate to app
    await page.goto(FRONTEND_URL);

    // STEP 3: Wait for app to load
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });
    console.log('   ✅ App loaded');

    // STEP 4: Verify WebSocket connected
    const wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
    console.log('   ✅ WebSocket connected:', wsStatus.id);

    // STEP 5: CRITICAL - Verify test isolation
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

  test('Test 4: events broadcast to all connected clients (ISOLATED)', async ({
    browser,
    request,
  }) => {
    const context = new TestContext('Test 4: Multi-Client Broadcasting');

    console.log('🧪 Starting isolated multi-client test...\n');

    // Open TWO browser contexts (simulates 2 users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Navigate both pages
      await page1.goto(FRONTEND_URL);
      await page2.goto(FRONTEND_URL);

      // Wait for both apps to load
      await expect(page1.locator('h1')).toContainText('CodeStream', { timeout: 15000 });
      await expect(page2.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

      // Verify both WebSocket connections
      const ws1 = await getWebSocketStatus(page1);
      const ws2 = await getWebSocketStatus(page2);

      expect(ws1.connected).toBe(true);
      expect(ws2.connected).toBe(true);

      console.log('✅ Client 1 connected:', ws1.id);
      console.log('✅ Client 2 connected:', ws2.id);

      // Set up listeners FIRST (avoid race condition)
      // NOTE: We'll filter by agentId once we have it
      const created1Promise = waitForWebSocketEvent(page1, 'agent:created');
      const created2Promise = waitForWebSocketEvent(page2, 'agent:created');

      // Launch agent from backend (not from client UI)
      const agentId = await launchSyntheticAgent(
        BACKEND_URL,
        [
          { delay: 1000, type: 'message', data: { content: 'Broadcast message' } },
          { delay: 2000, type: 'complete', data: { success: true } },
        ],
        'Test 4: Multi-client broadcast (isolated)'
      );

      // Register agent with test context
      context.registerAgent(agentId);
      console.log('🚀 Agent launched and registered:', agentId);

      // BOTH clients should receive agent:created event!
      const [event1, event2] = await Promise.all([created1Promise, created2Promise]);

      // CRITICAL: Verify events are from OUR agent
      expect(event1.agent.id).toBe(agentId);
      expect(event2.agent.id).toBe(agentId);
      expect(event1.agent.id).toBe(event2.agent.id);

      console.log('✅ Both clients received agent:created event');
      console.log('   Client 1 agent ID:', event1.agent.id);
      console.log('   Client 2 agent ID:', event2.agent.id);

      // Set up message listeners FIRST with agent ID filter
      const msg1Promise = waitForWebSocketEvent(page1, 'agent:message', {
        agentId, // CRITICAL: Only accept messages from OUR agent
        timeout: 3000,
      });
      const msg2Promise = waitForWebSocketEvent(page2, 'agent:message', {
        agentId, // CRITICAL: Only accept messages from OUR agent
        timeout: 3000,
      });

      // Subscribe both clients
      await Promise.all([
        selectAgentAndSubscribe(page1, agentId),
        selectAgentAndSubscribe(page2, agentId),
      ]);

      // Wait for message event on BOTH clients
      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);

      // CRITICAL: Verify messages are from OUR agent
      expect(msg1.agentId).toBe(agentId);
      expect(msg2.agentId).toBe(agentId);
      expect(msg1.message.id).toBe(msg2.message.id);
      expect(msg1.message.content).toBe(msg2.message.content);

      console.log('✅ Both clients received agent:message event');
      console.log('   Message:', msg1.message.content);

      // Wait for completion on BOTH clients with agent ID filter
      const [complete1, complete2] = await Promise.all([
        waitForWebSocketEvent(page1, 'agent:complete', {
          agentId, // CRITICAL: Only accept completion from OUR agent
          timeout: 3000,
        }),
        waitForWebSocketEvent(page2, 'agent:complete', {
          agentId, // CRITICAL: Only accept completion from OUR agent
          timeout: 3000,
        }),
      ]);

      expect(complete1.result).toBeDefined();
      expect(complete2.result).toBeDefined();

      console.log('✅ Both clients received agent:complete event');
      console.log('✅ Test 4 PASSED: Broadcast to all clients verified!');

      // Log final state
      await logIsolationStatus(request, page1, context);

      context.complete();
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('Test 5: messages stream progressively (ISOLATED)', async ({
    page,
    request,
  }) => {
    const context = new TestContext('Test 5: Message Streaming Progression');

    console.log('🧪 Starting isolated streaming test...\n');

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Create synthetic agent with 5 messages, 500ms apart
    const schedule = createStreamingSchedule(5, 500);
    const agentId = await launchSyntheticAgent(
      BACKEND_URL,
      schedule,
      'Test 5: Streaming (isolated)'
    );

    // Register agent with test context
    context.registerAgent(agentId);
    console.log('🚀 Synthetic agent launched and registered:', agentId);

    // Wait for agent:created
    const createdEvent = await createdPromise;

    // CRITICAL: Verify event is from OUR agent
    expect(createdEvent.agent.id).toBe(agentId);

    console.log('✅ agent:created event received');
    console.log('   Expected: 5 messages, 500ms apart');

    // Select agent AND subscribe
    await selectAgentAndSubscribe(page, agentId);

    // Wait for all 5 messages progressively
    const messageTimestamps: number[] = [];
    const start = Date.now();

    for (let i = 1; i <= 5; i++) {
      const msgEvent = await waitForWebSocketEvent(page, 'agent:message', {
        agentId, // CRITICAL: Only accept messages from OUR agent
        timeout: 2000, // Each message should arrive within 2s of previous
      });

      const elapsed = Date.now() - start;
      messageTimestamps.push(elapsed);

      // CRITICAL: Verify message is from OUR agent
      expect(msgEvent.agentId).toBe(agentId);

      console.log(`✅ Message ${i}/5 received at ${elapsed}ms`);
      console.log(`   Content: ${msgEvent.message.content}`);
      console.log(`   Sequence: ${msgEvent.message.sequenceNumber}`);

      // Verify sequence number
      expect(msgEvent.message.sequenceNumber).toBeGreaterThanOrEqual(i - 1);
    }

    console.log('\n📊 Message timing analysis:');
    messageTimestamps.forEach((time, index) => {
      const expected = (index + 1) * 500;
      const diff = Math.abs(time - expected);
      console.log(`   Msg ${index + 1}: ${time}ms (expected ~${expected}ms, diff: ${diff}ms)`);
    });

    // Verify all messages visible in UI
    const messageCount = await page.locator('[data-message-id]').count();
    expect(messageCount).toBeGreaterThanOrEqual(5);

    console.log(`✅ All ${messageCount} messages visible in UI`);

    // Wait for completion with agent ID filter
    await waitForWebSocketEvent(page, 'agent:complete', {
      agentId, // CRITICAL: Only accept completion from OUR agent
      timeout: 3000,
    });

    console.log('✅ Agent completed');
    console.log('✅ Test 5 PASSED: Progressive message streaming verified!');
    console.log(`   Total test time: ${Date.now() - start}ms`);

    // Log final state
    await logIsolationStatus(request, page, context);

    context.complete();
  });

  test('Test 6: state syncs on websocket reconnection (ISOLATED)', async ({
    page,
    request,
  }) => {
    const context = new TestContext('Test 6: Reconnection Sync');

    console.log('🧪 Starting isolated reconnection test...\n');

    // Verify initial connection
    let wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
    const initialSocketId = wsStatus.id;

    console.log('✅ Initial connection:', initialSocketId);

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Launch synthetic agent with longer delays (so messages arrive after reconnect)
    const agentId = await launchSyntheticAgent(
      BACKEND_URL,
      [
        { delay: 5000, type: 'message', data: { content: 'After reconnect' } },
        { delay: 6000, type: 'complete', data: { success: true } },
      ],
      'Test 6: Reconnection (isolated)'
    );

    // Register agent with test context
    context.registerAgent(agentId);
    console.log('🚀 Agent launched and registered:', agentId);

    // Wait for agent:created
    const createdEvent = await createdPromise;

    // CRITICAL: Verify event is from OUR agent
    expect(createdEvent.agent.id).toBe(agentId);

    console.log('✅ agent:created received');

    // Agent should be visible in UI
    await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible();

    console.log('✅ Agent visible before disconnect');

    // Disconnect WebSocket
    await page.evaluate(() => {
      (window as any).socket.disconnect();
    });

    await page.waitForTimeout(500);

    // Verify disconnected
    wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(false);

    console.log('🔌 WebSocket disconnected');

    // Set up reconnection listener FIRST (race condition!)
    const reconnectPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        const socket = (window as any).socket;
        socket.once('connect', () => resolve(true));
        socket.connect();
      });
    });

    // Wait for reconnection
    await reconnectPromise;

    wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);

    console.log('🔌 WebSocket reconnected:', wsStatus.id);

    // Give Redux time to sync state (fetchAgents on reconnect)
    await page.waitForTimeout(2000);

    // Agent should still be in UI (synced from backend on reconnect)
    await expect(page.locator(`[data-agent-id="${agentId}"]`)).toBeVisible();

    console.log('✅ Agent still visible after reconnection');

    // Set up listener and subscribe to receive remaining events
    const messagePromise = waitForWebSocketEvent(page, 'agent:message', {
      agentId, // CRITICAL: Only accept messages from OUR agent
      timeout: 6000,
    });

    await selectAgentAndSubscribe(page, agentId);

    // Verify we can receive new events after reconnection
    const messageAfterReconnect = await messagePromise;

    // CRITICAL: Verify message is from OUR agent
    expect(messageAfterReconnect.agentId).toBe(agentId);
    expect(messageAfterReconnect.message.content).toBeDefined();

    console.log('✅ Received new event after reconnection:', messageAfterReconnect.message.content);

    // Wait for completion with agent ID filter
    await waitForWebSocketEvent(page, 'agent:complete', {
      agentId, // CRITICAL: Only accept completion from OUR agent
      timeout: 3000,
    });

    console.log('✅ Agent completed after reconnection');
    console.log('✅ Test 6 PASSED: State synced correctly after reconnection!');

    // Log final state
    await logIsolationStatus(request, page, context);

    context.complete();
  });
});
