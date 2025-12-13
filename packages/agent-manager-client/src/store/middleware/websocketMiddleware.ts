/**
 * WebSocket Middleware
 * Bridges WebSocket events to Redux actions
 * This is the core integration piece for real-time updates
 */

import { Middleware } from '@reduxjs/toolkit';
import type { Socket } from 'socket.io-client';
import {
  connected,
  disconnected,
  agentSubscribed,
} from '../slices/connectionSlice';
import {
  agentAdded,
  agentStatusUpdated,
  // Phase 2: Lifecycle event actions
  agentCreated,
  agentUpdated,
  agentDeleted,
} from '../slices/agentsSlice';
import { messageReceived, fetchMessages, fetchMessagesSince } from '../slices/messagesSlice';
import type {
  AgentMessageEvent,
  AgentStatusEvent,
  AgentErrorEvent,
  AgentCompleteEvent,
} from '../../types';

/**
 * Creates WebSocket middleware that integrates Socket.IO with Redux
 * This middleware listens to WebSocket events and dispatches Redux actions
 *
 * @param socket - Socket.IO client instance
 * @returns Redux middleware
 */
export function createWebSocketMiddleware(socket: Socket): Middleware {
  return (store) => {
    // Set up WebSocket event listeners

    /**
     * Connection events
     *
     * PHASE 3: Added reconnection sync
     * When WebSocket reconnects, fetch latest state from backend to backfill any missed events
     */
    socket.on('connect', () => {
      const isReconnect = store.getState().connection?.isConnected === false;

      store.dispatch(connected({ connectionId: socket.id || 'unknown' }));

      // PHASE 3: On reconnect, sync state from backend
      if (isReconnect) {
        console.log('[WebSocketMiddleware] Reconnected - syncing state from backend');
        // Fetch latest agents to backfill any missed events
        import('../slices/agentsSlice').then(({ fetchAgents }) => {
          store.dispatch(fetchAgents() as any);
        });
      }
    });

    socket.on('disconnect', () => {
      store.dispatch(disconnected());
    });

    /**
     * Agent message events
     */
    socket.on('agent:message', (event: AgentMessageEvent) => {
      const { agentId, message } = event;

      // DIAGNOSTIC LOGGING
      console.log(`[WebSocketMiddleware] 📨 agent:message received`, {
        agentId,
        messageType: message?.type,
        contentPreview: typeof message?.content === 'string' ? message.content.substring(0, 50) : '[object]',
        sequenceNumber: message?.sequenceNumber,
        timestamp: new Date().toISOString(),
      });

      // Get current state to check for gaps
      const state = store.getState();
      const agentMessages = state.messages?.byAgentId?.[agentId];

      // Dispatch message to store
      store.dispatch(messageReceived({ agentId, message }));
      console.log(`[WebSocketMiddleware] ✅ Dispatched to Redux`);

      // Gap detection and auto-fill
      // Only for persisted messages (sequenceNumber > 0)
      if (message.sequenceNumber > 0 && agentMessages) {
        const lastSequence = agentMessages.lastSequence || 0;
        const expectedSequence = lastSequence + 1;

        // If there's a gap, auto-fill it
        if (message.sequenceNumber > expectedSequence) {
          console.log(
            `[WebSocketMiddleware] Gap detected for agent ${agentId}. Expected: ${expectedSequence}, Got: ${message.sequenceNumber}. Auto-filling...`
          );

          // Dispatch async thunk to fill gap
          store.dispatch(
            fetchMessagesSince({
              agentId,
              since: lastSequence,
            }) as any
          );
        }
      }
    });

    /**
     * Agent status events
     */
    socket.on('agent:status', (event: AgentStatusEvent) => {
      const { agentId, status } = event;
      store.dispatch(agentStatusUpdated({ agentId, status }));
    });

    /**
     * Agent error events
     */
    socket.on('agent:error', (event: AgentErrorEvent) => {
      const { agentId, error } = event;
      console.error(`[WebSocketMiddleware] Agent ${agentId} error:`, error);
      // Could dispatch an error action here if we add one to the slices
    });

    /**
     * Agent complete events
     */
    socket.on('agent:complete', (event: AgentCompleteEvent) => {
      const { agentId, result } = event;
      console.log(
        `[WebSocketMiddleware] Agent ${agentId} completed:`,
        result
      );
      // Update status to completed
      store.dispatch(agentStatusUpdated({ agentId, status: 'completed' }));
    });

    /**
     * EVENT-DRIVEN ARCHITECTURE: Lifecycle Events (Phase 2 - ACTIVATED!)
     * These events are emitted by the backend for all agent lifecycle changes.
     * All agent state updates now come from WebSocket events, not HTTP polling.
     */

    socket.on('agent:created', (event: any) => {
      console.log(`[WebSocketMiddleware] 🚀 LIFECYCLE EVENT: agent:created agentId=${event.agent?.id}`, event);
      console.log('[WebSocketMiddleware] event.agent data:', JSON.stringify(event.agent, null, 2));
      console.log('[WebSocketMiddleware] About to dispatch agentCreated action...');
      // PHASE 2: Dispatch to Redux!
      const action = agentCreated(event.agent);
      console.log('[WebSocketMiddleware] Created action:', action);
      store.dispatch(action);
      console.log('[WebSocketMiddleware] ✅ Action dispatched successfully');
    });

    socket.on('agent:updated', (event: any) => {
      console.log('[WebSocketMiddleware] 🔄 LIFECYCLE EVENT: agent:updated', event);
      // PHASE 2: Dispatch to Redux!
      store.dispatch(agentUpdated(event));
    });

    socket.on('agent:deleted', (event: any) => {
      console.log('[WebSocketMiddleware] 🗑️  LIFECYCLE EVENT: agent:deleted', event);
      // PHASE 2: Dispatch to Redux!
      store.dispatch(agentDeleted(event.agentId));
    });

    /**
     * Subscription confirmation event
     *
     * Backend emits 'subscribed' when a client successfully subscribes to an agent.
     * E2E tests wait for this event (via socket.on('subscribed')) to ensure
     * subscription is complete before testing message reception.
     *
     * This middleware listener is primarily for debugging - Socket.IO automatically
     * forwards the event to all registered listeners including E2E test helpers.
     */
    socket.on('subscribed', (event: { agentId: string; timestamp: string }) => {
      console.log('[WebSocketMiddleware] ✅ Subscription confirmed:', event);
      // Socket.IO automatically forwards this event to all listeners
      // No additional action needed - E2E tests receive it directly
    });

    // Return the middleware function
    return (next) => (action: any) => {
      // Handle actions that require WebSocket communication

      // When agent is selected, subscribe to its messages AND load history
      if (action.type === 'agents/agentSelected') {
        const agentId = action.payload;
        if (agentId) {
          console.log(`[WebSocketMiddleware] Agent selected: ${agentId}`);
          // Subscribe to WebSocket for real-time messages
          socket.emit('subscribe', { agentId });
          store.dispatch(agentSubscribed(agentId));
          // Load historical messages from API
          store.dispatch(fetchMessages(agentId) as any);
        }
      }

      // When agent is launched, auto-subscribe
      if (action.type === 'agents/launch/fulfilled') {
        const agentId = action.payload?.agentId; // LaunchAgentResponse uses 'agentId'
        if (agentId) {
          console.log(`[WebSocketMiddleware] Auto-subscribing to launched agent: ${agentId}`);
          socket.emit('subscribe', { agentId });
          store.dispatch(agentSubscribed(agentId));
          // Note: No need to fetchMessages here - new agents have no history yet
        }
      }

      // Pass all actions through
      return next(action);
    };
  };
}
