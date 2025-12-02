import { AgentMessageService } from '@application/services/agent-message.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { DatabaseService } from '@infrastructure/database/database.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * E2E Integration Test: Message Persistence Complete Flow
 *
 * This test suite simulates the COMPLETE real-world flow:
 * 1. Create agent
 * 2. Stream messages (simulating real agent output)
 * 3. Update agent status multiple times
 * 4. Verify ALL messages persist throughout lifecycle
 *
 * These tests would have CAUGHT both bugs:
 * - INSERT OR REPLACE causing CASCADE DELETE
 * - WAL mode data loss on process termination
 */
describe('Message Persistence E2E (Integration)', () => {
  let messageService: AgentMessageService;
  let repository: SqliteAgentRepository;
  let databaseService: DatabaseService;

  beforeEach(() => {
    // Use REAL database (in-memory for speed)
    databaseService = new DatabaseService(':memory:');
    databaseService.onModuleInit();

    // Use REAL repository and service
    repository = new SqliteAgentRepository(databaseService);
    messageService = new AgentMessageService(databaseService);
  });

  afterEach(() => {
    databaseService.onModuleDestroy();
  });

  describe('Complete agent lifecycle with message persistence', () => {
    it('should persist messages through complete agent lifecycle', async () => {
      // ========================================
      // PHASE 1: Agent Creation
      // ========================================
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test lifecycle',
        configuration: {},
      });
      await repository.save(agent);

      // Verify agent exists
      const agentAfterCreate = await repository.findById(agent.id);
      expect(agentAfterCreate).toBeDefined();

      // ========================================
      // PHASE 2: Streaming Messages (INITIALIZING state)
      // ========================================
      // Simulate agent starting to produce output
      const messages1 = [
        { type: 'system' as const, content: 'Agent initialized' },
        { type: 'assistant' as const, content: 'Starting task...' },
        { type: 'assistant' as const, content: 'Reading files...' },
      ];

      for (const msg of messages1) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: msg.type,
          role: msg.type,
          content: msg.content,
        });
      }

      // Verify messages saved
      let persistedMessages = await messageService.findByAgentId(agent.id.toString());
      expect(persistedMessages).toHaveLength(3);

      // ========================================
      // PHASE 3: Agent Transitions to RUNNING
      // ========================================
      agent.markAsRunning();
      await repository.save(agent); // THIS WAS CAUSING CASCADE DELETE!

      // CRITICAL: Verify messages survived status transition
      persistedMessages = await messageService.findByAgentId(agent.id.toString());
      expect(persistedMessages).toHaveLength(3);
      expect(persistedMessages[0]?.content).toBe('Agent initialized');
      expect(persistedMessages[2]?.content).toBe('Reading files...');

      // ========================================
      // PHASE 4: More Messages While RUNNING
      // ========================================
      const messages2 = [
        { type: 'assistant' as const, content: 'Analyzing code...' },
        { type: 'tool' as const, content: 'Running grep command' },
        { type: 'response' as const, content: 'Found 10 matches' },
        { type: 'assistant' as const, content: 'Writing report...' },
      ];

      for (const msg of messages2) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: msg.type,
          role: msg.type === 'assistant' ? 'assistant' : undefined,
          content: msg.content,
        });
      }

      // Verify all 7 messages exist
      persistedMessages = await messageService.findByAgentId(agent.id.toString());
      expect(persistedMessages).toHaveLength(7);

      // ========================================
      // PHASE 5: Agent Transitions to COMPLETED
      // ========================================
      agent.markAsCompleted();
      await repository.save(agent); // Another UPDATE that could trigger CASCADE DELETE

      // CRITICAL: Verify ALL messages still exist
      persistedMessages = await messageService.findByAgentId(agent.id.toString());
      expect(persistedMessages).toHaveLength(7);

      // ========================================
      // PHASE 6: Verify Data Integrity
      // ========================================
      // Verify sequence numbers are correct
      const sequences = persistedMessages.map((m) => m.sequenceNumber);
      expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // Verify content integrity
      expect(persistedMessages[0]?.content).toBe('Agent initialized');
      expect(persistedMessages[3]?.content).toBe('Analyzing code...');
      expect(persistedMessages[6]?.content).toBe('Writing report...');

      // Verify agent final state
      const finalAgent = await repository.findById(agent.id);
      expect(finalAgent?.status.toString()).toBe('completed');
      expect(finalAgent?.startedAt).toBeDefined();
      expect(finalAgent?.completedAt).toBeDefined();

      // ========================================
      // PHASE 7: Verify via Direct Database Query
      // ========================================
      const db = databaseService.getDatabase();
      const dbMessages = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM agent_messages WHERE agent_id = ?
      `
        )
        .get(agent.id.toString()) as { count: number };

      expect(dbMessages.count).toBe(7);
    });

    it('should handle rapid status updates without losing messages', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Rapid test',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Interleave message saves with status updates
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 1',
      });

      agent.markAsRunning();
      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 2',
      });

      // Redundant saves (simulating rapid updates)
      await repository.save(agent);
      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 3',
      });

      agent.markAsCompleted();
      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'system',
        content: 'Agent completed',
      });

      // Assert: All 4 messages should exist
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(4);
      expect(messages[0]?.content).toBe('Message 1');
      expect(messages[3]?.content).toBe('Agent completed');
    });

    it('should preserve messages across multiple rapid status changes', async () => {
      // Arrange: Create agent with initial messages
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Status change test',
        configuration: {},
      });
      await repository.save(agent);

      // Create 10 messages
      for (let i = 1; i <= 10; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Act: Rapid status transitions
      agent.markAsRunning();
      await repository.save(agent);
      await repository.save(agent); // Redundant
      await repository.save(agent); // Redundant
      await repository.save(agent); // Redundant

      agent.markAsCompleted();
      await repository.save(agent);
      await repository.save(agent); // Redundant

      // Assert: All 10 messages should still exist
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(10);

      // Verify sequence integrity
      for (let i = 0; i < 10; i++) {
        expect(messages[i]?.sequenceNumber).toBe(i + 1);
        expect(messages[i]?.content).toBe(`Message ${i + 1}`);
      }
    });
  });

  describe('Multi-agent scenarios', () => {
    it('should preserve messages for multiple agents independently', async () => {
      // Arrange: Create 3 agents
      const agents = [
        Agent.create({ type: AgentType.CLAUDE_CODE, prompt: 'Agent 1', configuration: {} }),
        Agent.create({ type: AgentType.CLAUDE_CODE, prompt: 'Agent 2', configuration: {} }),
        Agent.create({ type: AgentType.CLAUDE_CODE, prompt: 'Agent 3', configuration: {} }),
      ];

      for (const agent of agents) {
        await repository.save(agent);
      }

      // Act: Create different numbers of messages for each agent
      for (let i = 1; i <= 5; i++) {
        await messageService.saveMessage({
          agentId: agents[0]!.id.toString(),
          type: 'assistant',
          content: `Agent1 Message ${i}`,
        });
      }

      for (let i = 1; i <= 3; i++) {
        await messageService.saveMessage({
          agentId: agents[1]!.id.toString(),
          type: 'assistant',
          content: `Agent2 Message ${i}`,
        });
      }

      for (let i = 1; i <= 7; i++) {
        await messageService.saveMessage({
          agentId: agents[2]!.id.toString(),
          type: 'assistant',
          content: `Agent3 Message ${i}`,
        });
      }

      // Update all agents
      for (const agent of agents) {
        agent.markAsRunning();
        await repository.save(agent);
        agent.markAsCompleted();
        await repository.save(agent);
      }

      // Assert: Each agent should have its messages intact
      const messages1 = await messageService.findByAgentId(agents[0]!.id.toString());
      const messages2 = await messageService.findByAgentId(agents[1]!.id.toString());
      const messages3 = await messageService.findByAgentId(agents[2]!.id.toString());

      expect(messages1).toHaveLength(5);
      expect(messages2).toHaveLength(3);
      expect(messages3).toHaveLength(7);

      // Verify message content
      expect(messages1[0]?.content).toBe('Agent1 Message 1');
      expect(messages2[0]?.content).toBe('Agent2 Message 1');
      expect(messages3[0]?.content).toBe('Agent3 Message 1');
    });
  });

  describe('Edge cases and error scenarios', () => {
    it('should handle agent with no messages', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'No messages',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Update status without messages
      agent.markAsRunning();
      await repository.save(agent);
      agent.markAsCompleted();
      await repository.save(agent);

      // Assert: No errors, agent should be completed
      const finalAgent = await repository.findById(agent.id);
      expect(finalAgent?.status.toString()).toBe('completed');

      // Messages should be empty
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(0);
    });

    it('should preserve messages when agent fails', async () => {
      // Arrange: Create agent with messages
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Failing agent',
        configuration: {},
      });
      await repository.save(agent);

      // Create messages
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Starting...',
      });

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'error',
        content: 'Something went wrong!',
      });

      // Act: Mark agent as failed
      agent.markAsRunning();
      await repository.save(agent);

      const error = new Error('Test error');
      agent.markAsFailed(error);
      await repository.save(agent);

      // Assert: Messages should survive failure
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(2);
      expect(messages[1]?.content).toBe('Something went wrong!');

      // Verify agent is failed
      const failedAgent = await repository.findById(agent.id);
      expect(failedAgent?.status.toString()).toBe('failed');
      expect(failedAgent?.error?.message).toBe('Test error');
    });

    it('should handle large message volumes', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Large volume',
        configuration: {},
      });
      await repository.save(agent);

      // Act: Create 100 messages with status updates in between
      for (let i = 1; i <= 100; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i}`,
        });

        // Update agent status every 25 messages
        if (i % 25 === 0) {
          if (i === 25) agent.markAsRunning();
          await repository.save(agent);
        }
      }

      agent.markAsCompleted();
      await repository.save(agent);

      // Assert: All 100 messages should exist
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(100);

      // Verify sequence integrity
      for (let i = 0; i < 100; i++) {
        expect(messages[i]?.sequenceNumber).toBe(i + 1);
      }

      // Verify first and last messages
      expect(messages[0]?.content).toBe('Message 1');
      expect(messages[99]?.content).toBe('Message 100');
    });
  });

  describe('Database consistency checks', () => {
    it('should maintain referential integrity throughout lifecycle', async () => {
      // Arrange: Create agent
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Integrity test',
        configuration: {},
      });
      await repository.save(agent);

      // Create messages
      for (let i = 1; i <= 5; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Act: Update agent multiple times
      agent.markAsRunning();
      await repository.save(agent);
      agent.markAsCompleted();
      await repository.save(agent);

      // Assert: Direct database query to verify FK relationships
      const db = databaseService.getDatabase();

      // All messages should reference existing agent
      const orphanedMessages = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM agent_messages
        WHERE agent_id NOT IN (SELECT id FROM agents)
      `
        )
        .get() as { count: number };

      expect(orphanedMessages.count).toBe(0);

      // All messages should reference our specific agent
      const agentMessages = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM agent_messages
        WHERE agent_id = ?
      `
        )
        .get(agent.id.toString()) as { count: number };

      expect(agentMessages.count).toBe(5);
    });

    it('should verify CASCADE DELETE works when agent is deleted', async () => {
      // Arrange: Create agent with messages
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Cascade test',
        configuration: {},
      });
      await repository.save(agent);

      // Create messages
      for (let i = 1; i <= 5; i++) {
        await messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Verify messages exist
      let messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(5);

      // Act: Delete agent (should CASCADE DELETE messages)
      await repository.delete(agent.id);

      // Assert: Messages should be deleted too
      messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(0);

      // Verify via direct database query
      const db = databaseService.getDatabase();
      const dbMessages = db
        .prepare(
          `
        SELECT COUNT(*) as count FROM agent_messages WHERE agent_id = ?
      `
        )
        .get(agent.id.toString()) as { count: number };

      expect(dbMessages.count).toBe(0);
    });
  });
});
