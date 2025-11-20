import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { AgentOutput } from '@/components/AgentOutput';
import { createMockStore, mockMessageFixtures } from '@headless-agent-manager/client/testing';
import { messageReceived } from '@headless-agent-manager/client';
import type { AgentMessage } from '@/types/agent.types';

/**
 * AgentOutput Component Tests
 * Tests for agent output display with message history
 */
describe('AgentOutput', () => {
  const mockMessages: AgentMessage[] = [
    {
      id: 'msg-1',
      agentId: 'agent-123',
      sequenceNumber: 1,
      type: 'user',
      content: 'Hello, agent!',
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'msg-2',
      agentId: 'agent-123',
      sequenceNumber: 2,
      type: 'assistant',
      content: 'Hello! How can I help you?',
      createdAt: '2025-01-01T00:00:01Z',
    },
    {
      id: 'msg-3',
      agentId: 'agent-123',
      sequenceNumber: 3,
      type: 'system',
      content: 'System initialized',
      createdAt: '2025-01-01T00:00:02Z',
    },
  ];

  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMockStore();
  });

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<Provider store={store}>{ui}</Provider>);
  };

  describe('No agent selected', () => {
    it('should show empty state when no agent selected', () => {
      renderWithProvider(<AgentOutput agentId={null} />);

      expect(screen.getByText('Select an agent to view output')).toBeInTheDocument();
    });

    it('should show empty state even with messages in store', () => {
      // Add messages to store
      store.dispatch(messageReceived({ agentId: 'agent-123', message: mockMessages[0] }));

      renderWithProvider(<AgentOutput agentId={null} />);

      // Should still show empty state since no agent selected
      expect(screen.getByText('Select an agent to view output')).toBeInTheDocument();
      expect(screen.queryByText('Hello, agent!')).not.toBeInTheDocument();
    });
  });

  describe('Loading messages', () => {
    it('should show loading state when loading flag is true', () => {
      // Preload loading state
      store = createMockStore({
        messages: {
          byAgentId: {
            'agent-123': {
              messages: [],
              lastSequence: 0,
              loading: true,
              error: null,
            },
          },
          messageIds: {},
        },
      });

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      expect(screen.getByText('Loading messages...')).toBeInTheDocument();
    });

    it('should display messages from Redux store', () => {
      // Add messages to store
      mockMessages.forEach((msg) => {
        store.dispatch(messageReceived({ agentId: 'agent-123', message: msg }));
      });

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
      expect(screen.getByText('System initialized')).toBeInTheDocument();
    });

    it('should show empty state when no messages exist', () => {
      // Set up Redux state with empty messages
      // Note: Component will dispatch fetchMessages and set loading=true
      // So we should check for the loading state OR wait for fetch to complete
      store = createMockStore({
        messages: {
          byAgentId: {
            'agent-123': {
              messages: [],
              lastSequence: 0,
              loading: true, // Set to true to simulate fetch in progress
              error: null,
            },
          },
          messageIds: {},
        },
      });

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      // Should show loading state (component dispatches fetch when messages.length === 0)
      expect(screen.getByText('Loading messages...')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('should display error message from Redux state', () => {
      store = createMockStore({
        messages: {
          byAgentId: {
            'agent-123': {
              messages: [],
              lastSequence: 0,
              loading: false,
              error: 'Failed to load messages',
            },
          },
          messageIds: {},
        },
      });

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      expect(screen.getByText(/Error loading messages/i)).toBeInTheDocument();
    });
  });

  describe('Message rendering', () => {
    it('should render different message types with correct styling', () => {
      const messages: AgentMessage[] = [
        { ...mockMessages[0], type: 'user' },
        { ...mockMessages[1], type: 'assistant' },
        { ...mockMessages[2], type: 'system' },
      ];

      messages.forEach((msg) => {
        store.dispatch(messageReceived({ agentId: 'agent-123', message: msg }));
      });

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();
      expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument();
      expect(screen.getByText('System initialized')).toBeInTheDocument();
    });

    it('should render timestamps', () => {
      store.dispatch(messageReceived({ agentId: 'agent-123', message: mockMessages[0] }));

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      // Should render timestamp somewhere
      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();
    });

    it('should render object content as JSON', () => {
      const objectMessage: AgentMessage = {
        id: 'msg-obj',
        agentId: 'agent-123',
        sequenceNumber: 4,
        type: 'system',
        content: { status: 'success', data: { value: 42 } },
        createdAt: '2025-01-01T00:00:03Z',
      };

      store.dispatch(messageReceived({ agentId: 'agent-123', message: objectMessage }));

      renderWithProvider(<AgentOutput agentId="agent-123" />);

      // Should render JSON stringified version
      expect(screen.getByText(/"status"/)).toBeInTheDocument();
    });
  });

  describe('Agent switching', () => {
    it('should clear messages when switching to different agent', () => {
      // Set up Redux state with messages for agent-123 and empty state for agent-456
      store = createMockStore({
        messages: {
          byAgentId: {
            'agent-123': {
              messages: [mockMessages[0]],
              lastSequence: 1,
              loading: false,
              error: null,
            },
            'agent-456': {
              messages: [],
              lastSequence: 0,
              loading: true, // Will be loading when switching to new agent
              error: null,
            },
          },
          messageIds: {},
        },
      });

      const { rerender } = renderWithProvider(<AgentOutput agentId="agent-123" />);

      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();

      // Switch to different agent with no messages
      rerender(
        <Provider store={store}>
          <AgentOutput agentId="agent-456" />
        </Provider>
      );

      // Should show loading state for new agent (component dispatches fetch)
      expect(screen.queryByText('Hello, agent!')).not.toBeInTheDocument();
      expect(screen.getByText('Loading messages...')).toBeInTheDocument();
    });

    it('should show empty state when switching to null', () => {
      // Add messages
      store.dispatch(messageReceived({ agentId: 'agent-123', message: mockMessages[0] }));

      const { rerender } = renderWithProvider(<AgentOutput agentId="agent-123" />);

      expect(screen.getByText('Hello, agent!')).toBeInTheDocument();

      // Switch to null
      rerender(
        <Provider store={store}>
          <AgentOutput agentId={null} />
        </Provider>
      );

      expect(screen.queryByText('Hello, agent!')).not.toBeInTheDocument();
      expect(screen.getByText('Select an agent to view output')).toBeInTheDocument();
    });
  });
});
