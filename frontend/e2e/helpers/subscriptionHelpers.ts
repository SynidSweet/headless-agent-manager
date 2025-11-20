import { Page } from '@playwright/test';
import { waitForWebSocketEvent } from './waitForWebSocketEvent';

/**
 * Subscription Helper Functions
 *
 * Single Responsibility Principle (SRP):
 * These helpers have ONE job - manage agent subscription flow
 *
 * Separation of Concerns:
 * - waitForWebSocketEvent: Generic event waiting
 * - subscriptionHelpers: Specific to subscription flow
 */

/**
 * Select agent in UI and wait for subscription to complete
 *
 * This helper ensures the client is subscribed to the agent's room
 * BEFORE attempting to receive room-based events (agent:message).
 *
 * Critical for avoiding race conditions:
 * - Messages are emitted to room `agent:${id}`
 * - Client must subscribe to room first
 * - Synthetic agents may emit messages quickly (T+1000ms)
 * - Subscription must complete before first message
 *
 * @param page Playwright page instance
 * @param agentId Agent ID to subscribe to
 * @param options Configuration options
 *
 * @example
 * ```typescript
 * // Select agent and wait for subscription
 * await selectAgentAndSubscribe(page, agentId);
 *
 * // Now safe to wait for messages
 * const message = await waitForWebSocketEvent(page, 'agent:message');
 * ```
 */
export async function selectAgentAndSubscribe(
  page: Page,
  agentId: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000 } = options;

  console.log(`[Subscription] Selecting agent and subscribing: ${agentId}`);

  // Set up subscription listener FIRST (avoid race condition)
  // Note: Pass agentId via closure - the predicate will be stringified
  const subscriptionPromise = page.evaluate(
    ({ agentIdToMatch, timeoutMs }) => {
      return new Promise((resolve, reject) => {
        const socket = (window as any).socket;
        if (!socket) {
          reject(new Error('Socket not available'));
          return;
        }

        const timer = setTimeout(() => {
          socket.off('subscribed', handler);
          reject(new Error(`Timeout waiting for subscribed event (${timeoutMs}ms)`));
        }, timeoutMs);

        const handler = (data: any) => {
          if (data.agentId === agentIdToMatch) {
            clearTimeout(timer);
            socket.off('subscribed', handler);
            resolve(data);
          }
        };

        socket.on('subscribed', handler);
      });
    },
    { agentIdToMatch: agentId, timeoutMs: timeout }
  );

  // Click agent in UI (triggers subscription in WebSocket middleware)
  await page.click(`[data-agent-id="${agentId}"]`);

  // Wait for subscription to complete
  await subscriptionPromise;

  console.log(`[Subscription] ✅ Subscribed to agent: ${agentId}`);
}

/**
 * Programmatically subscribe to agent without UI interaction
 *
 * Useful for tests that need subscription without clicking UI
 *
 * @param page Playwright page instance
 * @param agentId Agent ID to subscribe to
 * @param options Configuration options
 *
 * @example
 * ```typescript
 * // Subscribe programmatically
 * await subscribeToAgent(page, agentId);
 *
 * // Now can receive messages
 * const message = await waitForWebSocketEvent(page, 'agent:message');
 * ```
 */
export async function subscribeToAgent(
  page: Page,
  agentId: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const { timeout = 5000 } = options;

  console.log(`[Subscription] Programmatically subscribing to agent: ${agentId}`);

  // Set up listener FIRST (with proper parameter passing)
  const subscriptionPromise = page.evaluate(
    ({ agentIdToMatch, timeoutMs }) => {
      return new Promise((resolve, reject) => {
        const socket = (window as any).socket;
        if (!socket) {
          reject(new Error('Socket not available'));
          return;
        }

        const timer = setTimeout(() => {
          socket.off('subscribed', handler);
          reject(new Error(`Timeout waiting for subscribed event (${timeoutMs}ms)`));
        }, timeoutMs);

        const handler = (data: any) => {
          if (data.agentId === agentIdToMatch) {
            clearTimeout(timer);
            socket.off('subscribed', handler);
            resolve(data);
          }
        };

        socket.on('subscribed', handler);
      });
    },
    { agentIdToMatch: agentId, timeoutMs: timeout }
  );

  // Send subscribe message via WebSocket
  await page.evaluate((id) => {
    const socket = (window as any).socket;
    if (!socket) {
      throw new Error('Socket not available on window');
    }
    socket.emit('subscribe', { agentId: id });
  }, agentId);

  // Wait for confirmation
  await subscriptionPromise;

  console.log(`[Subscription] ✅ Subscribed to agent: ${agentId}`);
}

/**
 * Unsubscribe from agent
 *
 * @param page Playwright page instance
 * @param agentId Agent ID to unsubscribe from
 */
export async function unsubscribeFromAgent(
  page: Page,
  agentId: string
): Promise<void> {
  console.log(`[Subscription] Unsubscribing from agent: ${agentId}`);

  await page.evaluate((id) => {
    const socket = (window as any).socket;
    if (socket) {
      socket.emit('unsubscribe', { agentId: id });
    }
  }, agentId);

  console.log(`[Subscription] ✅ Unsubscribed from agent: ${agentId}`);
}
