/**
 * Test ID Generator
 *
 * Provides guaranteed-unique IDs for tests to prevent pollution
 * Uses crypto.randomUUID() for collision-free ID generation
 */

import { randomUUID } from 'crypto';

/**
 * Generate a unique fake agent ID for testing FK violations
 * Guaranteed to never collide with other tests
 */
export function generateFakeAgentId(): string {
  return `fake-agent-${randomUUID()}`;
}

/**
 * Generate a unique message ID for testing
 */
export function generateMessageId(): string {
  return `test-msg-${randomUUID()}`;
}

/**
 * Generate a unique test agent ID
 */
export function generateTestAgentId(): string {
  return randomUUID();
}
