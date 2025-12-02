/**
 * Message Deduplication & Ordering Integration Tests
 *
 * Purpose: Verify message deduplication by UUID and ordering by sequence number
 * Type: Integration (Database + Service)
 *
 * Critical for:
 * - Preventing duplicate messages in frontend
 * - Maintaining correct message order
 * - Gap detection
 * - Handling out-of-order delivery
 *
 * Uses REAL: Database, AgentMessageService
 * Mocks: None (need real constraints)
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { AgentMessageService } from '@application/services/agent-message.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('Message Deduplication & Ordering', () => {
  let db: DatabaseService;
  let repository: SqliteAgentRepository;
  let messageService: AgentMessageService;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    db.onModuleInit();
    repository = new SqliteAgentRepository(db);
    messageService = new AgentMessageService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('UUID Deduplication', () => {
    it('should reject duplicate message with same UUID', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      const messageId = '11111111-1111-1111-1111-111111111111';

      // Insert first message
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(messageId, agent.id.toString(), 1, 'assistant', 'First', new Date().toISOString());

      // Act & Assert - Try to insert with same UUID
      expect(() => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            messageId, // Same UUID!
            agent.id.toString(),
            2, // Different sequence
            'assistant',
            'Second',
            new Date().toISOString()
          );
      }).toThrow(/UNIQUE constraint failed.*id/);
    });

    it('should allow messages with different UUIDs', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Save multiple messages (each gets unique UUID)
      const msg1 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 1',
      });

      const msg2 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Message 2',
      });

      // Assert - Different UUIDs
      expect(msg1.id).not.toBe(msg2.id);
    });

    it('should maintain UUID uniqueness across multiple agents', async () => {
      // Arrange - Two agents
      const agent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });

      const agent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });

      await repository.save(agent1);
      await repository.save(agent2);

      // Act - Save messages for both agents
      const agent1Messages = await Promise.all(
        Array.from({ length: 10 }, () =>
          messageService.saveMessage({
            agentId: agent1.id.toString(),
            type: 'assistant',
            content: 'Test',
          })
        )
      );

      const agent2Messages = await Promise.all(
        Array.from({ length: 10 }, () =>
          messageService.saveMessage({
            agentId: agent2.id.toString(),
            type: 'assistant',
            content: 'Test',
          })
        )
      );

      // Assert - All 20 UUIDs should be unique
      const allIds = [...agent1Messages.map((m) => m.id), ...agent2Messages.map((m) => m.id)];

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(20); // All unique
    });
  });

  describe('Sequence Number Ordering', () => {
    it('should assign monotonically increasing sequence numbers', async () => {
      // Already tested in message-persistence-integrity, but critical enough to repeat
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Save 5 messages
      const messages = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          messageService.saveMessage({
            agentId: agent.id.toString(),
            type: 'assistant',
            content: `Message ${i + 1}`,
          })
        )
      );

      // Assert - Sequences are 1, 2, 3, 4, 5
      const sequences = messages.map((m) => m.sequenceNumber).sort((a, b) => a - b);
      expect(sequences).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle concurrent message saves with atomic sequence assignment', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Save 50 messages concurrently
      const saves = Array.from({ length: 50 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Concurrent ${i}`,
        })
      );

      const messages = await Promise.all(saves);

      // Assert - All sequences should be unique
      const sequences = messages.map((m) => m.sequenceNumber);
      const uniqueSequences = new Set(sequences);
      expect(uniqueSequences.size).toBe(50);

      // Sequences should be 1-50 (in some order due to concurrency)
      sequences.sort((a, b) => a - b);
      expect(sequences[0]).toBe(1);
      expect(sequences[49]).toBe(50);
    });

    it('should maintain sequence order in retrieval', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Save messages
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Third saved',
      });
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'First saved',
      });
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Second saved',
      });

      // Act - Retrieve messages
      const messages = await messageService.findByAgentId(agent.id.toString());

      // Assert - Ordered by sequence (1, 2, 3), not save order
      expect(messages[0]?.sequenceNumber).toBe(1);
      expect(messages[1]?.sequenceNumber).toBe(2);
      expect(messages[2]?.sequenceNumber).toBe(3);
    });

    it('should detect gaps in sequence numbers', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Manually insert messages with gap (1, 2, 4, 5 - missing 3)
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          '11111111-1111-1111-1111-111111111111',
          agent.id.toString(),
          1,
          'assistant',
          'Msg 1',
          new Date().toISOString()
        );

      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          '22222222-2222-2222-2222-222222222222',
          agent.id.toString(),
          2,
          'assistant',
          'Msg 2',
          new Date().toISOString()
        );

      // Skip 3!

      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          '44444444-4444-4444-4444-444444444444',
          agent.id.toString(),
          4,
          'assistant',
          'Msg 4',
          new Date().toISOString()
        );

      // Act - Get all messages
      const messages = await messageService.findByAgentId(agent.id.toString());

      // Assert - Gap is detectable (2 → 4, skips 3)
      expect(messages.length).toBe(3);
      expect(messages[0]?.sequenceNumber).toBe(1);
      expect(messages[1]?.sequenceNumber).toBe(2);
      expect(messages[2]?.sequenceNumber).toBe(4); // Gap here!

      // Gap detection logic: messages[2].sequence - messages[1].sequence > 1
      const hasGap = (messages[2]?.sequenceNumber || 0) - (messages[1]?.sequenceNumber || 0) > 1;
      expect(hasGap).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle 1000+ messages for single agent', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Stress test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Save 1000 messages
      const saves = Array.from({ length: 1000 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i + 1}`,
        })
      );

      await Promise.all(saves);

      // Assert - All saved
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages.length).toBe(1000);

      // Sequences should be 1-1000
      expect(messages[0]?.sequenceNumber).toBe(1);
      expect(messages[999]?.sequenceNumber).toBe(1000);
    }, 10000);

    it('should handle sequence number at upper boundary (JavaScript safe integer)', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Manually insert message with very large sequence
      const largeSeq = Number.MAX_SAFE_INTEGER;
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          '11111111-1111-1111-1111-111111111111',
          agent.id.toString(),
          largeSeq,
          'assistant',
          'Large sequence',
          new Date().toISOString()
        );

      // Act - Retrieve
      const messages = await messageService.findByAgentId(agent.id.toString());

      // Assert - Should handle large numbers
      expect(messages[0]?.sequenceNumber).toBe(largeSeq);
    });

    it('should handle message retrieval with many gaps', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Insert messages: 1, 5, 10, 15, 20 (lots of gaps)
      [1, 5, 10, 15, 20].forEach((seq) => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            `${seq}${seq}${seq}${seq}${seq}${seq}${seq}${seq}-1111-1111-1111-111111111111`.substring(
              0,
              36
            ),
            agent.id.toString(),
            seq,
            'assistant',
            `Msg ${seq}`,
            new Date().toISOString()
          );
      });

      // Act
      const messages = await messageService.findByAgentId(agent.id.toString());

      // Assert - Should have 5 messages with gaps
      expect(messages.length).toBe(5);
      expect(messages.map((m) => m.sequenceNumber)).toEqual([1, 5, 10, 15, 20]);
    });

    it('should handle findByAgentIdSince with gaps', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Insert: 1, 2, 5, 6 (missing 3, 4)
      [1, 2, 5, 6].forEach((seq) => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            `${seq}0000000-0000-0000-0000-000000000000`,
            agent.id.toString(),
            seq,
            'assistant',
            `Msg ${seq}`,
            new Date().toISOString()
          );
      });

      // Act - Get messages since 2
      const messagesSince = await messageService.findByAgentIdSince(agent.id.toString(), 2);

      // Assert - Should get 5, 6 (those > 2)
      expect(messagesSince.length).toBe(2);
      expect(messagesSince[0]?.sequenceNumber).toBe(5);
      expect(messagesSince[1]?.sequenceNumber).toBe(6);
    });

    it('should handle extremely sparse sequences', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Insert very sparse sequences: 1, 1000, 10000
      [1, 1000, 10000].forEach((seq) => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            `${seq}00000-0000-0000-0000-000000000000`.substring(0, 36),
            agent.id.toString(),
            seq,
            'assistant',
            `Sparse ${seq}`,
            new Date().toISOString()
          );
      });

      // Act
      const messages = await messageService.findByAgentId(agent.id.toString());

      // Assert
      expect(messages.length).toBe(3);
      expect(messages.map((m) => m.sequenceNumber)).toEqual([1, 1000, 10000]);
    });
  });

  describe('Ordering Under Load', () => {
    it('should maintain order with rapid concurrent saves', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Load test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Save 100 messages as fast as possible
      const saves = Array.from({ length: 100 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Load test ${i}`,
        })
      );

      await Promise.all(saves);

      // Assert - Sequences should be 1-100
      const messages = await messageService.findByAgentId(agent.id.toString());
      expect(messages.length).toBe(100);

      // Check monotonic ordering
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i]?.sequenceNumber).toBeGreaterThan(messages[i - 1]?.sequenceNumber || 0);
      }
    }, 10000);

    it('should handle message saves from multiple agents concurrently', async () => {
      // Arrange - 5 agents
      const agents = await Promise.all(
        Array.from({ length: 5 }, (_, i) => {
          const agent = Agent.create({
            type: AgentType.SYNTHETIC,
            prompt: `Agent ${i}`,
            configuration: {},
          });
          return repository.save(agent).then(() => agent);
        })
      );

      // Act - Each agent saves 20 messages concurrently
      const allSaves = agents.flatMap((agent) =>
        Array.from({ length: 20 }, () =>
          messageService.saveMessage({
            agentId: agent.id.toString(),
            type: 'assistant',
            content: 'Concurrent test',
          })
        )
      );

      await Promise.all(allSaves);

      // Assert - Each agent should have sequences 1-20
      for (const agent of agents) {
        const messages = await messageService.findByAgentId(agent.id.toString());
        expect(messages.length).toBe(20);

        const sequences = messages.map((m) => m.sequenceNumber);
        sequences.sort((a, b) => a - b);
        expect(sequences[0]).toBe(1);
        expect(sequences[19]).toBe(20);
      }
    }, 10000);
  });

  describe('Deduplication Scenarios', () => {
    it('should prevent duplicate UUID even with same content', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      const messageId = '11111111-1111-1111-1111-111111111111';

      // Insert first
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          messageId,
          agent.id.toString(),
          1,
          'assistant',
          'Same content',
          new Date().toISOString()
        );

      // Act & Assert - Try to insert with same UUID but different content
      expect(() => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            messageId, // Same UUID
            agent.id.toString(),
            2,
            'assistant',
            'Same content', // Even same content
            new Date().toISOString()
          );
      }).toThrow(/UNIQUE constraint failed/);
    });

    it('should allow same content with different UUIDs', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Save same content multiple times
      const msg1 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Duplicate content',
      });

      const msg2 = await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Duplicate content', // Same!
      });

      // Assert - Both should be saved with different UUIDs
      expect(msg1.id).not.toBe(msg2.id);
      expect(msg1.content).toBe(msg2.content);
    });

    it('should handle sequence gaps without deduplication confusion', async () => {
      // This test verifies gap detection doesn't confuse deduplication
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Save: 1, 2, then manually insert 10, 11
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Seq 1',
      });

      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Seq 2',
      });

      // Manually insert with large gap
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          agent.id.toString(),
          10,
          'assistant',
          'Seq 10',
          new Date().toISOString()
        );

      // Act - Get all messages
      const messages = await messageService.findByAgentId(agent.id.toString());

      // Assert - 3 messages with gap
      expect(messages.length).toBe(3);
      expect(messages.map((m) => m.sequenceNumber)).toEqual([1, 2, 10]);

      // All have unique UUIDs
      const ids = messages.map((m) => m.id);
      expect(new Set(ids).size).toBe(3);
    });
  });
});
