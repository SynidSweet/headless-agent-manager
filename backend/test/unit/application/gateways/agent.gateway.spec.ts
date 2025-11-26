/**
 * AgentGateway Tests
 *
 * Purpose: Verify WebSocket gateway manages connections and message broadcasting
 * Layer: Application
 * Type: Unit
 *
 * Coverage:
 * - Connection lifecycle (connect/disconnect)
 * - Subscription management (subscribe/unsubscribe)
 * - Message broadcasting (client/room/all)
 * - Error handling
 *
 * Dependencies: StreamingService (mocked), OrchestrationService (mocked)
 * Mocks: Socket.io infrastructure, services
 */

import { AgentGateway } from '@application/gateways/agent.gateway';
import { StreamingService } from '@application/services/streaming.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { Server, Socket } from 'socket.io';
import { AgentId } from '@domain/value-objects/agent-id.vo';

describe('AgentGateway', () => {
  let gateway: AgentGateway;
  let mockStreamingService: jest.Mocked<StreamingService>;
  let mockOrchestrationService: jest.Mocked<AgentOrchestrationService>;
  let mockServer: jest.Mocked<Server>;
  let mockSocket: jest.Mocked<Socket>;

  beforeEach(() => {
    // Mock StreamingService
    mockStreamingService = {
      subscribeToAgent: jest.fn(),
      unsubscribeFromAgent: jest.fn(),
      unsubscribeClient: jest.fn(),
    } as any;

    // Mock OrchestrationService
    mockOrchestrationService = {
      getRunnerForAgent: jest.fn(),
    } as any;

    // Create gateway instance
    gateway = new AgentGateway(mockStreamingService, mockOrchestrationService);

    // Mock socket.io server
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: new Map(),
      },
    } as any;

    // Mock socket.io client socket
    mockSocket = {
      id: 'test-client-123',
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
    } as any;

    // Inject server into gateway
    gateway.server = mockServer;

    // Add mock socket to server's socket map
    mockServer.sockets.sockets.set(mockSocket.id, mockSocket);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Lifecycle', () => {
    it('should add client to connectedClients map on connection', () => {
      // Act
      gateway.handleConnection(mockSocket);

      // Assert
      const connectedClients = gateway.getConnectedClients();
      expect(connectedClients).toHaveLength(1);
      expect(connectedClients[0]?.id).toBe('test-client-123');
      expect(connectedClients[0]?.connectedAt).toBeInstanceOf(Date);
    });

    it('should remove client from connectedClients map on disconnect', () => {
      // Arrange
      gateway.handleConnection(mockSocket);
      expect(gateway.getConnectedClients()).toHaveLength(1);

      // Act
      gateway.handleDisconnect(mockSocket);

      // Assert
      expect(gateway.getConnectedClients()).toHaveLength(0);
      expect(mockStreamingService.unsubscribeClient).toHaveBeenCalledWith('test-client-123');
    });

    it('should emit "connected" event with client ID and timestamp', () => {
      // Act
      gateway.handleConnection(mockSocket);

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', {
        clientId: 'test-client-123',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/), // ISO 8601
      });
    });

    it('should handle multiple simultaneous connections', () => {
      // Arrange
      const mockSocket2 = {
        id: 'test-client-456',
        emit: jest.fn(),
      } as any;

      const mockSocket3 = {
        id: 'test-client-789',
        emit: jest.fn(),
      } as any;

      // Act
      gateway.handleConnection(mockSocket);
      gateway.handleConnection(mockSocket2);
      gateway.handleConnection(mockSocket3);

      // Assert
      const connectedClients = gateway.getConnectedClients();
      expect(connectedClients).toHaveLength(3);
      expect(connectedClients.map(c => c.id)).toEqual([
        'test-client-123',
        'test-client-456',
        'test-client-789',
      ]);
    });
  });

  describe('Subscription Management', () => {
    it('should call subscribeToAgent on streaming service when subscribing', async () => {
      // Arrange
      gateway.handleConnection(mockSocket);
      const agentId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
      const mockRunner = { mockRunner: true } as any;
      mockOrchestrationService.getRunnerForAgent.mockReturnValue(mockRunner);

      // Act
      await gateway.handleSubscribe(mockSocket, { agentId });

      // Assert
      expect(mockStreamingService.subscribeToAgent).toHaveBeenCalledWith(
        expect.any(AgentId),
        'test-client-123',
        mockRunner
      );
    });

    it('should call unsubscribeFromAgent on streaming service when unsubscribing', () => {
      // Arrange
      const agentId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID

      // Act
      gateway.handleUnsubscribe(mockSocket, { agentId });

      // Assert
      expect(mockStreamingService.unsubscribeFromAgent).toHaveBeenCalledWith(
        expect.any(AgentId),
        'test-client-123'
      );
    });

    it('should emit "subscribed" confirmation to client', async () => {
      // Arrange
      gateway.handleConnection(mockSocket);
      const agentId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
      mockOrchestrationService.getRunnerForAgent.mockReturnValue({} as any);

      // Act
      await gateway.handleSubscribe(mockSocket, { agentId });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribed', {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should emit "unsubscribed" confirmation to client', () => {
      // Arrange
      const agentId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID

      // Act
      gateway.handleUnsubscribe(mockSocket, { agentId });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribed', {
        agentId: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    });

    it('should handle subscription to non-existent agent', async () => {
      // Arrange
      const agentId = '999e8400-e29b-41d4-a716-446655440999'; // Valid UUID but non-existent
      mockOrchestrationService.getRunnerForAgent.mockImplementation(() => {
        throw new Error('Agent not found');
      });

      // Act
      await gateway.handleSubscribe(mockSocket, { agentId });

      // Assert
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        event: 'subscribe',
        message: 'Agent not found',
        agentId: '999e8400-e29b-41d4-a716-446655440999',
      });
    });

    it('should allow multiple clients to subscribe to same agent', async () => {
      // Arrange
      const mockSocket2 = {
        id: 'test-client-456',
        emit: jest.fn(),
      } as any;

      gateway.handleConnection(mockSocket);
      gateway.handleConnection(mockSocket2);

      const agentId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID
      mockOrchestrationService.getRunnerForAgent.mockReturnValue({} as any);

      // Act
      await gateway.handleSubscribe(mockSocket, { agentId });
      await gateway.handleSubscribe(mockSocket2, { agentId });

      // Assert
      expect(mockStreamingService.subscribeToAgent).toHaveBeenCalledTimes(2);
      expect(mockStreamingService.subscribeToAgent).toHaveBeenNthCalledWith(
        1,
        expect.any(AgentId),
        'test-client-123',
        expect.anything()
      );
      expect(mockStreamingService.subscribeToAgent).toHaveBeenNthCalledWith(
        2,
        expect.any(AgentId),
        'test-client-456',
        expect.anything()
      );
    });
  });

  describe('Message Broadcasting', () => {
    it('should emit to specific client via emitToClient()', () => {
      // Arrange
      const clientId = 'test-client-123';
      const event = 'agent:message';
      const data = { message: 'test' };

      // Act
      gateway.emitToClient(clientId, event, data);

      // Assert
      expect(mockServer.to).toHaveBeenCalledWith(clientId);
      expect(mockServer.emit).toHaveBeenCalledWith(event, data);
    });

    it('should emit to all clients via emitToAll()', () => {
      // Arrange
      const event = 'agent:created';
      const data = { agentId: 'test' };

      // Act
      gateway.emitToAll(event, data);

      // Assert
      expect(mockServer.emit).toHaveBeenCalledWith(event, data);
    });

    it('should emit to room via emitToRoom()', () => {
      // Arrange
      const room = 'agent:test-agent-id';
      const event = 'agent:message';
      const data = { message: 'test' };

      // Act
      gateway.emitToRoom(room, event, data);

      // Assert
      expect(mockServer.to).toHaveBeenCalledWith(room);
      expect(mockServer.emit).toHaveBeenCalledWith(event, data);
    });

    it('should add client to room via joinRoom()', () => {
      // Arrange
      const clientId = 'test-client-123';
      const room = 'agent:test-agent-id';

      // Act
      gateway.joinRoom(clientId, room);

      // Assert
      expect(mockSocket.join).toHaveBeenCalledWith(room);
    });
  });

  describe('Error Handling', () => {
    it('should handle joinRoom for disconnected client gracefully', () => {
      // Arrange
      const disconnectedClientId = 'disconnected-client-999';
      const room = 'agent:test-agent-id';

      // Act & Assert - Should not throw
      expect(() => {
        gateway.joinRoom(disconnectedClientId, room);
      }).not.toThrow();
    });
  });

  describe('Client Status Checking', () => {
    it('should return true for connected client via isClientConnected()', () => {
      // Arrange
      gateway.handleConnection(mockSocket);

      // Act
      const isConnected = gateway.isClientConnected('test-client-123');

      // Assert
      expect(isConnected).toBe(true);
    });

    it('should return false for disconnected client via isClientConnected()', () => {
      // Act
      const isConnected = gateway.isClientConnected('non-existent-client');

      // Assert
      expect(isConnected).toBe(false);
    });
  });
});
