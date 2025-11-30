import { Injectable, Inject } from '@nestjs/common';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import {
  IAgentRunner,
  IAgentObserver,
  AgentMessage,
  AgentResult,
} from '@application/ports/agent-runner.port';
import { AgentMessageService } from './agent-message.service';

/**
 * Agent Subscription Tracking
 * Tracks which clients are subscribed to which agents
 */
interface AgentSubscription {
  agentId: AgentId;
  runner: IAgentRunner;
  observer: IAgentObserver;
  clientIds: Set<string>;
}

/**
 * Streaming Service
 * Manages real-time streaming of agent output to WebSocket clients
 * Implements observer pattern to receive agent events and broadcast to clients
 *
 * **CRITICAL**: Also persists agent status changes to database
 * This ensures status transitions (RUNNING -> COMPLETED/FAILED) are saved
 */
@Injectable()
export class StreamingService {
  private subscriptions: Map<string, AgentSubscription> = new Map();
  private clientSubscriptions: Map<string, Set<string>> = new Map();

  constructor(
    @Inject('IWebSocketGateway') private readonly websocketGateway: IWebSocketGateway,
    @Inject('IAgentRepository') private readonly agentRepository: IAgentRepository,
    private readonly messageService: AgentMessageService
  ) {}

  /**
   * Subscribe a client to agent events
   * @param agentId - The agent to subscribe to
   * @param clientId - The WebSocket client ID
   * @param runner - The agent runner to observe
   */
  subscribeToAgent(agentId: AgentId, clientId: string, runner: IAgentRunner): void {
    const agentKey = agentId.toString();

    // Get or create subscription for this agent
    let subscription = this.subscriptions.get(agentKey);
    if (!subscription) {
      // Create observer for this agent
      const observer = this.createObserver(agentId);

      // Subscribe to runner events
      runner.subscribe(agentId, observer);

      subscription = {
        agentId,
        runner,
        observer,
        clientIds: new Set(),
      };
      this.subscriptions.set(agentKey, subscription);
    }

    // Add client to this agent's subscription
    subscription.clientIds.add(clientId);

    // Track client's subscriptions
    if (!this.clientSubscriptions.has(clientId)) {
      this.clientSubscriptions.set(clientId, new Set());
    }
    this.clientSubscriptions.get(clientId)!.add(agentKey);

    // Join client to WebSocket room for this agent
    this.websocketGateway.joinRoom(clientId, `agent:${agentKey}`);
  }

  /**
   * Unsubscribe a client from agent events
   * @param agentId - The agent to unsubscribe from
   * @param clientId - The WebSocket client ID
   */
  unsubscribeFromAgent(agentId: AgentId, clientId: string): void {
    const agentKey = agentId.toString();
    const subscription = this.subscriptions.get(agentKey);

    if (!subscription) {
      return; // No subscription exists
    }

    // Remove client from agent subscription
    subscription.clientIds.delete(clientId);

    // Remove agent from client's subscriptions
    const clientSubs = this.clientSubscriptions.get(clientId);
    if (clientSubs) {
      clientSubs.delete(agentKey);
      if (clientSubs.size === 0) {
        this.clientSubscriptions.delete(clientId);
      }
    }

    // Remove client from WebSocket room
    this.websocketGateway.leaveRoom(clientId, `agent:${agentKey}`);

    // If no clients remain, unsubscribe from runner
    if (subscription.clientIds.size === 0) {
      subscription.runner.unsubscribe(agentId, subscription.observer);
      this.subscriptions.delete(agentKey);
    }
  }

  /**
   * Unsubscribe a client from all agents
   * @param clientId - The WebSocket client ID
   */
  unsubscribeClient(clientId: string): void {
    const agentKeys = this.clientSubscriptions.get(clientId);
    if (!agentKeys) {
      return;
    }

    // Unsubscribe from each agent
    const agentKeysCopy = Array.from(agentKeys);
    agentKeysCopy.forEach((agentKey) => {
      const agentId = AgentId.fromString(agentKey);
      this.unsubscribeFromAgent(agentId, clientId);
    });
  }

  /**
   * Broadcast agent message to all subscribed clients
   * CRITICAL: Messages MUST be saved to database first to maintain data integrity
   * FK constraint violations indicate agent doesn't exist - this is a FATAL error
   * @param agentId - The agent ID
   * @param message - The message to broadcast
   * @throws Error if agent doesn't exist (FK constraint violation)
   */
  async broadcastMessage(agentId: AgentId, message: AgentMessage): Promise<void> {
    console.log('[TRACE] broadcastMessage START', { agentId: agentId.toString(), messageType: message.type });

    // 1. MUST save to database first (maintains referential integrity)
    try {
      console.log('[TRACE] Attempting DB save...');
      const savedMessage = await this.messageService.saveMessage({
        agentId: agentId.toString(),
        type: message.type as 'user' | 'assistant' | 'system' | 'error' | 'tool' | 'response',
        role: message.role,
        content: message.content,
        raw: message.raw,
        metadata: message.metadata,
      });
      console.log('[TRACE] DB save SUCCESS', { messageId: savedMessage.id });

      // 2. ONLY emit to WebSocket after successful DB save
      console.log('[TRACE] Emitting agent:message to WebSocket...', { room: `agent:${agentId.toString()}` });
      this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:message', {
        agentId: agentId.toString(),
        message: savedMessage,
        timestamp: new Date().toISOString(),
      });
      console.log('[TRACE] WebSocket emission COMPLETE');
    } catch (error) {
      const err = error as Error;

      // CRITICAL: FK constraint violations indicate agent doesn't exist
      // This is a FATAL error that must be propagated, not hidden
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        console.error('[ERROR] FK constraint violation - agent does not exist', {
          agentId: agentId.toString(),
          error: err.message,
        });

        // Emit error to frontend (if any clients are subscribed)
        this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:error', {
          agentId: agentId.toString(),
          error: {
            message: `Agent ${agentId.toString()} does not exist`,
            name: 'AgentNotFoundError',
          },
          timestamp: new Date().toISOString(),
        });

        // MUST propagate the error - caller needs to know agent doesn't exist
        throw new Error(`Cannot save message: Agent ${agentId.toString()} does not exist (FK constraint violation)`);
      }

      // For other errors (e.g., database locked), also propagate
      // Caller should decide retry strategy, not hide the error
      console.error('[ERROR] Failed to save message to database', {
        agentId: agentId.toString(),
        error: err.message,
      });

      throw error; // Always propagate, never silently swallow
    }

    console.log('[TRACE] broadcastMessage END');
  }

  /**
   * Broadcast status change to all subscribed clients
   * @param agentId - The agent ID
   * @param status - The new status
   *
   * EVENT-DRIVEN: Emits two events:
   * 1. 'agent:status' to room (for clients subscribed to this agent)
   * 2. 'agent:updated' to ALL clients (for global agent list updates)
   */
  broadcastStatusChange(agentId: AgentId, status: AgentStatus): void {
    const agentIdStr = agentId.toString();
    const statusStr = status.toString();
    const timestamp = new Date().toISOString();

    // Emit to room (subscribed clients get detailed status event)
    this.websocketGateway.emitToRoom(`agent:${agentIdStr}`, 'agent:status', {
      agentId: agentIdStr,
      status: statusStr,
      timestamp,
    });

    // EVENT-DRIVEN: Emit to ALL clients (for global agent list updates)
    // This ensures all frontends see status changes in their agent lists
    this.websocketGateway.emitToAll('agent:updated', {
      agentId: agentIdStr,
      status: statusStr,
      timestamp,
    });
  }

  /**
   * Broadcast error to all subscribed clients
   * @param agentId - The agent ID
   * @param error - The error
   *
   * **CRITICAL FIX**: Also persists FAILED status to database
   * Without this, agents fail in-memory but stay "running" in DB
   */
  async broadcastError(agentId: AgentId, error: Error): Promise<void> {
    // 1. Persist failure to database FIRST
    try {
      const agent = await this.agentRepository.findById(agentId);
      if (agent) {
        agent.markAsFailed(error);
        await this.agentRepository.save(agent);
        console.log('[StreamingService] Agent failure persisted to DB:', agentId.toString());
      } else {
        console.warn('[StreamingService] Agent not found for error:', agentId.toString());
      }
    } catch (dbError) {
      console.error('[StreamingService] Failed to persist agent failure:', {
        agentId: agentId.toString(),
        error: dbError instanceof Error ? dbError.message : 'Unknown',
      });
    }

    // 2. THEN broadcast to WebSocket clients
    this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:error', {
      agentId: agentId.toString(),
      error: {
        message: error.message,
        name: error.name,
      },
      timestamp: new Date().toISOString(),
    });

    // 3. Also emit status update to ALL clients (for agent list)
    this.websocketGateway.emitToAll('agent:updated', {
      agentId: agentId.toString(),
      status: 'failed',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast completion to all subscribed clients
   * @param agentId - The agent ID
   * @param result - The completion result
   *
   * **CRITICAL FIX**: Also persists COMPLETED status to database
   * Without this, agents complete in-memory but stay "running" in DB
   */
  async broadcastComplete(agentId: AgentId, result: AgentResult): Promise<void> {
    // 1. Persist completion to database FIRST
    try {
      const agent = await this.agentRepository.findById(agentId);
      if (agent) {
        agent.markAsCompleted();
        await this.agentRepository.save(agent);
        console.log('[StreamingService] Agent completion persisted to DB:', agentId.toString());
      } else {
        console.warn('[StreamingService] Agent not found for completion:', agentId.toString());
      }
    } catch (error) {
      console.error('[StreamingService] Failed to persist agent completion:', {
        agentId: agentId.toString(),
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }

    // 2. THEN broadcast to WebSocket clients
    this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:complete', {
      agentId: agentId.toString(),
      result,
      timestamp: new Date().toISOString(),
    });

    // 3. Also emit status update to ALL clients (for agent list)
    this.websocketGateway.emitToAll('agent:updated', {
      agentId: agentId.toString(),
      status: 'completed',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Create an observer for agent events
   * @param agentId - The agent ID
   * @returns The observer
   */
  private createObserver(agentId: AgentId): IAgentObserver {
    return {
      onMessage: (message: AgentMessage) => {
        // Fire and forget for real-time updates
        // IMPORTANT: FK violations will be logged and emitted as agent:error events
        // but won't block the agent runner from continuing
        this.broadcastMessage(agentId, message).catch(error => {
          // Log critical errors but don't crash the agent
          console.error('CRITICAL: Failed to broadcast message - data may be lost', {
            agentId: agentId.toString(),
            error: error.message,
          });

          // Emit error to frontend so users know something went wrong
          this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:error', {
            agentId: agentId.toString(),
            error: {
              message: `Message broadcast failed: ${error.message}`,
              name: error.name,
            },
            timestamp: new Date().toISOString(),
          });
        });
      },
      onStatusChange: (status: AgentStatus) => {
        this.broadcastStatusChange(agentId, status);
      },
      onError: (error: Error) => {
        this.broadcastError(agentId, error);
      },
      onComplete: (result: AgentResult) => {
        this.broadcastComplete(agentId, result);
      },
    };
  }
}
