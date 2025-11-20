import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { createWebSocketMiddleware } from '../../src/store/middleware/websocketMiddleware';
import { agentsSlice } from '../../src/store/slices/agentsSlice';
import { messagesSlice } from '../../src/store/slices/messagesSlice';
import { connectionSlice } from '../../src/store/slices/connectionSlice';
import { AgentApiClient } from '../../src/api/AgentApiClient';
import type { AgentMessage } from '../../src/types';

// Mock the API client
vi.mock('../../src/api/AgentApiClient', () => ({
  AgentApiClient: {
    getAgentMessagesSince: vi.fn(),
  },
}));

describe('websocketMiddleware', () => {
  let store: any;
  let mockSocket: any;
  let eventHandlers: Record<string, (data: any) => void>;

  beforeEach(() => {
    // Reset event handlers
    eventHandlers = {};

    // Create mock socket
    mockSocket = {
      on: vi.fn((event: string, handler: (data: any) => void) => {
        eventHandlers[event] = handler;
      }),
      emit: vi.fn(),
      off: vi.fn(),
      connected: true,
      id: 'mock-socket-123',
    };

    // Create store with middleware
    store = configureStore({
      reducer: {
        agents: agentsSlice.reducer,
        messages: messagesSlice.reducer,
        connection: connectionSlice.reducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(createWebSocketMiddleware(mockSocket)),
    });

    vi.clearAllMocks();
  });

  describe('socket connection handling', () => {
    it('should dispatch connected action on connect event', () => {
      // Trigger connect event
      eventHandlers['connect']();

      const state = store.getState().connection;
      expect(state.isConnected).toBe(true);
      expect(state.connectionId).toBe('mock-socket-123');
    });

    it('should dispatch disconnected action on disconnect event', () => {
      // First connect
      eventHandlers['connect']();
      expect(store.getState().connection.isConnected).toBe(true);

      // Then disconnect
      eventHandlers['disconnect']();

      const state = store.getState().connection;
      expect(state.isConnected).toBe(false);
      expect(state.connectionId).toBeNull();
    });
  });

  describe('agent:message event handling', () => {
    it('should dispatch messageReceived action on agent:message event', () => {
      const messageEvent = {
        agentId: 'agent-1',
        message: {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Hello from WebSocket!',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      // Trigger message event
      eventHandlers['agent:message'](messageEvent);

      const state = store.getState().messages;
      expect(state.byAgentId['agent-1'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-1'].messages[0].id).toBe('msg-1');
      expect(state.byAgentId['agent-1'].messages[0].content).toBe('Hello from WebSocket!');
    });

    it('should handle multiple messages for the same agent', () => {
      const msg1 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'user' as const,
          content: 'Message 1',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      const msg2 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Message 2',
          sequenceNumber: 2,
          createdAt: '2025-11-10T10:00:01Z',
        },
        timestamp: '2025-11-10T10:00:01Z',
      };

      eventHandlers['agent:message'](msg1);
      eventHandlers['agent:message'](msg2);

      const state = store.getState().messages;
      expect(state.byAgentId['agent-1'].messages).toHaveLength(2);
      expect(state.byAgentId['agent-1'].lastSequence).toBe(2);
    });
  });

  describe('agent:status event handling', () => {
    it('should dispatch agentStatusUpdated action on agent:status event', () => {
      // First add an agent
      const agent = {
        id: 'agent-1',
        type: 'claude-code' as const,
        status: 'running' as const,
        createdAt: '2025-11-10T10:00:00Z',
      };

      store.dispatch({ type: 'agents/agentAdded', payload: agent });

      // Then update status via WebSocket
      const statusEvent = {
        agentId: 'agent-1',
        status: 'completed',
        timestamp: '2025-11-10T10:05:00Z',
      };

      eventHandlers['agent:status'](statusEvent);

      const state = store.getState().agents;
      expect(state.byId['agent-1'].status).toBe('completed');
    });
  });

  describe('gap detection and auto-fill', () => {
    it('should auto-fill gaps when sequence jump detected', async () => {
      const msg1 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Message 1',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      const msg5 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-5',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Message 5 (gap!)',
          sequenceNumber: 5,
          createdAt: '2025-11-10T10:00:04Z',
        },
        timestamp: '2025-11-10T10:00:04Z',
      };

      // Mock gap messages
      const gapMessages: AgentMessage[] = [
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Message 2 (gap fill)',
          sequenceNumber: 2,
          createdAt: '2025-11-10T10:00:01Z',
        },
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Message 3 (gap fill)',
          sequenceNumber: 3,
          createdAt: '2025-11-10T10:00:02Z',
        },
        {
          id: 'msg-4',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Message 4 (gap fill)',
          sequenceNumber: 4,
          createdAt: '2025-11-10T10:00:03Z',
        },
      ];

      (AgentApiClient.getAgentMessagesSince as any).mockResolvedValue(gapMessages);

      // Send message 1
      eventHandlers['agent:message'](msg1);

      // Send message 5 (gap detected!)
      eventHandlers['agent:message'](msg5);

      // Wait for gap fill
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify gap fill was triggered
      expect(AgentApiClient.getAgentMessagesSince).toHaveBeenCalledWith('agent-1', 1);

      // Verify all messages are now in store
      const state = store.getState().messages;
      const messages = state.byAgentId['agent-1'].messages;

      expect(messages).toHaveLength(5);

      // Verify correct order
      const sequences = messages.map((m) => m.sequenceNumber);
      expect(sequences).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not trigger gap fill for temporary messages', async () => {
      const tempMsg = {
        agentId: 'agent-1',
        message: {
          id: 'temp-1',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Temporary message',
          sequenceNumber: -1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      eventHandlers['agent:message'](tempMsg);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT trigger gap fill for temporary messages
      expect(AgentApiClient.getAgentMessagesSince).not.toHaveBeenCalled();
    });

    it('should not trigger gap fill when no gap exists', async () => {
      const msg1 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Message 1',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      const msg2 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Message 2',
          sequenceNumber: 2,
          createdAt: '2025-11-10T10:00:01Z',
        },
        timestamp: '2025-11-10T10:00:01Z',
      };

      eventHandlers['agent:message'](msg1);
      eventHandlers['agent:message'](msg2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // No gap, so should NOT trigger gap fill
      expect(AgentApiClient.getAgentMessagesSince).not.toHaveBeenCalled();
    });
  });

  describe('multiple agents', () => {
    it('should handle messages from different agents independently', () => {
      const msgAgent1 = {
        agentId: 'agent-1',
        message: {
          id: 'msg-a1',
          agentId: 'agent-1',
          type: 'assistant' as const,
          content: 'Agent 1 message',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      const msgAgent2 = {
        agentId: 'agent-2',
        message: {
          id: 'msg-a2',
          agentId: 'agent-2',
          type: 'assistant' as const,
          content: 'Agent 2 message',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        timestamp: '2025-11-10T10:00:00Z',
      };

      eventHandlers['agent:message'](msgAgent1);
      eventHandlers['agent:message'](msgAgent2);

      const state = store.getState().messages;

      expect(state.byAgentId['agent-1'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-1'].messages[0].id).toBe('msg-a1');

      expect(state.byAgentId['agent-2'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-2'].messages[0].id).toBe('msg-a2');
    });
  });
});
