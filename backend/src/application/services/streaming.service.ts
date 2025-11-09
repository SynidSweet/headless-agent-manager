import { Injectable, Inject } from '@nestjs/common';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';
import {
  IAgentRunner,
  IAgentObserver,
  AgentMessage,
  AgentResult,
} from '@application/ports/agent-runner.port';

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
 */
@Injectable()
export class StreamingService {
  private subscriptions: Map<string, AgentSubscription> = new Map();
  private clientSubscriptions: Map<string, Set<string>> = new Map();

  constructor(
    @Inject('IWebSocketGateway') private readonly websocketGateway: IWebSocketGateway
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
   * @param agentId - The agent ID
   * @param message - The message to broadcast
   */
  broadcastMessage(agentId: AgentId, message: AgentMessage): void {
    this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:message', {
      agentId: agentId.toString(),
      timestamp: new Date().toISOString(),
      message,
    });
  }

  /**
   * Broadcast status change to all subscribed clients
   * @param agentId - The agent ID
   * @param status - The new status
   */
  broadcastStatusChange(agentId: AgentId, status: AgentStatus): void {
    this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:status', {
      agentId: agentId.toString(),
      status: status.toString(),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast error to all subscribed clients
   * @param agentId - The agent ID
   * @param error - The error
   */
  broadcastError(agentId: AgentId, error: Error): void {
    this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:error', {
      agentId: agentId.toString(),
      error: {
        message: error.message,
        name: error.name,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast completion to all subscribed clients
   * @param agentId - The agent ID
   * @param result - The completion result
   */
  broadcastComplete(agentId: AgentId, result: AgentResult): void {
    this.websocketGateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:complete', {
      agentId: agentId.toString(),
      result,
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
        this.broadcastMessage(agentId, message);
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
