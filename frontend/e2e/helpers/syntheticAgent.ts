import { Page } from '@playwright/test';

/**
 * Synthetic Event Definition
 * Matches backend SyntheticEvent interface
 */
export interface SyntheticEvent {
  delay: number; // Milliseconds from start
  type: 'message' | 'status' | 'error' | 'complete';
  data: any;
}

/**
 * Launch a synthetic agent with controllable timing
 *
 * PHASE 4: Testing Infrastructure
 *
 * Synthetic agents emit scripted events on a precise schedule, enabling:
 * - Deterministic timing (know exactly when events arrive)
 * - Fast tests (complete in seconds, not minutes)
 * - Edge case testing (gaps, delays, errors)
 * - Long-running scenario simulation
 *
 * @param backendUrl Backend API URL
 * @param schedule Array of events with delays
 * @param prompt Optional prompt text
 * @returns Agent ID
 *
 * @example
 * ```typescript
 * const agentId = await launchSyntheticAgent('http://localhost:3000', [
 *   { delay: 1000, type: 'message', data: { content: 'First' } },
 *   { delay: 2000, type: 'message', data: { content: 'Second' } },
 *   { delay: 3000, type: 'complete', data: { success: true } }
 * ]);
 *
 * // Events arrive at exactly 1s, 2s, 3s!
 * ```
 */
export async function launchSyntheticAgent(
  backendUrl: string,
  schedule: SyntheticEvent[],
  prompt = 'Synthetic test agent'
): Promise<string> {
  const response = await fetch(`${backendUrl}/api/test/agents/synthetic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      schedule,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to launch synthetic agent: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.agentId;
}

/**
 * Create a quick message schedule
 *
 * Helper for common test pattern: a few messages then completion
 *
 * @param messageDelays Array of delays in milliseconds for each message
 * @param completionDelay Delay for completion event
 * @returns Schedule array
 *
 * @example
 * ```typescript
 * // 3 messages at 1s, 2s, 3s, then complete at 4s
 * const schedule = createMessageSchedule([1000, 2000, 3000], 4000);
 * ```
 */
export function createMessageSchedule(
  messageDelays: number[],
  completionDelay: number
): SyntheticEvent[] {
  const schedule: SyntheticEvent[] = messageDelays.map((delay, index) => ({
    delay,
    type: 'message' as const,
    data: {
      type: 'assistant',
      role: 'assistant',
      content: `Message ${index + 1}`,
    },
  }));

  schedule.push({
    delay: completionDelay,
    type: 'complete',
    data: {
      success: true,
      output: 'Synthetic agent completed',
    },
  });

  return schedule;
}

/**
 * Create a schedule for testing progressive streaming
 *
 * @param messageCount Number of messages to send
 * @param intervalMs Interval between messages
 * @returns Schedule array
 *
 * @example
 * ```typescript
 * // 5 messages, one every 500ms
 * const schedule = createStreamingSchedule(5, 500);
 * // Messages at: 500ms, 1000ms, 1500ms, 2000ms, 2500ms
 * // Complete at: 3000ms
 * ```
 */
export function createStreamingSchedule(
  messageCount: number,
  intervalMs: number
): SyntheticEvent[] {
  const delays = Array.from({ length: messageCount }, (_, i) => (i + 1) * intervalMs);
  const completionDelay = (messageCount + 1) * intervalMs;

  return createMessageSchedule(delays, completionDelay);
}

/**
 * Create a schedule for testing gaps in message sequence
 *
 * Useful for testing gap detection and backfill logic
 *
 * @example
 * ```typescript
 * const schedule = createGapSchedule();
 * // Messages with sequence gaps to trigger backfill
 * ```
 */
export function createGapSchedule(): SyntheticEvent[] {
  return [
    {
      delay: 1000,
      type: 'message',
      data: { content: 'Message 1' },
    },
    {
      delay: 2000,
      type: 'message',
      data: { content: 'Message 2' },
    },
    // Simulate gap - message 3 missing
    {
      delay: 3000,
      type: 'message',
      data: { content: 'Message 4 (gap before this!)' },
    },
    {
      delay: 4000,
      type: 'complete',
      data: { success: true },
    },
  ];
}

/**
 * Create schedule for testing error scenarios
 *
 * @example
 * ```typescript
 * const schedule = createErrorSchedule();
 * // Agent sends messages then fails
 * ```
 */
export function createErrorSchedule(): SyntheticEvent[] {
  return [
    {
      delay: 1000,
      type: 'message',
      data: { content: 'Starting...' },
    },
    {
      delay: 2000,
      type: 'error',
      data: { message: 'Synthetic error for testing' },
    },
    {
      delay: 3000,
      type: 'complete',
      data: { success: false, error: 'Test error' },
    },
  ];
}
