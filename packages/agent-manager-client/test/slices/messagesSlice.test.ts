import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import {
  messagesSlice,
  messageReceived,
  messagesCleared,
  fetchMessages,
  fetchMessagesSince,
} from '../../src/store/slices/messagesSlice';
import type { AgentMessage } from '../../src/types';
import { AgentApiClient } from '../../src/api/AgentApiClient';

// Mock the API client
vi.mock('../../src/api/AgentApiClient', () => ({
  AgentApiClient: {
    getAgentMessages: vi.fn(),
    getAgentMessagesSince: vi.fn(),
  },
}));

describe('messagesSlice', () => {
  let store: ReturnType<typeof createTestStore>;
  let consoleWarnSpy: any;

  function createTestStore() {
    return configureStore({
      reducer: { messages: messagesSlice.reducer },
    });
  }

  beforeEach(() => {
    store = createTestStore();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  describe('messageReceived action', () => {
    it('should add message to agent messages', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Hello!',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message }));

      const state = store.getState().messages;
      expect(state.byAgentId['agent-1'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-1'].messages[0]).toEqual(message);
    });

    it('should initialize agent messages if not exists', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        agentId: 'new-agent',
        type: 'assistant',
        content: 'First message',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      expect(store.getState().messages.byAgentId['new-agent']).toBeUndefined();

      store.dispatch(messageReceived({ agentId: 'new-agent', message }));

      const state = store.getState().messages;
      expect(state.byAgentId['new-agent']).toBeDefined();
      expect(state.byAgentId['new-agent'].messages).toHaveLength(1);
      expect(state.byAgentId['new-agent'].lastSequence).toBe(1);
      expect(state.byAgentId['new-agent'].loading).toBe(false);
      expect(state.byAgentId['new-agent'].error).toBeNull();
    });

    it('should deduplicate messages by ID', () => {
      const message: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Test',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message }));
      store.dispatch(messageReceived({ agentId: 'agent-1', message }));
      store.dispatch(messageReceived({ agentId: 'agent-1', message }));

      const state = store.getState().messages;
      expect(state.byAgentId['agent-1'].messages).toHaveLength(1);
      expect(state.messageIds['msg-1']).toBe(true);
    });

    it('should track last sequence number', () => {
      const msg1: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'user',
        content: 'Message 1',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      const msg2: AgentMessage = {
        id: 'msg-2',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 2',
        sequenceNumber: 2,
        createdAt: new Date().toISOString(),
      };

      const msg3: AgentMessage = {
        id: 'msg-3',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 3',
        sequenceNumber: 3,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg1 }));
      expect(store.getState().messages.byAgentId['agent-1'].lastSequence).toBe(1);

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg2 }));
      expect(store.getState().messages.byAgentId['agent-1'].lastSequence).toBe(2);

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg3 }));
      expect(store.getState().messages.byAgentId['agent-1'].lastSequence).toBe(3);
    });

    it('should detect gaps in sequence numbers', () => {
      const msg1: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 1',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      const msg5: AgentMessage = {
        id: 'msg-5',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 5 (gap!)',
        sequenceNumber: 5,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg1 }));
      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg5 }));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[messagesSlice] Gap detected. Expected:',
        2,
        'Got:',
        5
      );
    });

    it('should handle temporary messages (sequenceNumber = -1)', () => {
      const tempMessage: AgentMessage = {
        id: 'temp-msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Temporary message',
        sequenceNumber: -1,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: tempMessage }));

      const state = store.getState().messages;

      // Temporary message should be added
      expect(state.byAgentId['agent-1'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-1'].messages[0].id).toBe('temp-msg-1');

      // But should NOT update lastSequence
      expect(state.byAgentId['agent-1'].lastSequence).toBe(0);

      // Should be tracked in messageIds for deduplication
      expect(state.messageIds['temp-msg-1']).toBe(true);
    });

    it('should handle messages from multiple agents independently', () => {
      const msgAgent1: AgentMessage = {
        id: 'msg-a1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Agent 1 message',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      const msgAgent2: AgentMessage = {
        id: 'msg-a2',
        agentId: 'agent-2',
        type: 'assistant',
        content: 'Agent 2 message',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msgAgent1 }));
      store.dispatch(messageReceived({ agentId: 'agent-2', message: msgAgent2 }));

      const state = store.getState().messages;

      expect(state.byAgentId['agent-1'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-1'].lastSequence).toBe(1);

      expect(state.byAgentId['agent-2'].messages).toHaveLength(1);
      expect(state.byAgentId['agent-2'].lastSequence).toBe(1);
    });
  });

  describe('messagesCleared action', () => {
    it('should clear messages for specific agent', () => {
      const msg1: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 1',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      const msg2: AgentMessage = {
        id: 'msg-2',
        agentId: 'agent-2',
        type: 'assistant',
        content: 'Message 2',
        sequenceNumber: 1,
        createdAt: new Date().toISOString(),
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg1 }));
      store.dispatch(messageReceived({ agentId: 'agent-2', message: msg2 }));

      store.dispatch(messagesCleared('agent-1'));

      const state = store.getState().messages;

      // agent-1 messages cleared
      expect(state.byAgentId['agent-1'].messages).toHaveLength(0);
      expect(state.byAgentId['agent-1'].lastSequence).toBe(0);

      // agent-2 messages remain
      expect(state.byAgentId['agent-2'].messages).toHaveLength(1);
    });
  });

  describe('fetchMessages thunk', () => {
    it('should load messages and track IDs', async () => {
      const mockMessages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-1',
          type: 'user',
          content: 'Message 1',
          sequenceNumber: 1,
          createdAt: '2025-11-10T10:00:00Z',
        },
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Message 2',
          sequenceNumber: 2,
          createdAt: '2025-11-10T10:00:01Z',
        },
        {
          id: 'msg-3',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Message 3',
          sequenceNumber: 3,
          createdAt: '2025-11-10T10:00:02Z',
        },
      ];

      (AgentApiClient.getAgentMessages as any).mockResolvedValue(mockMessages);

      await store.dispatch(fetchMessages('agent-1'));

      const state = store.getState().messages;

      expect(state.byAgentId['agent-1'].messages).toHaveLength(3);
      expect(state.byAgentId['agent-1'].lastSequence).toBe(3);
      expect(state.messageIds['msg-1']).toBe(true);
      expect(state.messageIds['msg-2']).toBe(true);
      expect(state.messageIds['msg-3']).toBe(true);
      expect(state.byAgentId['agent-1'].loading).toBe(false);
    });

    it('should set loading state during fetch', async () => {
      (AgentApiClient.getAgentMessages as any).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve([]), 100))
      );

      const promise = store.dispatch(fetchMessages('agent-1'));

      // Check loading state immediately
      expect(store.getState().messages.byAgentId['agent-1'].loading).toBe(true);

      await promise;

      // Check loading state after completion
      expect(store.getState().messages.byAgentId['agent-1'].loading).toBe(false);
    });
  });

  describe('fetchMessagesSince thunk (gap filling)', () => {
    it('should fill gap with missing messages', async () => {
      // Start with messages 1, 2, and 5 (gap at 3-4)
      const msg1: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 1',
        sequenceNumber: 1,
        createdAt: '2025-11-10T10:00:00Z',
      };

      const msg2: AgentMessage = {
        id: 'msg-2',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 2',
        sequenceNumber: 2,
        createdAt: '2025-11-10T10:00:01Z',
      };

      const msg5: AgentMessage = {
        id: 'msg-5',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 5',
        sequenceNumber: 5,
        createdAt: '2025-11-10T10:00:04Z',
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg1 }));
      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg2 }));
      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg5 }));

      // Mock gap messages
      const gapMessages: AgentMessage[] = [
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

      // Fill gap
      await store.dispatch(fetchMessagesSince({ agentId: 'agent-1', since: 2 }));

      const state = store.getState().messages;
      const messages = state.byAgentId['agent-1'].messages;

      // Should have all 5 messages now
      expect(messages).toHaveLength(5);

      // Should be sorted by sequence number
      const sequences = messages.map((m) => m.sequenceNumber);
      expect(sequences).toEqual([1, 2, 3, 4, 5]);

      // Verify all message IDs tracked
      expect(state.messageIds['msg-1']).toBe(true);
      expect(state.messageIds['msg-2']).toBe(true);
      expect(state.messageIds['msg-3']).toBe(true);
      expect(state.messageIds['msg-4']).toBe(true);
      expect(state.messageIds['msg-5']).toBe(true);
    });

    it('should not add duplicate messages when filling gaps', async () => {
      const msg1: AgentMessage = {
        id: 'msg-1',
        agentId: 'agent-1',
        type: 'assistant',
        content: 'Message 1',
        sequenceNumber: 1,
        createdAt: '2025-11-10T10:00:00Z',
      };

      store.dispatch(messageReceived({ agentId: 'agent-1', message: msg1 }));

      // Mock response includes msg-1 again
      const gapMessages: AgentMessage[] = [
        msg1, // Duplicate!
        {
          id: 'msg-2',
          agentId: 'agent-1',
          type: 'assistant',
          content: 'Message 2',
          sequenceNumber: 2,
          createdAt: '2025-11-10T10:00:01Z',
        },
      ];

      (AgentApiClient.getAgentMessagesSince as any).mockResolvedValue(gapMessages);

      await store.dispatch(fetchMessagesSince({ agentId: 'agent-1', since: 1 }));

      const state = store.getState().messages;

      // Should only have 2 messages (no duplicate)
      expect(state.byAgentId['agent-1'].messages).toHaveLength(2);
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().messages;

      expect(state.byAgentId).toEqual({});
      expect(state.messageIds).toEqual({});
    });
  });
});
