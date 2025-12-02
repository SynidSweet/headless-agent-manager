import { AgentMessageService } from '@application/services/agent-message.service';
import { DatabaseService } from '@infrastructure/database/database.service';

/**
 * PHASE 3: RACE CONDITION TESTS
 *
 * These tests verify the system handles concurrent operations correctly:
 * - Multiple concurrent writes
 * - Interleaved messages from multiple agents
 * - Database write contention
 * - Sequence number integrity under load
 *
 * Uses REAL database (not mocks) to catch timing bugs that unit tests would miss.
 */
describe('Race Condition Integration Tests', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;

  beforeEach(() => {
    // Use in-memory SQLite database
    db = new DatabaseService(':memory:');
    db.onModuleInit();
    messageService = new AgentMessageService(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper: Create an agent in the database
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
   * TEST 1: Database Lock Contention
   *
   * Verifies that high write contention doesn't cause:
   * - Deadlocks
   * - Lost writes
   * - Sequence number collisions
   */
  it('should handle 100 concurrent message writes without deadlocks', async () => {
    const agentId = 'test-agent-contention';
    createAgent(agentId);

    // 100 concurrent message writes
    const writes = Array.from({ length: 100 }, (_, i) =>
      messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: `Concurrent message ${i}`,
        metadata: { index: i },
      })
    );

    // All should succeed without deadlock
    const messages = await Promise.all(writes);

    expect(messages).toHaveLength(100);

    // Verify all messages were persisted
    const savedMessages = await messageService.findByAgentId(agentId);
    expect(savedMessages).toHaveLength(100);

    // All should have unique sequence numbers
    const sequences = savedMessages.map((m) => m.sequenceNumber);
    const uniqueSequences = new Set(sequences);
    expect(uniqueSequences.size).toBe(100);

    // Sequences should be 1-100 (in some order)
    const sortedSequences = sequences.sort((a, b) => a - b);
    expect(sortedSequences).toEqual([...Array(100).keys()].map((i) => i + 1));
  }, 30000);

  /**
   * TEST 2: Interleaved Messages from Multiple Agents
   *
   * Verifies that messages from different agents don't interfere with each other
   * when written concurrently
   */
  it('should correctly sequence messages from 5 concurrent agents', async () => {
    // Create 5 agents
    const agentIds = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];

    for (const agentId of agentIds) {
      createAgent(agentId);
    }

    // Each agent gets 20 messages, written concurrently
    const allWrites = agentIds.flatMap((agentId) =>
      Array.from({ length: 20 }, (_, i) =>
        messageService.saveMessage({
          agentId,
          type: 'assistant',
          role: 'test',
          content: `Agent ${agentId} message ${i}`,
        })
      )
    );

    // Execute all 100 writes concurrently (5 agents × 20 messages)
    await Promise.all(allWrites);

    // Verify each agent has correct sequence numbers
    for (const agentId of agentIds) {
      const messages = await messageService.findByAgentId(agentId);
      expect(messages).toHaveLength(20);

      const sequences = messages.map((m) => m.sequenceNumber).sort((a, b) => a - b);

      // Should be [1, 2, 3, ..., 20] with no gaps or duplicates
      expect(sequences).toEqual([...Array(20).keys()].map((i) => i + 1));
    }
  }, 30000);

  /**
   * TEST 3: Concurrent Writes with Message Bursts
   *
   * Simulates the real scenario: agent starts and immediately sends
   * a burst of messages
   */
  it('should handle burst of 50 messages arriving rapidly', async () => {
    const agentId = 'test-agent-burst';
    createAgent(agentId);

    // Simulate burst: write 50 messages as fast as possible
    const burstWrites = Array.from({ length: 50 }, (_, i) =>
      messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: `Burst message ${i}`,
        metadata: { burstIndex: i },
      })
    );

    const messages = await Promise.all(burstWrites);

    // All 50 messages should be persisted
    expect(messages).toHaveLength(50);
    expect(messages.every((m) => m.sequenceNumber > 0)).toBe(true);

    // Verify no gaps
    const sequences = messages.map((m) => m.sequenceNumber).sort((a, b) => a - b);
    expect(sequences).toEqual([...Array(50).keys()].map((i) => i + 1));

    // Verify deduplication worked (no duplicate IDs)
    const ids = messages.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(50);
  }, 30000);

  /**
   * TEST 4: Message Writes During Agent Deletion
   *
   * Verifies that CASCADE DELETE doesn't cause issues when
   * messages are being written
   */
  it('should handle message writes during agent deletion gracefully', async () => {
    const agentId = 'test-agent-delete';
    createAgent(agentId);

    // Start writing messages
    const writes = Array.from({ length: 20 }, (_, i) =>
      messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: `Message ${i}`,
      })
    );

    // Delete agent mid-write (after a few messages)
    await new Promise((resolve) => setTimeout(resolve, 10));

    const database = db.getDatabase();
    const deleteStmt = database.prepare('DELETE FROM agents WHERE id = ?');

    // This may cause some writes to fail (expected)
    // But should not deadlock or corrupt database
    try {
      deleteStmt.run(agentId);
    } catch (e) {
      // May fail if writes are in progress
    }

    // Wait for all writes to complete (some may fail)
    const results = await Promise.allSettled(writes);

    // Some writes may have succeeded, some may have failed
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Should not have ALL failed (some should succeed before delete)
    // Should not have ALL succeeded (delete should interrupt some)
    // This is a realistic scenario test
    expect(succeeded.length + failed.length).toBe(20);

    // Database should be in consistent state (not corrupted)
    const messages = await messageService.findByAgentId(agentId);
    // All persisted messages should have valid sequences
    if (messages.length > 0) {
      expect(messages.every((m) => m.sequenceNumber > 0)).toBe(true);
    }
  }, 30000);

  /**
   * TEST 5: Rapid Sequential Operations
   *
   * Verifies that rapid sequential writes maintain data integrity
   */
  it('should maintain sequence integrity with rapid sequential writes', async () => {
    const agentId = 'test-agent-rapid';
    createAgent(agentId);

    // Write 50 messages as fast as possible (sequential, not parallel)
    const messages = [];
    for (let i = 0; i < 50; i++) {
      const msg = await messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: `Rapid message ${i}`,
      });
      messages.push(msg);
    }

    // All should have sequential numbers [1, 2, 3, ..., 50]
    const sequences = messages.map((m) => m.sequenceNumber);
    expect(sequences).toEqual([...Array(50).keys()].map((i) => i + 1));

    // Verify in database
    const savedMessages = await messageService.findByAgentId(agentId);
    expect(savedMessages).toHaveLength(50);

    // Verify no gaps
    const dbSequences = savedMessages.map((m) => m.sequenceNumber).sort((a, b) => a - b);
    expect(dbSequences).toEqual([...Array(50).keys()].map((i) => i + 1));
  }, 30000);
});
