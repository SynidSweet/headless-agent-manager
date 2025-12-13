/**
 * Tests for providersSlice
 * TDD: Write tests first, then implementation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { providersSlice, fetchProviders } from '../../src/store/slices/providersSlice';
import type { ProvidersState } from '../../src/store/slices/providersSlice';
import { AgentApiClient } from '../../src/api/AgentApiClient';
import type { ProvidersResponse, ProviderInfo } from '../../src/types';

// Mock the API client
vi.mock('../../src/api/AgentApiClient', () => ({
  AgentApiClient: {
    configure: vi.fn(),
    getProviders: vi.fn(),
  },
}));

const mockProvidersResponse: ProvidersResponse = {
  totalCount: 2,
  providers: [
    {
      type: 'claude-code',
      name: 'Claude Code',
      description: 'Anthropic Claude Code CLI',
      isAvailable: true,
      capabilities: {
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: true,
        mcpSupport: true,
        modelSelection: true,
      },
      models: [
        {
          id: 'claude-sonnet-4-5-20250929',
          name: 'Claude Sonnet 4.5',
          description: 'Best for coding',
          contextWindow: 200000,
          capabilities: ['streaming', 'tool-use'],
          isAvailable: true,
          isDefault: true,
          costTier: 'medium' as const,
        },
      ],
    },
    {
      type: 'gemini-cli',
      name: 'Gemini CLI',
      description: 'Google Gemini CLI',
      isAvailable: false,
      capabilities: {
        streaming: false,
        multiTurn: true,
        toolUse: false,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: true,
      },
      models: [
        {
          id: 'gemini-pro',
          name: 'Gemini Pro',
          description: 'Google Gemini Pro',
          contextWindow: 32000,
          capabilities: ['multi-turn'],
          isAvailable: true,
          isDefault: true,
          costTier: 'low' as const,
        },
      ],
    },
  ],
};

describe('providersSlice', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        providers: providersSlice.reducer,
      },
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().providers;
      expect(state).toEqual({
        providers: [],
        loading: false,
        error: null,
      });
    });
  });

  describe('fetchProviders async thunk', () => {
    it('should set loading to true when pending', () => {
      const state: ProvidersState = {
        providers: [],
        loading: false,
        error: null,
      };

      const action = { type: fetchProviders.pending.type };
      const newState = providersSlice.reducer(state, action);

      expect(newState.loading).toBe(true);
      expect(newState.error).toBe(null);
    });

    it('should set providers and loading to false when fulfilled', async () => {
      (AgentApiClient.getProviders as any).mockResolvedValue(
        mockProvidersResponse
      );

      await store.dispatch(fetchProviders());
      const state = store.getState().providers;

      expect(state.loading).toBe(false);
      expect(state.error).toBe(null);
      expect(state.providers).toEqual(mockProvidersResponse.providers);
      expect(state.providers).toHaveLength(2);
    });

    it('should set error and loading to false when rejected', async () => {
      const errorMessage = 'Failed to fetch providers';
      (AgentApiClient.getProviders as any).mockRejectedValue(
        new Error(errorMessage)
      );

      await store.dispatch(fetchProviders());
      const state = store.getState().providers;

      expect(state.loading).toBe(false);
      expect(state.error).toBe(errorMessage);
      expect(state.providers).toEqual([]);
    });

    it('should call AgentApiClient.getProviders', async () => {
      (AgentApiClient.getProviders as any).mockResolvedValue(
        mockProvidersResponse
      );

      await store.dispatch(fetchProviders());

      expect(AgentApiClient.getProviders).toHaveBeenCalledTimes(1);
    });

    it('should preserve existing providers on fetch failure', async () => {
      const initialState: ProvidersState = {
        providers: mockProvidersResponse.providers,
        loading: false,
        error: null,
      };

      store = configureStore({
        reducer: {
          providers: providersSlice.reducer,
        },
        preloadedState: {
          providers: initialState,
        },
      });

      (AgentApiClient.getProviders as any).mockRejectedValue(
        new Error('Network error')
      );

      await store.dispatch(fetchProviders());
      const state = store.getState().providers;

      expect(state.providers).toEqual(mockProvidersResponse.providers);
      expect(state.error).toBe('Network error');
    });
  });

  describe('providersLoaded reducer', () => {
    it('should set providers when providersLoaded is dispatched', () => {
      const state: ProvidersState = {
        providers: [],
        loading: false,
        error: null,
      };

      const action = providersSlice.actions.providersLoaded(
        mockProvidersResponse.providers
      );
      const newState = providersSlice.reducer(state, action);

      expect(newState.providers).toEqual(mockProvidersResponse.providers);
    });

    it('should replace existing providers', () => {
      const state: ProvidersState = {
        providers: [mockProvidersResponse.providers[0]],
        loading: false,
        error: null,
      };

      const action = providersSlice.actions.providersLoaded(
        mockProvidersResponse.providers
      );
      const newState = providersSlice.reducer(state, action);

      expect(newState.providers).toEqual(mockProvidersResponse.providers);
      expect(newState.providers).toHaveLength(2);
    });
  });

  describe('providersLoadFailed reducer', () => {
    it('should set error when providersLoadFailed is dispatched', () => {
      const state: ProvidersState = {
        providers: [],
        loading: false,
        error: null,
      };

      const errorMessage = 'Failed to load providers';
      const action = providersSlice.actions.providersLoadFailed(errorMessage);
      const newState = providersSlice.reducer(state, action);

      expect(newState.error).toBe(errorMessage);
    });

    it('should preserve existing providers on error', () => {
      const state: ProvidersState = {
        providers: mockProvidersResponse.providers,
        loading: false,
        error: null,
      };

      const action = providersSlice.actions.providersLoadFailed('Error');
      const newState = providersSlice.reducer(state, action);

      expect(newState.providers).toEqual(mockProvidersResponse.providers);
      expect(newState.error).toBe('Error');
    });
  });
});
