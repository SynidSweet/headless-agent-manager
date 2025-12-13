/**
 * @headless-agent-manager/client
 * Modular Redux state management for AI agent orchestration
 *
 * @example
 * ```typescript
 * import { createAgentClient } from '@headless-agent-manager/client';
 *
 * const client = createAgentClient({
 *   apiUrl: 'http://localhost:3000',
 *   websocketUrl: 'http://localhost:3000',
 * });
 *
 * export const store = client.store;
 * export const { actions, selectors } = client;
 * ```
 */

// Main factory function
export { createAgentClient } from './createAgentClient';
export type { AgentClient } from './createAgentClient';

// Types
export type {
  Agent,
  AgentType,
  AgentStatus,
  AgentMessage,
  AgentConfiguration,
  LaunchAgentRequest,
  LaunchAgentResponse,
  SessionInfo,
  AgentMessageEvent,
  AgentStatusEvent,
  AgentErrorEvent,
  AgentCompleteEvent,
  AgentClientConfig,
  // Provider types
  ProviderInfo,
  ModelInfo,
  ProviderCapabilities,
  ProvidersResponse,
  CostTier,
} from './types';

// Slices (for advanced usage)
export { agentsSlice } from './store/slices/agentsSlice';
export { messagesSlice } from './store/slices/messagesSlice';
export { connectionSlice } from './store/slices/connectionSlice';
export { providersSlice } from './store/slices/providersSlice';

// State interfaces
export type { AgentsState } from './store/slices/agentsSlice';
export type { MessagesState } from './store/slices/messagesSlice';
export type { ConnectionState } from './store/slices/connectionSlice';
export type { ProvidersState } from './store/slices/providersSlice';
export type { RootState } from './store/selectors';

// Actions (for advanced usage)
export {
  agentAdded,
  agentStatusUpdated,
  agentSelected,
  agentRemoved,
  fetchAgents,
  launchAgent,
  terminateAgent,
  // Phase 2: Lifecycle event actions
  agentCreated,
  agentUpdated,
  agentDeleted,
} from './store/slices/agentsSlice';

export {
  messageReceived,
  messagesCleared,
  fetchMessages,
  fetchMessagesSince,
} from './store/slices/messagesSlice';

export {
  connected,
  disconnected,
  connectionError,
  reconnecting,
  agentSubscribed,
  agentUnsubscribed,
} from './store/slices/connectionSlice';

export {
  fetchProviders,
  providersLoaded,
  providersLoadFailed,
} from './store/slices/providersSlice';

// Selectors
export {
  // Agent selectors
  selectAllAgents,
  selectAgentById,
  selectSelectedAgent,
  selectRunningAgents,
  selectCompletedAgents,
  selectFailedAgents,

  // Message selectors (RECOMMENDED - use these for UI display)
  selectAggregatedMessagesForAgent,
  selectAggregatedMessagesForSelectedAgent,

  // Deprecated aliases (backward compatibility)
  selectMessagesForAgent, // @deprecated Use selectAggregatedMessagesForAgent
  selectMessagesForSelectedAgent, // @deprecated Use selectAggregatedMessagesForSelectedAgent

  // Raw selectors (ADVANCED - for debugging/custom aggregation only)
  selectRawMessagesForAgent_UNSAFE,
  selectRawMessagesForSelectedAgent_UNSAFE,

  // Other message selectors
  selectLastSequenceForAgent,

  // Connection selectors
  selectIsConnected,
  selectConnectionId,
  selectConnectionError,
  selectSubscribedAgents,
  selectReconnectAttempts,

  // Provider selectors
  selectAllProviders,
  selectProviderByType,
  selectModelsForProvider,
  selectDefaultModel,
  selectProvidersLoading,
  selectProvidersError,

  // Combined selectors
  selectAgentWithMessages,
} from './store/selectors';

// Middleware (for advanced usage)
export { createWebSocketMiddleware } from './store/middleware/websocketMiddleware';

// API Client (for advanced usage)
export { AgentApiClient } from './api/AgentApiClient';

// Utilities
export { aggregateStreamingTokens } from './utils/messageAggregation';
