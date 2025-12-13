/**
 * DIAGNOSTIC TEST: Debug Browser Event Reception
 *
 * Goal: Find why Redux middleware receives events but E2E listeners don't
 */

import { test, expect } from '@playwright/test';

test.describe('Diagnostic: Event Reception Analysis', () => {

  test('Compare middleware vs E2E listener behavior', async ({ page, request }) => {
    // Step 1: Navigate and wait for connection
    await page.goto('http://localhost:5174');

    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket && socket.connected;
    }, { timeout: 10000 });

    console.log('✅ WebSocket connected');

    // Step 2: Count existing listeners and add diagnostic listeners
    const diagnosticSetup = await page.evaluate(() => {
      const socket = (window as any).socket;

      // Count existing listeners
      const existingListeners = socket.listeners('agent:message').length;
      console.log(`[Diagnostic] Existing agent:message listeners: ${existingListeners}`);

      // Initialize event storage
      (window as any).diagnosticEvents = {
        middlewareReceived: [],
        earlyListenerReceived: [],
        lateListenerReceived: [],
      };

      // Add early diagnostic listener (simulating E2E listener)
      socket.on('agent:message', (data: any) => {
        console.log('[Early Listener] ✅ Received agent:message', {
          agentId: data.agentId,
          messageType: data.message?.type,
          timestamp: new Date().toISOString(),
        });
        (window as any).diagnosticEvents.earlyListenerReceived.push({
          agentId: data.agentId,
          type: data.message?.type,
          timestamp: new Date().toISOString(),
        });
      });

      const afterEarlyListener = socket.listeners('agent:message').length;
      console.log(`[Diagnostic] After adding early listener: ${afterEarlyListener} total listeners`);

      return {
        existingListeners,
        afterEarlyListener,
      };
    });

    console.log('[Diagnostic Setup]', diagnosticSetup);

    // Step 3: Launch agent
    console.log('🚀 Launching agent...');
    const response = await request.post('http://localhost:3001/api/agents', {
      data: {
        type: 'claude-code',
        prompt: 'Run this command: echo "DIAGNOSTIC TEST MESSAGE" && sleep 2',
      },
    });

    expect(response.ok()).toBeTruthy();
    const { agentId } = await response.json();
    console.log(`Agent launched: ${agentId}`);

    // Step 4: Add late listener (after agent launch, like waitForWebSocketEvent does)
    await page.evaluate((id) => {
      const socket = (window as any).socket;

      socket.on('agent:message', (data: any) => {
        console.log('[Late Listener] ✅ Received agent:message', {
          agentId: data.agentId,
          messageType: data.message?.type,
          timestamp: new Date().toISOString(),
        });
        (window as any).diagnosticEvents.lateListenerReceived.push({
          agentId: data.agentId,
          type: data.message?.type,
          timestamp: new Date().toISOString(),
        });
      });

      const totalListeners = socket.listeners('agent:message').length;
      console.log(`[Diagnostic] After adding late listener: ${totalListeners} total listeners`);

      // Subscribe to agent
      console.log(`[Diagnostic] Subscribing to agent: ${id}`);
      socket.emit('subscribe', { agentId: id });
    }, agentId);

    // Step 5: Wait for messages to arrive
    console.log('⏳ Waiting for messages (20 seconds)...');
    await page.waitForTimeout(20000);

    // Step 6: Check Redux state (middleware received events)
    const reduxState = await page.evaluate(() => {
      const store = (window as any).store;
      const state = store.getState();
      return {
        hasMessages: Object.keys(state.messages?.byAgentId || {}).length > 0,
        messageCount: Object.values(state.messages?.byAgentId || {}).reduce(
          (sum: number, agent: any) => sum + (agent.messages?.length || 0),
          0
        ),
        agentIds: Object.keys(state.messages?.byAgentId || {}),
      };
    });

    console.log('[Redux State]', reduxState);

    // Step 7: Retrieve diagnostic events
    const diagnosticResults = await page.evaluate(() => {
      return (window as any).diagnosticEvents;
    });

    console.log('\n📊 DIAGNOSTIC RESULTS:\n');
    console.log('Early Listener (added before launch):', {
      received: diagnosticResults.earlyListenerReceived.length,
      events: diagnosticResults.earlyListenerReceived,
    });

    console.log('Late Listener (added after launch):', {
      received: diagnosticResults.lateListenerReceived.length,
      events: diagnosticResults.lateListenerReceived,
    });

    console.log('Redux State:', reduxState);

    // Step 8: Analysis
    console.log('\n🔍 ANALYSIS:\n');

    if (reduxState.messageCount > 0 && diagnosticResults.earlyListenerReceived.length === 0) {
      console.log('❌ BUG CONFIRMED: Redux receives events, early listener does NOT');
      console.log('Root cause: Middleware listener is added BEFORE early listener');
      console.log('Hypothesis: Socket.IO event handling may have ordering issues');
    } else if (reduxState.messageCount > 0 && diagnosticResults.earlyListenerReceived.length > 0) {
      console.log('✅ Early listener WORKS - Redux and early listener both receive events');
    }

    if (diagnosticResults.lateListenerReceived.length === 0) {
      console.log('❌ Late listener did NOT receive events');
      console.log('Root cause: Listener added AFTER subscription/events already emitted');
    } else {
      console.log('✅ Late listener received events');
    }

    // Step 9: Get listener details
    const listenerDetails = await page.evaluate(() => {
      const socket = (window as any).socket;
      const listeners = socket.listeners('agent:message');
      return {
        totalCount: listeners.length,
        listenerNames: listeners.map((fn: any) => fn.name || 'anonymous'),
      };
    });

    console.log('\n📋 Listener Details:', listenerDetails);

    // Terminate agent
    await request.post(`http://localhost:3001/api/agents/${agentId}/terminate`);
  });

  test('Test listener registration timing', async ({ page, request }) => {
    console.log('\n🧪 TEST: Listener Registration Timing\n');

    await page.goto('http://localhost:5174');

    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket && socket.connected;
    }, { timeout: 10000 });

    // Add listener using page.addInitScript pattern (earliest possible)
    await page.addInitScript(() => {
      // This runs BEFORE page loads
      window.addEventListener('load', () => {
        const checkSocket = () => {
          const socket = (window as any).socket;
          if (socket) {
            console.log('[InitScript Listener] Socket found, adding listener');

            (window as any).initScriptEvents = [];

            socket.on('agent:message', (data: any) => {
              console.log('[InitScript Listener] ✅ Received agent:message', data);
              (window as any).initScriptEvents.push(data);
            });

            console.log(`[InitScript] Total listeners: ${socket.listeners('agent:message').length}`);
          } else {
            setTimeout(checkSocket, 100);
          }
        };
        checkSocket();
      });
    });

    // Reload page to activate initScript
    await page.reload();

    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket && socket.connected;
    }, { timeout: 10000 });

    // Launch agent
    const response = await request.post('http://localhost:3001/api/agents', {
      data: {
        type: 'claude-code',
        prompt: 'Run: echo "INIT SCRIPT TEST" && sleep 2',
      },
    });

    const { agentId } = await response.json();
    console.log(`Agent launched: ${agentId}`);

    // Subscribe
    await page.evaluate((id) => {
      (window as any).socket.emit('subscribe', { agentId: id });
    }, agentId);

    // Wait for messages
    await page.waitForTimeout(15000);

    // Check results
    const initScriptResults = await page.evaluate(() => {
      return {
        initScriptEvents: (window as any).initScriptEvents || [],
        reduxState: (window as any).store.getState().messages,
      };
    });

    console.log('\n📊 InitScript Test Results:');
    console.log('InitScript Listener:', {
      received: initScriptResults.initScriptEvents.length,
    });

    console.log('Redux State:', {
      agentCount: Object.keys(initScriptResults.reduxState?.byAgentId || {}).length,
    });

    // Terminate agent
    await request.post(`http://localhost:3001/api/agents/${agentId}/terminate`);
  });
});
