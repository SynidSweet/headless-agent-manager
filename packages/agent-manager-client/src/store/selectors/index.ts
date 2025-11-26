/**
 * Redux Selectors
 * Memoized selectors for efficient state access
 */

import { createSelector } from '@reduxjs/toolkit';
import type { Agent, AgentMessage } from '../../types';
import type { AgentsState } from '../slices/agentsSlice';
import type { MessagesState } from '../slices/messagesSlice';
import type { ConnectionState } from '../slices/connectionSlice';

/**
 * Root state interface
 * This will be used by consumers to type their store
 */
export interface RootState {
  agents: AgentsState;
  messages: MessagesState;
  connection: ConnectionState;
}

/**
 * Base selectors (direct state access)
 */
const selectAgentsState = (state: RootState) => state.agents;
const selectMessagesState = (state: RootState) => state.messages;
const selectConnectionState = (state: RootState) => state.connection;

/**
 * Agent selectors
 */

export const selectAllAgents = createSelector(
  [selectAgentsState],
  (agentsState): Agent[] => {
    return agentsState.allIds.map((id) => agentsState.byId[id]);
  }
);

export const selectAgentById = (
  state: RootState,
  agentId: string
): Agent | undefined => {
  return state.agents.byId[agentId];
};

export const selectSelectedAgent = createSelector(
  [selectAgentsState],
  (agentsState): Agent | undefined => {
    if (!agentsState.selectedAgentId) return undefined;
    return agentsState.byId[agentsState.selectedAgentId];
  }
);

export const selectRunningAgents = createSelector(
  [selectAllAgents],
  (agents): Agent[] => {
    return agents.filter((agent) => agent.status === 'running');
  }
);

export const selectCompletedAgents = createSelector(
  [selectAllAgents],
  (agents): Agent[] => {
    return agents.filter((agent) => agent.status === 'completed');
  }
);

export const selectFailedAgents = createSelector(
  [selectAllAgents],
  (agents): Agent[] => {
    return agents.filter((agent) => agent.status === 'failed');
  }
);

/**
 * Message selectors
 */

// Memoized selector factory for messages by agent ID
// This prevents unnecessary re-renders when the same agent is selected
export const selectMessagesForAgent = createSelector(
  [
    (state: RootState) => state.messages.byAgentId,
    (_state: RootState, agentId: string) => agentId,
  ],
  (byAgentId, agentId): AgentMessage[] => {
    const agentMessages = byAgentId[agentId];
    return agentMessages?.messages || [];
  }
);

export const selectMessagesForSelectedAgent = createSelector(
  [selectAgentsState, selectMessagesState],
  (agentsState, messagesState): AgentMessage[] => {
    if (!agentsState.selectedAgentId) return [];
    const agentMessages = messagesState.byAgentId[agentsState.selectedAgentId];
    return agentMessages?.messages || [];
  }
);

export const selectLastSequenceForAgent = (
  state: RootState,
  agentId: string
): number => {
  const agentMessages = state.messages.byAgentId[agentId];
  return agentMessages?.lastSequence || 0;
};

/**
 * Connection selectors
 */

export const selectIsConnected = createSelector(
  [selectConnectionState],
  (connectionState): boolean => {
    return connectionState.isConnected;
  }
);

export const selectConnectionId = createSelector(
  [selectConnectionState],
  (connectionState): string | null => {
    return connectionState.connectionId;
  }
);

export const selectConnectionError = createSelector(
  [selectConnectionState],
  (connectionState): string | null => {
    return connectionState.error;
  }
);

export const selectSubscribedAgents = createSelector(
  [selectConnectionState],
  (connectionState): string[] => {
    return connectionState.subscribedAgents;
  }
);

export const selectReconnectAttempts = createSelector(
  [selectConnectionState],
  (connectionState): number => {
    return connectionState.reconnectAttempts;
  }
);

/**
 * Computed selectors (cross-slice)
 */

export const selectAgentWithMessages = (state: RootState, agentId: string) => {
  const agent = selectAgentById(state, agentId);
  const messages = selectMessagesForAgent(state, agentId);

  return {
    agent,
    messages,
  };
};
