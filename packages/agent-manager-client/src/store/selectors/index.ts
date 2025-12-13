/**
 * Redux Selectors
 * Memoized selectors for efficient state access
 */

import { createSelector } from '@reduxjs/toolkit';
import type { Agent, AgentMessage, ProviderInfo, ModelInfo, AgentType } from '../../types';
import type { AgentsState } from '../slices/agentsSlice';
import type { MessagesState } from '../slices/messagesSlice';
import type { ConnectionState } from '../slices/connectionSlice';
import type { ProvidersState } from '../slices/providersSlice';
import { aggregateStreamingTokens } from '../../utils/messageAggregation';

/**
 * Constant empty arrays to avoid creating new references
 * This prevents unnecessary rerenders when selectors return empty results
 */
const EMPTY_ARRAY: AgentMessage[] = [];
const EMPTY_MODEL_ARRAY: ModelInfo[] = [];

/**
 * Root state interface
 * This will be used by consumers to type their store
 */
export interface RootState {
  agents: AgentsState;
  messages: MessagesState;
  connection: ConnectionState;
  providers: ProvidersState;
}

/**
 * Base selectors (direct state access)
 */
const selectAgentsState = (state: RootState) => state.agents;
const selectMessagesState = (state: RootState) => state.messages;
const selectConnectionState = (state: RootState) => state.connection;
const selectProvidersState = (state: RootState) => state.providers;

/**
 * Agent selectors
 */

export const selectAllAgents = createSelector(
  [selectAgentsState],
  (agentsState): Agent[] => {
    return agentsState.allIds.map((id) => agentsState.byId[id]);
  }
);

export const selectAgentById = createSelector(
  [
    (state: RootState) => state.agents.byId,
    (_state: RootState, agentId: string) => agentId,
  ],
  (byId, agentId): Agent | undefined => {
    return byId[agentId];
  }
);

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

/**
 * Select aggregated messages for a specific agent (RECOMMENDED).
 *
 * **Automatically handles:**
 * - ✅ Streaming token aggregation (typing effect)
 * - ✅ Duplicate complete message removal
 * - ✅ Proper message ordering
 *
 * **Use this for UI display!** This selector aggregates individual streaming
 * tokens into complete messages and removes duplicate complete messages sent
 * by the Claude CLI after streaming completes.
 *
 * @param state - Redux root state
 * @param agentId - The agent ID to fetch messages for
 * @returns Aggregated messages ready for UI display (no duplicates)
 *
 * @example
 * ```tsx
 * const messages = useSelector((state) =>
 *   selectAggregatedMessagesForAgent(state, agentId)
 * );
 *
 * return messages.map(msg => <Message key={msg.id} {...msg} />);
 * ```
 *
 * **Why aggregation matters:**
 * Claude CLI sends messages in two forms:
 * 1. Streaming tokens: "H" "e" "l" "l" "o" (as they're typed)
 * 2. Complete message: "Hello" (after streaming finishes)
 *
 * Without aggregation, your UI shows: "H" "e" "l" "l" "o" "Hello" (duplicates!)
 * With aggregation, your UI shows: "Hello" (1 clean message)
 */
export const selectAggregatedMessagesForAgent = createSelector(
  [
    (state: RootState) => state.messages.byAgentId,
    (_state: RootState, agentId: string) => agentId,
  ],
  (byAgentId, agentId): AgentMessage[] => {
    const agentMessages = byAgentId[agentId];
    const rawMessages = agentMessages?.messages || EMPTY_ARRAY;
    return aggregateStreamingTokens(rawMessages);
  }
);

/**
 * Select aggregated messages for the currently selected agent (RECOMMENDED).
 *
 * **Automatically handles:**
 * - ✅ Streaming token aggregation (typing effect)
 * - ✅ Duplicate complete message removal
 * - ✅ Proper message ordering
 *
 * **Use this for UI display!** Convenience selector that combines agent
 * selection with message aggregation.
 *
 * @param state - Redux root state
 * @returns Aggregated messages for selected agent (no duplicates)
 *
 * @example
 * ```tsx
 * const messages = useSelector(selectAggregatedMessagesForSelectedAgent);
 *
 * return messages.map(msg => <Message key={msg.id} {...msg} />);
 * ```
 */
export const selectAggregatedMessagesForSelectedAgent = createSelector(
  [selectAgentsState, selectMessagesState],
  (agentsState, messagesState): AgentMessage[] => {
    if (!agentsState.selectedAgentId) return EMPTY_ARRAY;
    const agentMessages = messagesState.byAgentId[agentsState.selectedAgentId];
    const rawMessages = agentMessages?.messages || EMPTY_ARRAY;
    return aggregateStreamingTokens(rawMessages);
  }
);

/**
 * @deprecated Use selectAggregatedMessagesForAgent instead (same behavior)
 * @see selectAggregatedMessagesForAgent
 */
export const selectMessagesForAgent = selectAggregatedMessagesForAgent;

/**
 * @deprecated Use selectAggregatedMessagesForSelectedAgent instead (same behavior)
 * @see selectAggregatedMessagesForSelectedAgent
 */
export const selectMessagesForSelectedAgent = selectAggregatedMessagesForSelectedAgent;

/**
 * Select RAW messages WITHOUT aggregation or deduplication (ADVANCED).
 *
 * ⚠️ **WARNING**: This selector returns raw messages including individual
 * streaming tokens and complete messages separately. Using this will cause
 * **duplicate messages in your UI**!
 *
 * **Only use this if:**
 * - ✅ You're implementing custom aggregation logic
 * - ✅ You're debugging message flow
 * - ✅ You're testing the aggregation function
 * - ✅ You need access to streaming metadata (tokenCount, etc.)
 *
 * **For UI display, use**: `selectAggregatedMessagesForAgent`
 *
 * @example
 * ```tsx
 * // ❌ WRONG - Will show duplicates in UI!
 * const rawMessages = useSelector(state =>
 *   selectRawMessagesForAgent_UNSAFE(state, agentId)
 * );
 * // Result: ["H", "e", "l", "l", "o", "Hello"] <- duplicates!
 *
 * // ✅ CORRECT - For UI display
 * const messages = useSelector(state =>
 *   selectAggregatedMessagesForAgent(state, agentId)
 * );
 * // Result: ["Hello"] <- clean, deduplicated
 *
 * // ✅ VALID USE - Custom processing
 * const rawMessages = useSelector(state =>
 *   selectRawMessagesForAgent_UNSAFE(state, agentId)
 * );
 * const customProcessed = myCustomAggregation(rawMessages);
 * ```
 *
 * @param state - Redux root state
 * @param agentId - The agent ID to fetch messages for
 * @returns Raw messages array (includes streaming tokens, no deduplication)
 *
 * @internal For advanced use cases only
 * @see selectAggregatedMessagesForAgent for UI display
 */
export const selectRawMessagesForAgent_UNSAFE = createSelector(
  [
    (state: RootState) => state.messages.byAgentId,
    (_state: RootState, agentId: string) => agentId,
  ],
  (byAgentId, agentId): AgentMessage[] => {
    const agentMessages = byAgentId[agentId];
    return agentMessages?.messages || EMPTY_ARRAY;
  }
);

/**
 * Select RAW messages for selected agent WITHOUT aggregation (ADVANCED).
 *
 * ⚠️ **WARNING**: This selector returns raw messages including individual
 * streaming tokens and complete messages separately. Using this will cause
 * **duplicate messages in your UI**!
 *
 * **Only use this if:**
 * - ✅ You're implementing custom aggregation logic
 * - ✅ You're debugging message flow
 * - ✅ You're testing the aggregation function
 * - ✅ You need access to streaming metadata
 *
 * **For UI display, use**: `selectAggregatedMessagesForSelectedAgent`
 *
 * @param state - Redux root state
 * @returns Raw messages for selected agent (includes tokens, no deduplication)
 *
 * @internal For advanced use cases only
 * @see selectAggregatedMessagesForSelectedAgent for UI display
 */
export const selectRawMessagesForSelectedAgent_UNSAFE = createSelector(
  [selectAgentsState, selectMessagesState],
  (agentsState, messagesState): AgentMessage[] => {
    const selectedId = agentsState.selectedAgentId;
    if (!selectedId) return EMPTY_ARRAY;
    const agentMessages = messagesState.byAgentId[selectedId];
    return agentMessages?.messages || EMPTY_ARRAY;
  }
);

export const selectLastSequenceForAgent = createSelector(
  [
    (state: RootState) => state.messages.byAgentId,
    (_state: RootState, agentId: string) => agentId,
  ],
  (byAgentId, agentId): number => {
    const agentMessages = byAgentId[agentId];
    return agentMessages?.lastSequence || 0;
  }
);

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
 * Provider selectors
 */

export const selectAllProviders = createSelector(
  [selectProvidersState],
  (providersState): ProviderInfo[] => {
    return providersState.providers;
  }
);

export const selectProviderByType = createSelector(
  [
    (state: RootState) => state.providers.providers,
    (_state: RootState, providerType: AgentType) => providerType,
  ],
  (providers, providerType): ProviderInfo | undefined => {
    return providers.find((p) => p.type === providerType);
  }
);

export const selectModelsForProvider = createSelector(
  [
    (state: RootState, providerType: AgentType) => selectProviderByType(state, providerType),
  ],
  (provider): ModelInfo[] => {
    return provider?.models || EMPTY_MODEL_ARRAY;
  }
);

export const selectDefaultModel = createSelector(
  [
    (state: RootState, providerType: AgentType) => selectModelsForProvider(state, providerType),
  ],
  (models): ModelInfo | undefined => {
    // Return default model or first model if no default
    return models.find((m) => m.isDefault) || models[0];
  }
);

export const selectProvidersLoading = createSelector(
  [selectProvidersState],
  (providersState): boolean => {
    return providersState.loading;
  }
);

export const selectProvidersError = createSelector(
  [selectProvidersState],
  (providersState): string | null => {
    return providersState.error;
  }
);

/**
 * Computed selectors (cross-slice)
 */

export const selectAgentWithMessages = createSelector(
  [
    (state: RootState, agentId: string) => selectAgentById(state, agentId),
    (state: RootState, agentId: string) => selectMessagesForAgent(state, agentId),
  ],
  (agent, messages) => ({
    agent,
    messages,
  })
);
