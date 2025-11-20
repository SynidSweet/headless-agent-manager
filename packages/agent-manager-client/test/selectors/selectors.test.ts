import { describe, it, expect } from 'vitest';
import {
  selectAllAgents,
  selectAgentById,
  selectSelectedAgent,
  selectRunningAgents,
  selectCompletedAgents,
  selectMessagesForAgent,
  selectMessagesForSelectedAgent,
  selectIsConnected,
  selectSubscribedAgents,
} from '../../src/store/selectors';
import type { Agent, AgentMessage } from '../../src/types';

describe('selectors', () => {
  // Helper to create test state
  const createTestState = () => ({
    agents: {
      byId: {
        'agent-1': {
          id: 'agent-1',
          type: 'claude-code' as const,
          status: 'running' as const,
          createdAt: '2025-11-10T10:00:00Z',
        },
        'agent-2': {
          id: 'agent-2',
          type: 'gemini-cli' as const,
          status: 'completed' as const,
          createdAt: '2025-11-10T10:05:00Z',
        },
        'agent-3': {
          id: 'agent-3',
          type: 'claude-code' as const,
          status: 'failed' as const,
          createdAt: '2025-11-10T10:10:00Z',
        },
      },
      allIds: ['agent-1', 'agent-2', 'agent-3'],
      selectedAgentId: 'agent-1',
      loading: false,
      error: null,
      lastFetched: null,
    },
    messages: {
      byAgentId: {
        'agent-1': {
          messages: [
            {
              id: 'msg-1',
              agentId: 'agent-1',
              type: 'user' as const,
              content: 'Hello',
              sequenceNumber: 1,
              createdAt: '2025-11-10T10:00:00Z',
            },
            {
              id: 'msg-2',
              agentId: 'agent-1',
              type: 'assistant' as const,
              content: 'Hi!',
              sequenceNumber: 2,
              createdAt: '2025-11-10T10:00:01Z',
            },
          ],
          lastSequence: 2,
          loading: false,
          error: null,
        },
        'agent-2': {
          messages: [
            {
              id: 'msg-3',
              agentId: 'agent-2',
              type: 'system' as const,
              content: 'System message',
              sequenceNumber: 1,
              createdAt: '2025-11-10T10:05:00Z',
            },
          ],
          lastSequence: 1,
          loading: false,
          error: null,
        },
      },
      messageIds: {
        'msg-1': true,
        'msg-2': true,
        'msg-3': true,
      },
    },
    connection: {
      isConnected: true,
      connectionId: 'conn-123',
      error: null,
      reconnectAttempts: 0,
      subscribedAgents: ['agent-1', 'agent-2'],
    },
  });

  describe('selectAllAgents', () => {
    it('should return array of all agents', () => {
      const state = createTestState();
      const agents = selectAllAgents(state);

      expect(agents).toHaveLength(3);
      expect(agents[0].id).toBe('agent-1');
      expect(agents[1].id).toBe('agent-2');
      expect(agents[2].id).toBe('agent-3');
    });

    it('should return empty array when no agents', () => {
      const state = createTestState();
      state.agents.byId = {};
      state.agents.allIds = [];

      const agents = selectAllAgents(state);
      expect(agents).toEqual([]);
    });
  });

  describe('selectAgentById', () => {
    it('should return specific agent by ID', () => {
      const state = createTestState();
      const agent = selectAgentById(state, 'agent-2');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent-2');
      expect(agent?.type).toBe('gemini-cli');
      expect(agent?.status).toBe('completed');
    });

    it('should return undefined for non-existent agent', () => {
      const state = createTestState();
      const agent = selectAgentById(state, 'fake-id');

      expect(agent).toBeUndefined();
    });
  });

  describe('selectSelectedAgent', () => {
    it('should return currently selected agent', () => {
      const state = createTestState();
      const agent = selectSelectedAgent(state);

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent-1');
    });

    it('should return undefined when no agent selected', () => {
      const state = createTestState();
      state.agents.selectedAgentId = null;

      const agent = selectSelectedAgent(state);
      expect(agent).toBeUndefined();
    });
  });

  describe('selectRunningAgents', () => {
    it('should return only agents with running status', () => {
      const state = createTestState();
      const runningAgents = selectRunningAgents(state);

      expect(runningAgents).toHaveLength(1);
      expect(runningAgents[0].id).toBe('agent-1');
      expect(runningAgents[0].status).toBe('running');
    });

    it('should return empty array when no running agents', () => {
      const state = createTestState();
      state.agents.byId['agent-1'].status = 'completed';

      const runningAgents = selectRunningAgents(state);
      expect(runningAgents).toEqual([]);
    });
  });

  describe('selectCompletedAgents', () => {
    it('should return only agents with completed status', () => {
      const state = createTestState();
      const completedAgents = selectCompletedAgents(state);

      expect(completedAgents).toHaveLength(1);
      expect(completedAgents[0].id).toBe('agent-2');
      expect(completedAgents[0].status).toBe('completed');
    });
  });

  describe('selectMessagesForAgent', () => {
    it('should return messages for specific agent', () => {
      const state = createTestState();
      const messages = selectMessagesForAgent(state, 'agent-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg-1');
      expect(messages[1].id).toBe('msg-2');
    });

    it('should return empty array for agent with no messages', () => {
      const state = createTestState();
      const messages = selectMessagesForAgent(state, 'agent-3');

      expect(messages).toEqual([]);
    });

    it('should return empty array for non-existent agent', () => {
      const state = createTestState();
      const messages = selectMessagesForAgent(state, 'fake-id');

      expect(messages).toEqual([]);
    });
  });

  describe('selectMessagesForSelectedAgent', () => {
    it('should return messages for selected agent', () => {
      const state = createTestState();
      const messages = selectMessagesForSelectedAgent(state);

      expect(messages).toHaveLength(2);
      expect(messages[0].agentId).toBe('agent-1');
    });

    it('should return empty array when no agent selected', () => {
      const state = createTestState();
      state.agents.selectedAgentId = null;

      const messages = selectMessagesForSelectedAgent(state);
      expect(messages).toEqual([]);
    });
  });

  describe('selectIsConnected', () => {
    it('should return connection status', () => {
      const state = createTestState();
      const isConnected = selectIsConnected(state);

      expect(isConnected).toBe(true);
    });

    it('should return false when disconnected', () => {
      const state = createTestState();
      state.connection.isConnected = false;

      const isConnected = selectIsConnected(state);
      expect(isConnected).toBe(false);
    });
  });

  describe('selectSubscribedAgents', () => {
    it('should return list of subscribed agents', () => {
      const state = createTestState();
      const subscribed = selectSubscribedAgents(state);

      expect(subscribed).toEqual(['agent-1', 'agent-2']);
    });
  });
});
