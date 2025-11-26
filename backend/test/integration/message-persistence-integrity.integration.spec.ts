/**
 * Message Persistence Integrity Integration Tests
 *
 * Purpose: Verify messages are persisted correctly with all constraints
 * Type: Integration (Service + Repository + Database)
 *
 * Tests complete flow: Message creation → Database save → Retrieval
 *
 * Uses REAL: Database, AgentMessageService, Repository
 * Mocks: None
 */

import { AgentMessageService } from '@application/services/agent-message.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { DatabaseService } from '@infrastructure/database/database.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('Message Persistence Integrity (Integration)', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;
  let repository: SqliteAgentRepository;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    db.onModuleInit();

    // Verify FK enabled
    const fkEnabled = db.getDatabase().pragma('foreign_keys', { simple: true });
    if (fkEnabled !== 1) {
      throw new Error('FK constraints must be enabled');
    }

    messageService = new AgentMessageService(db);
    repository = new SqliteAgentRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should save message for valid agent (FK integrity)', async () => {
    // Arrange - Create agent first
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Act - Save message
    const message = await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Test message',
    });

    // Assert
    expect(message).toBeDefined();
    expect(message.agentId).toBe(agent.id.toString());
    expect(message.sequenceNumber).toBe(1);
  });

  it('should reject message for non-existent agent (FK violation)', async () => {
    // Arrange - No agent created
    const fakeAgentId = '00000000-0000-0000-0000-000000000000';

    // Act & Assert - Should fail with FK error
    await expect(
      messageService.saveMessage({
        agentId: fakeAgentId,
        type: 'assistant',
        content: 'Should fail',
      })
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it('should assign monotonically increasing sequence numbers', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Act - Save multiple messages
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

    const msg3 = await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Message 3',
    });

    // Assert - Sequences are 1, 2, 3
    expect(msg1.sequenceNumber).toBe(1);
    expect(msg2.sequenceNumber).toBe(2);
    expect(msg3.sequenceNumber).toBe(3);
  });

  it('should enforce UNIQUE constraint on (agent_id, sequence_number)', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Save first message with sequence 1
    await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'First',
    });

    // Act - Try to manually insert another message with sequence 1
    const duplicateInsert = () => {
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          '11111111-1111-1111-1111-111111111111',
          agent.id.toString(),
          1, // Duplicate sequence!
          'assistant',
          'Duplicate',
          new Date().toISOString()
        );
    };

    // Assert - Should throw UNIQUE constraint error
    expect(duplicateInsert).toThrow(/UNIQUE constraint failed/);
  });

  it('should cascade delete messages when agent deleted', async () => {
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
      content: 'Message 1',
    });

    await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Message 2',
    });

    // Verify messages exist
    const messagesBefore = await messageService.findByAgentId(agent.id.toString());
    expect(messagesBefore.length).toBe(2);

    // Act - Delete agent
    await repository.delete(agent.id);

    // Assert - Messages should be cascade deleted
    const messagesAfter = await messageService.findByAgentId(agent.id.toString());
    expect(messagesAfter.length).toBe(0);
  });

  it('should handle concurrent message saves without duplicating sequences', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Act - Save messages concurrently
    const saves = Array.from({ length: 10 }, (_, i) =>
      messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: `Concurrent message ${i + 1}`,
      })
    );

    const messages = await Promise.all(saves);

    // Assert - All should have unique sequence numbers
    const sequences = messages.map((m) => m.sequenceNumber);
    const uniqueSequences = new Set(sequences);
    expect(uniqueSequences.size).toBe(10); // All unique

    // Sequences should be 1-10 (in some order due to concurrency)
    sequences.sort((a, b) => a - b);
    expect(sequences[0]).toBe(1);
    expect(sequences[9]).toBe(10);
  });

  it('should retrieve messages in sequence order', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Save messages in random order
    await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Third',
    });

    await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'First',
    });

    await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Second',
    });

    // Act - Retrieve messages
    const messages = await messageService.findByAgentId(agent.id.toString());

    // Assert - Should be ordered by sequence number
    expect(messages[0]?.sequenceNumber).toBe(1);
    expect(messages[1]?.sequenceNumber).toBe(2);
    expect(messages[2]?.sequenceNumber).toBe(3);

    // Content order doesn't matter - sequence order does
    expect(messages[0]?.content).toBe('Third'); // First saved = sequence 1
    expect(messages[1]?.content).toBe('First'); // Second saved = sequence 2
    expect(messages[2]?.content).toBe('Second'); // Third saved = sequence 3
  });

  it('should generate unique UUIDs for all messages', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Act - Save multiple messages
    const messages = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i + 1}`,
        })
      )
    );

    // Assert - All IDs are unique
    const ids = messages.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(20);

    // All are valid UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    ids.forEach((id) => {
      expect(id).toMatch(uuidRegex);
    });
  });

  it('should store ISO 8601 timestamps', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Act
    const message = await messageService.saveMessage({
      agentId: agent.id.toString(),
      type: 'assistant',
      content: 'Timestamp test',
    });

    // Assert - createdAt should be ISO 8601
    expect(message.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Should be parseable as Date
    const date = new Date(message.createdAt);
    expect(date.getTime()).not.toBeNaN();
  });

  it('should isolate messages between different agents', async () => {
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

    // Act - Save messages for each
    await messageService.saveMessage({
      agentId: agent1.id.toString(),
      type: 'assistant',
      content: 'Agent 1 message',
    });

    await messageService.saveMessage({
      agentId: agent2.id.toString(),
      type: 'assistant',
      content: 'Agent 2 message',
    });

    // Retrieve messages
    const agent1Messages = await messageService.findByAgentId(agent1.id.toString());
    const agent2Messages = await messageService.findByAgentId(agent2.id.toString());

    // Assert - No cross-contamination
    expect(agent1Messages.length).toBe(1);
    expect(agent2Messages.length).toBe(1);

    expect(agent1Messages[0]?.agentId).toBe(agent1.id.toString());
    expect(agent1Messages[0]?.content).toBe('Agent 1 message');

    expect(agent2Messages[0]?.agentId).toBe(agent2.id.toString());
    expect(agent2Messages[0]?.content).toBe('Agent 2 message');
  });

  it('should support findByAgentIdSince for gap detection', async () => {
    // Arrange
    const agent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test',
      configuration: {},
    });
    await repository.save(agent);

    // Save 5 messages
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Message ${i + 1}`,
        })
      )
    );

    // Act - Get messages since sequence 2
    const messagesSince = await messageService.findByAgentIdSince(agent.id.toString(), 2);

    // Assert - Should get messages 3, 4, 5 (sequence > 2)
    expect(messagesSince.length).toBe(3);
    expect(messagesSince[0]?.sequenceNumber).toBe(3);
    expect(messagesSince[1]?.sequenceNumber).toBe(4);
    expect(messagesSince[2]?.sequenceNumber).toBe(5);
  });
});
