import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAgentMessages, aggregateStreamingTokens } from '@/hooks/useAgentMessages';
import { ApiService } from '@/services/api.service';
import type { AgentMessage } from '@/types/agent.types';

/**
 * useAgentMessages Hook Tests
 * Tests for message state management with deduplication and gap detection
 */
describe('useAgentMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading historical messages', () => {
    it('should load historical messages when agent selected', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'msg-2',
          agentId: 'agent-123',
          sequenceNumber: 2,
          type: 'assistant',
          content: 'Hi there',
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages').mockResolvedValue(mockHistory);

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'));

      // Assert
      await waitFor(() => {
        expect(result.current.messages).toEqual(mockHistory);
        expect(result.current.loading).toBe(false);
      });
    });

    it('should show loading state while fetching messages', () => {
      // Arrange
      vi.spyOn(ApiService, 'getAgentMessages').mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'));

      // Assert
      expect(result.current.loading).toBe(true);
      expect(result.current.messages).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      // Arrange
      const error = new Error('Network error');
      vi.spyOn(ApiService, 'getAgentMessages').mockRejectedValue(error);

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'));

      // Assert
      await waitFor(() => {
        expect(result.current.error).toEqual(error);
        expect(result.current.loading).toBe(false);
      });
    });

    it('should return empty array when no agent selected', () => {
      // Act
      const { result } = renderHook(() => useAgentMessages(null));

      // Assert
      expect(result.current.messages).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Real-time message handling', () => {
    it('should append new message from WebSocket', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages').mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useAgentMessages('agent-123'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Act - Simulate WebSocket message
      act(() => {
        window.dispatchEvent(
          new CustomEvent('agent:message', {
            detail: {
              agentId: 'agent-123',
              message: {
                id: 'msg-2',
                agentId: 'agent-123',
                sequenceNumber: 2,
                type: 'assistant',
                content: 'New message',
                createdAt: '2025-01-01T00:00:01Z',
              },
            },
          })
        );
      });

      // Assert
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1]?.id).toBe('msg-2');
    });

    it('should ignore messages for different agents', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages').mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useAgentMessages('agent-123'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Act - Message for different agent
      act(() => {
        window.dispatchEvent(
          new CustomEvent('agent:message', {
            detail: {
              agentId: 'agent-456', // Different agent!
              message: {
                id: 'msg-x',
                agentId: 'agent-456',
                sequenceNumber: 1,
                type: 'user',
                content: 'Wrong agent',
                createdAt: '2025-01-01T00:00:02Z',
              },
            },
          })
        );
      });

      // Assert - Should not append
      expect(result.current.messages).toHaveLength(1);
    });
  });

  describe('Message deduplication', () => {
    it('should deduplicate messages by ID', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages').mockResolvedValue(mockHistory);

      const { result } = renderHook(() => useAgentMessages('agent-123'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const existingMessage = result.current.messages[0]!;

      // Act - Send duplicate message
      act(() => {
        window.dispatchEvent(
          new CustomEvent('agent:message', {
            detail: {
              agentId: 'agent-123',
              message: existingMessage, // Same ID!
            },
          })
        );
      });

      // Assert - Should not duplicate
      expect(result.current.messages).toHaveLength(1);
      const messageIds = result.current.messages.map((m) => m.id);
      const uniqueIds = new Set(messageIds);
      expect(messageIds.length).toBe(uniqueIds.size);
    });
  });

  describe('Gap detection and filling', () => {
    it('should detect and fill gaps in sequence', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Message 1',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'msg-2',
          agentId: 'agent-123',
          sequenceNumber: 2,
          type: 'assistant',
          content: 'Message 2',
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      const gapFillMessages: AgentMessage[] = [
        {
          id: 'msg-3',
          agentId: 'agent-123',
          sequenceNumber: 3,
          type: 'user',
          content: 'Message 3',
          createdAt: '2025-01-01T00:00:02Z',
        },
        {
          id: 'msg-4',
          agentId: 'agent-123',
          sequenceNumber: 4,
          type: 'assistant',
          content: 'Message 4',
          createdAt: '2025-01-01T00:00:03Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages')
        .mockResolvedValueOnce(mockHistory);
      vi.spyOn(ApiService, 'getAgentMessagesSince')
        .mockResolvedValueOnce(gapFillMessages);

      const { result } = renderHook(() => useAgentMessages('agent-123'));

      await waitFor(() => expect(result.current.messages.length).toBe(2));

      // Act - Receive message with gap (sequence 5, but we only have 1-2)
      act(() => {
        window.dispatchEvent(
          new CustomEvent('agent:message', {
            detail: {
              agentId: 'agent-123',
              message: {
                id: 'msg-5',
                agentId: 'agent-123',
                sequenceNumber: 5, // Gap! We have 1-2, this is 5
                type: 'user',
                content: 'Message 5',
                createdAt: '2025-01-01T00:00:04Z',
              },
            },
          })
        );
      });

      // Assert - Should trigger re-fetch and fill gap
      await waitFor(() => {
        expect(ApiService.getAgentMessagesSince).toHaveBeenCalledWith('agent-123', 2);
        expect(result.current.messages.length).toBeGreaterThanOrEqual(4);
      });
    });
  });

  describe('Agent switching', () => {
    it('should clear messages when switching agents', async () => {
      // Arrange
      const mockHistoryAgent1: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          sequenceNumber: 1,
          type: 'user',
          content: 'Agent 1 message',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      const mockHistoryAgent2: AgentMessage[] = [
        {
          id: 'msg-2',
          agentId: 'agent-2',
          sequenceNumber: 1,
          type: 'user',
          content: 'Agent 2 message',
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages')
        .mockResolvedValueOnce(mockHistoryAgent1)
        .mockResolvedValueOnce(mockHistoryAgent2);

      const { result, rerender } = renderHook(
        ({ agentId }) => useAgentMessages(agentId),
        { initialProps: { agentId: 'agent-1' as string | null } }
      );

      await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0));

      // Act - Switch to different agent
      rerender({ agentId: 'agent-2' });

      // Assert - Should clear old messages immediately
      expect(result.current.messages).toEqual([]);
      expect(result.current.loading).toBe(true);

      // Wait for new messages to load
      await waitFor(() => {
        expect(result.current.messages.length).toBe(1);
        expect(result.current.messages[0]?.agentId).toBe('agent-2');
      });
    });

    it('should handle switching to null agent', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          sequenceNumber: 1,
          type: 'user',
          content: 'Message',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(ApiService, 'getAgentMessages').mockResolvedValue(mockHistory);

      const { result, rerender } = renderHook(
        ({ agentId }) => useAgentMessages(agentId),
        { initialProps: { agentId: 'agent-1' as string | null } }
      );

      await waitFor(() => expect(result.current.messages.length).toBeGreaterThan(0));

      // Act - Switch to null
      rerender({ agentId: null });

      // Assert
      expect(result.current.messages).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe('Token aggregation', () => {
    it('should aggregate streaming content_delta tokens into single message', () => {
      // Arrange
      const tokens: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Hello',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: ' ',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
        {
          id: '3',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'world',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 3,
          createdAt: '2025-01-01T00:00:02Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(tokens);

      // Assert
      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].content).toBe('Hello world');
      expect(aggregated[0].metadata?.tokenCount).toBe(3);
    });

    it('should flush token buffer when non-delta message arrives', () => {
      // Arrange
      const messages: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Hello',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: ' world',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
        {
          id: '3',
          agentId: 'agent-123',
          type: 'system',
          content: 'Complete',
          metadata: {},
          sequenceNumber: 3,
          createdAt: '2025-01-01T00:00:02Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      expect(aggregated).toHaveLength(2);
      expect(aggregated[0].content).toBe('Hello world');
      expect(aggregated[1].type).toBe('system');
    });

    it('should handle in-progress streaming (partial buffer)', () => {
      // Arrange
      const messages: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Typing',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: '...',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      // Should have one aggregated message (still streaming)
      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].content).toBe('Typing...');
      expect(aggregated[0].metadata?.streaming).toBe(true);
    });

    it('should preserve non-delta messages unchanged', () => {
      // Arrange
      const messages: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'system',
          content: 'Init',
          metadata: {},
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'response',
          content: 'Done',
          metadata: {},
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      expect(aggregated).toHaveLength(2);
      expect(aggregated[0]).toEqual(messages[0]);
      expect(aggregated[1]).toEqual(messages[1]);
    });

    it('should handle multiple assistant message groups', () => {
      // Arrange
      const messages: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'First',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: ' part',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
        {
          id: '3',
          agentId: 'agent-123',
          type: 'system',
          content: 'Thinking...',
          metadata: {},
          sequenceNumber: 3,
          createdAt: '2025-01-01T00:00:02Z',
        },
        {
          id: '4',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Second',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 4,
          createdAt: '2025-01-01T00:00:03Z',
        },
        {
          id: '5',
          agentId: 'agent-123',
          type: 'assistant',
          content: ' part',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 5,
          createdAt: '2025-01-01T00:00:04Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      expect(aggregated).toHaveLength(3);
      expect(aggregated[0].content).toBe('First part');
      expect(aggregated[1].type).toBe('system');
      expect(aggregated[2].content).toBe('Second part');
    });

    it('should not duplicate complete message after streaming tokens (DEDUPLICATION)', () => {
      // Arrange - This is the EXACT duplicate message scenario the user reported
      const messages: AgentMessage[] = [
        // Streaming tokens (typing effect)
        {
          id: '1',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Hello',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: ' world',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
        // Complete message from Claude (DUPLICATE - this is the problem!)
        // Claude sends this after all tokens, containing the full message
        {
          id: '3',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Hello world',
          metadata: {}, // NO eventType - this is a complete message, not a delta
          sequenceNumber: 3,
          createdAt: '2025-01-01T00:00:02Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      // Should have only ONE assistant message, not two!
      // The complete message should be skipped because it duplicates the aggregated tokens
      expect(aggregated).toHaveLength(1);
      expect(aggregated[0].content).toBe('Hello world');
      expect(aggregated[0].metadata?.aggregated).toBe(true);
      expect(aggregated[0].metadata?.tokenCount).toBe(2);
    });

    it('should keep complete message if no streaming tokens preceded it', () => {
      // Arrange - Complete message WITHOUT prior streaming tokens
      const messages: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'system',
          content: 'System message',
          metadata: {},
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Complete message without streaming',
          metadata: {}, // No eventType
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      // Should keep the complete message since it wasn't preceded by streaming tokens
      expect(aggregated).toHaveLength(2);
      expect(aggregated[0].type).toBe('system');
      expect(aggregated[1].content).toBe('Complete message without streaming');
    });

    it('should handle complete message with different content than aggregated tokens', () => {
      // Arrange - Edge case: complete message doesn't match tokens (shouldn't happen, but handle it)
      const messages: AgentMessage[] = [
        {
          id: '1',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Hello',
          metadata: { eventType: 'content_delta' },
          sequenceNumber: 1,
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          agentId: 'agent-123',
          type: 'assistant',
          content: 'Different content', // Doesn't match aggregated "Hello"
          metadata: {},
          sequenceNumber: 2,
          createdAt: '2025-01-01T00:00:01Z',
        },
      ];

      // Act
      const aggregated = aggregateStreamingTokens(messages);

      // Assert
      // Should keep both since content doesn't match (unusual but defensive)
      expect(aggregated).toHaveLength(2);
      expect(aggregated[0].content).toBe('Hello');
      expect(aggregated[1].content).toBe('Different content');
    });
  });
});
