import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import {
  agentsSlice,
  agentAdded,
  agentStatusUpdated,
  agentSelected,
  agentRemoved,
  fetchAgents,
  launchAgent,
  terminateAgent,
} from '../../src/store/slices/agentsSlice';
import type { Agent } from '../../src/types';

describe('agentsSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  function createTestStore() {
    return configureStore({
      reducer: { agents: agentsSlice.reducer },
    });
  }

  beforeEach(() => {
    store = createTestStore();
  });

  describe('agentAdded action', () => {
    it('should add agent to byId and allIds', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent));

      const state = store.getState().agents;
      expect(state.byId['agent-1']).toEqual(agent);
      expect(state.allIds).toContain('agent-1');
      expect(state.allIds).toHaveLength(1);
    });

    it('should not duplicate agent if added twice', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent));
      store.dispatch(agentAdded(agent));

      const state = store.getState().agents;
      expect(state.allIds).toHaveLength(1);
    });

    it('should add multiple different agents', () => {
      const agent1: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      const agent2: Agent = {
        id: 'agent-2',
        type: 'gemini-cli',
        status: 'initializing',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent1));
      store.dispatch(agentAdded(agent2));

      const state = store.getState().agents;
      expect(state.allIds).toHaveLength(2);
      expect(state.byId['agent-1']).toEqual(agent1);
      expect(state.byId['agent-2']).toEqual(agent2);
    });
  });

  describe('agentStatusUpdated action', () => {
    it('should update agent status', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent));
      store.dispatch(agentStatusUpdated({ agentId: 'agent-1', status: 'completed' }));

      const state = store.getState().agents;
      expect(state.byId['agent-1'].status).toBe('completed');
    });

    it('should handle status update for non-existent agent gracefully', () => {
      // Should not crash
      store.dispatch(agentStatusUpdated({ agentId: 'fake-id', status: 'completed' }));

      const state = store.getState().agents;
      expect(state.byId['fake-id']).toBeUndefined();
    });

    it('should update status multiple times', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'initializing',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent));
      store.dispatch(agentStatusUpdated({ agentId: 'agent-1', status: 'running' }));
      store.dispatch(agentStatusUpdated({ agentId: 'agent-1', status: 'completed' }));

      const state = store.getState().agents;
      expect(state.byId['agent-1'].status).toBe('completed');
    });
  });

  describe('agentSelected action', () => {
    it('should set selectedAgentId', () => {
      store.dispatch(agentSelected('agent-1'));

      const state = store.getState().agents;
      expect(state.selectedAgentId).toBe('agent-1');
    });

    it('should allow deselection with null', () => {
      store.dispatch(agentSelected('agent-1'));
      store.dispatch(agentSelected(null));

      const state = store.getState().agents;
      expect(state.selectedAgentId).toBeNull();
    });

    it('should switch selection between agents', () => {
      store.dispatch(agentSelected('agent-1'));
      expect(store.getState().agents.selectedAgentId).toBe('agent-1');

      store.dispatch(agentSelected('agent-2'));
      expect(store.getState().agents.selectedAgentId).toBe('agent-2');
    });
  });

  describe('agentRemoved action', () => {
    it('should remove agent from byId and allIds', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'completed',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent));
      store.dispatch(agentRemoved('agent-1'));

      const state = store.getState().agents;
      expect(state.byId['agent-1']).toBeUndefined();
      expect(state.allIds).not.toContain('agent-1');
      expect(state.allIds).toHaveLength(0);
    });

    it('should deselect agent if it was selected', () => {
      const agent: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'completed',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent));
      store.dispatch(agentSelected('agent-1'));
      store.dispatch(agentRemoved('agent-1'));

      const state = store.getState().agents;
      expect(state.selectedAgentId).toBeNull();
    });

    it('should not affect selectedAgentId if different agent removed', () => {
      const agent1: Agent = {
        id: 'agent-1',
        type: 'claude-code',
        status: 'completed',
        createdAt: new Date().toISOString(),
      };

      const agent2: Agent = {
        id: 'agent-2',
        type: 'gemini-cli',
        status: 'running',
        createdAt: new Date().toISOString(),
      };

      store.dispatch(agentAdded(agent1));
      store.dispatch(agentAdded(agent2));
      store.dispatch(agentSelected('agent-1'));
      store.dispatch(agentRemoved('agent-2'));

      const state = store.getState().agents;
      expect(state.selectedAgentId).toBe('agent-1');
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().agents;

      expect(state.byId).toEqual({});
      expect(state.allIds).toEqual([]);
      expect(state.selectedAgentId).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetched).toBeNull();
    });
  });
});
