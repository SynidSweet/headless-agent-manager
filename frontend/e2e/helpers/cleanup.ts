import type { APIRequestContext } from '@playwright/test';

/**
 * E2E Test Cleanup Helpers
 * Provides cleanup utilities to ensure test isolation
 */

// Backend API URL (different from Playwright baseURL which is frontend)
const BACKEND_URL = 'http://localhost:3001';

/**
 * Clean up all agents created during tests
 * Ensures each test starts with a clean slate
 *
 * IMPROVED: Now uses database reset endpoint + verification
 *
 * Benefits:
 * - Much faster (single API call vs N deletes)
 * - Works with terminated agents (force delete)
 * - Provides detailed error messages
 * - Verifies cleanup succeeded
 */
export async function cleanupAllAgents(
  request: APIRequestContext,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    throwOnFailure?: boolean;
  } = {}
): Promise<void> {
  const { maxRetries = 3, retryDelay = 1000, throwOnFailure = true } = options;

  try {
    // STEP 1: Use database reset endpoint (fastest method)
    console.log('🧹 Resetting database...');
    const resetResponse = await request.post(`${BACKEND_URL}/api/test/reset-database`);

    if (!resetResponse.ok()) {
      throw new Error(`Database reset failed: HTTP ${resetResponse.status()}`);
    }

    const resetResult = await resetResponse.json();
    console.log(`   Deleted ${resetResult.deletedCount} agent(s) via database reset`);

    // STEP 2: Wait for cleanup to propagate
    // This gives time for:
    // 1. Database writes to complete
    // 2. WebSocket cleanup events to emit
    // 3. Any async cleanup to finish
    console.log(`   ⏳ Waiting ${retryDelay}ms for cleanup to propagate...`);
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    // STEP 3: Verify cleanup succeeded (with retries)
    let attempt = 0;
    let lastVerification: any = null;

    while (attempt < maxRetries) {
      const verifyResponse = await request.get(`${BACKEND_URL}/api/test/verify-clean-state`);

      if (!verifyResponse.ok()) {
        console.warn(`⚠️  Verification request failed: HTTP ${verifyResponse.status()}`);
        attempt++;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
        continue;
      }

      lastVerification = await verifyResponse.json();

      if (lastVerification.isClean) {
        console.log(`✅ Cleanup verified: Database is clean`);
        return;
      }

      attempt++;
      if (attempt < maxRetries) {
        console.warn(
          `⚠️  Cleanup incomplete (attempt ${attempt}/${maxRetries}):`,
          lastVerification.issues
        );
        console.warn(`   Retrying cleanup...`);

        // Retry the reset
        await request.post(`${BACKEND_URL}/api/test/reset-database`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // Verification failed after retries
    if (lastVerification && !lastVerification.isClean) {
      const errorMsg = `Cleanup verification failed after ${maxRetries} attempts:\n${lastVerification.issues.join('\n')}`;
      console.error('❌', errorMsg);
      console.error(`   Agent count: ${lastVerification.agentCount}`);
      console.error(`   Message count: ${lastVerification.messageCount}`);

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
 * Wait for an agent to complete or fail
 * Useful for tests that launch agents and need to wait for completion
 */
export async function waitForAgentCompletion(
  request: APIRequestContext,
  agentId: string,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await request.get(`${BACKEND_URL}/api/agents/${agentId}/status`);

    if (response.ok()) {
      const { status } = await response.json();

      if (status === 'completed' || status === 'failed' || status === 'terminated') {
        return;
      }
    }

    // Wait 500ms before checking again
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Agent ${agentId} did not complete within ${timeoutMs}ms`);
}
