import { describe, it, expect } from 'vitest';
import {
  createMockStore,
  createMockWebSocket,
  mockAgentFixtures,
  mockMessageFixtures,
} from '../../src/testing';
import { agentAdded } from '../../src/store/slices/agentsSlice';
import { messageReceived } from '../../src/store/slices/messagesSlice';

describe('Testing Utilities', () => {
  describe('createMockStore', () => {
    it('should create store with default state', () => {
      const store = createMockStore();

      const state = store.getState();

      expect(state.agents).toBeDefined();
      expect(state.messages).toBeDefined();
      expect(state.connection).toBeDefined();
    });

    it('should create store with preloaded state', () => {
      const preloadedState = {
        agents: {
          byId: { 'agent-1': mockAgentFixtures.running },
          allIds: ['agent-1'],
          selectedAgentId: 'agent-1',
          loading: false,
          error: null,
          lastFetched: null,
        },
      };

      const store = createMockStore(preloadedState);

      const state = store.getState();
      expect(state.agents.allIds).toContain('agent-1');
      expect(state.agents.byId['agent-1']).toEqual(mockAgentFixtures.running);
    });

    it('should allow dispatching actions', () => {
      const store = createMockStore();

      store.dispatch(agentAdded(mockAgentFixtures.completed));

      const state = store.getState();
      expect(state.agents.byId[mockAgentFixtures.completed.id]).toBeDefined();
    });
  });

  describe('createMockWebSocket', () => {
    it('should create mock WebSocket with event handlers', () => {
      const mockSocket = createMockWebSocket();

      expect(mockSocket.on).toBeDefined();
      expect(mockSocket.emit).toBeDefined();
      expect(mockSocket.off).toBeDefined();
      expect(mockSocket.connected).toBe(true);
      expect(mockSocket.id).toBeDefined();
    });

    it('should allow triggering events', () => {
      const mockSocket = createMockWebSocket();
      let connectCalled = false;

      mockSocket.on('connect', () => {
        connectCalled = true;
      });

      mockSocket.trigger('connect');

      expect(connectCalled).toBe(true);
    });

    it('should support multiple event handlers', () => {
      const mockSocket = createMockWebSocket();
      const calls: string[] = [];

      mockSocket.on('test-event', () => calls.push('handler1'));
      mockSocket.on('test-event', () => calls.push('handler2'));

      mockSocket.trigger('test-event');

      expect(calls).toEqual(['handler1', 'handler2']);
    });
  });

  describe('mockAgentFixtures', () => {
    it('should provide running agent fixture', () => {
      const agent = mockAgentFixtures.running;

      expect(agent.id).toBeDefined();
      expect(agent.type).toBe('claude-code');
      expect(agent.status).toBe('running');
      expect(agent.createdAt).toBeDefined();
    });

    it('should provide completed agent fixture', () => {
      const agent = mockAgentFixtures.completed;

      expect(agent.status).toBe('completed');
      expect(agent.completedAt).toBeDefined();
    });

    it('should provide failed agent fixture', () => {
      const agent = mockAgentFixtures.failed;

      expect(agent.status).toBe('failed');
    });

    it('should provide all agent types', () => {
      expect(mockAgentFixtures.running).toBeDefined();
      expect(mockAgentFixtures.completed).toBeDefined();
      expect(mockAgentFixtures.failed).toBeDefined();
      expect(mockAgentFixtures.initializing).toBeDefined();
      expect(mockAgentFixtures.terminated).toBeDefined();
    });
  });

  describe('mockMessageFixtures', () => {
    it('should provide user message fixture', () => {
      const message = mockMessageFixtures.user;

      expect(message.type).toBe('user');
      expect(message.id).toBeDefined();
      expect(message.sequenceNumber).toBeGreaterThan(0);
    });

    it('should provide assistant message fixture', () => {
      const message = mockMessageFixtures.assistant;

      expect(message.type).toBe('assistant');
      expect(message.content).toBeDefined();
    });

    it('should provide system message fixture', () => {
      const message = mockMessageFixtures.system;

      expect(message.type).toBe('system');
    });

    it('should provide temporary message fixture', () => {
      const message = mockMessageFixtures.temporary;

      expect(message.sequenceNumber).toBe(-1);
    });
  });
});
