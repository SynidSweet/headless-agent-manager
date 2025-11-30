/**
 * App State Hooks Tests
 * Tests for Redux selector wrapper hooks
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import {
  useAgents,
  useSelectedAgent,
  useAgentById,
  useRunningAgents,
  useCompletedAgents,
  useFailedAgents,
  useSelectAgent,
  useConnectionStatus,
  useConnectionId,
  useConnectionError,
  useReconnectAttempts,
  useConnection,
} from '@/hooks/useAppState';
import {
  agentsSlice,
  messagesSlice,
  connectionSlice,
  type Agent,
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

describe('Agent Hooks', () => {
  describe('useAgents', () => {
    it('should return all agents', () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          type: 'claude-code',
          status: 'running',
          createdAt: '2025-01-01T00:00:00Z',
          configuration: {},
        },
        {
          id: 'agent-2',
          type: 'claude-code',
          status: 'completed',
          createdAt: '2025-01-01T00:01:00Z',
          configuration: {},
        },
      ];

      const store = createTestStore({
        agents: {
          byId: {
            'agent-1': mockAgents[0],
            'agent-2': mockAgents[1],
          },
          allIds: ['agent-1', 'agent-2'],
          selectedAgentId: null,
          loading: false,
          error: null,
          lastFetched: null,
          pendingLaunchId: null,
        },
      });

      const { result } = renderHook(() => useAgents(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toEqual(mockAgents);
    });

    it('should return empty array when no agents', () => {
      const store = createTestStore();

      const { result } = renderHook(() => useAgents(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toEqual([]);
    });
  });

  describe('useSelectedAgent', () => {
    it('should return selected agent', () => {
      const mockAgent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'running',
        createdAt: '2025-01-01T00:00:00Z',
        configuration: {},
      };

      const store = createTestStore({
        agents: {
          byId: { 'agent-1': mockAgent },
          allIds: ['agent-1'],
          selectedAgentId: 'agent-1',
          loading: false,
          error: null,
          lastFetched: null,
          pendingLaunchId: null,
        },
      });

      const { result } = renderHook(() => useSelectedAgent(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toEqual(mockAgent);
    });

    it('should return undefined when no agent selected', () => {
      const store = createTestStore();

      const { result } = renderHook(() => useSelectedAgent(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toBeUndefined();
    });
  });

  describe('useAgentById', () => {
    it('should return agent by ID', () => {
      const mockAgent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'running',
        createdAt: '2025-01-01T00:00:00Z',
        configuration: {},
      };

      const store = createTestStore({
        agents: {
          byId: { 'agent-1': mockAgent },
          allIds: ['agent-1'],
          selectedAgentId: null,
          loading: false,
          error: null,
          lastFetched: null,
          pendingLaunchId: null,
        },
      });

      const { result } = renderHook(() => useAgentById('agent-1'), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toEqual(mockAgent);
    });

    it('should return undefined for null ID', () => {
      const store = createTestStore();

      const { result } = renderHook(() => useAgentById(null), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toBeUndefined();
    });
  });

  describe('useRunningAgents', () => {
    it('should return only running agents', () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          type: 'claude-code',
          status: 'running',
          createdAt: '2025-01-01T00:00:00Z',
          configuration: {},
        },
        {
          id: 'agent-2',
          type: 'claude-code',
          status: 'completed',
          createdAt: '2025-01-01T00:01:00Z',
          configuration: {},
        },
        {
          id: 'agent-3',
          type: 'claude-code',
          status: 'running',
          createdAt: '2025-01-01T00:02:00Z',
          configuration: {},
        },
      ];

      const store = createTestStore({
        agents: {
          byId: {
            'agent-1': mockAgents[0],
            'agent-2': mockAgents[1],
            'agent-3': mockAgents[2],
          },
          allIds: ['agent-1', 'agent-2', 'agent-3'],
          selectedAgentId: null,
          loading: false,
          error: null,
          lastFetched: null,
          pendingLaunchId: null,
        },
      });

      const { result } = renderHook(() => useRunningAgents(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toHaveLength(2);
      expect(result.current[0]?.id).toBe('agent-1');
      expect(result.current[1]?.id).toBe('agent-3');
    });
  });

  describe('useCompletedAgents', () => {
    it('should return only completed agents', () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          type: 'claude-code',
          status: 'running',
          createdAt: '2025-01-01T00:00:00Z',
          configuration: {},
        },
        {
          id: 'agent-2',
          type: 'claude-code',
          status: 'completed',
          createdAt: '2025-01-01T00:01:00Z',
          configuration: {},
        },
      ];

      const store = createTestStore({
        agents: {
          byId: {
            'agent-1': mockAgents[0],
            'agent-2': mockAgents[1],
          },
          allIds: ['agent-1', 'agent-2'],
          selectedAgentId: null,
          loading: false,
          error: null,
          lastFetched: null,
          pendingLaunchId: null,
        },
      });

      const { result } = renderHook(() => useCompletedAgents(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toHaveLength(1);
      expect(result.current[0]?.id).toBe('agent-2');
    });
  });

  describe('useFailedAgents', () => {
    it('should return only failed agents', () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          type: 'claude-code',
          status: 'running',
          createdAt: '2025-01-01T00:00:00Z',
          configuration: {},
        },
        {
          id: 'agent-2',
          type: 'claude-code',
          status: 'failed',
          createdAt: '2025-01-01T00:01:00Z',
          configuration: {},
          error: 'Network error',
        },
      ];

      const store = createTestStore({
        agents: {
          byId: {
            'agent-1': mockAgents[0],
            'agent-2': mockAgents[1],
          },
          allIds: ['agent-1', 'agent-2'],
          selectedAgentId: null,
          loading: false,
          error: null,
          lastFetched: null,
          pendingLaunchId: null,
        },
      });

      const { result } = renderHook(() => useFailedAgents(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toHaveLength(1);
      expect(result.current[0]?.id).toBe('agent-2');
    });
  });

  describe('useSelectAgent', () => {
    it('should dispatch agentSelected action', () => {
      const store = createTestStore();

      const { result } = renderHook(() => useSelectAgent(), {
        wrapper: createWrapper(store),
      });

      act(() => {
        result.current('agent-1');
      });

      const state = store.getState();
      expect(state.agents.selectedAgentId).toBe('agent-1');
    });
  });
});

describe('Connection Hooks', () => {
  describe('useConnectionStatus', () => {
    it('should return connection status', () => {
      const store = createTestStore({
        connection: {
          isConnected: true,
          connectionId: 'conn-123',
          error: null,
          reconnectAttempts: 0,
          subscribedAgents: [],
        },
      });

      const { result } = renderHook(() => useConnectionStatus(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toBe(true);
    });
  });

  describe('useConnectionId', () => {
    it('should return connection ID', () => {
      const store = createTestStore({
        connection: {
          isConnected: true,
          connectionId: 'conn-123',
          error: null,
          reconnectAttempts: 0,
          subscribedAgents: [],
        },
      });

      const { result } = renderHook(() => useConnectionId(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toBe('conn-123');
    });
  });

  describe('useConnectionError', () => {
    it('should return connection error', () => {
      const store = createTestStore({
        connection: {
          isConnected: false,
          connectionId: null,
          error: 'Connection failed',
          reconnectAttempts: 3,
          subscribedAgents: [],
        },
      });

      const { result } = renderHook(() => useConnectionError(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toBe('Connection failed');
    });
  });

  describe('useReconnectAttempts', () => {
    it('should return reconnect attempts count', () => {
      const store = createTestStore({
        connection: {
          isConnected: false,
          connectionId: null,
          error: null,
          reconnectAttempts: 5,
          subscribedAgents: [],
        },
      });

      const { result } = renderHook(() => useReconnectAttempts(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toBe(5);
    });
  });

  describe('useConnection (composite hook)', () => {
    it('should return all connection state', () => {
      const store = createTestStore({
        connection: {
          isConnected: true,
          connectionId: 'conn-123',
          error: null,
          reconnectAttempts: 2,
          subscribedAgents: ['agent-1', 'agent-2'],
        },
      });

      const { result } = renderHook(() => useConnection(), {
        wrapper: createWrapper(store),
      });

      expect(result.current).toEqual({
        isConnected: true,
        connectionId: 'conn-123',
        error: null,
        reconnectAttempts: 2,
      });
    });
  });
});
