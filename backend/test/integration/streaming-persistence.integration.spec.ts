import { AgentMessageService } from '@application/services/agent-message.service';
import { StreamingService } from '@application/services/streaming.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';
import { AgentMessage } from '@application/ports/agent-runner.port';

/**
 * Integration Test: Streaming + Message Persistence Architecture
 *
 * This test suite verifies the COMPLETE integration of:
 * 1. Real-time token streaming to frontend (WebSocket)
 * 2. Message persistence to database (DELETE journal mode)
 * 3. Agent status transitions with UPDATE (preserves messages)
 *
 * Key architectural validations:
 * - Messages are saved BEFORE emitting to WebSocket
 * - UPDATE is used for agent changes (not INSERT OR REPLACE)
 * - Messages survive agent status transitions
 * - DELETE journal mode persists data immediately
 * - Sequence numbers maintain correct ordering
 * - Multiple agents have isolated message streams
 *
 * This test uses REAL services to catch bugs that unit tests miss.
 */
describe('Streaming + Persistence Integration', () => {
  let databaseService: DatabaseService;
  let messageService: AgentMessageService;
  let repository: SqliteAgentRepository;
  let streamingService: StreamingService;
  let mockWebSocketGateway: jest.Mocked<IWebSocketGateway>;

  beforeEach(() => {
    // Setup REAL services with in-memory database
    databaseService = new DatabaseService(':memory:');
    databaseService.onModuleInit(); // Connects and runs migrations

    messageService = new AgentMessageService(databaseService);
    repository = new SqliteAgentRepository(databaseService);

    // Mock only the WebSocket gateway (external dependency)
    mockWebSocketGateway = {
      emitToClient: jest.fn(),
      emitToAll: jest.fn(),
      emitToRoom: jest.fn(),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn(),
      getConnectedClients: jest.fn().mockReturnValue([]),
      isClientConnected: jest.fn().mockReturnValue(true),
    };

    streamingService = new StreamingService(
      mockWebSocketGateway,
      repository,
      messageService
    );
  });

  afterEach(() => {
    databaseService.close();
  });

  describe('Token streaming flow', () => {
    it('should stream tokens to frontend AND save to database', async () => {
      // Arrange: Create and save agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Simulate streaming tokens (one message per token)
      const tokens = ['Hello', ' ', 'world', '!'];

      for (const token of tokens) {
        const message: AgentMessage = {
          type: 'assistant',
          content: token,
          role: 'assistant',
        };
        await streamingService.broadcastMessage(agent.id, message);
      }

      // Assert: All tokens were saved to database
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages.length).toBeGreaterThanOrEqual(tokens.length);

      // Verify content matches
      for (let i = 0; i < tokens.length; i++) {
        expect(messages[i]?.content).toBe(tokens[i]);
      }

      // Assert: WebSocket was called for each token
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledTimes(tokens.length);

      // Verify WebSocket emissions happened AFTER database saves
      for (let i = 0; i < tokens.length; i++) {
        expect(mockWebSocketGateway.emitToRoom).toHaveBeenNthCalledWith(
          i + 1,
          `agent:${agent.id.toString()}`,
          'agent:message',
          expect.objectContaining({
            agentId: agent.id.toString(),
            message: expect.objectContaining({
              content: tokens[i],
            }),
          })
        );
      }
    });

    it('should preserve message order with sequence numbers', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Save messages in order
      for (let i = 1; i <= 10; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Token ${i}`,
          role: 'assistant',
        });
      }

      // Assert: Retrieve and verify order
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(10);

      for (let i = 0; i < 10; i++) {
        expect(messages[i]?.sequenceNumber).toBe(i + 1);
        expect(messages[i]?.content).toBe(`Token ${i + 1}`);
      }
    });

    it('should save to database BEFORE emitting to WebSocket', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Track call order
      const callOrder: string[] = [];

      // Mock database to track when save happens
      const originalSave = messageService.saveMessage.bind(messageService);
      jest.spyOn(messageService, 'saveMessage').mockImplementation(async (dto) => {
        callOrder.push('database-save');
        return originalSave(dto);
      });

      // Mock WebSocket to track when emit happens
      mockWebSocketGateway.emitToRoom.mockImplementation(() => {
        callOrder.push('websocket-emit');
      });

      // Act: Broadcast message
      await streamingService.broadcastMessage(agent.id, {
        type: 'assistant',
        content: 'Test',
        role: 'assistant',
      });

      // Assert: Database save must happen BEFORE WebSocket emit
      expect(callOrder).toEqual(['database-save', 'websocket-emit']);
    });

    it('should handle rapid successive messages without data loss', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Broadcast many messages rapidly
      const messageCount = 50;
      const broadcastPromises: Promise<void>[] = [];

      for (let i = 1; i <= messageCount; i++) {
        broadcastPromises.push(
          streamingService.broadcastMessage(agent.id, {
            type: 'assistant',
            content: `Message ${i}`,
            role: 'assistant',
          })
        );
      }

      await Promise.all(broadcastPromises);

      // Assert: All messages saved with correct sequence
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(messageCount);

      // Verify sequence numbers are monotonic (no gaps or duplicates)
      for (let i = 0; i < messageCount; i++) {
        expect(messages[i]?.sequenceNumber).toBe(i + 1);
      }
    });
  });

  describe('Agent status changes with messages', () => {
    it('should preserve messages when agent transitions to running', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent); // INSERT

      // Save messages
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Msg 1',
        role: 'assistant',
      });
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Msg 2',
        role: 'assistant',
      });

      // Act: Update to running (uses UPDATE, not INSERT OR REPLACE)
      agent.markAsRunning();
      await repository.save(agent); // UPDATE

      // Assert: Messages should survive
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(2);
      expect(messages[0]?.content).toBe('Msg 1');
      expect(messages[1]?.content).toBe('Msg 2');
    });

    it('should preserve messages when agent completes', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Save messages
      for (let i = 1; i <= 5; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i}`,
          role: 'assistant',
        });
      }

      // Act: Transition through states
      agent.markAsRunning();
      await repository.save(agent);

      agent.markAsCompleted();
      await repository.save(agent);

      // Assert: All 5 messages should survive
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(5);

      // Verify agent status is updated
      const persistedAgent = await repository.findById(agent.id);
      expect(persistedAgent?.status).toBe(AgentStatus.COMPLETED);
    });

    it('should preserve messages when agent fails', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Before error',
        role: 'assistant',
      });

      // Act: Transition to failed
      agent.markAsRunning();
      await repository.save(agent);

      agent.markAsFailed(new Error('Test error'));
      await repository.save(agent);

      // Assert: Message should survive error
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(1);
      expect(messages[0]?.content).toBe('Before error');

      // Verify agent status is updated
      const persistedAgent = await repository.findById(agent.id);
      expect(persistedAgent?.status).toBe(AgentStatus.FAILED);
      expect(persistedAgent?.error?.message).toBe('Test error');
    });

    it('should preserve messages when agent is terminated', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Add messages
      for (let i = 1; i <= 3; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i}`,
          role: 'assistant',
        });
      }

      // Act: Transition to terminated
      agent.markAsRunning();
      await repository.save(agent);

      agent.markAsTerminated();
      await repository.save(agent);

      // Assert: All messages survive
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(3);

      // Verify agent status
      const persistedAgent = await repository.findById(agent.id);
      expect(persistedAgent?.status).toBe(AgentStatus.TERMINATED);
    });

    it('should handle complete lifecycle with messages at each stage', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'lifecycle test',
        configuration: {},
      });
      await repository.save(agent);

      // Stage 1: INITIALIZING - add messages
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'system',
        content: 'Initializing agent',
        role: 'system',
      });

      // Stage 2: RUNNING - add more messages
      agent.markAsRunning();
      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Running task 1',
        role: 'assistant',
      });

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Running task 2',
        role: 'assistant',
      });

      // Stage 3: COMPLETED - add final message
      agent.markAsCompleted();
      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'system',
        content: 'Task completed',
        role: 'system',
      });

      // Assert: All messages from all stages should be present
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(4);
      expect(messages[0]?.content).toBe('Initializing agent');
      expect(messages[1]?.content).toBe('Running task 1');
      expect(messages[2]?.content).toBe('Running task 2');
      expect(messages[3]?.content).toBe('Task completed');

      // Verify sequence numbers
      expect(messages[0]?.sequenceNumber).toBe(1);
      expect(messages[1]?.sequenceNumber).toBe(2);
      expect(messages[2]?.sequenceNumber).toBe(3);
      expect(messages[3]?.sequenceNumber).toBe(4);
    });
  });

  describe('Multiple agents', () => {
    it('should isolate messages between agents', async () => {
      // Arrange: Create two agents
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Agent 1',
        configuration: {},
      });
      const agent2 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Agent 2',
        configuration: {},
      });

      await repository.save(agent1);
      await repository.save(agent2);

      // Act: Save messages for agent 1
      await messageService.saveMessage({
        agentId: agent1.id.toString(),
        type: 'assistant',
        content: 'A1 M1',
        role: 'assistant',
      });
      await messageService.saveMessage({
        agentId: agent1.id.toString(),
        type: 'assistant',
        content: 'A1 M2',
        role: 'assistant',
      });

      // Save messages for agent 2
      await messageService.saveMessage({
        agentId: agent2.id.toString(),
        type: 'assistant',
        content: 'A2 M1',
        role: 'assistant',
      });

      // Update both agents
      agent1.markAsRunning();
      agent1.markAsCompleted();
      agent2.markAsRunning();
      agent2.markAsCompleted();
      await repository.save(agent1);
      await repository.save(agent2);

      // Assert: Verify isolation
      const messages1 = await messageService.findByAgentId(agent1.id.toString());
      const messages2 = await messageService.findByAgentId(agent2.id.toString());

      expect(messages1).toHaveLength(2);
      expect(messages2).toHaveLength(1);

      expect(messages1[0]?.content).toBe('A1 M1');
      expect(messages1[1]?.content).toBe('A1 M2');
      expect(messages2[0]?.content).toBe('A2 M1');
    });

    it('should handle concurrent streaming from multiple agents', async () => {
      // Arrange: Create multiple agents
      const agents = await Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: `Agent ${i + 1}`,
            configuration: {},
          })
        )
      );

      // Save all agents
      await Promise.all(agents.map((agent) => repository.save(agent)));

      // Act: Stream messages from all agents concurrently
      const streamPromises: Promise<void>[] = [];

      agents.forEach((agent, agentIndex) => {
        for (let i = 1; i <= 5; i++) {
          streamPromises.push(
            streamingService.broadcastMessage(agent.id, {
              type: 'assistant',
              content: `Agent ${agentIndex + 1} Message ${i}`,
              role: 'assistant',
            })
          );
        }
      });

      await Promise.all(streamPromises);

      // Assert: Each agent should have exactly 5 messages
      for (let i = 0; i < agents.length; i++) {
        const messages = await messageService.findByAgentId(agents[i]!.id.toString());
        expect(messages).toHaveLength(5);

        // Verify correct sequence
        messages.forEach((msg, msgIndex) => {
          expect(msg.sequenceNumber).toBe(msgIndex + 1);
          expect(msg.content).toBe(`Agent ${i + 1} Message ${msgIndex + 1}`);
        });
      }
    });
  });

  describe('DELETE journal mode behavior', () => {
    it('should persist messages immediately without WAL', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Save message
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Test message',
        role: 'assistant',
      });

      // Assert: Query immediately (DELETE mode writes synchronously)
      const db = databaseService.getDatabase();
      const messages = db
        .prepare('SELECT * FROM agent_messages WHERE agent_id = ?')
        .all(agent.id.toString());

      expect(messages).toHaveLength(1);
      expect((messages[0] as any).content).toBe('Test message');
    });

    it('should verify journal mode is DELETE or MEMORY (for in-memory DB)', () => {
      // Assert: Verify database is using DELETE or MEMORY mode
      // In-memory databases use MEMORY mode, file-based use DELETE mode
      const db = databaseService.getDatabase();
      const journalMode = db.pragma('journal_mode', { simple: true });

      // Both DELETE and MEMORY modes persist data immediately (no WAL)
      expect(['delete', 'memory']).toContain(journalMode);
    });

    it('should verify foreign keys are enabled', () => {
      // Assert: Verify FK constraints are enabled
      const db = databaseService.getDatabase();
      const foreignKeys = db.pragma('foreign_keys', { simple: true });

      expect(foreignKeys).toBe(1);
    });

    it('should enforce foreign key constraints on message save', async () => {
      // Arrange: Non-existent agent ID
      const fakeAgentId = AgentId.generate();

      // Act & Assert: Should throw FK constraint error
      await expect(
        messageService.saveMessage({
          agentId: fakeAgentId.toString(),
          type: 'assistant',
          content: 'This should fail',
          role: 'assistant',
        })
      ).rejects.toThrow();
    });
  });

  describe('StreamingService status persistence', () => {
    it('should persist agent completion via broadcastComplete', async () => {
      // Arrange: Create running agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      agent.markAsRunning();
      await repository.save(agent);

      // Act: Broadcast completion
      await streamingService.broadcastComplete(agent.id, {
        status: 'success',
        duration: 1000,
        messageCount: 0,
      });

      // Assert: Agent should be COMPLETED in database
      const persistedAgent = await repository.findById(agent.id);
      expect(persistedAgent?.status).toBe(AgentStatus.COMPLETED);
      expect(persistedAgent?.completedAt).toBeDefined();

      // Verify WebSocket was called
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agent.id.toString()}`,
        'agent:complete',
        expect.objectContaining({
          agentId: agent.id.toString(),
        })
      );
    });

    it('should persist agent failure via broadcastError', async () => {
      // Arrange: Create running agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      agent.markAsRunning();
      await repository.save(agent);

      // Act: Broadcast error
      const testError = new Error('Test failure');
      await streamingService.broadcastError(agent.id, testError);

      // Assert: Agent should be FAILED in database
      const persistedAgent = await repository.findById(agent.id);
      expect(persistedAgent?.status).toBe(AgentStatus.FAILED);
      expect(persistedAgent?.error?.message).toBe('Test failure');
      expect(persistedAgent?.completedAt).toBeDefined();

      // Verify WebSocket was called
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agent.id.toString()}`,
        'agent:error',
        expect.objectContaining({
          agentId: agent.id.toString(),
          error: expect.objectContaining({
            message: 'Test failure',
          }),
        })
      );
    });

    it('should handle agent not found in broadcastComplete', async () => {
      // Arrange: Non-existent agent
      const fakeAgentId = AgentId.generate();

      // Act: Broadcast completion for non-existent agent
      await streamingService.broadcastComplete(fakeAgentId, {
        status: 'success',
        duration: 1000,
        messageCount: 0,
      });

      // Assert: Should not throw (logs warning instead)
      // Verify WebSocket still called (frontend will handle)
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalled();
    });

    it('should handle agent not found in broadcastError', async () => {
      // Arrange: Non-existent agent
      const fakeAgentId = AgentId.generate();

      // Act: Broadcast error for non-existent agent
      await streamingService.broadcastError(fakeAgentId, new Error('Test'));

      // Assert: Should not throw (logs warning instead)
      // Verify WebSocket still called (frontend will handle)
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should propagate FK constraint violation from broadcastMessage', async () => {
      // Arrange: Non-existent agent
      const fakeAgentId = AgentId.generate();

      // Act & Assert: Should throw FK violation error
      await expect(
        streamingService.broadcastMessage(fakeAgentId, {
          type: 'assistant',
          content: 'This should fail',
          role: 'assistant',
        })
      ).rejects.toThrow(/does not exist/);

      // Verify WebSocket error was emitted
      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${fakeAgentId.toString()}`,
        'agent:error',
        expect.objectContaining({
          agentId: fakeAgentId.toString(),
          error: expect.objectContaining({
            message: expect.stringContaining('does not exist'),
          }),
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Mock database to throw error
      jest.spyOn(messageService, 'saveMessage').mockRejectedValue(new Error('Database locked'));

      // Act & Assert: Should propagate error
      await expect(
        streamingService.broadcastMessage(agent.id, {
          type: 'assistant',
          content: 'Test',
          role: 'assistant',
        })
      ).rejects.toThrow('Database locked');
    });
  });

  describe('Message metadata and raw fields', () => {
    it('should persist and retrieve message metadata', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Save message with metadata
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Test message',
        role: 'assistant',
        metadata: {
          tokenCount: 42,
          model: 'claude-3-5-sonnet',
          custom: { nested: 'value' },
        },
      });

      // Assert: Metadata should be preserved
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(1);
      expect(messages[0]?.metadata).toEqual({
        tokenCount: 42,
        model: 'claude-3-5-sonnet',
        custom: { nested: 'value' },
      });
    });

    it('should persist and retrieve raw JSON', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });
      await repository.save(agent);

      const rawJson = JSON.stringify({
        type: 'assistant',
        content: 'Original CLI output',
        timestamp: '2025-01-01T00:00:00Z',
      });

      // Act: Save message with raw JSON
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Parsed content',
        role: 'assistant',
        raw: rawJson,
      });

      // Assert: Raw JSON should be preserved
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(1);
      expect(messages[0]?.raw).toBe(rawJson);
    });
  });
});
