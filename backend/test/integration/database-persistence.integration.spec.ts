import { AgentMessageService } from '@application/services/agent-message.service';
import { DatabaseService } from '@infrastructure/database/database.service';

/**
 * PHASE 2: COMPREHENSIVE DATABASE PERSISTENCE TESTS
 *
 * These tests verify critical database integrity constraints and behaviors
 * that were NOT covered in the original test suite, leading to the race
 * condition bug in production.
 *
 * Tests use REAL SQLite database (not mocks) to verify:
 * - Foreign key constraints
 * - CASCADE DELETE behavior
 * - Concurrent access patterns
 * - Sequence number generation
 * - UUID uniqueness
 * - JSON serialization
 * - Query performance
 * - Gap detection
 *
 * Following strict TDD: Each test is written to FAIL first if the
 * constraint/behavior doesn't work, then we verify it PASSES with
 * current implementation.
 */
describe('Database Persistence Integration Tests', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;

  beforeEach(() => {
    // Use in-memory SQLite database for speed
    // This is a REAL database with REAL constraints
    db = new DatabaseService(':memory:');
    db.onModuleInit(); // Runs schema.sql migrations

    messageService = new AgentMessageService(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper: Create an agent in the database
   * Required because agent_messages has a FOREIGN KEY to agents table
   */
  function createAgent(agentId: string): void {
    const database = db.getDatabase();
    const stmt = database.prepare(`
      INSERT INTO agents (id, type, status, prompt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(agentId, 'claude-code', 'running', 'test prompt', new Date().toISOString());
  }

  /**
   * Helper: Delete an agent from the database
   * Tests CASCADE DELETE behavior
   */
  function deleteAgent(agentId: string): void {
    const database = db.getDatabase();
    const stmt = database.prepare('DELETE FROM agents WHERE id = ?');
    stmt.run(agentId);
  }

  /**
   * TEST 1: Foreign Key Constraint Enforcement
   *
   * CRITICAL: This is the constraint that was failing in production!
   * Verifies that messages CANNOT be saved without a valid agent.
   */
  describe('Foreign Key Constraints', () => {
    it('should enforce foreign key constraint on agent_messages.agent_id', async () => {
      const nonExistentAgentId = 'fake-agent-id-does-not-exist';

      // Attempt to save message for non-existent agent
      try {
        await messageService.saveMessage({
          agentId: nonExistentAgentId,
          type: 'assistant',
          content: 'test message',
        });
        // If we reach here, test should fail
        fail('Expected FK constraint error but none was thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/FOREIGN KEY constraint failed|SQLITE_CONSTRAINT/);
      }

      // Verify: No messages were saved
      const messages = await messageService.findByAgentId(nonExistentAgentId);
      expect(messages).toHaveLength(0);
    });

    it('should allow saving messages after agent exists', async () => {
      const agentId = 'test-agent-123';
      createAgent(agentId);

      // Should succeed now
      const saved = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        content: 'test message',
      });

      expect(saved.id).toBeDefined();
      expect(saved.agentId).toBe(agentId);
      expect(saved.sequenceNumber).toBe(1);
    });
  });

  /**
   * TEST 2: CASCADE DELETE Behavior
   *
   * Verifies that deleting an agent automatically deletes all its messages
   * This is critical for data cleanup and prevents orphaned records.
   */
  describe('CASCADE DELETE', () => {
    it('should CASCADE DELETE messages when agent is deleted', async () => {
      const agentId = 'agent-to-delete';
      createAgent(agentId);

      // Create 5 messages
      for (let i = 1; i <= 5; i++) {
        await messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Verify messages exist
      let messages = await messageService.findByAgentId(agentId);
      expect(messages).toHaveLength(5);

      // Delete the agent
      deleteAgent(agentId);

      // Messages should be automatically deleted
      messages = await messageService.findByAgentId(agentId);
      expect(messages).toHaveLength(0);
    });

    it('should only delete messages for the deleted agent', async () => {
      const agent1 = 'agent-1';
      const agent2 = 'agent-2';
      createAgent(agent1);
      createAgent(agent2);

      // Create messages for both agents
      await messageService.saveMessage({ agentId: agent1, type: 'assistant', content: 'A1' });
      await messageService.saveMessage({ agentId: agent2, type: 'assistant', content: 'A2' });

      // Delete agent1
      deleteAgent(agent1);

      // Agent1 messages gone
      const messages1 = await messageService.findByAgentId(agent1);
      expect(messages1).toHaveLength(0);

      // Agent2 messages still there
      const messages2 = await messageService.findByAgentId(agent2);
      expect(messages2).toHaveLength(1);
      expect(messages2[0]!.content).toBe('A2');
    });
  });

  /**
   * TEST 3: Sequence Number Uniqueness & Monotonicity
   *
   * CRITICAL for message ordering and gap detection
   * Tests concurrent message saves to verify atomicity of sequence generation
   */
  describe('Sequence Number Generation', () => {
    it('should generate unique, monotonic sequence numbers per agent', async () => {
      const agentId = 'seq-test-agent';
      createAgent(agentId);

      // Save 10 messages concurrently (stress test)
      const promises = Array.from({ length: 10 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Message ${i}`,
        })
      );

      const savedMessages = await Promise.all(promises);

      // Extract sequence numbers
      const sequences = savedMessages.map((m) => m.sequenceNumber).sort((a, b) => a - b);

      // Should be exactly [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // No duplicates
      const uniqueSequences = new Set(sequences);
      expect(uniqueSequences.size).toBe(10);
    });

    it('should maintain separate sequences for different agents', async () => {
      const agent1 = 'agent-seq-1';
      const agent2 = 'agent-seq-2';
      createAgent(agent1);
      createAgent(agent2);

      // Save interleaved messages
      await messageService.saveMessage({ agentId: agent1, type: 'assistant', content: 'A1-1' });
      await messageService.saveMessage({ agentId: agent2, type: 'assistant', content: 'A2-1' });
      await messageService.saveMessage({ agentId: agent1, type: 'assistant', content: 'A1-2' });
      await messageService.saveMessage({ agentId: agent2, type: 'assistant', content: 'A2-2' });

      const messages1 = await messageService.findByAgentId(agent1);
      const messages2 = await messageService.findByAgentId(agent2);

      // Each agent should have sequences [1, 2]
      expect(messages1.map((m) => m.sequenceNumber)).toEqual([1, 2]);
      expect(messages2.map((m) => m.sequenceNumber)).toEqual([1, 2]);
    });

    it('should handle high-concurrency message bursts', async () => {
      const agentId = 'burst-test-agent';
      createAgent(agentId);

      // Simulate 50 rapid concurrent messages (like real Claude CLI)
      const promises = Array.from({ length: 50 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Burst ${i}`,
        })
      );

      await Promise.all(promises);

      const messages = await messageService.findByAgentId(agentId);

      // Should have all 50 messages
      expect(messages).toHaveLength(50);

      // Sequences should be [1, 2, 3, ..., 50] with NO gaps or duplicates
      const sequences = messages.map((m) => m.sequenceNumber).sort((a, b) => a - b);
      const expectedSequences = Array.from({ length: 50 }, (_, i) => i + 1);
      expect(sequences).toEqual(expectedSequences);
    });
  });

  /**
   * TEST 4: UUID Generation and Uniqueness
   *
   * Verifies that every message gets a unique UUID for deduplication
   */
  describe('UUID Generation', () => {
    it('should generate valid v4 UUIDs for each message', async () => {
      const agentId = 'uuid-test-agent';
      createAgent(agentId);

      const msg1 = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        content: 'test 1',
      });

      const msg2 = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        content: 'test 2',
      });

      // Both should have UUIDs
      expect(msg1.id).toBeDefined();
      expect(msg2.id).toBeDefined();

      // Should be different
      expect(msg1.id).not.toBe(msg2.id);

      // Should match UUID v4 format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(msg1.id).toMatch(uuidRegex);
      expect(msg2.id).toMatch(uuidRegex);
    });

    it('should guarantee UUID uniqueness across 100 messages', async () => {
      const agentId = 'uuid-unique-test';
      createAgent(agentId);

      const promises = Array.from({ length: 100 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Message ${i}`,
        })
      );

      const messages = await Promise.all(promises);
      const ids = messages.map((m) => m.id);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });
  });

  /**
   * TEST 5: JSON Metadata Serialization
   *
   * Verifies complex objects can be stored and retrieved correctly
   */
  describe('JSON Serialization', () => {
    it('should serialize and deserialize complex metadata objects', async () => {
      const agentId = 'json-test-agent';
      createAgent(agentId);

      const complexMetadata = {
        toolUse: { name: 'bash', args: ['ls', '-la'] },
        stats: { duration: 1500, tokens: 250 },
        nested: { deep: { value: 42, array: [1, 2, 3] } },
        nullValue: null,
        boolValue: true,
      };

      await messageService.saveMessage({
        agentId,
        type: 'assistant',
        content: 'test',
        metadata: complexMetadata,
      });

      const retrieved = await messageService.findByAgentId(agentId);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]!.metadata).toEqual(complexMetadata);
    });

    it('should handle messages without metadata', async () => {
      const agentId = 'no-metadata-agent';
      createAgent(agentId);

      await messageService.saveMessage({
        agentId,
        type: 'assistant',
        content: 'simple message',
        // No metadata field
      });

      const retrieved = await messageService.findByAgentId(agentId);
      expect(retrieved[0]!.metadata).toBeUndefined();
    });
  });

  /**
   * TEST 6: Query Performance with Indexes
   *
   * Verifies that indexes are working and queries are fast
   */
  describe('Query Performance', () => {
    it('should efficiently query messages with indexes on large dataset', async () => {
      const agentId = 'perf-test-agent';
      createAgent(agentId);

      // Insert 1000 messages
      for (let i = 1; i <= 1000; i++) {
        await messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Timed query
      const start = Date.now();
      const messages = await messageService.findByAgentId(agentId);
      const duration = Date.now() - start;

      // Should have all messages
      expect(messages).toHaveLength(1000);

      // Should be fast (with index on agent_id)
      // Allow up to 100ms for in-memory SQLite
      expect(duration).toBeLessThan(100);
    });

    it('should efficiently query messages since sequence number', async () => {
      const agentId = 'perf-since-agent';
      createAgent(agentId);

      // Insert 500 messages
      for (let i = 1; i <= 500; i++) {
        await messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Query messages since sequence 400
      const start = Date.now();
      const recent = await messageService.findByAgentIdSince(agentId, 400);
      const duration = Date.now() - start;

      // Should have 100 messages (401-500)
      expect(recent).toHaveLength(100);
      expect(recent[0]!.sequenceNumber).toBe(401);
      expect(recent[99]!.sequenceNumber).toBe(500);

      // Should be fast (with composite index on agent_id + sequence_number)
      expect(duration).toBeLessThan(50);
    });
  });

  /**
   * TEST 7: Gap Detection in Sequences
   *
   * Critical for WebSocket reconnection and message synchronization
   * Frontend needs to detect and fill gaps in message sequences
   */
  describe('Gap Detection', () => {
    it('should detect gaps in sequence numbers', async () => {
      const agentId = 'gap-test-agent';
      createAgent(agentId);

      // Save messages 1, 2, 3, 4, 5
      await messageService.saveMessage({ agentId, type: 'assistant', content: '1' });
      await messageService.saveMessage({ agentId, type: 'assistant', content: '2' });
      await messageService.saveMessage({ agentId, type: 'assistant', content: '3' });
      const msg4 = await messageService.saveMessage({ agentId, type: 'assistant', content: '4' });
      await messageService.saveMessage({ agentId, type: 'assistant', content: '5' });

      // Manually delete message 4 to create gap
      const database = db.getDatabase();
      database.prepare('DELETE FROM agent_messages WHERE id = ?').run(msg4.id);

      const messages = await messageService.findByAgentId(agentId);

      // Should have messages 1, 2, 3, 5 (missing 4)
      const sequences = messages.map((m) => m.sequenceNumber);
      expect(sequences).toEqual([1, 2, 3, 5]);

      // Detect gap
      const hasGap = detectGaps(sequences);
      expect(hasGap).toBe(true);
    });

    it('should detect no gaps in complete sequences', async () => {
      const agentId = 'no-gap-agent';
      createAgent(agentId);

      // Save 10 messages sequentially
      for (let i = 1; i <= 10; i++) {
        await messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      const messages = await messageService.findByAgentId(agentId);
      const sequences = messages.map((m) => m.sequenceNumber);

      // Should be complete [1, 2, 3, ..., 10]
      const hasGap = detectGaps(sequences);
      expect(hasGap).toBe(false);
    });
  });

  /**
   * TEST 8: Concurrent Writes to Same Agent
   *
   * Verifies database can handle multiple simultaneous writes
   * without deadlocks or corruption
   */
  describe('Concurrent Write Safety', () => {
    it('should handle 100 concurrent writes without deadlock', async () => {
      const agentId = 'concurrent-writes-agent';
      createAgent(agentId);

      // 100 concurrent writes
      const writes = Array.from({ length: 100 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Concurrent message ${i}`,
        })
      );

      // Should all succeed without deadlock
      const results = await Promise.all(writes);

      expect(results).toHaveLength(100);
      expect(results.every((r) => r.id && r.sequenceNumber > 0)).toBe(true);

      // Verify all were saved
      const messages = await messageService.findByAgentId(agentId);
      expect(messages).toHaveLength(100);
    });

    it('should maintain sequence integrity under concurrent load', async () => {
      const agentId = 'integrity-test-agent';
      createAgent(agentId);

      // Simulate concurrent writes from multiple "sources"
      const batch1 = Array.from({ length: 20 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'assistant',
          content: `Batch1-${i}`,
        })
      );

      const batch2 = Array.from({ length: 20 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'system',
          content: `Batch2-${i}`,
        })
      );

      await Promise.all([...batch1, ...batch2]);

      const messages = await messageService.findByAgentId(agentId);

      // Should have all 40 messages
      expect(messages).toHaveLength(40);

      // Sequences should be [1..40] with no gaps or duplicates
      const sequences = messages.map((m) => m.sequenceNumber).sort((a, b) => a - b);
      const expectedSequences = Array.from({ length: 40 }, (_, i) => i + 1);
      expect(sequences).toEqual(expectedSequences);
    });
  });
});

/**
 * Helper: Detect gaps in sequence numbers
 * Used for testing message synchronization logic
 */
function detectGaps(sequences: number[]): boolean {
  if (sequences.length === 0) return false;

  const sorted = [...sequences].sort((a, b) => a - b);

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1]! - sorted[i]! > 1) {
      return true; // Gap found
    }
  }

  return false; // No gaps
}
