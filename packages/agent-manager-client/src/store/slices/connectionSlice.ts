/**
 * Connection Slice
 * Redux slice for managing WebSocket connection state
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * State interface for connection
 */
export interface ConnectionState {
  isConnected: boolean;
  connectionId: string | null;
  error: string | null;
  reconnectAttempts: number;
  subscribedAgents: string[];
}

const initialState: ConnectionState = {
  isConnected: false,
  connectionId: null,
  error: null,
  reconnectAttempts: 0,
  subscribedAgents: [],
};

/**
 * Connection slice
 */
export const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    /**
     * WebSocket connected
     */
    connected: (state, action: PayloadAction<{ connectionId: string }>) => {
      state.isConnected = true;
      state.connectionId = action.payload.connectionId;
      state.error = null;
      state.reconnectAttempts = 0;
    },

    /**
     * WebSocket disconnected
     */
    disconnected: (state) => {
      state.isConnected = false;
      state.connectionId = null;
    },

    /**
     * Connection error occurred
     */
    connectionError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },

    /**
     * Reconnection attempt
     */
    reconnecting: (state) => {
      state.reconnectAttempts += 1;
    },

    /**
     * Agent subscribed to receive messages
     */
    agentSubscribed: (state, action: PayloadAction<string>) => {
      if (!state.subscribedAgents.includes(action.payload)) {
        state.subscribedAgents.push(action.payload);
      }
    },

    /**
     * Agent unsubscribed
     */
    agentUnsubscribed: (state, action: PayloadAction<string>) => {
      state.subscribedAgents = state.subscribedAgents.filter(
        (id) => id !== action.payload
      );
    },
  },
});

/**
 * Export actions
 */
export const {
  connected,
  disconnected,
  connectionError,
  reconnecting,
  agentSubscribed,
  agentUnsubscribed,
} = connectionSlice.actions;

/**
 * Export reducer
 */
export default connectionSlice.reducer;
