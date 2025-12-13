import { Page } from '@playwright/test';

export interface WaitForEventOptions {
  timeout?: number;
  predicate?: (data: any) => boolean;
  /** Only match events from this specific agent ID (prevents cross-test contamination) */
  agentId?: string;
}

/**
 * Wait for a specific WebSocket event in Playwright tests
 *
 * This is the foundation of event-driven testing - instead of waiting
 * for arbitrary timeouts, we wait for specific WebSocket events.
 *
 * PHASE 3: Event-Based Testing Infrastructure
 *
 * @param page Playwright page instance
 * @param eventName WebSocket event to wait for (e.g., 'agent:created')
 * @param options Configuration options
 * @returns Event data when received
 * @throws Error if timeout without receiving event
 *
 * @example
 * ```typescript
 * // Wait for agent:created event
 * const event = await waitForWebSocketEvent(page, 'agent:created');
 * expect(event.agent.id).toBeDefined();
 *
 * // Wait for specific agent's message
 * const message = await waitForWebSocketEvent(
 *   page,
 *   'agent:message',
 *   { predicate: (data) => data.agentId === 'abc-123' }
 * );
 * ```
 */
export async function waitForWebSocketEvent(
  page: Page,
  eventName: string,
  options: WaitForEventOptions = {}
): Promise<any> {
  const { timeout = 30000, predicate, agentId } = options;

  const filterDesc = agentId ? ` for agent ${agentId}` : predicate ? ' with custom filter' : '';
  console.log(`⏳ Waiting for WebSocket event: ${eventName}${filterDesc} (timeout: ${timeout}ms)`);

  // Use page.evaluate to listen for event in browser context
  const result = await page.evaluate(
    ({ event, timeoutMs, predicateFn, filterAgentId }) => {
      return new Promise((resolve, reject) => {
        const socket = (window as any).socket;

        if (!socket) {
          reject(new Error('Socket not available on window - ensure store is initialized'));
          return;
        }

        // Set timeout
        const timer = setTimeout(() => {
          socket.off(event, handler);
          reject(new Error(`Timeout waiting for WebSocket event: ${event} (${timeoutMs}ms)`));
        }, timeoutMs);

        // Create event handler
        const handler = (data: any) => {
          console.log(`[waitForWebSocketEvent] 🎯 Handler called for ${event}`, {
            data: JSON.stringify(data).substring(0, 100),
            timestamp: new Date().toISOString(),
          });

          // CRITICAL: Agent ID filtering to prevent cross-test contamination
          if (filterAgentId) {
            const eventAgentId = data.agentId || data.agent?.id || data.id;
            if (eventAgentId !== filterAgentId) {
              console.log(
                `[waitForWebSocketEvent] 🚫 Filtered out ${event} from agent ${eventAgentId} (expected ${filterAgentId})`
              );
              return; // Not our agent, keep listening
            } else {
              console.log(
                `[waitForWebSocketEvent] ✅ Agent ID matched: ${eventAgentId}`
              );
            }
          }

          // If predicate provided, eval it (it's a string from evaluate)
          if (predicateFn) {
            try {
              const pred = eval(`(${predicateFn})`);
              if (!pred(data)) {
                return; // Don't match this event, keep listening
              }
            } catch (err) {
              console.error('[waitForWebSocketEvent] Predicate error:', err);
              clearTimeout(timer);
              socket.off(event, handler);
              reject(err);
              return;
            }
          }

          // Event matched!
          clearTimeout(timer);
          socket.off(event, handler);
          resolve(data);
        };

        // Listen for event
        // Note: We use .on() not .once() because Socket.IO doesn't guarantee listener execution
        // order. The middleware also listens for this event, and both listeners must execute.
        // We handle cleanup manually with socket.off() on line 96.
        socket.on(event, handler);

        console.log(`[waitForWebSocketEvent] 📡 Registered listener for: ${event}`, {
          agentIdFilter: filterAgentId,
          listenerCount: socket.listeners(event).length,
          timestamp: new Date().toISOString(),
        });
      });
    },
    {
      event: eventName,
      timeoutMs: timeout,
      predicateFn: predicate?.toString(),
      filterAgentId: agentId,
    }
  );

  console.log(`✅ WebSocket event received: ${eventName}`);
  return result;
}

/**
 * Wait for multiple WebSocket events in sequence
 *
 * Useful for testing progressive event flows
 *
 * @example
 * ```typescript
 * const events = await waitForWebSocketEvents(page, [
 *   'agent:created',
 *   'agent:message',
 *   'agent:updated',
 * ]);
 * ```
 */
export async function waitForWebSocketEvents(
  page: Page,
  eventNames: string[],
  options: WaitForEventOptions = {}
): Promise<any[]> {
  const results: any[] = [];

  for (const eventName of eventNames) {
    const result = await waitForWebSocketEvent(page, eventName, options);
    results.push(result);
  }

  return results;
}

/**
 * Wait for WebSocket event with retry logic
 *
 * Some events may be emitted multiple times (e.g., agent:updated)
 * This helper waits for the Nth occurrence
 *
 * @example
 * ```typescript
 * // Wait for 3rd agent:message event
 * const thirdMessage = await waitForNthWebSocketEvent(
 *   page,
 *   'agent:message',
 *   3
 * );
 * ```
 */
export async function waitForNthWebSocketEvent(
  page: Page,
  eventName: string,
  occurrence: number,
  options: WaitForEventOptions = {}
): Promise<any> {
  const { timeout = 30000, predicate } = options;

  console.log(`⏳ Waiting for ${occurrence}th occurrence of: ${eventName}`);

  const result = await page.evaluate(
    ({ event, timeoutMs, predicateFn, n }) => {
      return new Promise((resolve, reject) => {
        const socket = (window as any).socket;

        if (!socket) {
          reject(new Error('Socket not available on window'));
          return;
        }

        let count = 0;

        const timer = setTimeout(() => {
          socket.off(event, handler);
          reject(new Error(`Timeout: Only received ${count} of ${n} occurrences`));
        }, timeoutMs);

        const handler = (data: any) => {
          // Check predicate
          if (predicateFn) {
            try {
              const pred = eval(`(${predicateFn})`);
              if (!pred(data)) {
                return;
              }
            } catch (err) {
              clearTimeout(timer);
              socket.off(event, handler);
              reject(err);
              return;
            }
          }

          count++;
          console.log(`[waitForNthEvent] ${event} occurrence ${count}/${n}`);

          if (count >= n) {
            clearTimeout(timer);
            socket.off(event, handler);
            resolve(data);
          }
        };

        socket.on(event, handler); // Use .on() - manual cleanup on line 196
      });
    },
    {
      event: eventName,
      timeoutMs: timeout,
      predicateFn: predicate?.toString(),
      n: occurrence,
    }
  );

  console.log(`✅ Received ${occurrence}th occurrence of: ${eventName}`);
  return result;
}

/**
 * Get current WebSocket connection status
 */
export async function getWebSocketStatus(page: Page): Promise<{
  connected: boolean;
  id?: string;
}> {
  return await page.evaluate(() => {
    const socket = (window as any).socket;
    if (!socket) {
      return { connected: false };
    }

    return {
      connected: socket.connected,
      id: socket.id,
    };
  });
}
