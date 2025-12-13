/**
 * Providers Slice
 * Redux slice for managing provider state (agent types and their models)
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ProviderInfo } from '../../types';
import { AgentApiClient } from '../../api/AgentApiClient';

/**
 * State interface for providers
 */
export interface ProvidersState {
  providers: ProviderInfo[];
  loading: boolean;
  error: string | null;
}

const initialState: ProvidersState = {
  providers: [],
  loading: false,
  error: null,
};

/**
 * Async thunk for fetching providers from API
 */
export const fetchProviders = createAsyncThunk(
  'providers/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await AgentApiClient.getProviders();
      return response.providers;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

/**
 * Providers slice
 */
export const providersSlice = createSlice({
  name: 'providers',
  initialState,
  reducers: {
    /**
     * Synchronous action to load providers (e.g., from cache)
     */
    providersLoaded: (state, action: PayloadAction<ProviderInfo[]>) => {
      state.providers = action.payload;
    },

    /**
     * Synchronous action to set error
     */
    providersLoadFailed: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },

  extraReducers: (builder) => {
    /**
     * fetchProviders async thunk
     */
    builder.addCase(fetchProviders.pending, (state) => {
      state.loading = true;
      state.error = null;
    });

    builder.addCase(fetchProviders.fulfilled, (state, action) => {
      state.loading = false;
      state.providers = action.payload;
      state.error = null;
    });

    builder.addCase(fetchProviders.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
      // Preserve existing providers on error
    });
  },
});

/**
 * Export actions
 */
export const { providersLoaded, providersLoadFailed } = providersSlice.actions;

/**
 * Export reducer
 */
export default providersSlice.reducer;
