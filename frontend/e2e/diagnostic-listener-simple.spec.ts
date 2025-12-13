/**
 * SIMPLIFIED DIAGNOSTIC: Browser Event Reception
 *
 * Uses SYNTHETIC agents (no external dependencies) to test listener behavior
 */

import { test, expect } from '@playwright/test';
import {
  waitForWebSocketEvent,
  getWebSocketStatus,
} from './helpers/waitForWebSocketEvent';
import {
  launchSyntheticAgent,
  createMessageSchedule,
} from './helpers/syntheticAgent';

const BACKEND_URL = 'http://localhost:3001';
const FRONTEND_URL = 'http://localhost:5174';

test.describe('Diagnostic: Listener Reception (Synthetic Agent)', () => {
  test.beforeEach(async ({ page, request }) => {
    // Reset database
    await request.post(`${BACKEND_URL}/api/test/reset-database`);

    // Navigate
    await page.goto(FRONTEND_URL);

    // Wait for app load
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });

    // Verify WebSocket connected
    const wsStatus = await getWebSocketStatus(page);
    expect(wsStatus.connected).toBe(true);
    console.log('✅ WebSocket connected:', wsStatus.id);
  });

  test('Compare Redux middleware vs E2E listener', async ({ page, request }) => {
    console.log('\n🔍 DIAGNOSTIC: Redux Middleware vs E2E Listener\n');

    // Step 1: Count existing listeners and add diagnostic listener
    const setupInfo = await page.evaluate(() => {
      const socket = (window as any).socket;

      // Count existing listeners (should be 1 for middleware)
      const before = socket.listeners('agent:message').length;

      // Add diagnostic listener (simulates E2E waitForWebSocketEvent)
      (window as any).diagnosticEvents = [];
      socket.on('agent:message', (data: any) => {
        console.log('[Diagnostic Listener] ✅ Received agent:message', {
          agentId: data.agentId,
          messageType: data.message?.type,
        });
        (window as any).diagnosticEvents.push(data);
      });

      const after = socket.listeners('agent:message').length;

      return { before, after };
    });

    console.log('Listener Count:', setupInfo);
    console.log(`  Before: ${setupInfo.before} (middleware only)`);
    console.log(`  After: ${setupInfo.after} (middleware + diagnostic)`);

    // Step 2: Launch synthetic agent with quick schedule
    console.log('\n🚀 Launching synthetic agent...');
    const schedule = createMessageSchedule([500, 1000], 1500); // 3 events over 1.5 seconds
    const agentId = await launchSyntheticAgent(BACKEND_URL, schedule, 'Diagnostic Test');

    console.log(`Agent launched: ${agentId}`);

    // Step 3: Subscribe to agent
    await page.evaluate((id) => {
      console.log(`[Test] Subscribing to agent: ${id}`);
      (window as any).socket.emit('subscribe', { agentId: id });
    }, agentId);

    // Step 4: Wait for events to arrive (2 seconds)
    console.log('\n⏳ Waiting 3 seconds for events...');
    await page.waitForTimeout(3000);

    // Step 5: Check Redux state (middleware received events?)
    const reduxState = await page.evaluate((id) => {
      const store = (window as any).store;
      const state = store.getState();
      const agentMessages = state.messages?.byAgentId?.[id];

      return {
        hasAgent: !!agentMessages,
        messageCount: agentMessages?.messages?.length || 0,
        messages: agentMessages?.messages || [],
      };
    }, agentId);

    console.log('\n📊 Redux State (Middleware):');
    console.log(`  Has agent: ${reduxState.hasAgent}`);
    console.log(`  Message count: ${reduxState.messageCount}`);
    if (reduxState.messageCount > 0) {
      console.log(`  ✅ MIDDLEWARE RECEIVED EVENTS`);
    } else {
      console.log(`  ❌ MIDDLEWARE DID NOT RECEIVE EVENTS`);
    }

    // Step 6: Check diagnostic listener (E2E received events?)
    const diagnosticEvents = await page.evaluate(() => {
      return (window as any).diagnosticEvents || [];
    });

    console.log('\n📊 Diagnostic Listener (E2E):');
    console.log(`  Event count: ${diagnosticEvents.length}`);
    if (diagnosticEvents.length > 0) {
      console.log(`  ✅ E2E LISTENER RECEIVED EVENTS`);
      console.log(`  Events:`, diagnosticEvents.map((e: any) => ({
        agentId: e.agentId,
        type: e.message?.type,
      })));
    } else {
      console.log(`  ❌ E2E LISTENER DID NOT RECEIVE EVENTS`);
    }

    // Step 7: Analysis
    console.log('\n🔍 ANALYSIS:');

    if (reduxState.messageCount > 0 && diagnosticEvents.length > 0) {
      console.log('✅ BOTH LISTENERS WORK - No issue detected');
      console.log('   Root cause: Test filtering logic or timing issues');
    } else if (reduxState.messageCount > 0 && diagnosticEvents.length === 0) {
      console.log('❌ MIDDLEWARE WORKS, E2E LISTENER DOES NOT');
      console.log('   Root cause: Context isolation or listener registration issue');
    } else if (reduxState.messageCount === 0 && diagnosticEvents.length === 0) {
      console.log('❌ NEITHER LISTENER RECEIVED EVENTS');
      console.log('   Root cause: Backend not emitting events or subscription issue');
    } else {
      console.log('⚠️  UNEXPECTED: E2E works but middleware doesn\'t');
    }

    // Cleanup
    await request.post(`${BACKEND_URL}/api/agents/${agentId}/terminate`);
  });

  test('Test waitForWebSocketEvent helper directly', async ({ page, request }) => {
    console.log('\n🔍 DIAGNOSTIC: waitForWebSocketEvent Helper\n');

    // Set up listener BEFORE launching agent
    console.log('📡 Setting up waitForWebSocketEvent listener...');
    const messagePromise = waitForWebSocketEvent(page, 'agent:message', {
      timeout: 5000,
    });

    // Launch synthetic agent
    console.log('🚀 Launching synthetic agent...');
    const schedule = [
      { delay: 500, type: 'message', data: { content: 'Test message 1' } },
    ];
    const agentId = await launchSyntheticAgent(BACKEND_URL, schedule, 'Wait Test');

    console.log(`Agent launched: ${agentId}`);

    // Subscribe
    await page.evaluate((id) => {
      (window as any).socket.emit('subscribe', { agentId: id });
    }, agentId);

    // Try to receive event
    console.log('⏳ Waiting for agent:message via waitForWebSocketEvent...');
    try {
      const event = await messagePromise;
      console.log('✅ waitForWebSocketEvent RECEIVED EVENT:', {
        agentId: event.agentId,
        messageType: event.message?.type,
      });
    } catch (error: any) {
      console.log('❌ waitForWebSocketEvent FAILED:', error.message);
    }

    // Cleanup
    await request.post(`${BACKEND_URL}/api/agents/${agentId}/terminate`);
  });

  test('Test listener with agent ID filter', async ({ page, request }) => {
    console.log('\n🔍 DIAGNOSTIC: Agent ID Filtering\n');

    // Launch synthetic agent
    const schedule = [
      { delay: 500, type: 'message', data: { content: 'Filtered message' } },
    ];
    const agentId = await launchSyntheticAgent(BACKEND_URL, schedule, 'Filter Test');
    console.log(`Agent launched: ${agentId}`);

    // Set up listener with CORRECT agent ID filter
    console.log('📡 Setting up filtered listener...');
    const messagePromise = waitForWebSocketEvent(page, 'agent:message', {
      agentId, // Filter for this specific agent
      timeout: 5000,
    });

    // Subscribe
    await page.evaluate((id) => {
      (window as any).socket.emit('subscribe', { agentId: id });
    }, agentId);

    // Wait for event
    console.log('⏳ Waiting for filtered event...');
    try {
      const event = await messagePromise;
      console.log('✅ FILTERED LISTENER RECEIVED EVENT:', {
        agentId: event.agentId,
        matches: event.agentId === agentId,
      });
    } catch (error: any) {
      console.log('❌ FILTERED LISTENER FAILED:', error.message);
    }

    // Cleanup
    await request.post(`${BACKEND_URL}/api/agents/${agentId}/terminate`);
  });
});
