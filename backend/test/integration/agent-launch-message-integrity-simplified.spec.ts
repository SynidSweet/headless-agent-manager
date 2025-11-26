/**
 * Agent Launch → Message Persistence Integration Test (Simplified)
 *
 * Purpose: Verify agent exists in DB before messages are saved (prevents FK violations)
 * Type: Integration
 *
 * This test validates the critical fix:
 * - Agent MUST be saved to DB BEFORE runner starts
 * - Messages can then safely reference the agent_id (FK constraint satisfied)
 *
 * Uses REAL: Database, Repository, MessageService
 * Pattern: Self-contained (fresh DB per test)
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentMessageService } from '@application/services/agent-message.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('Agent Launch → Message Persistence (Simplified Integration)', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;
  let repository: SqliteAgentRepository;

  beforeEach(() => {
    // ✅ FRESH database for EACH test
    db = new DatabaseService(':memory:');
    db.onModuleInit();

    // ✅ Verify FK constraints enabled
    const fkEnabled = db.getDatabase().pragma('foreign_keys', { simple: true });
    if (fkEnabled !== 1) {
      throw new Error('FK constraints MUST be enabled');
    }

    // ✅ Clean database
    db.getDatabase().exec('DELETE FROM agent_messages');
    db.getDatabase().exec('DELETE FROM agents');

    messageService = new AgentMessageService(db);
    repository = new SqliteAgentRepository(db);
  });

  afterEach(() => {
    // ✅ CRITICAL: Close database
    try {
      db.close();
    } catch (e) {
      // Ignore double-close errors
    }
  });

  describe('FK Integrity: Agent Must Exist Before Messages', () => {
    /**
     * TEST 1: Agent saved to DB → Messages can be saved
     *
     * This is the CORRECT flow that prevents FK violations
     */
    it('should allow message save when agent exists in DB', async () => {
      // Arrange: Create and save agent FIRST
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test agent',
        configuration: {},
      });

      await repository.save(agent);

      // Act: Save message for the agent
      const message = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Test message',
      });

      // Assert: Message saved successfully (no FK violation)
      expect(message.id).toBeDefined();
      expect(message.agentId).toBe(agent.id.toString());
      expect(message.sequenceNumber).toBe(1);

      // Verify in database
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(1);
      expect(messages[0]!.agentId).toBe(agent.id.toString());
    });

    /**
     * TEST 2: Messages saved BEFORE agent → FK violation
     *
     * This reproduces the bug: messages emitted before agent saved to DB
     */
    it('should reject message save when agent does NOT exist in DB', async () => {
      // Arrange: Use UNIQUE random ID that definitely doesn't exist
      const nonExistentAgentId = `fake-agent-${Date.now()}-${Math.random().toString(36)}`;

      // Act & Assert: Attempt to save message (should fail with FK error)
      await expect(
        messageService.saveMessage({
          agentId: nonExistentAgentId,
          type: 'assistant',
          content: 'Test message',
        })
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);

      // Verify no messages were saved
      const messages = await messageService.findByAgentId(nonExistentAgentId);
      expect(messages).toHaveLength(0);
    });

    /**
     * TEST 3: Save agent → Multiple messages → All succeed
     *
     * Verifies multiple messages work once agent exists
     */
    it('should allow multiple messages when agent exists', async () => {
      // Arrange: Save agent first
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test agent',
        configuration: {},
      });

      await repository.save(agent);

      // Act: Save multiple messages
      const message1 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 1',
      });

      const message2 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 2',
      });

      const message3 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 3',
      });

      // Assert: All messages saved successfully
      expect(message1.sequenceNumber).toBe(1);
      expect(message2.sequenceNumber).toBe(2);
      expect(message3.sequenceNumber).toBe(3);

      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(3);
    });

    /**
     * TEST 4: Delete agent → CASCADE deletes messages
     *
     * Verifies FK CASCADE DELETE works
     */
    it('should CASCADE delete messages when agent deleted', async () => {
      // Arrange: Create agent with messages
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test agent',
        configuration: {},
      });

      await repository.save(agent);

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 1',
      });

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 2',
      });

      // Verify messages exist
      let messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(2);

      // Act: Delete agent
      await repository.delete(agent.id);

      // Assert: Messages CASCADE deleted
      messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(0);
    });

    /**
     * TEST 5: Concurrent message saves maintain FK integrity
     *
     * Verifies FK constraint works under concurrent load
     */
    it('should maintain FK integrity under concurrent message saves', async () => {
      // Arrange: Save agent
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test agent',
        configuration: {},
      });

      await repository.save(agent);

      // Act: Save multiple messages concurrently
      const saves = Array.from({ length: 10 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Concurrent message ${i}`,
        })
      );

      const savedMessages = await Promise.all(saves);

      // Assert: All messages saved successfully
      expect(savedMessages).toHaveLength(10);
      expect(new Set(savedMessages.map(m => m.sequenceNumber)).size).toBe(10); // All unique sequences

      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages).toHaveLength(10);
    });
  });
});
