/**
 * useAgentMessages Hook Tests - Redux Version
 * Tests for Redux-based message state management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAgentMessages, aggregateStreamingTokens } from '@/hooks/useAgentMessages';
import {
  messagesSlice,
  agentsSlice,
  connectionSlice,
  AgentApiClient,
  type AgentMessage,
} from '@headless-agent-manager/client';

/**
 * Create a test store for testing
 */
function createTestStore(preloadedState?: any) {
  return configureStore({
    reducer: {
      agents: agentsSlice.reducer,
      messages: messagesSlice.reducer,
      connection: connectionSlice.reducer,
    },
    preloadedState,
  });
}

/**
 * Wrapper component that provides Redux store
 */
function createWrapper(store: ReturnType<typeof createTestStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe('useAgentMessages - Redux Version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading messages from Redux', () => {
    it('should dispatch fetchMessages when agent selected', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Hello',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(AgentApiClient, 'getAgentMessages').mockResolvedValue(mockHistory);

      const store = createTestStore();

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'), {
        wrapper: createWrapper(store),
      });

      // Assert - Should start in loading state
      expect(result.current.loading).toBe(true);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]?.content).toBe('Hello');
      });
    });

    it('should return empty array when no agent selected', () => {
      // Arrange
      const store = createTestStore();

      // Act
      const { result } = renderHook(() => useAgentMessages(null), {
        wrapper: createWrapper(store),
      });

      // Assert
      expect(result.current.messages).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle API errors', async () => {
      // Arrange
      const error = new Error('Network error');
      vi.spyOn(AgentApiClient, 'getAgentMessages').mockRejectedValue(error);

      const store = createTestStore();

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'), {
        wrapper: createWrapper(store),
      });

      // Assert
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
        expect(result.current.error?.message).toBe('Network error');
      });
    });
  });

  describe('Reading from Redux state', () => {
    it('should read messages from preloaded Redux state', () => {
      // Arrange - Create store with preloaded messages
      const preloadedMessages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Preloaded message',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      const store = createTestStore({
        messages: {
          byAgentId: {
            'agent-123': {
              messages: preloadedMessages,
              lastSequence: 1,
              loading: false,
              error: null,
            },
          },
          messageIds: { 'msg-1': true },
        },
      });

      // Mock API to prevent fetch
      vi.spyOn(AgentApiClient, 'getAgentMessages').mockResolvedValue([]);

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'), {
        wrapper: createWrapper(store),
      });

      // Assert - Should immediately have preloaded messages
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.content).toBe('Preloaded message');
    });

    it('should aggregate streaming tokens via selector', async () => {
      // Arrange - Create store with streaming tokens
      const streamingMessages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'assistant',
          content: 'Hello',
          timestamp: '2025-01-01T00:00:00Z',
          metadata: { eventType: 'content_delta' },
        },
        {
          id: 'msg-2',
          agentId: 'agent-123',
          sequenceNumber: 2,
          type: 'assistant',
          content: ' world',
          timestamp: '2025-01-01T00:00:01Z',
          metadata: { eventType: 'content_delta' },
        },
      ];

      const store = createTestStore({
        messages: {
          byAgentId: {
            'agent-123': {
              messages: streamingMessages,
              lastSequence: 2,
              loading: false,
              error: null,
            },
          },
          messageIds: { 'msg-1': true, 'msg-2': true },
        },
      });

      vi.spyOn(AgentApiClient, 'getAgentMessages').mockResolvedValue([]);

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'), {
        wrapper: createWrapper(store),
      });

      // Assert - Should aggregate tokens (selector does this automatically)
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]?.content).toBe('Hello world');
      expect(result.current.messages[0]?.metadata?.aggregated).toBe(true);
    });
  });

  describe('Refetch functionality', () => {
    it('should refetch messages when refetch called', async () => {
      // Arrange
      const mockHistory: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Initial',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      const mockRefreshed: AgentMessage[] = [
        ...mockHistory,
        {
          id: 'msg-2',
          agentId: 'agent-123',
          sequenceNumber: 2,
          type: 'assistant',
          content: 'New message',
          timestamp: '2025-01-01T00:00:01Z',
        },
      ];

      vi.spyOn(AgentApiClient, 'getAgentMessages')
        .mockResolvedValueOnce(mockHistory)
        .mockResolvedValueOnce(mockRefreshed);

      const store = createTestStore();

      // Act
      const { result } = renderHook(() => useAgentMessages('agent-123'), {
        wrapper: createWrapper(store),
      });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
      });

      // Refetch
      result.current.refetch();

      // Assert - Should have new message
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1]?.content).toBe('New message');
      });
    });

    it('should do nothing when refetch called with no agent', () => {
      // Arrange
      const store = createTestStore();
      vi.spyOn(AgentApiClient, 'getAgentMessages');

      // Act
      const { result } = renderHook(() => useAgentMessages(null), {
        wrapper: createWrapper(store),
      });

      result.current.refetch();

      // Assert - Should not call API
      expect(AgentApiClient.getAgentMessages).not.toHaveBeenCalled();
    });
  });

  describe('Agent switching', () => {
    it('should fetch new messages when switching agents', async () => {
      // Arrange
      const mockHistoryAgent1: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          sequenceNumber: 1,
          type: 'user',
          content: 'Agent 1 message',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      const mockHistoryAgent2: AgentMessage[] = [
        {
          id: 'msg-2',
          agentId: 'agent-2',
          sequenceNumber: 1,
          type: 'user',
          content: 'Agent 2 message',
          timestamp: '2025-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(AgentApiClient, 'getAgentMessages')
        .mockResolvedValueOnce(mockHistoryAgent1)
        .mockResolvedValueOnce(mockHistoryAgent2);

      const store = createTestStore();

      // Act - Start with agent-1
      const { result, rerender } = renderHook(
        ({ agentId }) => useAgentMessages(agentId),
        {
          wrapper: createWrapper(store),
          initialProps: { agentId: 'agent-1' },
        }
      );

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]?.content).toBe('Agent 1 message');
      });

      // Switch to agent-2
      rerender({ agentId: 'agent-2' });

      // Assert - Should load agent-2 messages
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0]?.content).toBe('Agent 2 message');
      });
    });
  });
});

/**
 * Tests for aggregateStreamingTokens utility (re-exported from module)
 */
describe('aggregateStreamingTokens (re-exported)', () => {
  it('should aggregate streaming tokens', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-1',
        agentId: 'agent-1',
        sequenceNumber: 1,
        type: 'assistant',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:00Z',
        metadata: { eventType: 'content_delta' },
      },
      {
        id: 'msg-2',
        agentId: 'agent-1',
        sequenceNumber: 2,
        type: 'assistant',
        content: ' world',
        timestamp: '2025-01-01T00:00:01Z',
        metadata: { eventType: 'content_delta' },
      },
    ];

    const result = aggregateStreamingTokens(messages);

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe('Hello world');
    expect(result[0]?.metadata?.aggregated).toBe(true);
  });

  it('should skip duplicate complete message', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-1',
        agentId: 'agent-1',
        sequenceNumber: 1,
        type: 'assistant',
        content: 'Hello',
        timestamp: '2025-01-01T00:00:00Z',
        metadata: { eventType: 'content_delta' },
      },
      {
        id: 'msg-2',
        agentId: 'agent-1',
        sequenceNumber: 2,
        type: 'assistant',
        content: ' world',
        timestamp: '2025-01-01T00:00:01Z',
        metadata: { eventType: 'content_delta' },
      },
      // Duplicate complete message
      {
        id: 'msg-3',
        agentId: 'agent-1',
        sequenceNumber: 3,
        type: 'assistant',
        content: 'Hello world',
        timestamp: '2025-01-01T00:00:02Z',
      },
    ];

    const result = aggregateStreamingTokens(messages);

    // Should only have 1 message (duplicate skipped)
    expect(result).toHaveLength(1);
    expect(result[0]?.content).toBe('Hello world');
    expect(result[0]?.metadata?.aggregated).toBe(true);
  });
});
