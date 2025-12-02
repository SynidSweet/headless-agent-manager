import { StreamingService } from '@application/services/streaming.service';
import { AgentMessageService } from '@application/services/agent-message.service';
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { IAgentRunner, AgentMessage, AgentResult } from '@application/ports/agent-runner.port';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';

describe('StreamingService', () => {
  let service: StreamingService;
  let mockWebSocketGateway: jest.Mocked<IWebSocketGateway>;
  let mockAgentRepository: jest.Mocked<IAgentRepository>;
  let mockMessageService: jest.Mocked<AgentMessageService>;
  let mockAgentRunner: jest.Mocked<IAgentRunner>;

  beforeEach(() => {
    // Create mock WebSocket gateway
    mockWebSocketGateway = {
      emitToClient: jest.fn(),
      emitToAll: jest.fn(),
      emitToRoom: jest.fn(),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn(),
      getConnectedClients: jest.fn(),
      isClientConnected: jest.fn(),
    };

    // Create mock agent repository
    mockAgentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByStatus: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    } as any;

    // Create mock message service
    mockMessageService = {
      saveMessage: jest.fn().mockResolvedValue({
        id: 'msg-uuid',
        agentId: 'agent-123',
        sequenceNumber: 1,
        type: 'assistant',
        content: 'test',
        createdAt: new Date().toISOString(),
      }),
      findByAgentId: jest.fn(),
      findByAgentIdSince: jest.fn(),
    } as any;

    // Create mock agent runner
    mockAgentRunner = {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    // Create service with mocks (constructor signature updated to include agentRepository)
    service = new StreamingService(mockWebSocketGateway, mockAgentRepository, mockMessageService);
  });

  describe('subscribeToAgent', () => {
    it('should subscribe runner to agent events', () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';

      // Act
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      // Assert
      expect(mockAgentRunner.subscribe).toHaveBeenCalled();
      const observer = mockAgentRunner.subscribe.mock.calls[0]![1];
      expect(observer).toBeDefined();
    });

    it('should join client to agent room', () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';

      // Act
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      // Assert
      expect(mockWebSocketGateway.joinRoom).toHaveBeenCalledWith(
        clientId,
        `agent:${agentId.toString()}`
      );
    });

    it('should allow multiple clients to subscribe to same agent', () => {
      // Arrange
      const agentId = AgentId.generate();
      const client1 = 'client-1';
      const client2 = 'client-2';

      // Act
      service.subscribeToAgent(agentId, client1, mockAgentRunner);
      service.subscribeToAgent(agentId, client2, mockAgentRunner);

      // Assert
      expect(mockWebSocketGateway.joinRoom).toHaveBeenCalledWith(
        client1,
        `agent:${agentId.toString()}`
      );
      expect(mockWebSocketGateway.joinRoom).toHaveBeenCalledWith(
        client2,
        `agent:${agentId.toString()}`
      );
      // Should only subscribe to runner once
      expect(mockAgentRunner.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribeFromAgent', () => {
    it('should remove client from agent room', () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      // Act
      service.unsubscribeFromAgent(agentId, clientId);

      // Assert
      expect(mockWebSocketGateway.leaveRoom).toHaveBeenCalledWith(
        clientId,
        `agent:${agentId.toString()}`
      );
    });

    it('should unsubscribe from runner when no clients remain', () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      // Act
      service.unsubscribeFromAgent(agentId, clientId);

      // Assert
      expect(mockAgentRunner.unsubscribe).toHaveBeenCalled();
    });

    it('should not unsubscribe from runner if other clients remain', () => {
      // Arrange
      const agentId = AgentId.generate();
      const client1 = 'client-1';
      const client2 = 'client-2';
      service.subscribeToAgent(agentId, client1, mockAgentRunner);
      service.subscribeToAgent(agentId, client2, mockAgentRunner);

      // Reset mock to clear subscribe calls
      mockAgentRunner.unsubscribe.mockClear();

      // Act
      service.unsubscribeFromAgent(agentId, client1);

      // Assert
      expect(mockWebSocketGateway.leaveRoom).toHaveBeenCalledWith(
        client1,
        `agent:${agentId.toString()}`
      );
      expect(mockAgentRunner.unsubscribe).not.toHaveBeenCalled();
    });

    it('should handle unsubscribe when client not subscribed', () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';

      // Act & Assert - Should not throw
      expect(() => service.unsubscribeFromAgent(agentId, clientId)).not.toThrow();
    });
  });

  describe('broadcastMessage', () => {
    it('should emit agent message to room', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const message: AgentMessage = {
        type: 'assistant',
        content: 'Test message',
      };

      // Act
      await service.broadcastMessage(agentId, message);

      // Assert
      expect(mockMessageService.saveMessage).toHaveBeenCalled();
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:message',
        expect.objectContaining({
          agentId: agentId.toString(),
          timestamp: expect.any(String),
          message: expect.objectContaining({
            id: 'msg-uuid',
            sequenceNumber: 1,
          }),
        })
      );
    });

    it('should include timestamp in ISO format', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const message: AgentMessage = {
        type: 'system',
        content: 'Test',
      };

      // Act
      await service.broadcastMessage(agentId, message);

      // Assert
      const call = mockWebSocketGateway.emitToRoom.mock.calls[0]!;
      const data = call[2] as any;
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should throw FK constraint error and NOT emit message', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const message: AgentMessage = {
        type: 'assistant',
        content: 'Test message',
      };

      // Simulate FK constraint violation (agent doesn't exist)
      const dbError = new Error('FOREIGN KEY constraint failed');
      mockMessageService.saveMessage.mockRejectedValueOnce(dbError);

      // Act & Assert - Should throw error (not swallow it)
      await expect(service.broadcastMessage(agentId, message)).rejects.toThrow(
        'does not exist (FK constraint violation)'
      );

      // Assert - Error event should be emitted to notify frontend
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:error',
        expect.objectContaining({
          agentId: agentId.toString(),
          error: expect.objectContaining({
            message: expect.stringContaining('does not exist'),
            name: 'AgentNotFoundError',
          }),
        })
      );

      // Assert - Message should NOT be emitted (data integrity preserved)
      expect(mockWebSocketGateway.emitToRoom).not.toHaveBeenCalledWith(
        expect.anything(),
        'agent:message',
        expect.anything()
      );
    });

    it('should throw error when database save fails (non-FK error)', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const message: AgentMessage = {
        type: 'assistant',
        content: 'Test message',
      };

      const dbError = new Error('Database write failed');
      mockMessageService.saveMessage.mockRejectedValueOnce(dbError);

      // Act & Assert - Should throw error (fail-fast principle)
      await expect(service.broadcastMessage(agentId, message)).rejects.toThrow(
        'Database write failed'
      );

      // Assert - NO message should be emitted (error occurred first)
      expect(mockWebSocketGateway.emitToRoom).not.toHaveBeenCalledWith(
        expect.anything(),
        'agent:message',
        expect.anything()
      );
    });
  });

  describe('broadcastStatusChange', () => {
    it('should emit status change to room', () => {
      // Arrange
      const agentId = AgentId.generate();
      const status = AgentStatus.RUNNING;

      // Act
      service.broadcastStatusChange(agentId, status);

      // Assert
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:status',
        {
          agentId: agentId.toString(),
          status: 'running',
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('broadcastError', () => {
    it('should emit error to room', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const error = new Error('Test error');

      // Act
      await service.broadcastError(agentId, error);

      // Assert
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:error',
        {
          agentId: agentId.toString(),
          error: {
            message: 'Test error',
            name: 'Error',
          },
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('broadcastComplete', () => {
    it('should emit completion event to room', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const result: AgentResult = {
        status: 'success',
        duration: 5000,
        messageCount: 10,
      };

      // Act
      await service.broadcastComplete(agentId, result);

      // Assert
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:complete',
        {
          agentId: agentId.toString(),
          result,
          timestamp: expect.any(String),
        }
      );
    });
  });

  describe('observer integration', () => {
    it('should broadcast message when observer receives message', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      // Get the observer that was registered
      const observer = mockAgentRunner.subscribe.mock.calls[0]![1];
      const message: AgentMessage = {
        type: 'assistant',
        content: 'Test message',
      };

      // Act
      observer.onMessage(message);

      // Wait for async broadcast to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Assert
      expect(mockMessageService.saveMessage).toHaveBeenCalled();
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:message',
        expect.objectContaining({
          message: expect.objectContaining({
            id: 'msg-uuid',
            sequenceNumber: 1,
          }),
        })
      );
    });

    it('should broadcast status when observer receives status change', () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      const observer = mockAgentRunner.subscribe.mock.calls[0]![1];

      // Act
      observer.onStatusChange(AgentStatus.COMPLETED);

      // Assert
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:status',
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    it('should broadcast error when observer receives error', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      const observer = mockAgentRunner.subscribe.mock.calls[0]![1];
      const error = new Error('Runtime error');

      // Act
      observer.onError(error);
      // Wait for async broadcast to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Assert
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:error',
        expect.objectContaining({
          error: {
            message: 'Runtime error',
            name: 'Error',
          },
        })
      );
    });

    it('should broadcast completion when observer receives complete', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const clientId = 'client-1';
      service.subscribeToAgent(agentId, clientId, mockAgentRunner);

      const observer = mockAgentRunner.subscribe.mock.calls[0]![1];
      const result: AgentResult = {
        status: 'success',
        duration: 3000,
        messageCount: 5,
      };

      // Act
      observer.onComplete(result);
      // Wait for async broadcast to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Assert
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:complete',
        expect.objectContaining({
          result,
        })
      );
    });
  });

  describe('unsubscribeClient', () => {
    it('should unsubscribe client from all agents', () => {
      // Arrange
      const agent1 = AgentId.generate();
      const agent2 = AgentId.generate();
      const clientId = 'client-1';

      const runner1 = { ...mockAgentRunner };
      const runner2 = { ...mockAgentRunner };

      service.subscribeToAgent(agent1, clientId, runner1 as any);
      service.subscribeToAgent(agent2, clientId, runner2 as any);

      // Act
      service.unsubscribeClient(clientId);

      // Assert
      expect(mockWebSocketGateway.leaveRoom).toHaveBeenCalledWith(
        clientId,
        `agent:${agent1.toString()}`
      );
      expect(mockWebSocketGateway.leaveRoom).toHaveBeenCalledWith(
        clientId,
        `agent:${agent2.toString()}`
      );
    });

    it('should handle unsubscribe for non-existent client', () => {
      // Arrange
      const clientId = 'non-existent';

      // Act & Assert - Should not throw
      expect(() => service.unsubscribeClient(clientId)).not.toThrow();
    });
  });
});
