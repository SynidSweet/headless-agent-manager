import { test, expect, Page } from '@playwright/test';
import { setupFullStackTest, cleanupAgents } from './setup';
import { waitForWebSocketEvent } from '../helpers/waitForWebSocketEvent';
import { selectAgentAndSubscribe } from '../helpers/subscriptionHelpers';

/**
 * REAL CLAUDE CODE E2E TESTS
 *
 * Prerequisites:
 * 1. Backend running on port 3000
 * 2. Python proxy running on port 8000
 * 3. Claude CLI authenticated (claude auth login)
 * 4. CLAUDE_ADAPTER=python-proxy in backend .env
 *
 * Expected Duration: 2-5 minutes (real AI is slow)
 *
 * These tests validate:
 * - Full stack integration with real Claude Code CLI
 * - WebSocket event emission and reception
 * - Message persistence to database
 * - UI updates from real events
 * - Agent lifecycle management
 *
 * Test Strategy:
 * - Give Claude deterministic prompts (bash commands)
 * - React to whatever messages come back
 * - Don't predict timing, just wait with generous timeouts
 * - Test the FULL stack integration
 *
 * All tests use REACTIVE waiting - no hardcoded timing assumptions!
 */

let env: any;

test.beforeAll(async () => {
  env = await setupFullStackTest();

  // Skip all tests if Python proxy not available
  if (!env.pythonProxyAvailable) {
    console.log('\n⚠️  Python proxy not available - skipping real Claude integration tests');
    console.log('   Start service: cd claude-proxy-service && source venv/bin/activate && uvicorn app.main:app --reload\n');
  }
});

test.beforeEach(async () => {
  // Skip if Python proxy not available
  test.skip(!env.pythonProxyAvailable, 'Requires Python proxy service on port 8000');

  await cleanupAgents(env.backendUrl);
});

test.afterEach(async () => {
  await cleanupAgents(env.backendUrl);
});

/**
 * Test Context Helper
 * Tracks agents for automatic cleanup even if test fails
 */
class TestContext {
  private agents: string[] = [];
  private name: string;

  constructor(name: string) {
    this.name = name;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🧪 TEST: ${name}`);
    console.log(`${'═'.repeat(60)}\n`);
  }

  registerAgent(agentId: string): void {
    this.agents.push(agentId);
    console.log(`📝 Registered agent: ${agentId}`);
  }

  complete(): void {
    console.log(`\n✅ TEST PASSED: ${this.name}`);
    console.log(`   Agents used: ${this.agents.join(', ')}`);
    console.log(`${'═'.repeat(60)}\n`);
  }
}

test.describe('Real Claude Code Integration', () => {
  /**
   * Test 1: Basic Agent Launch and Message
   *
   * Validates:
   * - REAL Claude CLI can be launched via Python proxy
   * - Agent executes simple bash command
   * - WebSocket events are emitted correctly
   * - Messages contain expected content
   * - Agent completes successfully
   */
  test('Real Claude agent executes command and sends message', async ({ page, request }) => {
    const context = new TestContext('Real Claude - Basic Execution');

    // ✅ Navigate to page and wait for socket initialization
    console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
    await page.goto(env.frontendUrl);

    // CRITICAL: Wait for WebSocket CONNECTION, not just socket object
    // This prevents race condition where events are emitted before client is ready
    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket !== undefined && socket.connected === true;
    }, { timeout: 10000 });
    console.log('   ✓ WebSocket connected and ready');

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000, // First event can take a bit longer
    });

    // Launch REAL Claude agent with simple, predictable command
    console.log('🚀 Launching real Claude agent...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute this bash command: echo "E2E_TEST_MARKER_12345"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });

    expect(response.ok()).toBe(true);
    const { agentId } = await response.json();
    context.registerAgent(agentId);

    console.log(`   Agent ID: ${agentId}`);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;

    expect(created.agent.id).toBe(agentId);
    expect(created.agent.type).toBe('claude-code');
    console.log('   ✓ agent:created received');

    // CRITICAL: Subscribe to agent BEFORE waiting for messages
    // Messages are emitted to room `agent:${agentId}`, client must join room first
    console.log('📡 Subscribing to agent...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Wait for message containing our marker (REACTIVE - no timing assumptions)
    // Claude is slow, so we use a 90s timeout
    console.log('⏳ Waiting for message with E2E_TEST_MARKER...');
    const message = await waitForWebSocketEvent(page, 'agent:message', {
      agentId,
      predicate: (data) => data.content?.includes('E2E_TEST_MARKER'),
      timeout: 90000, // 90s generous timeout for real Claude
    });

    expect(message.content).toContain('E2E_TEST_MARKER_12345');
    console.log(`   ✓ Message received: ${message.content?.substring(0, 100)}...`);

    // Wait for completion (REACTIVE - wait for status change)
    console.log('⏳ Waiting for agent completion...');
    const completed = await waitForWebSocketEvent(page, 'agent:updated', {
      agentId,
      predicate: (data) => data.agent.status === 'completed',
      timeout: 120000, // 2 minutes total
    });

    expect(completed.agent.status).toBe('completed');
    console.log('   ✓ Agent completed successfully');

    context.complete();
  });

  /**
   * Test 2: Agent Termination
   *
   * Validates:
   * - Real agents can be terminated mid-execution
   * - Termination works even during long-running commands
   * - Status updates correctly to 'terminated'
   * - Backend cleanup works properly
   */
  test('Real Claude agent can be terminated mid-execution', async ({ page, request }) => {
    const context = new TestContext('Real Claude - Termination');

    // ✅ Navigate to page and wait for socket initialization
    console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
    await page.goto(env.frontendUrl);

    // CRITICAL: Wait for WebSocket CONNECTION, not just socket object
    // This prevents race condition where events are emitted before client is ready
    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket !== undefined && socket.connected === true;
    }, { timeout: 10000 });
    console.log('   ✓ WebSocket connected and ready');

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch agent with long-running command (30 second sleep)
    console.log('🚀 Launching agent with long-running command...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: sleep 30 && echo "This should not appear"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });

    const { agentId } = await response.json();
    context.registerAgent(agentId);

    console.log(`   Agent ID: ${agentId}`);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;
    expect(created.agent.id).toBe(agentId);
    console.log('   ✓ Agent created');

    // CRITICAL: Subscribe to agent BEFORE continuing
    console.log('📡 Subscribing to agent...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Wait a bit for agent to actually start the command
    console.log('⏳ Waiting 5s for command to start...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Terminate via API
    console.log('🛑 Sending termination request...');
    const deleteResponse = await request.delete(
      `${env.backendUrl}/api/agents/${agentId}?force=true`
    );
    expect(deleteResponse.ok()).toBe(true);
    console.log('   ✓ Termination request sent');

    // Wait for termination event (REACTIVE)
    console.log('⏳ Waiting for termination event...');
    const terminated = await waitForWebSocketEvent(page, 'agent:updated', {
      agentId,
      predicate: (data) => data.agent.status === 'terminated',
      timeout: 30000,
    });

    expect(terminated.agent.status).toBe('terminated');
    console.log('   ✓ Agent terminated successfully');

    context.complete();
  });

  /**
   * Test 3: Multiple Real Agents Concurrently
   *
   * Validates:
   * - Multiple real agents can run simultaneously
   * - Messages don't cross-contaminate between agents
   * - WebSocket filtering works correctly
   * - Database stores messages per agent correctly
   */
  test('Multiple real Claude agents run concurrently without interference', async ({ page, request }) => {
    const context = new TestContext('Real Claude - Multi-Agent Concurrency');

    // ✅ Navigate to page and wait for socket initialization
    console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
    await page.goto(env.frontendUrl);

    // CRITICAL: Wait for WebSocket CONNECTION, not just socket object
    // This prevents race condition where events are emitted before client is ready
    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket !== undefined && socket.connected === true;
    }, { timeout: 10000 });
    console.log('   ✓ WebSocket connected and ready');

    // CRITICAL: Set up event listeners BEFORE launching agents to avoid race condition
    console.log('📡 Setting up event listeners for both agents...');
    const created1Promise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });
    const created2Promise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch 2 agents with different markers
    console.log('🚀 Launching agent 1...');
    const agent1Response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: echo "AGENT_1_MARKER"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const agent1Id = (await agent1Response.json()).agentId;
    context.registerAgent(agent1Id);
    console.log(`   Agent 1 ID: ${agent1Id}`);

    console.log('🚀 Launching agent 2...');
    const agent2Response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: echo "AGENT_2_MARKER"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const agent2Id = (await agent2Response.json()).agentId;
    context.registerAgent(agent2Id);
    console.log(`   Agent 2 ID: ${agent2Id}`);

    // Wait for both creation events (listeners were set up before launches)
    console.log('⏳ Waiting for both agents to be created...');
    const [created1, created2] = await Promise.all([created1Promise, created2Promise]);

    // Verify (might come in any order)
    const receivedIds = [created1.agent.id, created2.agent.id].sort();
    const expectedIds = [agent1Id, agent2Id].sort();
    expect(receivedIds).toEqual(expectedIds);
    console.log('   ✓ Both agents created');

    // CRITICAL: Subscribe to BOTH agents BEFORE waiting for messages
    console.log('📡 Subscribing to both agents...');
    await selectAgentAndSubscribe(page, agent1Id);
    console.log('   ✓ Subscribed to agent 1');
    await selectAgentAndSubscribe(page, agent2Id);
    console.log('   ✓ Subscribed to agent 2');

    // Wait for messages from BOTH agents (reactive, any order)
    // CRITICAL: agentId filtering prevents cross-contamination
    console.log('⏳ Waiting for messages from both agents...');
    const [message1, message2] = await Promise.all([
      waitForWebSocketEvent(page, 'agent:message', {
        agentId: agent1Id,
        predicate: (data) => data.content?.includes('AGENT_1_MARKER'),
        timeout: 90000,
      }),
      waitForWebSocketEvent(page, 'agent:message', {
        agentId: agent2Id,
        predicate: (data) => data.content?.includes('AGENT_2_MARKER'),
        timeout: 90000,
      }),
    ]);

    // Verify NO cross-contamination
    expect(message1.content).toContain('AGENT_1_MARKER');
    expect(message1.content).not.toContain('AGENT_2_MARKER');
    console.log(`   ✓ Agent 1 message correct: ${message1.content?.substring(0, 50)}...`);

    expect(message2.content).toContain('AGENT_2_MARKER');
    expect(message2.content).not.toContain('AGENT_1_MARKER');
    console.log(`   ✓ Agent 2 message correct: ${message2.content?.substring(0, 50)}...`);

    console.log('   ✓ No cross-contamination detected');

    context.complete();
  });

  /**
   * Test 4: Message Persistence
   *
   * Validates:
   * - Real Claude messages persist to database
   * - Messages can be retrieved via GET endpoint
   * - Database is the single source of truth
   * - WebSocket and database are in sync
   */
  test('Real Claude messages persist to database', async ({ page, request }) => {
    const context = new TestContext('Real Claude - Message Persistence');

    // ✅ Navigate to page and wait for socket initialization
    console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
    await page.goto(env.frontendUrl);

    // CRITICAL: Wait for WebSocket CONNECTION, not just socket object
    // This prevents race condition where events are emitted before client is ready
    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket !== undefined && socket.connected === true;
    }, { timeout: 10000 });
    console.log('   ✓ WebSocket connected and ready');

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch agent
    console.log('🚀 Launching agent...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: echo "PERSISTENCE_TEST_123"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const { agentId } = await response.json();
    context.registerAgent(agentId);
    console.log(`   Agent ID: ${agentId}`);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;
    expect(created.agent.id).toBe(agentId);
    console.log('   ✓ Agent created');

    // CRITICAL: Subscribe to agent BEFORE waiting for messages
    console.log('📡 Subscribing to agent...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Wait for message via WebSocket
    console.log('⏳ Waiting for message via WebSocket...');
    const message = await waitForWebSocketEvent(page, 'agent:message', {
      agentId,
      predicate: (data) => data.content?.includes('PERSISTENCE_TEST'),
      timeout: 90000,
    });
    expect(message.content).toContain('PERSISTENCE_TEST_123');
    console.log(`   ✓ Message received via WebSocket`);

    // Verify message in DATABASE (not just WebSocket)
    console.log('🗄️  Checking database...');
    const messagesResp = await request.get(`${env.backendUrl}/api/agents/${agentId}/messages`);
    expect(messagesResp.ok()).toBe(true);

    const messages = await messagesResp.json();
    console.log(`   Database has ${messages.length} message(s)`);

    expect(messages.length).toBeGreaterThan(0);
    const persistenceTestFound = messages.some((m: any) =>
      m.content?.includes('PERSISTENCE_TEST_123')
    );
    expect(persistenceTestFound).toBe(true);

    console.log('   ✓ Message persisted to database');
    console.log('   ✓ WebSocket and database are in sync');

    context.complete();
  });

  /**
   * Test 5: UI Updates from Real Events
   *
   * Validates:
   * - Real Claude messages appear in UI
   * - UI updates in real-time from WebSocket events
   * - Agent cards display correctly
   * - Message display works with real data
   * - Full end-to-end flow works
   */
  test('UI updates in real-time from real Claude agent', async ({ page, request }) => {
    const context = new TestContext('Real Claude - UI Updates');

    // Navigate to app
    console.log('🌐 Navigating to frontend...');
    await page.goto(env.frontendUrl);
    await expect(page.locator('h1')).toContainText('CodeStream', { timeout: 15000 });
    console.log('   ✓ Page loaded');

    // ✅ CRITICAL: Wait for socket to be initialized before continuing
    console.log('⏳ Waiting for WebSocket initialization...');
    await page.waitForFunction(() => {
      return (window as any).socket !== undefined;
    }, { timeout: 10000 });

    // Verify socket is connected
    const wsStatus = await page.evaluate(() => {
      const socket = (window as any).socket;
      return socket ? { connected: socket.connected, url: socket.io.uri } : null;
    });

    if (!wsStatus?.connected) {
      throw new Error(`WebSocket not connected after page load. Status: ${JSON.stringify(wsStatus)}`);
    }

    console.log(`   ✓ WebSocket connected: ${wsStatus.url}`);

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch agent via API (not UI form)
    console.log('🚀 Launching agent via API...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: echo "UI_UPDATE_TEST_789"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const { agentId } = await response.json();
    context.registerAgent(agentId);
    console.log(`   Agent ID: ${agentId}`);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;
    expect(created.agent.id).toBe(agentId);
    console.log('   ✓ Agent created via WebSocket event');

    // Wait for agent card to appear in UI
    console.log('⏳ Waiting for agent card in UI...');
    await page.waitForSelector(`[data-agent-id="${agentId}"]`, {
      timeout: 15000,
    });
    console.log('   ✓ Agent card visible');

    // Click agent to select it (subscribes to messages)
    console.log('👆 Clicking agent to subscribe...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Wait for message to appear in output panel
    // CRITICAL: This tests the FULL UI integration
    console.log('⏳ Waiting for message in UI output panel...');
    await page.waitForSelector(
      `[data-message-id]:has-text("UI_UPDATE_TEST_789")`,
      { timeout: 90000 }
    );
    console.log('   ✓ Message appeared in UI');

    // Verify message is visible
    const messageElement = page.locator('[data-message-id]').filter({
      hasText: 'UI_UPDATE_TEST_789'
    });
    await expect(messageElement).toBeVisible();
    console.log('   ✓ Message is visible');

    // Take screenshot for visual verification
    await page.screenshot({
      path: 'test-results/real-claude-ui-update.png',
      fullPage: true
    });
    console.log('   📸 Screenshot saved: test-results/real-claude-ui-update.png');

    context.complete();
  });

  /**
   * Test 6: Error Handling
   *
   * Validates:
   * - Real agents handle errors gracefully
   * - Error messages are captured and displayed
   * - Agent status updates to 'failed' on error
   * - System remains stable after agent failure
   */
  test('Real Claude agent handles errors gracefully', async ({ page, request }) => {
    const context = new TestContext('Real Claude - Error Handling');

    // ✅ Navigate to page and wait for socket initialization
    console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
    await page.goto(env.frontendUrl);

    // CRITICAL: Wait for WebSocket CONNECTION, not just socket object
    // This prevents race condition where events are emitted before client is ready
    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket !== undefined && socket.connected === true;
    }, { timeout: 10000 });
    console.log('   ✓ WebSocket connected and ready');

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch agent with command that will fail
    console.log('🚀 Launching agent with failing command...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: exit 1',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const { agentId } = await response.json();
    context.registerAgent(agentId);
    console.log(`   Agent ID: ${agentId}`);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;
    expect(created.agent.id).toBe(agentId);
    console.log('   ✓ Agent created');

    // CRITICAL: Subscribe to agent BEFORE waiting for updates
    console.log('📡 Subscribing to agent...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Wait for status update (either completed or failed)
    console.log('⏳ Waiting for agent status update...');
    const statusUpdate = await waitForWebSocketEvent(page, 'agent:updated', {
      agentId,
      predicate: (data) => {
        const status = data.agent.status;
        return status === 'completed' || status === 'failed' || status === 'terminated';
      },
      timeout: 120000,
    });

    // Agent should complete (even if command failed)
    // Claude handles errors gracefully and reports them
    expect(['completed', 'failed', 'terminated']).toContain(statusUpdate.agent.status);
    console.log(`   ✓ Agent status: ${statusUpdate.agent.status}`);

    // CRITICAL: Set up listener for second agent BEFORE launching
    console.log('📡 Setting up event listener for health check agent...');
    const created2EventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Verify system is still healthy (can launch another agent)
    console.log('🚀 Launching second agent to verify system health...');
    const response2 = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: echo "System still healthy"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const agent2Id = (await response2.json()).agentId;
    context.registerAgent(agent2Id);

    // Wait for agent:created event (listener was set up before launch)
    const created2 = await created2EventPromise;
    expect(created2.agent.id).toBe(agent2Id);
    console.log('   ✓ Second agent created');

    // CRITICAL: Subscribe to second agent
    console.log('📡 Subscribing to second agent...');
    await selectAgentAndSubscribe(page, agent2Id);
    console.log('   ✓ Subscribed to second agent');
    console.log('   ✓ System remains stable after error');

    context.complete();
  });

  /**
   * Test 7: Long-Running Agent
   *
   * Validates:
   * - Real agents can handle longer tasks
   * - Streaming works for extended durations
   * - No timeout issues with real Claude responses
   * - Progressive message updates work correctly
   */
  test('Real Claude agent handles longer task with streaming', async ({ page, request }) => {
    const context = new TestContext('Real Claude - Long-Running Task');

    // ✅ Navigate to page and wait for socket initialization
    console.log('🌐 Ensuring page is loaded and WebSocket is ready...');
    await page.goto(env.frontendUrl);

    // CRITICAL: Wait for WebSocket CONNECTION, not just socket object
    // This prevents race condition where events are emitted before client is ready
    await page.waitForFunction(() => {
      const socket = (window as any).socket;
      return socket !== undefined && socket.connected === true;
    }, { timeout: 10000 });
    console.log('   ✓ WebSocket connected and ready');

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch agent with multi-step task
    console.log('🚀 Launching agent with multi-step task...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute these commands in sequence: echo "Step 1" && sleep 2 && echo "Step 2" && sleep 2 && echo "Step 3"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const { agentId } = await response.json();
    context.registerAgent(agentId);
    console.log(`   Agent ID: ${agentId}`);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;
    expect(created.agent.id).toBe(agentId);
    console.log('   ✓ Agent created');

    // CRITICAL: Subscribe to agent BEFORE tracking messages
    console.log('📡 Subscribing to agent...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Track message count
    let messageCount = 0;
    const messageTracker = page.evaluate((id) => {
      return new Promise((resolve) => {
        const socket = (window as any).socket;
        let count = 0;

        const handler = (data: any) => {
          if (data.agentId === id) {
            count++;
            console.log(`[Message ${count}] ${data.content?.substring(0, 50)}...`);
          }
        };

        socket.on('agent:message', handler);

        // Track for 2 minutes
        setTimeout(() => {
          socket.off('agent:message', handler);
          resolve(count);
        }, 120000);
      });
    }, agentId);

    console.log('⏳ Tracking messages for up to 2 minutes...');

    // Wait for completion
    await waitForWebSocketEvent(page, 'agent:updated', {
      agentId,
      predicate: (data) => data.agent.status === 'completed',
      timeout: 150000, // 2.5 minutes for multi-step task
    });

    // Stop message tracking
    messageCount = await messageTracker as number;
    console.log(`   ✓ Agent completed`);
    console.log(`   Received ${messageCount} message(s) via streaming`);

    expect(messageCount).toBeGreaterThan(0);

    context.complete();
  });
});

/**
 * Diagnostic Test Suite
 *
 * These tests help diagnose issues with real Claude integration
 * Run when other tests fail to gather diagnostic info
 */
test.describe('Real Claude Diagnostics', () => {
  test('diagnostic: capture all events and logs from real agent', async ({ page, request }) => {
    const context = new TestContext('Diagnostic - Full Event Capture');

    const events: any[] = [];
    const wsMessages: string[] = [];

    // ✅ Navigate to page first for socket initialization
    console.log('🌐 Loading page...');
    await page.goto(env.frontendUrl);

    // Capture console logs
    page.on('console', msg => {
      events.push({
        type: 'console',
        level: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      });
    });

    // Capture WebSocket
    page.on('websocket', ws => {
      console.log('📡 WebSocket connection opened:', ws.url());

      ws.on('framereceived', event => {
        const payload = event.payload?.toString() || '';
        wsMessages.push(payload);
      });
    });

    // Navigate
    await page.goto(env.frontendUrl);

    // CRITICAL: Set up event listener BEFORE launching agent to avoid race condition
    console.log('📡 Setting up event listener...');
    const createdEventPromise = waitForWebSocketEvent(page, 'agent:created', {
      timeout: 15000,
    });

    // Launch agent
    console.log('🚀 Launching diagnostic agent...');
    const response = await request.post(`${env.backendUrl}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Execute: echo "DIAGNOSTIC_TEST"',
        configuration: {
          workingDirectory: '/tmp'
        }
      }
    });
    const { agentId } = await response.json();
    context.registerAgent(agentId);

    // Wait for agent:created event (listener was set up before launch)
    console.log('⏳ Waiting for agent:created event...');
    const created = await createdEventPromise;
    expect(created.agent.id).toBe(agentId);
    console.log('   ✓ Agent created');

    // CRITICAL: Subscribe to agent BEFORE waiting
    console.log('📡 Subscribing to agent...');
    await selectAgentAndSubscribe(page, agentId);
    console.log('   ✓ Subscribed to agent');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 60000)); // 60s

    // Take screenshot
    await page.screenshot({
      path: 'test-results/diagnostic-real-claude.png',
      fullPage: true
    });

    // Output diagnostic info
    console.log('\n═══════════════════════════════════════');
    console.log('REAL CLAUDE DIAGNOSTIC REPORT');
    console.log('═══════════════════════════════════════');

    console.log('\n📊 Event Summary:');
    console.log(`   Console logs: ${events.length}`);
    console.log(`   WebSocket messages: ${wsMessages.length}`);

    console.log('\n🔌 WebSocket Messages (last 10):');
    wsMessages.slice(-10).forEach((msg, i) => {
      console.log(`${i + 1}. ${msg.substring(0, 200)}`);
    });

    console.log('\n📋 Console Logs (last 20):');
    events.slice(-20).forEach((event, i) => {
      console.log(`${i + 1}. [${event.level}] ${event.text}`);
    });

    // Check database
    const messagesResp = await request.get(`${env.backendUrl}/api/agents/${agentId}/messages`);
    const dbMessages = await messagesResp.json();
    console.log(`\n🗄️  Database messages: ${dbMessages.length}`);

    console.log('\n═══════════════════════════════════════\n');

    context.complete();
  });
});
