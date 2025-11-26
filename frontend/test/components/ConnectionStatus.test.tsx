import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { createMockStore } from '@headless-agent-manager/client/testing';
import { connected, disconnected, reconnecting } from '@headless-agent-manager/client';

/**
 * ConnectionStatus Component Tests
 * Tests for WebSocket connection status display
 */
describe('ConnectionStatus', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
  });

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<Provider store={store}>{ui}</Provider>);
  };

  describe('Connection state display', () => {
    it('should show connected status when WebSocket is connected', () => {
      // Dispatch connected action
      store.dispatch(connected({ connectionId: 'test-connection-id' }));

      renderWithProvider(<ConnectionStatus />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should show disconnected status when WebSocket is disconnected', () => {
      // Dispatch disconnected action
      store.dispatch(disconnected());

      renderWithProvider(<ConnectionStatus />);

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('should show reconnecting status during reconnection', () => {
      // Dispatch reconnecting action (attempt 1)
      store.dispatch(reconnecting({ attempt: 1 }));

      renderWithProvider(<ConnectionStatus />);

      expect(screen.getByText(/Reconnecting/i)).toBeInTheDocument();
    });
  });

  describe('Visual indicators', () => {
    it('should show green indicator when connected', () => {
      store.dispatch(connected({ connectionId: 'test-id' }));

      renderWithProvider(<ConnectionStatus />);

      const indicator = screen.getByTestId('connection-indicator');
      expect(indicator).toHaveStyle({ backgroundColor: expect.stringMatching(/#28a745/i) });
    });

    it('should show red indicator when disconnected', () => {
      store.dispatch(disconnected());

      renderWithProvider(<ConnectionStatus />);

      const indicator = screen.getByTestId('connection-indicator');
      expect(indicator).toHaveStyle({ backgroundColor: expect.stringMatching(/#dc3545/i) });
    });

    it('should show orange indicator when reconnecting', () => {
      store.dispatch(reconnecting({ attempt: 1 }));

      renderWithProvider(<ConnectionStatus />);

      const indicator = screen.getByTestId('connection-indicator');
      expect(indicator).toHaveStyle({ backgroundColor: expect.stringMatching(/#ffc107/i) });
    });
  });

  describe('Connection details', () => {
    it('should show connection ID when connected', () => {
      store.dispatch(connected({ connectionId: 'abc123' }));

      renderWithProvider(<ConnectionStatus />);

      expect(screen.getByText(/abc123/i)).toBeInTheDocument();
    });

    it('should show reconnection attempt count', () => {
      // Dispatch reconnecting action multiple times
      store.dispatch(reconnecting({ attempt: 1 }));
      store.dispatch(reconnecting({ attempt: 2 }));
      store.dispatch(reconnecting({ attempt: 3 }));

      renderWithProvider(<ConnectionStatus />);

      expect(screen.getByText(/Attempt 3/i)).toBeInTheDocument();
    });

    it('should not show connection details when collapsed', () => {
      store.dispatch(connected({ connectionId: 'abc123' }));

      renderWithProvider(<ConnectionStatus collapsed={true} />);

      expect(screen.queryByText(/abc123/i)).not.toBeInTheDocument();
    });
  });

  describe('Compact mode', () => {
    it('should render in compact mode', () => {
      store.dispatch(connected({ connectionId: 'test-id' }));

      renderWithProvider(<ConnectionStatus compact={true} />);

      // Should have status indicator
      const indicator = screen.getByTestId('connection-indicator');
      expect(indicator).toBeInTheDocument();

      // Should have text
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });
  });
});
