/**
 * Messages Slice
 * Redux slice for managing agent messages with deduplication and gap detection
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { AgentMessage } from '../../types';
import { AgentApiClient } from '../../api/AgentApiClient';

/**
 * State interface for messages
 */
export interface MessagesState {
  // Normalized by agent ID
  byAgentId: Record<
    string,
    {
      messages: AgentMessage[];
      lastSequence: number;
      loading: boolean;
      error: string | null;
    }
  >;

  // Deduplication tracking (Set doesn't serialize, use object)
  messageIds: Record<string, boolean>;
}

const initialState: MessagesState = {
  byAgentId: {},
  messageIds: {},
};

/**
 * Async thunks for API operations
 */

export const fetchMessages = createAsyncThunk(
  'messages/fetchByAgent',
  async (agentId: string) => {
    return await AgentApiClient.getAgentMessages(agentId);
  }
);

export const fetchMessagesSince = createAsyncThunk(
  'messages/fetchSince',
  async ({ agentId, since }: { agentId: string; since: number }) => {
    return await AgentApiClient.getAgentMessagesSince(agentId, since);
  }
);

/**
 * Messages slice
 */
export const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    /**
     * Synchronous actions (typically from WebSocket events)
     */

    messageReceived: (
      state,
      action: PayloadAction<{ agentId: string; message: AgentMessage }>
    ) => {
      const { agentId, message } = action.payload;

      // Initialize agent messages if needed
      if (!state.byAgentId[agentId]) {
        state.byAgentId[agentId] = {
          messages: [],
          lastSequence: 0,
          loading: false,
          error: null,
        };
      }

      // Deduplication by ID
      if (state.messageIds[message.id]) {
        console.log('[messagesSlice] Duplicate message ignored:', message.id);
        return;
      }

      const agentMessages = state.byAgentId[agentId];

      // Gap detection (only for persisted messages with sequence > 0)
      if (
        message.sequenceNumber > 0 &&
        message.sequenceNumber > agentMessages.lastSequence + 1
      ) {
        console.warn('[messagesSlice] Gap detected. Expected:', agentMessages.lastSequence + 1, 'Got:', message.sequenceNumber);
        // Gap will be filled by fetchMessagesSince thunk
        // For now, still add the message (out of order)
      }

      // Add message
      agentMessages.messages.push(message);
      state.messageIds[message.id] = true;

      // Update sequence tracking (only for persisted messages)
      if (message.sequenceNumber > 0) {
        agentMessages.lastSequence = Math.max(
          agentMessages.lastSequence,
          message.sequenceNumber
        );
      }
    },

    messagesCleared: (state, action: PayloadAction<string>) => {
      const agentId = action.payload;
      if (state.byAgentId[agentId]) {
        // Clear messages but keep structure
        state.byAgentId[agentId].messages = [];
        state.byAgentId[agentId].lastSequence = 0;
      }
    },
  },

  extraReducers: (builder) => {
    /**
     * fetchMessages async thunk
     */
    builder.addCase(fetchMessages.pending, (state, action) => {
      const agentId = action.meta.arg;
      if (!state.byAgentId[agentId]) {
        state.byAgentId[agentId] = {
          messages: [],
          lastSequence: 0,
          loading: true,
          error: null,
        };
      } else {
        state.byAgentId[agentId].loading = true;
      }
    });

    builder.addCase(fetchMessages.fulfilled, (state, action) => {
      const agentId = action.meta.arg;
      const messages = action.payload;

      state.byAgentId[agentId].messages = messages;
      state.byAgentId[agentId].loading = false;

      // Track IDs and sequence
      messages.forEach((msg) => {
        state.messageIds[msg.id] = true;
      });

      if (messages.length > 0) {
        state.byAgentId[agentId].lastSequence =
          messages[messages.length - 1].sequenceNumber;
      }
    });

    builder.addCase(fetchMessages.rejected, (state, action) => {
      const agentId = action.meta.arg;
      state.byAgentId[agentId].loading = false;
      state.byAgentId[agentId].error =
        action.error.message || 'Failed to load messages';
    });

    /**
     * fetchMessagesSince async thunk (gap filling)
     */
    builder.addCase(fetchMessagesSince.fulfilled, (state, action) => {
      const { agentId } = action.meta.arg;
      const newMessages = action.payload;

      if (!state.byAgentId[agentId]) return;

      const agentMessages = state.byAgentId[agentId];

      // Merge new messages (deduplicate)
      newMessages.forEach((msg) => {
        if (!state.messageIds[msg.id]) {
          agentMessages.messages.push(msg);
          state.messageIds[msg.id] = true;
        }
      });

      // Sort by sequence number
      agentMessages.messages.sort(
        (a, b) => a.sequenceNumber - b.sequenceNumber
      );

      // Update last sequence
      if (newMessages.length > 0) {
        agentMessages.lastSequence = Math.max(
          agentMessages.lastSequence,
          ...newMessages.map((m) => m.sequenceNumber)
        );
      }
    });
  },
});

/**
 * Export actions
 */
export const { messageReceived, messagesCleared } = messagesSlice.actions;

/**
 * Export reducer
 */
export default messagesSlice.reducer;
