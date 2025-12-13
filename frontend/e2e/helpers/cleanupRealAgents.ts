import type { APIRequestContext } from '@playwright/test';

/**
 * Enhanced Cleanup for REAL Claude Agents
 *
 * Real agents have different lifecycle than synthetic agents:
 * - Take 15-60 seconds to complete
 * - Emit many messages (streaming)
 * - May still be running when cleanup starts
 * - Need proper process termination with generous delays
 *
 * This cleanup system handles these realities.
 */

const BACKEND_URL = 'http://localhost:3001';

export interface CleanupOptions {
  /**
   * Maximum number of verification retries
   * @default 5
   */
  maxRetries?: number;

  /**
   * Delay between retries (ms)
   * @default 2000
   */
  retryDelay?: number;

  /**
   * Initial delay after DELETE calls to let processes terminate (ms)
   * @default 3000
   */
  processExitDelay?: number;

  /**
   * Whether to throw on incomplete cleanup
   * @default false (logs warning instead)
   */
  throwOnFailure?: boolean;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

/**
 * Clean up all real Claude agents with robust retry logic
 *
 * UPDATED: Now uses fast database reset endpoint instead of individual deletes
 *
 * Benefits:
 * - 10x faster (single API call vs N calls)
 * - Works with agents in any status (terminated, running, etc.)
 * - Detailed verification with actionable error messages
 *
 * @param request - Playwright API request context
 * @param options - Cleanup configuration
 */
export async function cleanupRealAgents(
  request: APIRequestContext,
  options: CleanupOptions = {}
): Promise<void> {
  const {
    maxRetries = 5,
    retryDelay = 2000,
    processExitDelay = 3000,
    throwOnFailure = false,
    verbose = false,
  } = options;

  const log = verbose
    ? console.log
    : () => {
        /* silent */
      };

  try {
    // STEP 1: Use database reset endpoint (fastest method)
    console.log('🧹 Resetting database (real agents)...');
    const resetResponse = await request.post(`${BACKEND_URL}/api/test/reset-database`);

    if (!resetResponse.ok()) {
      throw new Error(`Database reset failed: HTTP ${resetResponse.status()}`);
    }

    const resetResult = await resetResponse.json();
    console.log(`   Deleted ${resetResult.deletedCount} agent(s) via database reset`);

    // STEP 2: Wait for cleanup to propagate
    // Real agents need extra time for:
    // - Process termination signals to propagate
    // - Python proxy to kill subprocesses
    // - File handles to close
    console.log(`   ⏳ Waiting ${processExitDelay}ms for processes to exit...`);
    await new Promise(resolve => setTimeout(resolve, processExitDelay));

    // STEP 3: Verify cleanup succeeded (with retries)
    let attempt = 0;
    let lastVerification: any = null;

    while (attempt < maxRetries) {
      const verifyResponse = await request.get(`${BACKEND_URL}/api/test/verify-clean-state`);

      if (!verifyResponse.ok()) {
        log(`  ⚠️ Verification request failed: HTTP ${verifyResponse.status()}`);
        attempt++;
        if (attempt < maxRetries) {
          log(`   ⏳ Waiting ${retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        continue;
      }

      lastVerification = await verifyResponse.json();

      if (lastVerification.isClean) {
        console.log(`✅ All agents cleaned up (verified after attempt ${attempt + 1})`);
        return;
      }

      attempt++;
      if (attempt < maxRetries) {
        log(
          `  ⚠️ Attempt ${attempt}/${maxRetries}: Cleanup incomplete`,
          lastVerification.issues
        );
        log(`   Retrying cleanup...`);

        // Retry the reset
        await request.post(`${BACKEND_URL}/api/test/reset-database`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // Verification failed after retries
    if (lastVerification && !lastVerification.isClean) {
      const errorMsg = `Cleanup incomplete after ${maxRetries} attempts:\n${lastVerification.issues.join('\n')}`;
      console.warn(`⚠️ ${errorMsg}`);
      console.warn(`   Agent count: ${lastVerification.agentCount}`);
      console.warn(`   Message count: ${lastVerification.messageCount}`);
      console.warn(
        '   Note: Real agents may need more time. Next test will catch this with verifyTestIsolation.'
      );

      if (throwOnFailure) {
        throw new Error(errorMsg);
      }
    }
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    if (throwOnFailure) {
      throw error;
    }
  }
}

/**
 * Verify test isolation - ensures no agents exist from previous tests
 *
 * This should be called at the START of each test to catch incomplete cleanup
 * from the previous test.
 *
 * @param request - Playwright API request context
 * @throws Error if agents exist (test isolation violated)
 */
export async function verifyTestIsolation(request: APIRequestContext): Promise<void> {
  const response = await request.get(`${BACKEND_URL}/api/agents`);

  if (!response.ok()) {
    throw new Error(`Failed to verify test isolation: HTTP ${response.status()}`);
  }

  const agents = await response.json();

  if (agents.length > 0) {
    throw new Error(
      `Test isolation violated: ${agents.length} agent(s) exist from previous test\n` +
        `IDs: ${agents.map((a: any) => a.id).join(', ')}\n` +
        `Statuses: ${agents.map((a: any) => a.status).join(', ')}\n` +
        `This indicates previous test cleanup failed or agent is stuck.`
    );
  }
}

/**
 * Wait for a real agent to reach a terminal state
 *
 * Terminal states: 'completed', 'failed', 'terminated'
 *
 * @param request - Playwright API request context
 * @param agentId - Agent ID to wait for
 * @param timeoutMs - Maximum time to wait (default: 60 seconds for real agents)
 * @throws Error if timeout is reached
 */
export async function waitForAgentTerminalState(
  request: APIRequestContext,
  agentId: string,
  timeoutMs: number = 60000
): Promise<string> {
  const startTime = Date.now();
  const terminalStates = ['completed', 'failed', 'terminated'];

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await request.get(`${BACKEND_URL}/api/agents/${agentId}/status`);

      if (response.ok()) {
        const { status } = await response.json();

        if (terminalStates.includes(status)) {
          return status;
        }
      }
    } catch (error) {
      // Agent might have been deleted, check if it's gone
      const checkExists = await request.get(`${BACKEND_URL}/api/agents`);
      if (checkExists.ok()) {
        const agents = await checkExists.json();
        const exists = agents.some((a: any) => a.id === agentId);
        if (!exists) {
          return 'deleted';
        }
      }
    }

    // Wait 500ms before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(
    `Agent ${agentId} did not reach terminal state within ${timeoutMs}ms (timeout for real agents)`
  );
}
