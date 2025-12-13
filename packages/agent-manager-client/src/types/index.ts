/**
 * Agent Client Types
 * Standalone TypeScript types for the agent manager client module
 * No external dependencies - pure types only
 */

export type AgentType = 'claude-code' | 'gemini-cli';

export type AgentStatus =
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'terminated';

/**
 * Session information for an agent
 */
export interface SessionInfo {
  id: string;
  prompt: string;
  messageCount: number;
}

/**
 * Agent entity representing a running AI CLI agent
 */
export interface Agent {
  id: string;
  type: AgentType;
  status: AgentStatus;
  session?: SessionInfo;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Configuration for agent launch
 */
export interface AgentConfiguration {
  sessionId?: string;
  outputFormat?: 'stream-json' | 'json';
  customArgs?: string[];
  workingDirectory?: string;
}

/**
 * Request payload for launching a new agent
 */
export interface LaunchAgentRequest {
  type: AgentType;
  prompt: string;
  configuration?: AgentConfiguration;
}

/**
 * Response from launching an agent
 */
export interface LaunchAgentResponse {
  agentId: string;
  status: AgentStatus;
  createdAt: string;
}

/**
 * Agent message with UUID and sequence number
 * Matches backend AgentMessageDto
 */
export interface AgentMessage {
  id: string; // UUID v4
  agentId: string;
  sequenceNumber: number; // Monotonic sequence (1, 2, 3...) or -1 for temporary
  type: 'assistant' | 'user' | 'system' | 'error';
  role?: string;
  content: string | object;
  metadata?: Record<string, unknown>;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * WebSocket event types
 */
export interface AgentMessageEvent {
  agentId: string;
  timestamp: string;
  message: AgentMessage;
}

export interface AgentStatusEvent {
  agentId: string;
  status: string;
  timestamp: string;
}

export interface AgentErrorEvent {
  agentId: string;
  error: {
    message: string;
    name: string;
  };
  timestamp: string;
}

export interface AgentCompleteEvent {
  agentId: string;
  result: {
    status: 'success' | 'failed';
    duration: number;
    messageCount: number;
  };
  timestamp: string;
}

/**
 * Client configuration options
 */
export interface AgentClientConfig {
  apiUrl: string;
  websocketUrl: string;
  headers?: Record<string, string>;
  debug?: boolean;
}

/**
 * Provider and Model Types
 * Matches backend API response structure
 */

export type CostTier = 'low' | 'medium' | 'high';

export interface ProviderCapabilities {
  streaming: boolean;
  multiTurn: boolean;
  toolUse: boolean;
  fileAccess: boolean;
  customInstructions: boolean;
  mcpSupport: boolean;
  modelSelection: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  capabilities: string[];
  isAvailable: boolean;
  isDefault: boolean;
  costTier?: CostTier;
}

export interface ProviderInfo {
  type: AgentType;
  name: string;
  description: string;
  isAvailable: boolean;
  capabilities: ProviderCapabilities;
  models: ModelInfo[];
}

export interface ProvidersResponse {
  totalCount: number;
  providers: ProviderInfo[];
}
