/**
 * Tests for provider selectors
 * TDD: Write tests first, then implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { providersSlice } from '../../src/store/slices/providersSlice';
import type { RootState } from '../../src/store/selectors';
import {
  selectAllProviders,
  selectProviderByType,
  selectModelsForProvider,
  selectDefaultModel,
  selectProvidersLoading,
  selectProvidersError,
} from '../../src/store/selectors';
import type { ProviderInfo, AgentType } from '../../src/types';

const mockProviders: ProviderInfo[] = [
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
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        description: 'Most intelligent',
        contextWindow: 200000,
        capabilities: ['streaming', 'tool-use', 'vision'],
        isAvailable: true,
        isDefault: false,
        costTier: 'high' as const,
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
];

describe('Provider Selectors', () => {
  let store: ReturnType<typeof configureStore>;
  let state: RootState;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        providers: providersSlice.reducer,
        agents: (state = {}) => state,
        messages: (state = {}) => state,
        connection: (state = {}) => state,
      },
      preloadedState: {
        providers: {
          providers: mockProviders,
          loading: false,
          error: null,
        },
      } as any,
    });
    state = store.getState() as RootState;
  });

  describe('selectAllProviders', () => {
    it('should return all providers', () => {
      const result = selectAllProviders(state);
      expect(result).toEqual(mockProviders);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no providers', () => {
      const emptyState: RootState = {
        ...state,
        providers: {
          providers: [],
          loading: false,
          error: null,
        },
      };
      const result = selectAllProviders(emptyState);
      expect(result).toEqual([]);
    });
  });

  describe('selectProviderByType', () => {
    it('should return provider for claude-code', () => {
      const result = selectProviderByType(state, 'claude-code');
      expect(result).toEqual(mockProviders[0]);
      expect(result?.type).toBe('claude-code');
    });

    it('should return provider for gemini-cli', () => {
      const result = selectProviderByType(state, 'gemini-cli');
      expect(result).toEqual(mockProviders[1]);
      expect(result?.type).toBe('gemini-cli');
    });

    it('should return undefined for non-existent provider', () => {
      const result = selectProviderByType(state, 'non-existent' as AgentType);
      expect(result).toBeUndefined();
    });
  });

  describe('selectModelsForProvider', () => {
    it('should return models for claude-code', () => {
      const result = selectModelsForProvider(state, 'claude-code');
      expect(result).toEqual(mockProviders[0].models);
      expect(result).toHaveLength(2);
    });

    it('should return models for gemini-cli', () => {
      const result = selectModelsForProvider(state, 'gemini-cli');
      expect(result).toEqual(mockProviders[1].models);
      expect(result).toHaveLength(1);
    });

    it('should return empty array for non-existent provider', () => {
      const result = selectModelsForProvider(state, 'non-existent' as AgentType);
      expect(result).toEqual([]);
    });
  });

  describe('selectDefaultModel', () => {
    it('should return default model for claude-code', () => {
      const result = selectDefaultModel(state, 'claude-code');
      expect(result).toEqual(mockProviders[0].models[0]);
      expect(result?.isDefault).toBe(true);
      expect(result?.id).toBe('claude-sonnet-4-5-20250929');
    });

    it('should return default model for gemini-cli', () => {
      const result = selectDefaultModel(state, 'gemini-cli');
      expect(result).toEqual(mockProviders[1].models[0]);
      expect(result?.isDefault).toBe(true);
      expect(result?.id).toBe('gemini-pro');
    });

    it('should return undefined for non-existent provider', () => {
      const result = selectDefaultModel(state, 'non-existent' as AgentType);
      expect(result).toBeUndefined();
    });

    it('should return first model if no default is marked', () => {
      // Create state with no default models
      const modifiedProviders = [
        {
          ...mockProviders[0],
          models: mockProviders[0].models.map((m) => ({ ...m, isDefault: false })),
        },
      ];
      const modifiedState: RootState = {
        ...state,
        providers: {
          providers: modifiedProviders,
          loading: false,
          error: null,
        },
      };

      const result = selectDefaultModel(modifiedState, 'claude-code');
      expect(result).toEqual(modifiedProviders[0].models[0]);
    });

    it('should return undefined if provider has no models', () => {
      const emptyModelsProvider = [
        {
          ...mockProviders[0],
          models: [],
        },
      ];
      const modifiedState: RootState = {
        ...state,
        providers: {
          providers: emptyModelsProvider,
          loading: false,
          error: null,
        },
      };

      const result = selectDefaultModel(modifiedState, 'claude-code');
      expect(result).toBeUndefined();
    });
  });

  describe('selectProvidersLoading', () => {
    it('should return false when not loading', () => {
      const result = selectProvidersLoading(state);
      expect(result).toBe(false);
    });

    it('should return true when loading', () => {
      const loadingState: RootState = {
        ...state,
        providers: {
          ...state.providers,
          loading: true,
        },
      };
      const result = selectProvidersLoading(loadingState);
      expect(result).toBe(true);
    });
  });

  describe('selectProvidersError', () => {
    it('should return null when no error', () => {
      const result = selectProvidersError(state);
      expect(result).toBe(null);
    });

    it('should return error message when error exists', () => {
      const errorState: RootState = {
        ...state,
        providers: {
          ...state.providers,
          error: 'Failed to load providers',
        },
      };
      const result = selectProvidersError(errorState);
      expect(result).toBe('Failed to load providers');
    });
  });
});
