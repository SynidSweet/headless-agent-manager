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

const BACKEND_URL = 'http://localhost:3000';
const FRONTEND_URL = 'http://localhost:5173';

/**
 * Event-Driven Advanced Tests
 *
 * These tests verify advanced event-driven scenarios:
 * 4. Multi-client broadcasting (all clients see same events)
 * 5. Message streaming progression (progressive message delivery)
 * 6. Reconnection sync (state syncs after disconnect/reconnect)
 *
 * All tests are event-based and use synthetic agents for determinism
 */

test.describe('Event-Driven Advanced', () => {
  test.beforeEach(async ({ request }) => {
    // Reset database for test isolation
    await request.post(`${BACKEND_URL}/api/test/reset-database`);
  });

  /**
   * Helper to wait for app to load and WebSocket to connect
   */
  async function waitForAppReady(page: any): Promise<void> {
    // Wait for app to load
    await expect(page.locator('h1')).toContainText('Headless AI Agent', { timeout: 10000 });

    // Check WebSocket connection
    const wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
  }

  test('Test 4: events broadcast to all connected clients', async ({ browser }) => {
    console.log('\n🧪 Test 4: Multi-Client Broadcasting');

    // Open TWO browser contexts (simulates 2 users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    await page1.goto(FRONTEND_URL);
    await page2.goto(FRONTEND_URL);

    // Wait for both apps to be ready
    await waitForAppReady(page1);
    await waitForAppReady(page2);

    // Verify both connected
    const ws1 = await getWebSocketStatus(page1);
    const ws2 = await getWebSocketStatus(page2);

    expect(ws1.connected).toBe(true);
    expect(ws2.connected).toBe(true);

    console.log('✅ Client 1 connected:', ws1.id);
    console.log('✅ Client 2 connected:', ws2.id);

    // Set up listeners FIRST (avoid race condition)
    const created1Promise = waitForWebSocketEvent(page1, 'agent:created');
    const created2Promise = waitForWebSocketEvent(page2, 'agent:created');

    // Launch agent from backend (not from client UI)
    const agentId = await launchSyntheticAgent(BACKEND_URL, [
      { delay: 1000, type: 'message', data: { content: 'Broadcast message' } },
      { delay: 2000, type: 'complete', data: { success: true } },
    ]);

    console.log('🚀 Agent launched:', agentId);

    // BOTH clients should receive agent:created event!
    const [event1, event2] = await Promise.all([created1Promise, created2Promise]);

    // Both should have same data
    expect(event1.agent.id).toBe(agentId);
    expect(event2.agent.id).toBe(agentId);
    expect(event1.agent.id).toBe(event2.agent.id);

    console.log('✅ Both clients received agent:created event');
    console.log('   Client 1 agent ID:', event1.agent.id);
    console.log('   Client 2 agent ID:', event2.agent.id);

    // Set up message listeners FIRST
    const msg1Promise = waitForWebSocketEvent(page1, 'agent:message', { timeout: 3000 });
    const msg2Promise = waitForWebSocketEvent(page2, 'agent:message', { timeout: 3000 });

    // Subscribe both clients
    await Promise.all([
      selectAgentAndSubscribe(page1, agentId),
      selectAgentAndSubscribe(page2, agentId),
    ]);

    // Wait for message event on BOTH clients
    const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);

    expect(msg1.message.id).toBe(msg2.message.id);
    expect(msg1.message.content).toBe(msg2.message.content);

    console.log('✅ Both clients received agent:message event');
    console.log('   Message:', msg1.message.content);

    // Wait for completion on BOTH clients
    const [complete1, complete2] = await Promise.all([
      waitForWebSocketEvent(page1, 'agent:complete', { timeout: 3000 }),
      waitForWebSocketEvent(page2, 'agent:complete', { timeout: 3000 }),
    ]);

    expect(complete1.result).toBeDefined();
    expect(complete2.result).toBeDefined();

    console.log('✅ Both clients received agent:updated event');
    console.log('✅ Test 4 PASSED: Broadcast to all clients verified!');

    await context1.close();
    await context2.close();
  });

  test('Test 5: messages stream progressively', async ({ page }) => {
    console.log('\n🧪 Test 5: Message Streaming Progression');

    await page.goto(FRONTEND_URL);
    await waitForAppReady(page);

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Create synthetic agent with 5 messages, 500ms apart
    const schedule = createStreamingSchedule(5, 500);
    await launchSyntheticAgent(BACKEND_URL, schedule, 'Test 5: Streaming');

    // Wait for agent:created
    const createdEvent = await createdPromise;
    const agentId = createdEvent.agent.id;

    console.log('🚀 Agent created:', agentId);
    console.log('   Expected: 5 messages, 500ms apart');

    // Select agent AND subscribe
    await selectAgentAndSubscribe(page, agentId);

    // Wait for all 5 messages progressively
    const messageTimestamps: number[] = [];
    const start = Date.now();

    for (let i = 1; i <= 5; i++) {
      const msgEvent = await waitForWebSocketEvent(page, 'agent:message', {
        timeout: 2000, // Each message should arrive within 1s of previous
      });

      const elapsed = Date.now() - start;
      messageTimestamps.push(elapsed);

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
    const messageCount = await page.locator('[data-message-type]').count();
    expect(messageCount).toBeGreaterThanOrEqual(5);

    console.log(`✅ All ${messageCount} messages visible in UI`);

    // Wait for completion
    await waitForWebSocketEvent(page, 'agent:complete', { timeout: 3000 });

    console.log('✅ Agent completed');
    console.log('✅ Test 5 PASSED: Progressive message streaming verified!');
    console.log(`   Total test time: ${Date.now() - start}ms`);
  });

  test('Test 6: state syncs on websocket reconnection', async ({ page }) => {
    console.log('\n🧪 Test 6: Reconnection Sync');

    await page.goto(FRONTEND_URL);
    await waitForAppReady(page);

    // Verify initial connection
    let wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
    const initialSocketId = wsStatus.id;

    console.log('✅ Initial connection:', initialSocketId);

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Launch synthetic agent with longer delays (so messages arrive after reconnect)
    await launchSyntheticAgent(BACKEND_URL, [
      { delay: 5000, type: 'message', data: { content: 'After reconnect' } },
      { delay: 6000, type: 'complete', data: { success: true } },
    ]);

    // Wait for agent:created
    const createdEvent = await createdPromise;
    const agentId = createdEvent.agent.id;

    console.log('🚀 Agent created:', agentId);

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
    const messagePromise = waitForWebSocketEvent(page, 'agent:message', { timeout: 3000 });
    await selectAgentAndSubscribe(page, agentId);

    // Verify we can receive new events
    const messageAfterReconnect = await messagePromise;

    expect(messageAfterReconnect.message.content).toBeDefined();

    console.log('✅ Received new event after reconnection:', messageAfterReconnect.message.content);

    // Wait for completion
    await waitForWebSocketEvent(page, 'agent:complete', { timeout: 3000 });

    console.log('✅ Agent completed after reconnection');
    console.log('✅ Test 6 PASSED: State synced correctly after reconnection!');
  });
});
