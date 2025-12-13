/**
 * Testing Utilities
 * Helpers for consumers to test their code that uses this client
 */

import { configureStore } from '@reduxjs/toolkit';
import { agentsSlice } from '../store/slices/agentsSlice';
import { messagesSlice } from '../store/slices/messagesSlice';
import { connectionSlice } from '../store/slices/connectionSlice';
import { providersSlice } from '../store/slices/providersSlice';
import type { RootState } from '../store/selectors';
import type { Agent, AgentMessage, ProviderInfo } from '../types';

/**
 * Create a mock Redux store for testing
 * Useful for testing components that use the agent client
 */
export function createMockStore(preloadedState?: any) {
  const reducers = {
    agents: agentsSlice.reducer,
    messages: messagesSlice.reducer,
    connection: connectionSlice.reducer,
    providers: providersSlice.reducer,
  };

  return configureStore({
    reducer: reducers,
    ...(preloadedState && { preloadedState }),
  });
}

/**
 * Mock WebSocket for testing
 * Allows triggering WebSocket events in tests
 */
export function createMockWebSocket() {
  const eventHandlers: Record<string, Array<(data?: any) => void>> = {};

  return {
    id: 'mock-socket-id',
    connected: true,

    on: (event: string, handler: (data?: any) => void) => {
      if (!eventHandlers[event]) {
        eventHandlers[event] = [];
      }
      eventHandlers[event].push(handler);
    },

    off: (event: string, handler?: (data?: any) => void) => {
      if (!handler) {
        delete eventHandlers[event];
      } else {
        eventHandlers[event] = eventHandlers[event]?.filter((h) => h !== handler) || [];
      }
    },

    emit: (event: string, data?: any) => {
      // Mock emit - doesn't actually send
    },

    trigger: (event: string, data?: any) => {
      // Trigger event handlers for testing
      eventHandlers[event]?.forEach((handler) => handler(data));
    },

    disconnect: () => {
      // Mock disconnect
    },

    connect: () => {
      // Mock connect
    },
  };
}

/**
 * Mock agent fixtures for testing
 */
export const mockAgentFixtures = {
  running: {
    id: 'mock-agent-running',
    type: 'claude-code' as const,
    status: 'running' as const,
    createdAt: '2025-11-10T10:00:00Z',
    startedAt: '2025-11-10T10:00:01Z',
  } as Agent,

  completed: {
    id: 'mock-agent-completed',
    type: 'claude-code' as const,
    status: 'completed' as const,
    createdAt: '2025-11-10T10:00:00Z',
    startedAt: '2025-11-10T10:00:01Z',
    completedAt: '2025-11-10T10:05:00Z',
  } as Agent,

  failed: {
    id: 'mock-agent-failed',
    type: 'gemini-cli' as const,
    status: 'failed' as const,
    createdAt: '2025-11-10T10:00:00Z',
    startedAt: '2025-11-10T10:00:01Z',
  } as Agent,

  initializing: {
    id: 'mock-agent-initializing',
    type: 'claude-code' as const,
    status: 'initializing' as const,
    createdAt: '2025-11-10T10:00:00Z',
  } as Agent,

  terminated: {
    id: 'mock-agent-terminated',
    type: 'claude-code' as const,
    status: 'terminated' as const,
    createdAt: '2025-11-10T10:00:00Z',
    startedAt: '2025-11-10T10:00:01Z',
  } as Agent,
};

/**
 * Mock message fixtures for testing
 */
export const mockMessageFixtures = {
  user: {
    id: 'mock-msg-user',
    agentId: 'mock-agent-1',
    type: 'user' as const,
    content: 'User message',
    sequenceNumber: 1,
    createdAt: '2025-11-10T10:00:00Z',
  } as AgentMessage,

  assistant: {
    id: 'mock-msg-assistant',
    agentId: 'mock-agent-1',
    type: 'assistant' as const,
    content: 'Assistant message',
    sequenceNumber: 2,
    createdAt: '2025-11-10T10:00:01Z',
  } as AgentMessage,

  system: {
    id: 'mock-msg-system',
    agentId: 'mock-agent-1',
    type: 'system' as const,
    content: 'System message',
    sequenceNumber: 3,
    createdAt: '2025-11-10T10:00:02Z',
  } as AgentMessage,

  error: {
    id: 'mock-msg-error',
    agentId: 'mock-agent-1',
    type: 'error' as const,
    content: 'Error message',
    sequenceNumber: 4,
    createdAt: '2025-11-10T10:00:03Z',
  } as AgentMessage,

  temporary: {
    id: 'mock-msg-temp',
    agentId: 'mock-agent-1',
    type: 'assistant' as const,
    content: 'Temporary message',
    sequenceNumber: -1,
    createdAt: '2025-11-10T10:00:04Z',
  } as AgentMessage,
};

/**
 * Create a mock agent with custom properties
 */
export function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    ...mockAgentFixtures.running,
    ...overrides,
  };
}

/**
 * Create a mock message with custom properties
 */
export function createMockMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    ...mockMessageFixtures.assistant,
    ...overrides,
  };
}

/**
 * Mock provider fixtures for testing
 */
export const mockProviderFixtures = {
  claudeCode: {
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
  } as ProviderInfo,

  geminiCli: {
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
  } as ProviderInfo,
};

/**
 * Create a mock provider with custom properties
 */
export function createMockProvider(overrides: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    ...mockProviderFixtures.claudeCode,
    ...overrides,
  };
}
