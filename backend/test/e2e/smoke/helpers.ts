/**
 * Smoke Test Helpers
 * Utilities for real Claude CLI integration testing
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * Check if Python proxy service is running and healthy
 */
export async function checkPythonProxyHealth(proxyUrl: string = 'http://localhost:8000'): Promise<boolean> {
  try {
    const response = await fetch(`${proxyUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Wait for agent messages with specific content
 * Used for verifying real Claude CLI output
 */
export interface WaitForMessagesOptions {
  timeout?: number;
  expectedContent?: string;
  minMessages?: number;
  pollInterval?: number;
}

export async function waitForAgentMessages(
  app: INestApplication,
  agentId: string,
  options: WaitForMessagesOptions = {}
): Promise<any[]> {
  const {
    timeout = 30000,
    expectedContent,
    minMessages = 1,
    pollInterval = 500,
  } = options;

  const startTime = Date.now();
  let messages: any[] = [];

  while (Date.now() - startTime < timeout) {
    try {
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}/messages`)
        .expect(200);

      messages = response.body;

      // Check if we have enough messages
      if (messages.length >= minMessages) {
        // If no specific content expected, return all messages
        if (!expectedContent) {
          return messages;
        }

        // Check if any message contains expected content
        const hasExpectedContent = messages.some((msg: any) =>
          msg.content?.includes(expectedContent)
        );

        if (hasExpectedContent) {
          return messages;
        }
      }
    } catch (error) {
      // Endpoint might not exist yet, continue polling
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timeout waiting for messages. Got ${messages.length} messages, expected ${minMessages}${
      expectedContent ? ` with content "${expectedContent}"` : ''
    }`
  );
}

/**
 * Wait for agent to reach specific status
 */
export async function waitForAgentStatus(
  app: INestApplication,
  agentId: string,
  expectedStatus: string,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}/status`)
        .expect(200);

      if (response.body.status === expectedStatus) {
        return;
      }
    } catch (error) {
      // Continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout waiting for agent status: ${expectedStatus}`);
}

/**
 * Cleanup all agents (useful for test isolation)
 */
export async function cleanupAllAgents(app: INestApplication): Promise<void> {
  try {
    const response = await request(app.getHttpServer())
      .get('/api/agents')
      .expect(200);

    const agents = response.body;

    // Terminate all agents
    await Promise.all(
      agents.map((agent: any) =>
        request(app.getHttpServer())
          .delete(`/api/agents/${agent.id}`)
          .catch(() => {
            // Ignore errors (agent might already be terminated)
          })
      )
    );

    // Wait a bit for cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    // Ignore errors in cleanup
  }
}

/**
 * Verify Claude CLI is authenticated
 * Calls Python proxy health endpoint which checks authentication
 */
export async function verifyClaudeAuthentication(proxyUrl: string = 'http://localhost:8000'): Promise<void> {
  const response = await fetch(`${proxyUrl}/health`);
  if (!response.ok) {
    throw new Error('Python proxy health check failed - Claude might not be authenticated');
  }

  const health = (await response.json()) as { claude_authenticated?: boolean };
  if (health.claude_authenticated === false) {
    throw new Error(
      'Claude CLI not authenticated. Run: claude auth login'
    );
  }
}

/**
 * Get real Python proxy URL from environment or default
 */
export function getPythonProxyUrl(): string {
  return process.env.CLAUDE_PROXY_URL || 'http://localhost:8000';
}

/**
 * Skip test if Python proxy is not available
 * Useful for running tests in CI/CD where proxy might not be set up
 */
export function skipIfProxyNotAvailable() {
  beforeAll(async () => {
    const proxyUrl = getPythonProxyUrl();
    const isHealthy = await checkPythonProxyHealth(proxyUrl);

    if (!isHealthy) {
      console.warn(
        `⚠️  Python proxy not available at ${proxyUrl}. Skipping smoke tests.`
      );
      console.warn('   To run smoke tests, start the Python proxy service:');
      console.warn('   cd claude-proxy-service && uvicorn app.main:app --reload');
    }
  });
}
