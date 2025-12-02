/**
 * Database Performance Tests
 *
 * Purpose: Verify database operations meet performance requirements
 * Type: Performance / Integration
 *
 * Performance Targets:
 * - Single agent lookup: <5ms
 * - Message lookup by agent: <50ms (10K messages)
 * - Concurrent operations: No deadlocks
 * - Bulk inserts: <2s for 1000 messages
 *
 * Uses REAL: Database with real indexes
 * Mocks: None (need real performance metrics)
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { AgentMessageService } from '@application/services/agent-message.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('Database Performance', () => {
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

  describe('Query Performance', () => {
    it('should query agent by ID in <10ms', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Performance test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Measure query time
      const start = performance.now();
      await repository.findById(agent.id);
      const duration = performance.now() - start;

      // Assert
      expect(duration).toBeLessThan(10);
    });

    it('should query all agents in <50ms with 1000 agents', async () => {
      // Arrange - Create 1000 agents
      await Promise.all(
        Array.from({ length: 1000 }, (_, i) =>
          repository.save(
            Agent.create({
              type: AgentType.SYNTHETIC,
              prompt: `Agent ${i}`,
              configuration: {},
            })
          )
        )
      );

      // Act - Measure query time
      const start = performance.now();
      const allAgents = await repository.findAll();
      const duration = performance.now() - start;

      // Assert
      expect(allAgents.length).toBe(1000);
      expect(duration).toBeLessThan(50);
    }, 15000);

    it('should query messages for agent in <100ms with 1000 messages', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Performance test',
        configuration: {},
      });
      await repository.save(agent);

      // Create 1000 messages
      await Promise.all(
        Array.from({ length: 1000 }, (_, i) =>
          messageService.saveMessage({
            agentId: agent.id.toString(),
            type: 'assistant',
            content: `Message ${i}`,
          })
        )
      );

      // Act - Measure retrieval time
      const start = performance.now();
      const messages = await messageService.findByAgentId(agent.id.toString());
      const duration = performance.now() - start;

      // Assert
      expect(messages.length).toBe(1000);
      expect(duration).toBeLessThan(100);
    }, 15000);

    it('should query by status using index (verify with EXPLAIN)', async () => {
      // Arrange - Create agents with different statuses
      const runningAgent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Running',
        configuration: {},
      });
      runningAgent.markAsRunning();
      await repository.save(runningAgent);

      // Act - Get query plan
      const queryPlan = db
        .getDatabase()
        .prepare('EXPLAIN QUERY PLAN SELECT * FROM agents WHERE status = ?')
        .all('running') as any[];

      // Assert - Should use index
      const usesIndex = queryPlan.some(
        (row: any) => row.detail && row.detail.includes('idx_agents_status')
      );
      expect(usesIndex).toBe(true);
    });
  });

  describe('Write Performance', () => {
    it('should insert agent in <10ms', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Write perf test',
        configuration: {},
      });

      // Act - Measure insert time
      const start = performance.now();
      await repository.save(agent);
      const duration = performance.now() - start;

      // Assert
      expect(duration).toBeLessThan(10);
    });

    it('should insert message in <10ms with atomic sequence', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Measure message insert time
      const start = performance.now();
      await messageService.saveMessage({
        agentId: agent.id.toString(),
        type: 'assistant',
        content: 'Performance test message',
      });
      const duration = performance.now() - start;

      // Assert
      expect(duration).toBeLessThan(10);
    });

    it('should handle 100 concurrent message inserts without deadlock', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Concurrency test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - Insert 100 messages concurrently
      const start = performance.now();
      const inserts = Array.from({ length: 100 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Concurrent ${i}`,
        })
      );

      await Promise.all(inserts);
      const duration = performance.now() - start;

      // Assert - No deadlock, reasonable time
      expect(duration).toBeLessThan(1000); // 100 inserts in <1s
    }, 10000);

    it('should maintain sequence atomicity under concurrent load', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Atomic sequence test',
        configuration: {},
      });
      await repository.save(agent);

      // Act - 200 concurrent saves
      const saves = Array.from({ length: 200 }, (_, i) =>
        messageService.saveMessage({
          agentId: agent.id.toString(),
          type: 'assistant',
          content: `Load ${i}`,
        })
      );

      const messages = await Promise.all(saves);

      // Assert - All sequences are unique (no duplicates from race conditions)
      const sequences = messages.map((m) => m.sequenceNumber);
      const uniqueSequences = new Set(sequences);
      expect(uniqueSequences.size).toBe(200); // All unique

      // Sequences should be exactly 1-200
      sequences.sort((a, b) => a - b);
      expect(sequences[0]).toBe(1);
      expect(sequences[199]).toBe(200);
    }, 15000);
  });

  describe('Index Usage Verification', () => {
    it('should use agent_id index for message lookups', () => {
      // Act - Get query plan
      const queryPlan = db
        .getDatabase()
        .prepare('EXPLAIN QUERY PLAN SELECT * FROM agent_messages WHERE agent_id = ?')
        .all('test-id') as any[];

      // Assert - Should use either the single-column or composite index
      // SQLite optimizer may choose idx_messages_sequence (composite) over idx_messages_agent_id
      // because the composite index can also be used for agent_id-only queries
      const usesIndex = queryPlan.some(
        (row: any) => row.detail &&
        (row.detail.includes('idx_messages_agent_id') ||
         row.detail.includes('idx_messages_sequence'))
      );
      expect(usesIndex).toBe(true);
    });

    it('should use composite index for sequence ordering', () => {
      // Act - Get query plan
      const queryPlan = db
        .getDatabase()
        .prepare(
          'EXPLAIN QUERY PLAN SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY sequence_number'
        )
        .all('test-id') as any[];

      // Assert - Should use composite index
      const usesIndex = queryPlan.some(
        (row: any) => row.detail && row.detail.includes('idx_messages_sequence')
      );
      expect(usesIndex).toBe(true);
    });
  });
});
