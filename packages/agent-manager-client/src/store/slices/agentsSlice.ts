/**
 * Agents Slice
 * Redux slice for managing agent state
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { Agent, LaunchAgentRequest, LaunchAgentResponse } from '../../types';
import { AgentApiClient } from '../../api/AgentApiClient';

/**
 * State interface for agents
 */
export interface AgentsState {
  // Normalized state for efficiency
  byId: Record<string, Agent>;
  allIds: string[];

  // Selection
  selectedAgentId: string | null;

  // Track pending launch for auto-selection
  pendingLaunchId: string | null;

  // UI state
  loading: boolean;
  error: string | null;

  // Metadata
  lastFetched: string | null;
}

const initialState: AgentsState = {
  byId: {},
  allIds: [],
  selectedAgentId: null,
  pendingLaunchId: null,
  loading: false,
  error: null,
  lastFetched: null,
};

/**
 * Async thunks for API operations
 */

export const fetchAgents = createAsyncThunk(
  'agents/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      return await AgentApiClient.getAllAgents();
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const launchAgent = createAsyncThunk<LaunchAgentResponse, LaunchAgentRequest>(
  'agents/launch',
  async (params: LaunchAgentRequest) => {
    return await AgentApiClient.launchAgent(params);
  }
);

export const terminateAgent = createAsyncThunk(
  'agents/terminate',
  async (agentId: string) => {
    await AgentApiClient.terminateAgent(agentId);
    return agentId;
  }
);

/**
 * Agents slice
 */
export const agentsSlice = createSlice({
  name: 'agents',
  initialState,
  reducers: {
    /**
     * Synchronous actions (typically from WebSocket events)
     */

    agentAdded: (state, action: PayloadAction<Agent>) => {
      const agent = action.payload;
      state.byId[agent.id] = agent;
      if (!state.allIds.includes(agent.id)) {
        state.allIds.push(agent.id);
      }
    },

    agentStatusUpdated: (
      state,
      action: PayloadAction<{ agentId: string; status: string }>
    ) => {
      const { agentId, status } = action.payload;
      if (state.byId[agentId]) {
        state.byId[agentId].status = status as any;
      }
    },

    agentSelected: (state, action: PayloadAction<string | null>) => {
      state.selectedAgentId = action.payload;
    },

    agentRemoved: (state, action: PayloadAction<string>) => {
      const agentId = action.payload;
      delete state.byId[agentId];
      state.allIds = state.allIds.filter((id) => id !== agentId);

      // Deselect if this agent was selected
      if (state.selectedAgentId === agentId) {
        state.selectedAgentId = null;
      }
    },

    /**
     * PHASE 2: Lifecycle Event Reducers
     * These handle WebSocket events from the backend
     */

    // Handle agent:created event from backend
    agentCreated: (state, action: PayloadAction<Agent>) => {
      const agent = action.payload;
      state.byId[agent.id] = agent;
      if (!state.allIds.includes(agent.id)) {
        state.allIds.push(agent.id);
      }
      console.log('[Redux] Agent created via lifecycle event:', agent.id);

      // If this is the agent we're waiting for, ensure it's selected and clear pending
      if (state.pendingLaunchId === agent.id) {
        state.selectedAgentId = agent.id;
        state.pendingLaunchId = null;
        console.log('[Redux] Auto-selected newly launched agent:', agent.id);
      }
    },

    // Handle agent:updated event from backend
    agentUpdated: (
      state,
      action: PayloadAction<{ agentId: string; status: string }>
    ) => {
      const { agentId, status } = action.payload;
      if (state.byId[agentId]) {
        state.byId[agentId].status = status as any;
        console.log('[Redux] Agent updated via lifecycle event:', agentId, status);
      }
    },

    // Handle agent:deleted event from backend
    agentDeleted: (state, action: PayloadAction<string>) => {
      const agentId = action.payload;
      delete state.byId[agentId];
      state.allIds = state.allIds.filter((id) => id !== agentId);

      // Deselect if this agent was selected
      if (state.selectedAgentId === agentId) {
        state.selectedAgentId = null;
      }
      console.log('[Redux] Agent deleted via lifecycle event:', agentId);
    },
  },

  extraReducers: (builder) => {
    /**
     * fetchAgents async thunk
     */
    builder.addCase(fetchAgents.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(fetchAgents.fulfilled, (state, action) => {
      state.loading = false;
      state.lastFetched = new Date().toISOString();

      // Merge agents from API with existing state (don't replace)
      action.payload.forEach((agent) => {
        state.byId[agent.id] = agent;
        if (!state.allIds.includes(agent.id)) {
          state.allIds.push(agent.id);
        }
      });

      // DON'T remove agents that aren't in backend response!
      // This prevents race condition where fetchAgents() runs before
      // backend saves newly launched agent, wiping it from Redux.
      // Agents should only be removed via explicit actions (agentRemoved)
      // or WebSocket events when they're truly deleted.
    });

    builder.addCase(fetchAgents.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    /**
     * launchAgent async thunk
     * NOTE: We don't add the agent here - that happens via WebSocket 'agent:created' event
     * This follows event-driven architecture: HTTP for commands, WebSocket for state updates
     */
    builder.addCase(launchAgent.fulfilled, (state, action) => {
      const response = action.payload;
      // Mark this agent as pending launch for auto-selection when it arrives via WebSocket
      state.pendingLaunchId = response.agentId;
      // Also set selection immediately for instant feedback
      state.selectedAgentId = response.agentId;
    });

    builder.addCase(launchAgent.rejected, (state, action) => {
      // Clear pending launch on failure
      state.pendingLaunchId = null;
      state.error = action.error.message || 'Failed to launch agent';
    });

    /**
     * terminateAgent async thunk
     */
    builder.addCase(terminateAgent.fulfilled, (state, action) => {
      const agentId = action.payload;
      if (state.byId[agentId]) {
        state.byId[agentId].status = 'terminated';
      }
    });
  },
});

/**
 * Export actions
 */
export const {
  agentAdded,
  agentStatusUpdated,
  agentSelected,
  agentRemoved,
  // Phase 2: Lifecycle event actions
  agentCreated,
  agentUpdated,
  agentDeleted,
} = agentsSlice.actions;

/**
 * Export reducer
 */
export default agentsSlice.reducer;
