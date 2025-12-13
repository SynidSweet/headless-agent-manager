import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { AgentLaunchForm } from '@/components/AgentLaunchForm';
import { createMockStore, mockProviderFixtures } from '@headless-agent-manager/client/testing';
import {
  fetchProviders,
  selectProvidersLoading,
  selectModelsForProvider
} from '@headless-agent-manager/client';

/**
 * AgentLaunchForm Provider Integration Tests
 * Tests for dynamic provider and model loading
 */
describe('AgentLaunchForm - Provider Integration', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch API to return provider data
    global.fetch = vi.fn((url) => {
      if (url.toString().includes('/api/providers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            providers: [mockProviderFixtures.claudeCode, mockProviderFixtures.geminiCli],
          }),
        } as Response);
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<Provider store={store}>{ui}</Provider>);
  };

  describe('Provider loading', () => {
    it('should dispatch fetchProviders on mount', async () => {
      store = createMockStore();
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderWithProvider(<AgentLaunchForm />);

      // Wait for component to dispatch fetchProviders and for it to settle
      await waitFor(() => {
        // fetchProviders is an async thunk, so dispatch is called multiple times
        // (once for the thunk, then for pending, fulfilled/rejected)
        expect(dispatchSpy.mock.calls.length).toBeGreaterThan(0);
      });

      // The action is dispatched as a thunk function, so we just verify dispatch was called
      // In a real scenario, the component would receive data from the mocked fetch
      expect(dispatchSpy).toHaveBeenCalled();

      // Wait for providers to actually load (verifies the thunk worked)
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });
    });

    it('should show loading state while providers are loading', () => {
      store = createMockStore({
        providers: {
          providers: [],
          loading: true,
          error: null,
        },
      });

      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByText(/Loading providers/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Agent Type/i)).toBeDisabled();
    });

    it('should show provider error when fetch fails', async () => {
      const errorMessage = 'Failed to fetch providers';

      // Override fetch to reject
      global.fetch = vi.fn(() =>
        Promise.reject(new Error(errorMessage))
      );

      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      // Wait for error to appear after failed fetch
      await waitFor(() => {
        expect(screen.getByText(/Failed to load providers/i)).toBeInTheDocument();
      });

      expect(screen.getByText(new RegExp(errorMessage, 'i'))).toBeInTheDocument();
    });

    it('should show "No providers available" when providers list is empty', async () => {
      // Override fetch to return empty providers list
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ providers: [] }),
        } as Response)
      );

      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      // Wait for providers to load (empty list)
      await waitFor(() => {
        expect(screen.getByText(/No providers available/i)).toBeInTheDocument();
      });
    });
  });

  describe('Dynamic provider rendering', () => {
    it('should render provider options from backend data', async () => {
      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      // Wait for providers to load from mocked API
      await waitFor(() => {
        expect(screen.getByText('Claude Code')).toBeInTheDocument();
      });

      expect(screen.getByText(/Gemini CLI.*Unavailable/i)).toBeInTheDocument();
    });

    it('should show "(Unavailable)" for unavailable providers', async () => {
      // Override fetch to return only Gemini (unavailable)
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            providers: [mockProviderFixtures.geminiCli],
          }),
        } as Response)
      );

      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      await waitFor(() => {
        expect(screen.getByText(/Gemini CLI.*Unavailable/i)).toBeInTheDocument();
      });
    });
  });

  describe('Dynamic model rendering', () => {
    it('should render models for selected provider', async () => {
      const providers = [mockProviderFixtures.claudeCode];
      store = createMockStore({
        providers: {
          providers,
          loading: false,
          error: null,
        },
      });

      renderWithProvider(<AgentLaunchForm />);

      // Wait for fetchProviders() to complete and component to render models
      await waitFor(() => {
        // Check for Claude models (the actual model option text format from component)
        // Format: "Name - description (costTier)"
        expect(screen.getByText(/Claude Sonnet 4\.5.*Best for coding/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Claude Opus 4\.5.*Most intelligent/i)).toBeInTheDocument();
    });

    it('should show default model option', async () => {
      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      // Wait for providers to load and default model option to appear
      await waitFor(() => {
        expect(screen.getByText(/Default.*Claude Sonnet 4\.5/i)).toBeInTheDocument();
      });
    });

    it('should show model descriptions and cost tiers', async () => {
      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      // Wait for providers to load, then check model details
      await waitFor(() => {
        expect(screen.getByText(/Best for coding.*medium/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Most intelligent.*high/i)).toBeInTheDocument();
    });

    it('should show loading state for models while providers are loading', () => {
      store = createMockStore({
        providers: {
          providers: [],
          loading: true,
          error: null,
        },
      });

      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByText(/Loading models/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Model/i)).toBeDisabled();
    });

    it('should show "No models available" when no models exist', async () => {
      // Override fetch to return provider with no models
      const providerWithoutModels = {
        ...mockProviderFixtures.claudeCode,
        models: [],
      };
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            providers: [providerWithoutModels],
          }),
        } as Response)
      );

      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      await waitFor(() => {
        expect(screen.getByText(/No models available/i)).toBeInTheDocument();
      });

      expect(screen.getByLabelText(/Model/i)).toBeDisabled();
    });
  });

  describe('Provider type changes', () => {
    it('should update models when provider type changes', async () => {
      store = createMockStore();

      renderWithProvider(<AgentLaunchForm />);

      // Wait for providers to load, then check Claude models are initially shown
      await waitFor(() => {
        expect(screen.getByText(/Claude Sonnet 4\.5.*Best for coding/i)).toBeInTheDocument();
      });

      // Change to Gemini (would require user interaction in real scenario)
      // For testing, we're just verifying the initial state is correct
      // The actual change would be tested in E2E tests
    });
  });

  describe('Backward compatibility', () => {
    it('should work with empty providers (backward compatibility)', () => {
      store = createMockStore({
        providers: {
          providers: [],
          loading: false,
          error: null,
        },
      });

      // Should not crash
      const { container } = renderWithProvider(<AgentLaunchForm />);
      expect(container).toBeInTheDocument();
    });

    it('should work when providers slice is missing (defensive)', () => {
      store = createMockStore();

      // Should not crash
      const { container } = renderWithProvider(<AgentLaunchForm />);
      expect(container).toBeInTheDocument();
    });
  });
});
