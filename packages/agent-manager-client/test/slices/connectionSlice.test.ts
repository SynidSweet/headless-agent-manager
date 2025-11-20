import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import {
  connectionSlice,
  connected,
  disconnected,
  connectionError,
  reconnecting,
  agentSubscribed,
  agentUnsubscribed,
} from '../../src/store/slices/connectionSlice';

describe('connectionSlice', () => {
  let store: ReturnType<typeof createTestStore>;

  function createTestStore() {
    return configureStore({
      reducer: { connection: connectionSlice.reducer },
    });
  }

  beforeEach(() => {
    store = createTestStore();
  });

  describe('connected action', () => {
    it('should set connected state with connection ID', () => {
      store.dispatch(connected({ connectionId: 'conn-123' }));

      const state = store.getState().connection;
      expect(state.isConnected).toBe(true);
      expect(state.connectionId).toBe('conn-123');
      expect(state.error).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });

    it('should clear error and reset reconnect attempts on connection', () => {
      // First simulate error and reconnect attempts
      store.dispatch(connectionError('Previous error'));
      store.dispatch(reconnecting());
      store.dispatch(reconnecting());

      // Then connect
      store.dispatch(connected({ connectionId: 'conn-456' }));

      const state = store.getState().connection;
      expect(state.error).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });
  });

  describe('disconnected action', () => {
    it('should set disconnected state and clear connection ID', () => {
      // First connect
      store.dispatch(connected({ connectionId: 'conn-123' }));

      // Then disconnect
      store.dispatch(disconnected());

      const state = store.getState().connection;
      expect(state.isConnected).toBe(false);
      expect(state.connectionId).toBeNull();
    });
  });

  describe('connectionError action', () => {
    it('should set error message', () => {
      store.dispatch(connectionError('Connection timeout'));

      const state = store.getState().connection;
      expect(state.error).toBe('Connection timeout');
    });
  });

  describe('reconnecting action', () => {
    it('should increment reconnect attempts', () => {
      expect(store.getState().connection.reconnectAttempts).toBe(0);

      store.dispatch(reconnecting());
      expect(store.getState().connection.reconnectAttempts).toBe(1);

      store.dispatch(reconnecting());
      expect(store.getState().connection.reconnectAttempts).toBe(2);

      store.dispatch(reconnecting());
      expect(store.getState().connection.reconnectAttempts).toBe(3);
    });
  });

  describe('agentSubscribed action', () => {
    it('should add agent to subscribed list', () => {
      store.dispatch(agentSubscribed('agent-1'));

      const state = store.getState().connection;
      expect(state.subscribedAgents).toContain('agent-1');
      expect(state.subscribedAgents).toHaveLength(1);
    });

    it('should not duplicate subscriptions', () => {
      store.dispatch(agentSubscribed('agent-1'));
      store.dispatch(agentSubscribed('agent-1'));
      store.dispatch(agentSubscribed('agent-1'));

      const state = store.getState().connection;
      expect(state.subscribedAgents).toHaveLength(1);
      expect(state.subscribedAgents).toEqual(['agent-1']);
    });

    it('should track multiple agents', () => {
      store.dispatch(agentSubscribed('agent-1'));
      store.dispatch(agentSubscribed('agent-2'));
      store.dispatch(agentSubscribed('agent-3'));

      const state = store.getState().connection;
      expect(state.subscribedAgents).toHaveLength(3);
      expect(state.subscribedAgents).toEqual(['agent-1', 'agent-2', 'agent-3']);
    });
  });

  describe('agentUnsubscribed action', () => {
    it('should remove agent from subscribed list', () => {
      store.dispatch(agentSubscribed('agent-1'));
      store.dispatch(agentSubscribed('agent-2'));
      store.dispatch(agentSubscribed('agent-3'));

      store.dispatch(agentUnsubscribed('agent-2'));

      const state = store.getState().connection;
      expect(state.subscribedAgents).toHaveLength(2);
      expect(state.subscribedAgents).toEqual(['agent-1', 'agent-3']);
    });

    it('should handle unsubscribe for non-existent agent', () => {
      store.dispatch(agentSubscribed('agent-1'));

      // Unsubscribe agent that wasn't subscribed
      store.dispatch(agentUnsubscribed('agent-999'));

      const state = store.getState().connection;
      expect(state.subscribedAgents).toHaveLength(1);
      expect(state.subscribedAgents).toEqual(['agent-1']);
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().connection;

      expect(state.isConnected).toBe(false);
      expect(state.connectionId).toBeNull();
      expect(state.error).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
      expect(state.subscribedAgents).toEqual([]);
    });
  });
});
