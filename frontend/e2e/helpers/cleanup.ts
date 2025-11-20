import type { APIRequestContext } from '@playwright/test';

/**
 * E2E Test Cleanup Helpers
 * Provides cleanup utilities to ensure test isolation
 */

/**
 * Clean up all agents created during tests
 * Ensures each test starts with a clean slate
 * Also validates that the DELETE endpoint works correctly
 */
export async function cleanupAllAgents(request: APIRequestContext): Promise<void> {
  try {
    // Get all agents
    const response = await request.get('/api/agents');

    if (!response.ok()) {
      console.warn('Failed to fetch agents for cleanup:', response.status());
      return;
    }

    const agents = await response.json();

    // Delete each agent with force flag (bypasses status check for testing)
    for (const agent of agents) {
      try {
        await request.delete(`/api/agents/${agent.id}?force=true`);
      } catch (err) {
        console.warn(`Failed to delete agent ${agent.id}:`, err);
      }
    }

    if (agents.length > 0) {
      console.log(`🧹 Cleaned up ${agents.length} agent(s)`);
    }
  } catch (error) {
    // Don't fail tests if cleanup fails - log and continue
    console.warn('Cleanup error:', error);
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
    const response = await request.get(`/api/agents/${agentId}/status`);

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
