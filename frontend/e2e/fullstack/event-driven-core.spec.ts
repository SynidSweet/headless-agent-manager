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

const BACKEND_URL = 'http://localhost:3000';
const FRONTEND_URL = 'http://localhost:5173';

/**
 * Event-Driven Core Tests
 *
 * These tests verify the fundamental event-driven architecture:
 * 1. Agent launches and appears via agent:created event
 * 2. Synthetic agents emit events on precise schedule
 * 3. WebSocket events match database state
 *
 * All tests are event-based (no arbitrary timeouts!)
 */

test.describe('Event-Driven Core', () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset database for test isolation
    await request.post(`${BACKEND_URL}/api/test/reset-database`);

    // Navigate to app
    await page.goto(FRONTEND_URL);

    // Wait for app to load (h1 element appears)
    await expect(page.locator('h1')).toContainText('Headless AI Agent', { timeout: 10000 });

    // Now check WebSocket connection (should be connected after app loads)
    const wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
    console.log('✅ WebSocket connected:', wsStatus.id);
  });

  test('Test 1: agent launches and appears via event', async ({ page, request }) => {
    console.log('\n🧪 Test 1: Event-Driven Agent Launch');

    // Set up listener BEFORE launching agent (avoid race condition)
    const eventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch synthetic agent with quick schedule (5 seconds total)
    const schedule = createMessageSchedule([1000, 2000], 3000);
    const agentId = await launchSyntheticAgent(BACKEND_URL, schedule, 'Test 1: Event launch');

    console.log('🚀 Synthetic agent launched:', agentId);

    // WAIT FOR EVENT (listener was set up before launch!)
    const event = await eventPromise;

    // Verify event data
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
  });

  test('Test 2: synthetic agent emits events on schedule', async ({ page }) => {
    console.log('\n🧪 Test 2: Synthetic Agent with Controllable Timing');

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Launch synthetic agent with 3-second schedule
    await launchSyntheticAgent(BACKEND_URL, [
      { delay: 1000, type: 'message', data: { content: 'Message 1' } },
      { delay: 2000, type: 'message', data: { content: 'Message 2' } },
      { delay: 3000, type: 'complete', data: { success: true } },
    ]);

    console.log('🚀 Synthetic agent launched');

    // Wait for agent:created (should be immediate)
    const createdEvent = await createdPromise;
    const agentId = createdEvent.agent.id;

    console.log('✅ agent:created received');
    console.log('   Agent ID from event:', agentId);

    // Set up message listeners BEFORE selecting agent (avoid race condition)
    const msg1Promise = waitForWebSocketEvent(page, 'agent:message');
    const msg2Promise = waitForWebSocketEvent(page, 'agent:message');

    // Select agent AND wait for subscription to complete
    // This ensures the client is in the agent's room before messages arrive
    await selectAgentAndSubscribe(page, agentId);

    // Wait for first message (arrives at exactly 1s)
    const start = Date.now();
    const msg1 = await msg1Promise;
    const firstMessageTime = Date.now() - start;

    console.log(`✅ First message arrived at ${firstMessageTime}ms`);
    console.log('   Message content:', msg1.message.content);

    // Should arrive around 1000ms (±500ms tolerance for CI)
    expect(firstMessageTime).toBeGreaterThan(500);
    expect(firstMessageTime).toBeLessThan(2000);

    // Wait for second message (arrives at exactly 2s from start)
    const msg2 = await msg2Promise;

    console.log('✅ Second message received:', msg2.message.content);

    // Wait for completion (arrives at exactly 3s from start)
    const completion = await waitForWebSocketEvent(page, 'agent:complete', {
      timeout: 3000,
    });

    expect(completion.result).toBeDefined();
    console.log('✅ Agent completed:', completion.result);

    console.log('✅ Test 2 PASSED: Complete lifecycle tracked with precise timing!');
    console.log(`   Total test time: ~${Date.now() - start}ms`);
  });

  test('Test 3: events match database state', async ({ page, request }) => {
    console.log('\n🧪 Test 3: Database State Matches Events');

    // Set up listener FIRST
    const createdPromise = waitForWebSocketEvent(page, 'agent:created');

    // Launch synthetic agent with quick schedule
    await launchSyntheticAgent(BACKEND_URL, [
      { delay: 500, type: 'message', data: { content: 'Test message' } },
      { delay: 1000, type: 'complete', data: { success: true } },
    ]);

    console.log('🚀 Synthetic agent launched');

    // Wait for agent:created event
    const createdEvent = await createdPromise;

    const agentId = createdEvent.agent.id;

    console.log('✅ agent:created event received');

    // Set up ALL event listeners BEFORE subscribing (avoid race conditions)
    const messagePromise = waitForWebSocketEvent(page, 'agent:message', { timeout: 3000 });
    const completionPromise = waitForWebSocketEvent(page, 'agent:complete', { timeout: 3000 });

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
    console.log('   Event agent ID:', createdEvent.agent.id);
    console.log('   DB agent ID:', dbAgent.id);
    console.log('   Event status:', createdEvent.agent.status);
    console.log('   DB status:', dbAgent.status);

    // Wait for message event (no predicate needed - we're subscribed to this agent)
    const messageEvent = await messagePromise;

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
    console.log('   Event message ID:', messageEvent.message.id);
    console.log('   DB message ID:', dbMessage.id);

    // Wait for completion (listener was set up earlier)
    await completionPromise;

    // Verify completion in database
    const finalResponse = await request.get(`${BACKEND_URL}/api/agents/${agentId}`);
    const finalAgent = await finalResponse.json();
    expect(finalAgent.status).toBe('completed');

    console.log('✅ Completion event matches database!');
    console.log('✅ Test 3 PASSED: All events match database state');
  });
});
