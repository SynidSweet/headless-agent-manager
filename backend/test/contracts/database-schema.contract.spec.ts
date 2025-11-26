/**
 * Database Schema Contract Tests
 *
 * Purpose: Verify database schema enforces all constraints correctly
 * Layer: Infrastructure (Database)
 * Type: Contract
 *
 * CRITICAL: These tests prevent data integrity bugs
 * Schema changes that break contracts will fail these tests
 *
 * Contract Requirements:
 * 1. Foreign keys must be enabled globally
 * 2. FK violations must be rejected
 * 3. CASCADE deletes must work correctly
 * 4. UNIQUE constraints must be enforced
 * 5. Indexes must exist for performance
 * 6. Data types must be consistent
 *
 * Uses REAL: SQLite database with full constraints
 * Mocks: None (tests actual database behavior)
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { AgentMessageService } from '@application/services/agent-message.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('Database Schema Contract', () => {
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

  describe('Foreign Key Constraints', () => {
    it('CONTRACT: must have FK enabled globally', () => {
      // Act
      const fkEnabled = db.getDatabase().pragma('foreign_keys', { simple: true });

      // Assert - CRITICAL: FK must be enabled
      expect(fkEnabled).toBe(1);
    });

    it('CONTRACT: agent_messages.agent_id must reference agents.id', () => {
      // Arrange
      const foreignKeys = db.getDatabase().pragma('foreign_key_list(agent_messages)') as any[];

      // Assert
      expect(foreignKeys.length).toBeGreaterThan(0);
      const fk = foreignKeys.find((f: any) => f.from === 'agent_id');
      expect(fk).toBeDefined();
      expect(fk.table).toBe('agents');
      expect(fk.from).toBe('agent_id');
    });

    it('CONTRACT: must reject insert with invalid agent_id', async () => {
      // Arrange - Use UNIQUE random ID to prevent test pollution
      const invalidAgentId = `fake-agent-${Date.now()}-${Math.random().toString(36)}`;

      // Act & Assert - Should throw FK constraint error
      await expect(
        messageService.saveMessage({
          agentId: invalidAgentId,
          type: 'assistant',
          content: 'Test message',
        })
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    it('CONTRACT: must CASCADE delete messages when agent deleted', async () => {
      // Arrange - Create agent and messages
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
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
      const messagesBefore = await messageService.findByAgentId(agent.id.toString());
      expect(messagesBefore.length).toBe(2);

      // Act - Delete agent
      await repository.delete(agent.id);

      // Assert - Messages should be CASCADE deleted
      const messagesAfter = await messageService.findByAgentId(agent.id.toString());
      expect(messagesAfter.length).toBe(0);
    });

    it('CONTRACT: FK must be checked immediately (no deferred constraints)', () => {
      // Use UNIQUE IDs to prevent test pollution
      const messageId = `msg-${Date.now()}-${Math.random().toString(36)}`;
      const invalidAgentId = `fake-agent-${Date.now()}-${Math.random().toString(36)}`;

      // Act - Try to insert with invalid FK
      const invalidInsert = () => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            messageId,
            invalidAgentId, // Invalid agent_id (doesn't exist)
            1,
            'assistant',
            'Test',
            new Date().toISOString()
          );
      };

      // Assert - Should throw immediately
      expect(invalidInsert).toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  describe('Unique Constraints', () => {
    it('CONTRACT: agents.id must be unique', async () => {
      // Use UNIQUE ID to prevent test pollution
      const agentId = `agent-${Date.now()}-${Math.random().toString(36)}`;

      // Arrange - Insert agent directly via SQL
      db.getDatabase()
        .prepare(
          'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          agentId,
          'synthetic',
          'running',
          'Test 1',
          '{}',
          new Date().toISOString()
        );

      // Act - Try to insert again with same ID
      const duplicateInsert = () => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            agentId, // Same ID
            'synthetic',
            'running',
            'Test 2',
            '{}',
            new Date().toISOString()
          );
      };

      // Assert - Should throw UNIQUE constraint error
      expect(duplicateInsert).toThrow(/UNIQUE constraint failed/);
    });

    it('CONTRACT: agent_messages.id must be unique', async () => {
      // Use UNIQUE message ID to prevent test pollution
      const messageId = `msg-${Date.now()}-${Math.random().toString(36)}`;

      // Arrange - Create agent first
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Insert first message
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          messageId,
          agent.id.toString(),
          1,
          'assistant',
          'First message',
          new Date().toISOString()
        );

      // Act - Try to insert with same ID
      const duplicateInsert = () => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            messageId, // Same ID
            agent.id.toString(),
            2,
            'assistant',
            'Second message',
            new Date().toISOString()
          );
      };

      // Assert
      expect(duplicateInsert).toThrow(/UNIQUE constraint failed/);
    });

    it('CONTRACT: (agent_id, sequence_number) must be unique', async () => {
      // Use UNIQUE message IDs to prevent test pollution
      const msg1Id = `msg1-${Date.now()}-${Math.random().toString(36)}`;
      const msg2Id = `msg2-${Date.now()}-${Math.random().toString(36)}`;

      // Arrange - Create agent
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Insert first message with sequence 1
      db.getDatabase()
        .prepare(
          'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .run(
          msg1Id,
          agent.id.toString(),
          1, // Sequence 1
          'assistant',
          'First',
          new Date().toISOString()
        );

      // Act - Try to insert another message with same agent_id and sequence_number
      const duplicateSequence = () => {
        db.getDatabase()
          .prepare(
            'INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            msg2Id, // Different ID
            agent.id.toString(),
            1, // Same sequence number!
            'assistant',
            'Second',
            new Date().toISOString()
          );
      };

      // Assert - Should fail on unique constraint
      // Note: This depends on schema having UNIQUE(agent_id, sequence_number)
      // If schema doesn't have this, test will fail (good - exposes missing constraint!)
      expect(duplicateSequence).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('Index Performance', () => {
    it('CONTRACT: must have index on agents(status) for findByStatus()', () => {
      // Act
      const indexes = db.getDatabase()
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agents'")
        .all() as any[];

      // Assert
      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_agents_status');
    });

    it('CONTRACT: must have index on agent_messages(agent_id) for message lookup', () => {
      // Act
      const indexes = db.getDatabase()
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_messages'")
        .all() as any[];

      // Assert
      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_messages_agent_id');
    });

    it('CONTRACT: must have index on (agent_id, sequence_number) for ordering', () => {
      // Act
      const indexes = db.getDatabase()
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='agent_messages'")
        .all() as any[];

      // Assert
      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_messages_sequence');
    });

    it('CONTRACT: must use index for agent_id queries (verify with EXPLAIN)', async () => {
      // Arrange - Create agent and message
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Get query plan
      const queryPlan = db.getDatabase()
        .prepare('EXPLAIN QUERY PLAN SELECT * FROM agent_messages WHERE agent_id = ?')
        .all('test-id') as any[];

      // Assert - Should use index
      const usesIndex = queryPlan.some((row: any) =>
        row.detail && row.detail.includes('idx_messages_agent_id')
      );
      expect(usesIndex).toBe(true);
    });
  });

  describe('Data Types', () => {
    it('CONTRACT: must store dates as ISO 8601 strings', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Get raw database value
      const row = db.getDatabase()
        .prepare('SELECT created_at FROM agents WHERE id = ?')
        .get(agent.id.toString()) as any;

      // Assert - Should be ISO 8601 string
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('CONTRACT: must store JSON as TEXT', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: { sessionId: 'custom-session', outputFormat: 'stream-json' },
      });
      await repository.save(agent);

      // Act - Get raw database value
      const row = db.getDatabase()
        .prepare('SELECT configuration FROM agents WHERE id = ?')
        .get(agent.id.toString()) as any;

      // Assert - Should be JSON string
      expect(typeof row.configuration).toBe('string');
      const parsed = JSON.parse(row.configuration);
      expect(parsed.sessionId).toBe('custom-session');
      expect(parsed.outputFormat).toBe('stream-json');
    });

    it('CONTRACT: must store UUIDs as TEXT', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Get raw database value
      const row = db.getDatabase()
        .prepare('SELECT id FROM agents WHERE id = ?')
        .get(agent.id.toString()) as any;

      // Assert - Should be string (TEXT type)
      expect(typeof row.id).toBe('string');
      // Should be valid UUID format
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});
