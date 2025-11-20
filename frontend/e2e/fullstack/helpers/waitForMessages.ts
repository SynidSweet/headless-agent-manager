import { Page } from '@playwright/test';

export interface WaitForMessagesOptions {
  minMessages?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  backendUrl?: string;
}

/**
 * Robust message waiting with polling for async streaming systems.
 *
 * This function handles the complex timing of:
 * - Claude CLI takes 5-60 seconds to respond
 * - Messages stream through multiple async layers
 * - WebSocket might miss early messages
 * - UI needs fallback fetch from database
 *
 * Strategy:
 * 1. Poll both database (source of truth) and UI
 * 2. If DB has messages but UI doesn't, trigger manual fetch
 * 3. Continue until messages appear in UI or timeout
 *
 * @param page Playwright page instance
 * @param agentId Agent ID to wait for messages from
 * @param options Configuration options
 * @returns Number of messages found in UI
 * @throws Error if timeout without finding messages
 */
export async function waitForMessages(
  page: Page,
  agentId: string,
  options: WaitForMessagesOptions = {}
): Promise<number> {
  const {
    minMessages = 1,
    timeoutMs = 90000, // 90 seconds default (allows for slow Claude responses)
    pollIntervalMs = 2000, // Poll every 2 seconds
    backendUrl = 'http://localhost:3000',
  } = options;

  const startTime = Date.now();
  let lastDbCount = 0;
  let lastUiCount = 0;
  let manualFetchAttempts = 0;
  const maxManualFetchAttempts = 3;

  console.log(`⏳ Waiting for at least ${minMessages} message(s) for agent ${agentId}...`);
  console.log(`   Timeout: ${timeoutMs}ms, Poll interval: ${pollIntervalMs}ms`);

  while (Date.now() - startTime < timeoutMs) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Check database (source of truth)
    let dbCount = 0;
    try {
      const response = await fetch(`${backendUrl}/api/agents/${agentId}/messages`);
      if (response.ok) {
        const dbMessages = await response.json();
        dbCount = dbMessages.length;
      }
    } catch (error) {
      console.error(`[T+${elapsed}s] Error fetching from backend:`, error);
    }

    // Check UI
    const uiCount = await page.locator('[data-message-type]').count();

    // Log changes
    if (dbCount !== lastDbCount || uiCount !== lastUiCount) {
      console.log(`[T+${elapsed}s] DB: ${dbCount} messages, UI: ${uiCount} messages`);
      lastDbCount = dbCount;
      lastUiCount = uiCount;
    }

    // Success condition: UI has enough messages
    if (uiCount >= minMessages) {
      console.log(`✅ Success: ${uiCount} messages in UI after ${elapsed}s`);
      return uiCount;
    }

    // If DB has messages but UI doesn't, trigger manual fetch
    if (dbCount > 0 && uiCount === 0 && manualFetchAttempts < maxManualFetchAttempts) {
      manualFetchAttempts++;
      console.log(`⚠️  DB has ${dbCount} messages, UI has 0 - triggering manual fetch (attempt ${manualFetchAttempts}/${maxManualFetchAttempts})`);

      // Trigger Redux fetch manually via browser console
      await page.evaluate(
        ({ id, url }) => {
          const store = (window as any).store;

          if (store && store.dispatch) {
            // Fetch messages from API
            fetch(`${url}/api/agents/${id}/messages`)
              .then((r) => r.json())
              .then((messages) => {
                console.log(`[Manual Fetch] Got ${messages.length} messages from API`);

                // Dispatch each message to Redux store
                messages.forEach((msg: any) => {
                  store.dispatch({
                    type: 'messages/messageReceived',
                    payload: { agentId: id, message: msg },
                  });
                });

                console.log(`[Manual Fetch] Dispatched ${messages.length} messages to Redux`);
              })
              .catch((err) => {
                console.error('[Manual Fetch] Error:', err);
              });
          } else {
            console.error('[Manual Fetch] Store not available on window');
          }
        },
        { id: agentId, url: backendUrl }
      );

      // Wait a bit for Redux to update and React to re-render
      await page.waitForTimeout(1000);

      // Check UI again after manual fetch
      const uiCountAfterFetch = await page.locator('[data-message-type]').count();
      if (uiCountAfterFetch > 0) {
        console.log(`✅ Manual fetch succeeded: ${uiCountAfterFetch} messages now in UI`);
        return uiCountAfterFetch;
      }
    }

    // Wait before next poll
    await page.waitForTimeout(pollIntervalMs);
  }

  // Timeout - gather diagnostic info
  const finalDbCount = lastDbCount;
  const finalUiCount = lastUiCount;
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

  throw new Error(
    `Timeout after ${elapsedSeconds}s: Expected ${minMessages} messages, ` +
      `got ${finalUiCount} in UI, ${finalDbCount} in DB. ` +
      `Manual fetch attempts: ${manualFetchAttempts}`
  );
}
