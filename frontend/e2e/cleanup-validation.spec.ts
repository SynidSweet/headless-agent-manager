import { test, expect } from '@playwright/test';
import {
  cleanupRealAgents,
  verifyTestIsolation,
  waitForAgentTerminalState,
} from './helpers/cleanupRealAgents';

/**
 * Cleanup Validation Tests for REAL Claude Agents
 *
 * These tests validate that our cleanup system can handle real Claude agents
 * with their slow lifecycle (15-60 seconds to complete).
 *
 * CRITICAL REQUIREMENTS:
 * 1. Python proxy must be running (claude-proxy-service)
 * 2. Claude must be authenticated
 * 3. Backend must be running
 *
 * Run with:
 *   npm run test:e2e -- cleanup-validation.spec.ts
 */

const BACKEND_URL = 'http://localhost:3001';

test.describe('Real Agent Cleanup Validation', () => {
  test.beforeEach(async ({ request }) => {
    // Verify test isolation at START of each test
    await verifyTestIsolation(request);
  });

  test.afterEach(async ({ request }) => {
    // Clean up after each test
    await cleanupRealAgents(request, {
      verbose: true,
      throwOnFailure: false, // Don't fail test if cleanup is slow
    });
  });

  test('should cleanup a running real agent gracefully', async ({ request }) => {
    // Launch a real Claude agent with a long-running task
    const response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Starting task..." then wait 30 seconds, then print "Task complete"',
      },
    });

    expect(response.ok()).toBeTruthy();
    const { id: agentId } = await response.json();

    console.log(`✅ Agent launched: ${agentId}`);

    // Wait a moment for agent to start emitting messages
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify agent exists and is running
    const statusCheck = await request.get(`${BACKEND_URL}/api/agents/${agentId}/status`);
    expect(statusCheck.ok()).toBeTruthy();
    const { status } = await statusCheck.json();
    console.log(`   Current status: ${status}`);

    // Cleanup while agent is still running
    console.log(`🧹 Starting cleanup while agent is running...`);
    await cleanupRealAgents(request, {
      verbose: true,
      throwOnFailure: false,
      processExitDelay: 3000, // Wait 3 seconds for process to exit
      retryDelay: 2000, // 2 second retry delay
      maxRetries: 5, // Up to 5 retries
    });

    // Verify agent is gone
    const finalCheck = await request.get(`${BACKEND_URL}/api/agents`);
    const remaining = await finalCheck.json();

    expect(remaining.length).toBe(0);
    console.log(`✅ Running agent cleaned up successfully`);
  });

  test('should handle multiple running agents', async ({ request }) => {
    // Launch 2 real Claude agents
    const agent1Response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Agent 1 starting" then wait 20 seconds',
      },
    });

    const agent2Response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Agent 2 starting" then wait 20 seconds',
      },
    });

    expect(agent1Response.ok()).toBeTruthy();
    expect(agent2Response.ok()).toBeTruthy();

    const { id: agentId1 } = await agent1Response.json();
    const { id: agentId2 } = await agent2Response.json();

    console.log(`✅ Agent 1 launched: ${agentId1}`);
    console.log(`✅ Agent 2 launched: ${agentId2}`);

    // Wait for agents to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Cleanup both agents
    console.log(`🧹 Starting cleanup of 2 running agents...`);
    await cleanupRealAgents(request, {
      verbose: true,
      throwOnFailure: false,
      processExitDelay: 3000,
      retryDelay: 2000,
      maxRetries: 5,
    });

    // Verify both agents are gone
    const finalCheck = await request.get(`${BACKEND_URL}/api/agents`);
    const remaining = await finalCheck.json();

    expect(remaining.length).toBe(0);
    console.log(`✅ Both agents cleaned up successfully`);
  });

  test('should handle completed agents (fast cleanup)', async ({ request }) => {
    // Launch a real Claude agent with a quick task
    const response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Quick task" and exit immediately',
      },
    });

    expect(response.ok()).toBeTruthy();
    const { id: agentId } = await response.json();

    console.log(`✅ Agent launched: ${agentId}`);

    // Wait for agent to complete (should be quick)
    console.log(`⏳ Waiting for agent to complete...`);
    const finalStatus = await waitForAgentTerminalState(request, agentId, 30000);
    console.log(`   Final status: ${finalStatus}`);

    // Cleanup completed agent
    console.log(`🧹 Cleaning up completed agent...`);
    await cleanupRealAgents(request, {
      verbose: true,
      throwOnFailure: false,
      processExitDelay: 1000, // Completed agents need less time
    });

    // Verify agent is gone
    const finalCheck = await request.get(`${BACKEND_URL}/api/agents`);
    const remaining = await finalCheck.json();

    expect(remaining.length).toBe(0);
    console.log(`✅ Completed agent cleaned up successfully`);
  });

  test('should detect test isolation violations', async ({ request }) => {
    // This test validates that verifyTestIsolation() works correctly

    // Launch an agent
    const response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Test isolation check"',
      },
    });

    expect(response.ok()).toBeTruthy();
    const { id: agentId } = await response.json();

    console.log(`✅ Agent launched: ${agentId}`);

    // Now try to verify isolation - should FAIL
    await expect(verifyTestIsolation(request)).rejects.toThrow(/Test isolation violated/);

    console.log(`✅ Test isolation violation detected correctly`);

    // Clean up for next test
    await cleanupRealAgents(request, {
      verbose: true,
      throwOnFailure: false,
    });
  });

  test('should handle agent termination via DELETE endpoint', async ({ request }) => {
    // Launch a real Claude agent
    const response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Agent running" then wait 30 seconds',
      },
    });

    expect(response.ok()).toBeTruthy();
    const { id: agentId } = await response.json();

    console.log(`✅ Agent launched: ${agentId}`);

    // Wait for agent to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Terminate via DELETE endpoint (with force flag)
    console.log(`🔥 Terminating agent via DELETE endpoint...`);
    const deleteResponse = await request.delete(`${BACKEND_URL}/api/agents/${agentId}?force=true`);

    expect(deleteResponse.status()).toBe(204);
    console.log(`   DELETE returned 204 No Content`);

    // Wait for process to exit
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify agent is gone
    const finalCheck = await request.get(`${BACKEND_URL}/api/agents`);
    const remaining = await finalCheck.json();

    expect(remaining.length).toBe(0);
    console.log(`✅ Agent terminated successfully via DELETE`);
  });
});

test.describe('Cleanup Retry Logic Validation', () => {
  test.beforeEach(async ({ request }) => {
    await verifyTestIsolation(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupRealAgents(request, {
      verbose: false,
      throwOnFailure: false,
    });
  });

  test('should retry cleanup if agents remain after first attempt', async ({ request }) => {
    // This test validates the retry logic works correctly

    // Launch an agent
    const response = await request.post(`${BACKEND_URL}/api/agents`, {
      data: {
        type: 'claude-code',
        prompt: 'Print "Retry test"',
      },
    });

    expect(response.ok()).toBeTruthy();
    const { id: agentId } = await response.json();

    console.log(`✅ Agent launched: ${agentId}`);

    // Cleanup with verbose logging to see retries
    await cleanupRealAgents(request, {
      verbose: true,
      throwOnFailure: false,
      processExitDelay: 1000,
      retryDelay: 1000,
      maxRetries: 3,
    });

    // Should succeed eventually
    const finalCheck = await request.get(`${BACKEND_URL}/api/agents`);
    const remaining = await finalCheck.json();

    expect(remaining.length).toBe(0);
    console.log(`✅ Retry logic worked - agent cleaned up`);
  });
});
