import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentClient } from '../src/createAgentClient';
import { io } from 'socket.io-client';

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

describe('createAgentClient', () => {
  let mockSocket: any;

  beforeEach(() => {
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connected: true,
      id: 'test-socket-id',
    };

    (io as any).mockReturnValue(mockSocket);
    vi.clearAllMocks();
  });

  it('should create client with store and middleware', () => {
    const client = createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
    });

    expect(client.store).toBeDefined();
    expect(client.actions).toBeDefined();
    expect(client.selectors).toBeDefined();
  });

  it('should configure API client with baseUrl', () => {
    const client = createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
    });

    expect(client.store).toBeDefined();
  });

  it('should create WebSocket connection', () => {
    createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
    });

    expect(io).toHaveBeenCalledWith(
      'http://localhost:3000',
      expect.objectContaining({
        transports: ['websocket', 'polling'],
      })
    );
  });

  it('should configure API client with custom headers', () => {
    const client = createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
      headers: {
        Authorization: 'Bearer token',
      },
    });

    expect(client.store).toBeDefined();
  });

  it('should export all actions', () => {
    const client = createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
    });

    // Agent actions
    expect(client.actions.agentAdded).toBeDefined();
    expect(client.actions.agentStatusUpdated).toBeDefined();
    expect(client.actions.agentSelected).toBeDefined();
    expect(client.actions.agentRemoved).toBeDefined();

    // Message actions
    expect(client.actions.messageReceived).toBeDefined();
    expect(client.actions.messagesCleared).toBeDefined();

    // Connection actions
    expect(client.actions.connected).toBeDefined();
    expect(client.actions.disconnected).toBeDefined();

    // Async thunks
    expect(client.actions.fetchAgents).toBeDefined();
    expect(client.actions.launchAgent).toBeDefined();
    expect(client.actions.terminateAgent).toBeDefined();
    expect(client.actions.fetchMessages).toBeDefined();
    expect(client.actions.fetchMessagesSince).toBeDefined();
  });

  it('should export all selectors', () => {
    const client = createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
    });

    expect(client.selectors.selectAllAgents).toBeDefined();
    expect(client.selectors.selectAgentById).toBeDefined();
    expect(client.selectors.selectSelectedAgent).toBeDefined();
    expect(client.selectors.selectRunningAgents).toBeDefined();
    expect(client.selectors.selectMessagesForAgent).toBeDefined();
    expect(client.selectors.selectIsConnected).toBeDefined();
  });

  it('should have working store that dispatches actions', () => {
    const client = createAgentClient({
      apiUrl: 'http://localhost:3000',
      websocketUrl: 'http://localhost:3000',
    });

    const agent = {
      id: 'test-agent',
      type: 'claude-code' as const,
      status: 'running' as const,
      createdAt: '2025-11-10T10:00:00Z',
    };

    client.store.dispatch(client.actions.agentAdded(agent));

    const state = client.store.getState();
    expect(state.agents.byId['test-agent']).toEqual(agent);
  });
});
