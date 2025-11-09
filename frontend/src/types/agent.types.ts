/**
 * Agent Types
 * TypeScript types matching backend API
 */

export type AgentType = 'claude-code' | 'gemini-cli';

export type AgentStatus = 'initializing' | 'running' | 'paused' | 'completed' | 'failed' | 'terminated';

export interface SessionInfo {
  id: string;
  prompt: string;
  messageCount: number;
}

export interface Agent {
  id: string;
  type: AgentType;
  status: AgentStatus;
  session?: SessionInfo;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LaunchAgentRequest {
  type: AgentType;
  prompt: string;
  configuration?: {
    sessionId?: string;
    outputFormat?: string;
    customArgs?: string[];
  };
}

export interface LaunchAgentResponse {
  agentId: string;
  status: AgentStatus;
  createdAt: string;
}

export interface AgentMessage {
  type: 'assistant' | 'user' | 'system' | 'error';
  role?: string;
  content: string | object;
  metadata?: Record<string, unknown>;
}

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
