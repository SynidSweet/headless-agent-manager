/**
 * Tests for message aggregation utility
 * Tests WRITTEN FIRST following TDD (RED → GREEN → REFACTOR)
 */

import { describe, it, expect } from 'vitest';
import { aggregateStreamingTokens } from '../../src/utils/messageAggregation';
import type { AgentMessage } from '../../src/types';

describe('aggregateStreamingTokens', () => {
  describe('Edge Cases', () => {
    it('should return empty array for no messages', () => {
      const result = aggregateStreamingTokens([]);
      expect(result).toEqual([]);
    });

    it('should return same messages when no streaming tokens present', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hi there!',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
        },
      ];

      const result = aggregateStreamingTokens(messages);
      expect(result).toEqual(messages);
      expect(result).toHaveLength(2);
    });
  });

  describe('Streaming Token Aggregation', () => {
    it('should aggregate consecutive streaming tokens into single message', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' there',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: '!',
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
          metadata: { eventType: 'content_delta' },
        },
      ];

      const result = aggregateStreamingTokens(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'msg-1', // Uses first token's ID
        type: 'assistant',
        content: 'Hello there!', // Concatenated content
        metadata: {
          eventType: 'content_delta',
          aggregated: true,
          tokenCount: 3,
          streaming: true, // Still streaming (no complete message after)
        },
      });
    });

    it('should mark aggregated message as complete when followed by non-streaming message', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' world',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'user',
          content: 'Next message',
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
        },
      ];

      const result = aggregateStreamingTokens(messages);

      expect(result).toHaveLength(2);
      expect(result[0]?.metadata?.streaming).toBe(false); // Complete
      expect(result[1]?.content).toBe('Next message'); // Non-streaming message preserved
    });
  });

  describe('Duplicate Detection', () => {
    it('should skip duplicate complete message after aggregated tokens', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' world',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        // Duplicate complete message (Claude sends this after all tokens)
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello world', // Same content as aggregated tokens
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
          // No metadata.eventType = complete message
        },
      ];

      const result = aggregateStreamingTokens(messages);

      // Should only have 1 message (aggregated tokens, duplicate skipped)
      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe('Hello world');
      expect(result[0]?.metadata?.aggregated).toBe(true);
      expect(result[0]?.metadata?.tokenCount).toBe(2);
    });

    it('should NOT skip complete message if content differs from aggregated', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' world',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        // Different complete message (not a duplicate)
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Different message', // Different content
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
        },
      ];

      const result = aggregateStreamingTokens(messages);

      // Should have 2 messages (aggregated + different complete)
      expect(result).toHaveLength(2);
      expect(result[0]?.content).toBe('Hello world');
      expect(result[1]?.content).toBe('Different message');
    });

    it('should handle whitespace differences in duplicate detection', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' world',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        // Duplicate with extra whitespace
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: '  Hello world  \n', // Extra whitespace
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
        },
      ];

      const result = aggregateStreamingTokens(messages);

      // Should skip duplicate (whitespace trimmed in comparison)
      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe('Hello world');
    });
  });

  describe('Mixed Message Types', () => {
    it('should handle mix of user, streaming, and complete messages', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'user',
          content: 'Question?',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'The',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' answer',
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-4',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' is...',
          timestamp: new Date().toISOString(),
          sequenceNumber: 4,
          metadata: { eventType: 'content_delta' },
        },
        // Duplicate complete
        {
          id: 'msg-5',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'The answer is...',
          timestamp: new Date().toISOString(),
          sequenceNumber: 5,
        },
        {
          id: 'msg-6',
          agentId: 'agent-1',
          type: 'system',
          content: 'Task complete',
          timestamp: new Date().toISOString(),
          sequenceNumber: 6,
        },
      ];

      const result = aggregateStreamingTokens(messages);

      expect(result).toHaveLength(3);
      expect(result[0]?.type).toBe('user');
      expect(result[0]?.content).toBe('Question?');
      expect(result[1]?.type).toBe('assistant');
      expect(result[1]?.content).toBe('The answer is...');
      expect(result[1]?.metadata?.aggregated).toBe(true);
      expect(result[2]?.type).toBe('system');
      expect(result[2]?.content).toBe('Task complete');
    });

    it('should handle multiple separate streaming sequences', () => {
      const messages: AgentMessage[] = [
        // First streaming sequence
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'First',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' message',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'First message',
          timestamp: new Date().toISOString(),
          sequenceNumber: 3,
        },
        // Complete message between sequences
        {
          id: 'msg-4',
          agentId: 'agent-1',
          type: 'user',
          content: 'Follow-up',
          timestamp: new Date().toISOString(),
          sequenceNumber: 4,
        },
        // Second streaming sequence
        {
          id: 'msg-5',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Second',
          timestamp: new Date().toISOString(),
          sequenceNumber: 5,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-6',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' response',
          timestamp: new Date().toISOString(),
          sequenceNumber: 6,
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-7',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Second response',
          timestamp: new Date().toISOString(),
          sequenceNumber: 7,
        },
      ];

      const result = aggregateStreamingTokens(messages);

      expect(result).toHaveLength(3);
      expect(result[0]?.content).toBe('First message');
      expect(result[1]?.content).toBe('Follow-up');
      expect(result[2]?.content).toBe('Second response');
    });
  });

  describe('Metadata Preservation', () => {
    it('should preserve metadata from first token in aggregated message', () => {
      const firstTokenMetadata = {
        eventType: 'content_delta',
        customField: 'value',
        timestamp: Date.now(),
      };

      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          metadata: firstTokenMetadata,
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: ' world',
          timestamp: new Date().toISOString(),
          sequenceNumber: 2,
          metadata: { eventType: 'content_delta' },
        },
      ];

      const result = aggregateStreamingTokens(messages);

      expect(result).toHaveLength(1);
      expect(result[0]?.metadata).toMatchObject({
        eventType: 'content_delta',
        customField: 'value', // Preserved from first token
        aggregated: true,
        tokenCount: 2,
        streaming: true,
      });
    });

    it('should handle messages with no metadata', () => {
      const messages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'user',
          content: 'Hello',
          timestamp: new Date().toISOString(),
          sequenceNumber: 1,
          // No metadata
        },
      ];

      const result = aggregateStreamingTokens(messages);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(messages[0]);
    });
  });
});
