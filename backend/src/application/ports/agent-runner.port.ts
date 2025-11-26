import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { Session } from '@domain/value-objects/session.vo';

/**
 * Agent Message
 * Represents a message from the agent output stream
 */
export interface AgentMessage {
  type: 'assistant' | 'user' | 'system' | 'error' | 'tool' | 'response';
  role?: string;
  content: string | object;
  raw?: string; // Original JSON from CLI
  metadata?: Record<string, unknown>;
}

/**
 * Agent Result
 * Result information when agent completes
 */
export interface AgentResult {
  status: 'success' | 'failed';
  duration: number;
  messageCount: number;
  stats?: Record<string, unknown>;
}

/**
 * Agent Observer
 * Observer pattern for agent events
 */
export interface IAgentObserver {
  onMessage(message: AgentMessage): void;
  onStatusChange(status: AgentStatus): void;
  onError(error: Error): void;
  onComplete(result: AgentResult): void;
}

/**
 * Agent Runner Port
 * Interface for running and managing agent CLI processes
 */
export interface IAgentRunner {
  /**
   * Start an agent with the given session
   * @param session - The session configuration
   * @returns The agent instance
   */
  start(session: Session): Promise<Agent>;

  /**
   * Stop a running agent
   * @param agentId - The agent to stop
   */
  stop(agentId: AgentId): Promise<void>;

  /**
   * Get the current status of an agent
   * @param agentId - The agent ID
   */
  getStatus(agentId: AgentId): Promise<AgentStatus>;

  /**
   * Subscribe to agent events
   * @param agentId - The agent to observe
   * @param observer - The observer to notify
   */
  subscribe(agentId: AgentId, observer: IAgentObserver): void;

  /**
   * Unsubscribe from agent events
   * @param agentId - The agent ID
   * @param observer - The observer to remove
   */
  unsubscribe(agentId: AgentId, observer: IAgentObserver): void;
}
