/**
 * Unit Tests: Sidebar Component
 *
 * TDD Test for ConnectionStatus Integration
 * This test was written FIRST (RED phase) before implementing the fix
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Sidebar } from '@/components/Sidebar';
import { agentsSlice, connectionSlice, providersSlice } from '@headless-agent-manager/client';

describe('Sidebar Component', () => {
  const createMockStore = (initialState = {}) => {
    return configureStore({
      reducer: {
        agents: agentsSlice.reducer,
        connection: connectionSlice.reducer,
        providers: providersSlice.reducer,
      },
      preloadedState: {
        agents: {
          agents: [],
          selectedAgentId: null,
          status: 'idle',
          error: null,
          ...initialState.agents,
        },
        connection: {
          isConnected: true,
          connectionId: 'test-connection-id',
          reconnectAttempts: 0,
          ...initialState.connection,
        },
        providers: {
          providers: [],
          status: 'idle',
          error: null,
          ...initialState.providers,
        },
      },
    });
  };

  it('should render connection status indicator at bottom of sidebar', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <Sidebar
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={() => {}}
        />
      </Provider>
    );

    // Should show connection status text
    // Using regex to be case-insensitive
    const connectionStatus = screen.getByText(/connected/i);
    expect(connectionStatus).toBeInTheDocument();
  });

  it('should show "Connected" when WebSocket is connected', () => {
    const store = createMockStore({
      connection: { isConnected: true },
    });

    render(
      <Provider store={store}>
        <Sidebar
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={() => {}}
        />
      </Provider>
    );

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it('should show "Disconnected" when WebSocket is not connected', () => {
    const store = createMockStore({
      connection: { isConnected: false, reconnectAttempts: 0 },
    });

    render(
      <Provider store={store}>
        <Sidebar
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={() => {}}
        />
      </Provider>
    );

    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });

  it('should render active agents section', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <Sidebar
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={() => {}}
        />
      </Provider>
    );

    // Use more specific matcher (with count)
    expect(screen.getByText(/Active Agents \(0\)/i)).toBeInTheDocument();
  });

  it('should render historic agents section', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <Sidebar
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={() => {}}
        />
      </Provider>
    );

    // Use more specific matcher (with count)
    expect(screen.getByText(/Historic Agents \(0\)/i)).toBeInTheDocument();
  });

  it('should render launch form', () => {
    const store = createMockStore();

    render(
      <Provider store={store}>
        <Sidebar
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={() => {}}
        />
      </Provider>
    );

    // Launch form should be present (use more specific ID selector)
    const promptInput = screen.getByPlaceholderText(/Enter your prompt/i);
    expect(promptInput).toBeInTheDocument();
  });
});
