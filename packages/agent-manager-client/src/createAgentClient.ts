/**
 * Agent Client Factory
 * Main entry point for creating configured agent management client
 */

import { configureStore } from '@reduxjs/toolkit';
import { io } from 'socket.io-client';
import { agentsSlice } from './store/slices/agentsSlice';
import { messagesSlice } from './store/slices/messagesSlice';
import { connectionSlice } from './store/slices/connectionSlice';
import { createWebSocketMiddleware } from './store/middleware/websocketMiddleware';
import { AgentApiClient } from './api/AgentApiClient';
import * as selectors from './store/selectors';
import type { AgentClientConfig } from './types';

// Re-export actions for convenience
import {
  agentAdded,
  agentStatusUpdated,
  agentSelected,
  agentRemoved,
  fetchAgents,
  launchAgent,
  terminateAgent,
} from './store/slices/agentsSlice';

import {
  messageReceived,
  messagesCleared,
  fetchMessages,
  fetchMessagesSince,
} from './store/slices/messagesSlice';

import {
  connected,
  disconnected,
  connectionError,
  reconnecting,
  agentSubscribed,
  agentUnsubscribed,
} from './store/slices/connectionSlice';

/**
 * Create a configured agent management client
 * This is the main entry point for consumers
 *
 * @param config - Client configuration
 * @returns Configured client with store, actions, and selectors
 *
 * @example
 * ```typescript
 * const client = createAgentClient({
 *   apiUrl: 'http://localhost:3000',
 *   websocketUrl: 'http://localhost:3000',
 *   headers: {
 *     Authorization: 'Bearer token',
 *   },
 * });
 *
 * // Use in React
 * <Provider store={client.store}>
 *   <App />
 * </Provider>
 *
 * // Dispatch actions
 * client.store.dispatch(client.actions.launchAgent({ ... }));
 *
 * // Use selectors
 * const agents = client.selectors.selectAllAgents(client.store.getState());
 * ```
 */
export function createAgentClient(config: AgentClientConfig) {
  // Configure API client
  AgentApiClient.configure({
    baseUrl: config.apiUrl,
    headers: config.headers,
  });

  // Create WebSocket connection
  const socket = io(config.websocketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  // Create Redux store with WebSocket middleware
  const store = configureStore({
    reducer: {
      agents: agentsSlice.reducer,
      messages: messagesSlice.reducer,
      connection: connectionSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(createWebSocketMiddleware(socket)),
    devTools: config.debug !== false, // Enable Redux DevTools by default
  });

  // Return configured client
  return {
    /**
     * Redux store - use with React Provider
     */
    store,

    /**
     * All actions (sync and async)
     */
    actions: {
      // Agent actions
      agentAdded,
      agentStatusUpdated,
      agentSelected,
      agentRemoved,
      fetchAgents,
      launchAgent,
      terminateAgent,

      // Message actions
      messageReceived,
      messagesCleared,
      fetchMessages,
      fetchMessagesSince,

      // Connection actions
      connected,
      disconnected,
      connectionError,
      reconnecting,
      agentSubscribed,
      agentUnsubscribed,
    },

    /**
     * All selectors
     */
    selectors: {
      ...selectors,
    },

    /**
     * WebSocket instance (for advanced use cases)
     */
    socket,
  };
}

/**
 * Type of the client returned by createAgentClient
 */
export type AgentClient = ReturnType<typeof createAgentClient>;
