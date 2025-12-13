import type { Page, APIRequestContext } from '@playwright/test';

/**
 * Test Isolation Module
 *
 * CRITICAL: Ensures tests run in complete isolation to prevent:
 * - Event cross-contamination (receiving events from wrong agents)
 * - State leakage between tests
 * - Race conditions from overlapping test execution
 *
 * ARCHITECTURE:
 * 1. Pre-Test Verification: Ensure clean state before test starts
 * 2. Test Context Tracking: Track what each test creates
 * 3. Event Filtering: Only receive events from current test's agents
 * 4. Fail-Fast Detection: Immediately fail if isolation violated
 * 5. Post-Test Cleanup: Verify cleanup completed successfully
 */

const BACKEND_URL = 'http://localhost:3001';

/**
 * Test Context - Tracks resources created by current test
 */
export class TestContext {
  public readonly testId: string;
  public readonly testName: string;
  private agentsCreated: Set<string> = new Set();
  private startTime: number;

  constructor(testName: string) {
    this.testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.testName = testName;
    this.startTime = Date.now();
    console.log(`\n┌─────────────────────────────────────────────┐`);
    console.log(`│ 🧪 TEST ISOLATION: ${testName.slice(0, 30).padEnd(30)} │`);
    console.log(`│ Test ID: ${this.testId.padEnd(33)} │`);
    console.log(`└─────────────────────────────────────────────┘\n`);
  }

  /**
   * Register an agent created by this test
   */
  registerAgent(agentId: string): void {
    this.agentsCreated.add(agentId);
    console.log(`[${this.testId}] 📝 Registered agent: ${agentId}`);
  }

  /**
   * Get all agents created by this test
   */
  getAgents(): string[] {
    return Array.from(this.agentsCreated);
  }

  /**
   * Check if agent belongs to this test
   */
  ownsAgent(agentId: string): boolean {
    return this.agentsCreated.has(agentId);
  }

  /**
   * Verify all agents cleaned up
   */
  async verifyAllAgentsCleanedUp(request: APIRequestContext): Promise<boolean> {
    const response = await request.get(`${BACKEND_URL}/api/agents`);
    if (!response.ok()) {
      console.warn(`[${this.testId}] ⚠️ Failed to verify cleanup: ${response.status()}`);
      return false;
    }

    const agents = await response.json();
    const ourAgents = agents.filter((a: any) => this.agentsCreated.has(a.id));

    if (ourAgents.length > 0) {
      console.error(`[${this.testId}] ❌ Cleanup incomplete: ${ourAgents.length} agents remain`);
      console.error(`   Remaining agents: ${ourAgents.map((a: any) => a.id).join(', ')}`);
      return false;
    }

    console.log(`[${this.testId}] ✅ Cleanup verified: All ${this.agentsCreated.size} agents deleted`);
    return true;
  }

  /**
   * Log test completion with duration
   */
  complete(): void {
    const duration = Date.now() - this.startTime;
    console.log(`\n┌─────────────────────────────────────────────┐`);
    console.log(`│ ✅ TEST COMPLETE: ${this.testName.slice(0, 26).padEnd(26)} │`);
    console.log(`│ Duration: ${duration.toString().padEnd(34)}ms │`);
    console.log(`│ Agents created: ${this.agentsCreated.size.toString().padEnd(28)} │`);
    console.log(`└─────────────────────────────────────────────┘\n`);
  }
}

/**
 * Isolation Violation Error
 */
export class IsolationViolationError extends Error {
  constructor(message: string, details?: any) {
    super(message);
    this.name = 'IsolationViolationError';
    if (details) {
      console.error('❌ ISOLATION VIOLATION DETAILS:', details);
    }
  }
}

/**
 * Pre-Test Verification
 *
 * CRITICAL: Must be called before EVERY test
 * Ensures clean state to prevent cross-test contamination
 *
 * @throws IsolationViolationError if isolation violated
 */
export async function verifyTestIsolation(
  request: APIRequestContext,
  page: Page
): Promise<void> {
  console.log('🔍 Verifying test isolation...');

  // 1. Verify no agents exist
  const agentsResponse = await request.get(`${BACKEND_URL}/api/agents`);
  if (!agentsResponse.ok()) {
    throw new IsolationViolationError(
      'Failed to verify agent state',
      { status: agentsResponse.status() }
    );
  }

  const agents = await agentsResponse.json();
  if (agents.length > 0) {
    throw new IsolationViolationError(
      `Test isolation violation: ${agents.length} agents exist from previous test`,
      {
        agentIds: agents.map((a: any) => a.id),
        agentStatuses: agents.map((a: any) => ({ id: a.id, status: a.status })),
      }
    );
  }

  // 2. Verify WebSocket connection count
  const wsStatus = await page.evaluate(() => {
    const socket = (window as any).socket;
    return socket ? { connected: socket.connected, id: socket.id } : null;
  });

  if (!wsStatus) {
    console.warn('⚠️ WebSocket not initialized (expected during app load)');
  } else if (!wsStatus.connected) {
    console.warn('⚠️ WebSocket not connected (expected during app load)');
  }

  // 3. Verify Redux state is clean (no agents)
  const reduxState = await page.evaluate(() => {
    const store = (window as any).store;
    if (!store) return null;
    const state = store.getState();
    return {
      agentCount: state.agents?.allIds?.length || 0,
      selectedAgentId: state.agents?.selectedAgentId,
    };
  });

  if (reduxState && reduxState.agentCount > 0) {
    throw new IsolationViolationError(
      `Redux state not clean: ${reduxState.agentCount} agents in state`,
      reduxState
    );
  }

  console.log('✅ Test isolation verified:');
  console.log('   - No agents in database');
  console.log('   - Redux state clean');
  console.log('   - WebSocket:', wsStatus?.connected ? 'connected' : 'not yet connected');
}

/**
 * Ensure Clean State
 *
 * More lenient than verifyTestIsolation - tries to clean up state
 * rather than failing immediately. Useful in afterEach hooks.
 */
export async function ensureCleanState(
  request: APIRequestContext,
  page: Page
): Promise<void> {
  console.log('🧹 Ensuring clean state...');

  // 1. Clean up any remaining agents
  try {
    const response = await request.get(`${BACKEND_URL}/api/agents`);
    if (response.ok()) {
      const agents = await response.json();
      if (agents.length > 0) {
        console.warn(`⚠️ Found ${agents.length} agents, cleaning up...`);
        for (const agent of agents) {
          await request.delete(`${BACKEND_URL}/api/agents/${agent.id}?force=true`);
        }
        // Wait for cleanup to propagate
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.warn('Failed to clean up agents:', error);
  }

  // 2. Verify cleanup succeeded
  const verifyResponse = await request.get(`${BACKEND_URL}/api/agents`);
  if (verifyResponse.ok()) {
    const remainingAgents = await verifyResponse.json();
    if (remainingAgents.length > 0) {
      console.error(`❌ Cleanup failed: ${remainingAgents.length} agents remain`);
      throw new Error('Failed to ensure clean state');
    }
  }

  console.log('✅ Clean state ensured');
}

/**
 * Wait for Test Isolation
 *
 * Adds a delay between tests to ensure previous test has fully cleaned up.
 * This is a safety mechanism for sequential test execution.
 *
 * @param delayMs - Delay in milliseconds (default: 1500ms)
 */
export async function waitForTestIsolation(delayMs: number = 1500): Promise<void> {
  console.log(`⏳ Waiting ${delayMs}ms for test isolation...`);
  await new Promise(resolve => setTimeout(resolve, delayMs));
  console.log('✅ Isolation delay complete');
}

/**
 * Create Event Filter
 *
 * Returns a predicate function that filters events to only those
 * from agents owned by the current test context.
 *
 * Use this with waitForWebSocketEvent to prevent receiving events
 * from other tests' agents.
 *
 * @param context - Test context tracking agent ownership
 * @returns Predicate function for event filtering
 *
 * @example
 * ```typescript
 * const context = new TestContext('My Test');
 * context.registerAgent(agentId);
 *
 * const filter = createEventFilter(context);
 * const event = await waitForWebSocketEvent(page, 'agent:message', {
 *   predicate: filter
 * });
 * ```
 */
export function createEventFilter(context: TestContext) {
  return (data: any): boolean => {
    // Extract agent ID from event data (handles different event structures)
    const agentId = data.agentId || data.agent?.id || data.id;

    if (!agentId) {
      console.warn(`[${context.testId}] ⚠️ Event has no agent ID:`, data);
      return false; // Reject events without agent ID
    }

    // Check if this agent belongs to current test
    const isOurs = context.ownsAgent(agentId);

    if (!isOurs) {
      console.warn(
        `[${context.testId}] 🚫 Filtered out event from agent: ${agentId} (not ours)`
      );
      return false;
    }

    // Event is from our agent
    return true;
  };
}

/**
 * Log Isolation Status
 *
 * Diagnostic helper to log current isolation state
 */
export async function logIsolationStatus(
  request: APIRequestContext,
  page: Page,
  context?: TestContext
): Promise<void> {
  console.log('\n📊 ISOLATION STATUS:');

  // Database state
  const agentsResponse = await request.get(`${BACKEND_URL}/api/agents`);
  const agents = agentsResponse.ok() ? await agentsResponse.json() : [];
  console.log(`   Agents in DB: ${agents.length}`);
  if (agents.length > 0) {
    agents.forEach((a: any) => {
      const owned = context ? context.ownsAgent(a.id) : '?';
      console.log(`      - ${a.id} [${a.status}] ${owned ? '(OURS)' : '(OTHER)'}`);
    });
  }

  // WebSocket state
  const wsState = await page.evaluate(() => {
    const socket = (window as any).socket;
    return socket ? {
      connected: socket.connected,
      id: socket.id,
      rooms: (socket as any).rooms || [],
    } : null;
  });
  console.log(`   WebSocket: ${wsState?.connected ? 'connected' : 'disconnected'}`);
  if (wsState?.id) {
    console.log(`   Socket ID: ${wsState.id}`);
  }

  // Redux state
  const reduxState = await page.evaluate(() => {
    const store = (window as any).store;
    if (!store) return null;
    const state = store.getState();
    return {
      agentIds: state.agents?.allIds || [],
      selectedId: state.agents?.selectedAgentId,
    };
  });
  console.log(`   Redux agents: ${reduxState?.agentIds.length || 0}`);
  if (reduxState?.agentIds.length > 0) {
    reduxState.agentIds.forEach((id: string) => {
      const owned = context ? context.ownsAgent(id) : '?';
      console.log(`      - ${id} ${owned ? '(OURS)' : '(OTHER)'}`);
    });
  }

  console.log('');
}
