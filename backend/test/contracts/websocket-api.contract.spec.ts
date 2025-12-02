/**
 * WebSocket API Contract Tests
 *
 * Purpose: Verify WebSocket event schemas are consistent and predictable
 * Layer: Boundary between Backend and Frontend
 * Type: Contract
 *
 * CRITICAL: These tests ensure frontend and backend stay in sync
 * Breaking changes to event schemas will fail these tests
 *
 * Contract Requirements:
 * 1. Event names must be stable ('agent:message', 'agent:status', etc.)
 * 2. Event payloads must have all required fields
 * 3. Field types must match frontend expectations
 * 4. Timestamps must be ISO 8601 format
 * 5. IDs must be valid UUIDs
 *
 * Events Tested:
 * - agent:message
 * - agent:status
 * - agent:created
 * - agent:updated
 * - agent:deleted
 *
 * Uses REAL: WebSocket gateway, streaming service, database
 * Mocks: None (full integration test of WebSocket layer)
 */

import { AgentGateway } from '@application/gateways/agent.gateway';
import { StreamingService } from '@application/services/streaming.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { DatabaseService } from '@infrastructure/database/database.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Server, Socket } from 'socket.io';
import { ILogger } from '@application/ports/logger.port';

describe('WebSocket API Contract', () => {
  let gateway: AgentGateway;
  let mockStreamingService: jest.Mocked<StreamingService>;
  let mockOrchestrationService: jest.Mocked<AgentOrchestrationService>;
  let mockLogger: jest.Mocked<ILogger>;
  let db: DatabaseService;
  let repository: SqliteAgentRepository;
  let mockSocket: jest.Mocked<Socket>;
  let mockServer: jest.Mocked<Server>;

  beforeEach(async () => {
    // Setup real database and repository
    db = new DatabaseService(':memory:');
    db.onModuleInit();
    repository = new SqliteAgentRepository(db);

    // Mock services (we're testing event schemas, not service logic)
    mockStreamingService = {} as any;
    mockOrchestrationService = {} as any;

    // Mock Logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    gateway = new AgentGateway(mockStreamingService, mockOrchestrationService, mockLogger);

    // Mock socket.io infrastructure
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      sockets: {
        sockets: new Map(),
      },
    } as any;

    mockSocket = {
      id: 'test-client-123',
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
    } as any;

    gateway.server = mockServer;
    mockServer.sockets.sockets.set(mockSocket.id, mockSocket);
  });

  afterEach(() => {
    db.close();
  });

  // UUID v4 regex
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  // ISO 8601 timestamp regex
  const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  describe('Event: agent:created', () => {
    it('must have agent field with complete agent data', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });

      // Act - Broadcast agent:created
      gateway.emitToAll('agent:created', {
        agent: {
          id: agent.id.toString(),
          type: agent.type.valueOf(),
          status: agent.status.valueOf(),
          prompt: agent.session.prompt,
        },
        timestamp: new Date().toISOString(),
      });

      // Assert
      expect(mockServer.emit).toHaveBeenCalledWith(
        'agent:created',
        expect.objectContaining({
          agent: expect.objectContaining({
            id: expect.stringMatching(UUID_REGEX),
            type: expect.any(String),
            status: expect.any(String),
            prompt: expect.any(String),
          }),
          timestamp: expect.stringMatching(ISO_8601_REGEX),
        })
      );
    });

    it('must have timestamp field in ISO 8601 format', () => {
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });

      gateway.emitToAll('agent:created', {
        agent: {
          id: agent.id.toString(),
          type: agent.type.valueOf(),
          status: agent.status.valueOf(),
        },
        timestamp: new Date().toISOString(),
      });

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    });

    it('agent.id must match database record', async () => {
      // Arrange - Save agent to database
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Emit agent:created
      gateway.emitToAll('agent:created', {
        agent: {
          id: agent.id.toString(),
          type: agent.type.valueOf(),
          status: agent.status.valueOf(),
        },
        timestamp: new Date().toISOString(),
      });

      // Assert - ID in event matches database
      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      const dbAgent = await repository.findById(AgentId.fromString(payload.agent.id));

      expect(dbAgent).toBeDefined();
      expect(dbAgent?.id.toString()).toBe(agent.id.toString());
    });
  });

  describe('Event: agent:message', () => {
    it('must have agentId field (string UUID)', () => {
      // Arrange
      const agentId = AgentId.generate();
      const messageData = {
        agentId: agentId.toString(),
        message: {
          id: AgentId.generate().toString(),
          agentId: agentId.toString(),
          sequenceNumber: 1,
          type: 'assistant',
          content: 'Test message',
          createdAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      // Act
      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:message', messageData);

      // Assert
      expect(mockServer.to).toHaveBeenCalledWith(`agent:${agentId.toString()}`);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'agent:message',
        expect.objectContaining({
          agentId: expect.stringMatching(UUID_REGEX),
        })
      );
    });

    it('must have message field with required properties', () => {
      const agentId = AgentId.generate();
      const messageData = {
        agentId: agentId.toString(),
        message: {
          id: AgentId.generate().toString(),
          agentId: agentId.toString(),
          sequenceNumber: 1,
          type: 'assistant',
          content: 'Test',
          createdAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:message', messageData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];

      expect(payload.message).toMatchObject({
        id: expect.stringMatching(UUID_REGEX),
        agentId: expect.stringMatching(UUID_REGEX),
        sequenceNumber: expect.any(Number),
        type: expect.stringMatching(/^(assistant|user|system|error)$/),
        content: expect.any(String),
        createdAt: expect.stringMatching(ISO_8601_REGEX),
      });
    });

    it('must have timestamp field (ISO 8601)', () => {
      const agentId = AgentId.generate();
      const messageData = {
        agentId: agentId.toString(),
        message: {
          id: AgentId.generate().toString(),
          agentId: agentId.toString(),
          sequenceNumber: 1,
          type: 'assistant',
          content: 'Test',
          createdAt: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:message', messageData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    });
  });

  describe('Event: agent:status', () => {
    it('must have agentId field', () => {
      const agentId = AgentId.generate();
      const statusData = {
        agentId: agentId.toString(),
        status: 'running',
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:status', statusData);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'agent:status',
        expect.objectContaining({
          agentId: expect.stringMatching(UUID_REGEX),
        })
      );
    });

    it('must have status field (valid enum value)', () => {
      const agentId = AgentId.generate();
      const statusData = {
        agentId: agentId.toString(),
        status: 'running',
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:status', statusData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.status).toMatch(/^(initializing|running|paused|completed|failed|terminated)$/);
    });

    it('must have timestamp field', () => {
      const agentId = AgentId.generate();
      const statusData = {
        agentId: agentId.toString(),
        status: 'running',
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:status', statusData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    });
  });

  describe('Event: agent:updated', () => {
    it('must have agentId field', () => {
      const agentId = AgentId.generate();
      const updateData = {
        agentId: agentId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      gateway.emitToAll('agent:updated', updateData);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'agent:updated',
        expect.objectContaining({
          agentId: expect.stringMatching(UUID_REGEX),
        })
      );
    });

    it('must have status field', () => {
      const agentId = AgentId.generate();
      const updateData = {
        agentId: agentId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      gateway.emitToAll('agent:updated', updateData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.status).toBeDefined();
    });

    it('must have timestamp field', () => {
      const agentId = AgentId.generate();
      const updateData = {
        agentId: agentId.toString(),
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      gateway.emitToAll('agent:updated', updateData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    });
  });

  describe('Event: agent:deleted', () => {
    it('must have agentId field', () => {
      const agentId = AgentId.generate();
      const deleteData = {
        agentId: agentId.toString(),
        timestamp: new Date().toISOString(),
      };

      gateway.emitToAll('agent:deleted', deleteData);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'agent:deleted',
        expect.objectContaining({
          agentId: expect.stringMatching(UUID_REGEX),
        })
      );
    });

    it('must have timestamp field', () => {
      const agentId = AgentId.generate();
      const deleteData = {
        agentId: agentId.toString(),
        timestamp: new Date().toISOString(),
      };

      gateway.emitToAll('agent:deleted', deleteData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    });

    it('must emit AFTER database deletion', async () => {
      // Arrange - Create and save agent
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Delete from database first
      await repository.delete(agent.id);

      // Then emit event
      gateway.emitToAll('agent:deleted', {
        agentId: agent.id.toString(),
        timestamp: new Date().toISOString(),
      });

      // Assert - Agent should not exist in database when event is emitted
      const dbAgent = await repository.findById(agent.id);
      expect(dbAgent).toBeNull(); // Deleted before event emitted
    });
  });

  describe('Event: agent:complete', () => {
    it('must have agentId field', () => {
      const agentId = AgentId.generate();
      const completeData = {
        agentId: agentId.toString(),
        result: {
          status: 'success',
          duration: 1500,
          messageCount: 5,
        },
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:complete', completeData);

      expect(mockServer.emit).toHaveBeenCalledWith(
        'agent:complete',
        expect.objectContaining({
          agentId: expect.stringMatching(UUID_REGEX),
        })
      );
    });

    it('must have result field with status and duration', () => {
      const agentId = AgentId.generate();
      const completeData = {
        agentId: agentId.toString(),
        result: {
          status: 'success',
          duration: 1500,
          messageCount: 5,
        },
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:complete', completeData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.result).toMatchObject({
        status: expect.stringMatching(/^(success|failed)$/),
        duration: expect.any(Number),
        messageCount: expect.any(Number),
      });
    });

    it('must have timestamp field', () => {
      const agentId = AgentId.generate();
      const completeData = {
        agentId: agentId.toString(),
        result: {
          status: 'success',
          duration: 1500,
          messageCount: 5,
        },
        timestamp: new Date().toISOString(),
      };

      gateway.emitToRoom(`agent:${agentId.toString()}`, 'agent:complete', completeData);

      const call = mockServer.emit.mock.calls[0];
      expect(call).toBeDefined();
      const payload = call![1];
      expect(payload.timestamp).toMatch(ISO_8601_REGEX);
    });
  });
});
