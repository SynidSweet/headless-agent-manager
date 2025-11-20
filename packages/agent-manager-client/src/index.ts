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
} from './types';

// Slices (for advanced usage)
export { agentsSlice } from './store/slices/agentsSlice';
export { messagesSlice } from './store/slices/messagesSlice';
export { connectionSlice } from './store/slices/connectionSlice';

// State interfaces
export type { AgentsState } from './store/slices/agentsSlice';
export type { MessagesState } from './store/slices/messagesSlice';
export type { ConnectionState } from './store/slices/connectionSlice';
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

// Selectors
export {
  selectAllAgents,
  selectAgentById,
  selectSelectedAgent,
  selectRunningAgents,
  selectCompletedAgents,
  selectFailedAgents,
  selectMessagesForAgent,
  selectMessagesForSelectedAgent,
  selectLastSequenceForAgent,
  selectIsConnected,
  selectConnectionId,
  selectConnectionError,
  selectSubscribedAgents,
  selectReconnectAttempts,
  selectAgentWithMessages,
} from './store/selectors';

// Middleware (for advanced usage)
export { createWebSocketMiddleware } from './store/middleware/websocketMiddleware';

// API Client (for advanced usage)
export { AgentApiClient } from './api/AgentApiClient';
