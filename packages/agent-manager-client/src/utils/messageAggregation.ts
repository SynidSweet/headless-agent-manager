/**
 * Message Aggregation Utilities
 * Pure functions for processing agent messages
 */

import type { AgentMessage } from '../types';

/**
 * Aggregates streaming delta tokens into complete messages
 * This provides the "typing" effect in the UI
 *
 * MULTI-PROVIDER SUPPORT:
 * Supports both Claude and Gemini CLI delta streaming formats:
 * - Claude: metadata.eventType = 'content_delta'
 * - Gemini: metadata.delta = true
 *
 * DEDUPLICATION FIX:
 * Claude CLI sends BOTH streaming tokens (content_delta) AND a complete message.
 * This function detects and skips the complete message if it duplicates the
 * aggregated tokens, preventing the message from appearing twice in the UI.
 *
 * @param messages - Raw messages from backend (includes individual tokens)
 * @returns Aggregated messages with tokens combined and duplicates removed
 *
 * @example Claude
 * ```typescript
 * const messages = [
 *   { content: 'Hello', metadata: { eventType: 'content_delta' } },
 *   { content: ' world', metadata: { eventType: 'content_delta' } },
 *   { content: 'Hello world' }, // Duplicate complete message
 * ];
 *
 * const result = aggregateStreamingTokens(messages);
 * // Returns: [{ content: 'Hello world', metadata: { aggregated: true } }]
 * ```
 *
 * @example Gemini
 * ```typescript
 * const messages = [
 *   { content: 'TypeScript', metadata: { delta: true } },
 *   { content: ' is great', metadata: { delta: true } },
 * ];
 *
 * const result = aggregateStreamingTokens(messages);
 * // Returns: [{ content: 'TypeScript is great', metadata: { aggregated: true } }]
 * ```
 */
export function aggregateStreamingTokens(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const aggregated: AgentMessage[] = [];
  let currentBuffer: string[] = [];
  let currentBufferStartMsg: AgentMessage | null = null;

  for (const msg of messages) {
    // Check if this is a streaming token (supports both Claude and Gemini formats)
    const isClaudeDelta =
      msg.type === 'assistant' &&
      msg.metadata?.eventType === 'content_delta';

    const isGeminiDelta =
      msg.type === 'assistant' &&
      msg.metadata?.delta === true;

    const isStreamingToken = isClaudeDelta || isGeminiDelta;

    if (isStreamingToken) {
      // Accumulate token into buffer
      currentBuffer.push(String(msg.content));
      if (!currentBufferStartMsg) {
        currentBufferStartMsg = msg;
      }
    } else {
      // Non-streaming message - flush accumulated tokens first
      if (currentBuffer.length > 0 && currentBufferStartMsg) {
        const aggregatedContent = currentBuffer.join('');

        aggregated.push({
          ...currentBufferStartMsg,
          content: aggregatedContent,
          metadata: {
            ...currentBufferStartMsg.metadata,
            aggregated: true,
            tokenCount: currentBuffer.length,
            streaming: false,  // Complete (followed by non-delta message)
          },
        });

        // DEDUPLICATION: Check if this non-streaming message duplicates the aggregated tokens
        // Claude sends a complete message after all tokens, we need to skip it
        const isDuplicateComplete =
          msg.type === 'assistant' &&
          !msg.metadata?.eventType &&  // No eventType = complete message, not a delta
          String(msg.content).trim() === aggregatedContent.trim();  // Same content

        if (isDuplicateComplete) {
          // Skip the duplicate complete message
          currentBuffer = [];
          currentBufferStartMsg = null;
          continue;  // Don't add this message to aggregated
        }

        currentBuffer = [];
        currentBufferStartMsg = null;
      }

      // Add the non-streaming message (if not a duplicate)
      aggregated.push(msg);
    }
  }

  // Flush remaining tokens (for in-progress streaming)
  if (currentBuffer.length > 0 && currentBufferStartMsg) {
    aggregated.push({
      ...currentBufferStartMsg,
      content: currentBuffer.join(''),
      metadata: {
        ...currentBufferStartMsg.metadata,
        aggregated: true,
        tokenCount: currentBuffer.length,
        streaming: true,  // Still streaming (no non-delta message after)
      },
    });
  }

  return aggregated;
}
