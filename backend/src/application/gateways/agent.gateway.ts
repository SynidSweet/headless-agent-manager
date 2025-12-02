import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { StreamingService } from '../services/streaming.service';
import { AgentOrchestrationService } from '../services/agent-orchestration.service';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { IWebSocketGateway, WebSocketClient } from '../ports/websocket-gateway.port';
import { ILogger } from '../ports/logger.port';

/**
 * Agent WebSocket Gateway
 * Handles real-time WebSocket connections for agent streaming
 * Implements IWebSocketGateway for use by StreamingService
 */
@WebSocketGateway({
  cors: {
    origin: '*', // Configure appropriately for production
    credentials: true,
  },
})
@Injectable()
export class AgentGateway implements OnGatewayConnection, OnGatewayDisconnect, IWebSocketGateway {
  @WebSocketServer()
  server!: Server;

  private connectedClients: Map<string, WebSocketClient> = new Map();

  constructor(
    @Inject(forwardRef(() => StreamingService))
    private readonly streamingService: StreamingService,
    private readonly orchestrationService: AgentOrchestrationService,
    @Inject('ILogger') private readonly logger: ILogger
  ) {}

  /**
   * Handle new WebSocket connection
   */
  handleConnection(client: Socket): void {
    const clientInfo: WebSocketClient = {
      id: client.id,
      connectedAt: new Date(),
    };

    this.connectedClients.set(client.id, clientInfo);

    this.logger.info('WebSocket client connected', {
      clientId: client.id,
      totalClients: this.connectedClients.size,
    });

    // Send connection confirmation
    client.emit('connected', {
      clientId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(client: Socket): void {
    this.logger.info('WebSocket client disconnected', {
      clientId: client.id,
    });

    // Unsubscribe from all agents
    this.streamingService.unsubscribeClient(client.id);

    // Remove from connected clients
    this.connectedClients.delete(client.id);

    this.logger.info('Client disconnected', {
      clientId: client.id,
      totalClients: this.connectedClients.size,
    });
  }

  /**
   * Handle subscription to agent events
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string }
  ): Promise<void> {
    try {
      const agentId = AgentId.fromString(data.agentId);

      // Get the ACTUAL runner that's running this agent (not a new instance)
      const runner = this.orchestrationService.getRunnerForAgent(agentId);

      // Subscribe to agent events
      this.streamingService.subscribeToAgent(agentId, client.id, runner);

      // Send subscription confirmation
      client.emit('subscribed', {
        agentId: data.agentId,
        timestamp: new Date().toISOString(),
      });

      this.logger.info('Client subscribed to agent', {
        clientId: client.id,
        agentId: data.agentId,
      });
    } catch (error) {
      client.emit('error', {
        event: 'subscribe',
        message: error instanceof Error ? error.message : 'Subscription failed',
        agentId: data.agentId,
      });
    }
  }

  /**
   * Handle unsubscription from agent events
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string }
  ): void {
    try {
      const agentId = AgentId.fromString(data.agentId);
      this.streamingService.unsubscribeFromAgent(agentId, client.id);

      client.emit('unsubscribed', {
        agentId: data.agentId,
        timestamp: new Date().toISOString(),
      });

      this.logger.info('Client unsubscribed from agent', {
        clientId: client.id,
        agentId: data.agentId,
      });
    } catch (error) {
      client.emit('error', {
        event: 'unsubscribe',
        message: error instanceof Error ? error.message : 'Unsubscription failed',
        agentId: data.agentId,
      });
    }
  }

  // IWebSocketGateway implementation

  /**
   * Emit event to specific client
   */
  emitToClient(clientId: string, event: string, data: unknown): void {
    this.server.to(clientId).emit(event, data);
  }

  /**
   * Emit event to all connected clients
   */
  emitToAll(event: string, data: unknown): void {
    this.server.emit(event, data);
  }

  /**
   * Emit event to clients in a room
   */
  emitToRoom(room: string, event: string, data: unknown): void {
    this.server.to(room).emit(event, data);
  }

  /**
   * Add client to a room
   */
  joinRoom(clientId: string, room: string): void {
    const socket = this.server.sockets.sockets.get(clientId);
    if (socket) {
      void socket.join(room);
    }
  }

  /**
   * Remove client from a room
   */
  leaveRoom(clientId: string, room: string): void {
    const socket = this.server.sockets.sockets.get(clientId);
    if (socket) {
      void socket.leave(room);
    }
  }

  /**
   * Get all connected clients
   */
  getConnectedClients(): WebSocketClient[] {
    return Array.from(this.connectedClients.values());
  }

  /**
   * Check if client is connected
   */
  isClientConnected(clientId: string): boolean {
    return this.connectedClients.has(clientId);
  }
}
