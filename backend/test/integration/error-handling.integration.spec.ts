import { AgentMessageService } from '@application/services/agent-message.service';
import { DatabaseService } from '@infrastructure/database/database.service';

/**
 * PHASE 5: ERROR HANDLING & RECOVERY TESTS
 *
 * These tests verify the system degrades gracefully under error conditions:
 * - Invalid message data handling
 * - Database constraint violations
 * - NULL value handling
 * - Type validation
 * - Recovery after errors
 *
 * Uses REAL database to catch real error scenarios.
 */
describe('Error Handling & Recovery Integration Tests', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;

  beforeEach(() => {
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
    stmt.run(
      agentId,
      'claude-code',
      'running',
      'test prompt',
      new Date().toISOString()
    );
  }

  /**
   * TEST 1: Foreign Key Violation (Non-Existent Agent)
   *
   * Verifies proper error handling when trying to save message
   * for non-existent agent
   */
  it('should reject message for non-existent agent', async () => {
    const nonExistentAgentId = 'fake-agent-999';

    await expect(
      messageService.saveMessage({
        agentId: nonExistentAgentId,
        type: 'assistant',
        role: 'test',
        content: 'This should fail',
      })
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);

    // Database should remain consistent
    const allMessages = await messageService.findByAgentId(nonExistentAgentId);
    expect(allMessages).toHaveLength(0);
  });

  /**
   * TEST 2: NULL Content Handling
   *
   * Verifies that NULL content is stored as NULL (database is lenient)
   */
  it('should accept and store NULL content', async () => {
    const agentId = 'test-agent-null';
    createAgent(agentId);

    // Database accepts NULL content
    const message = await messageService.saveMessage({
      agentId,
      type: 'assistant',
      role: 'test',
      content: null as any,
    });

    expect(message.id).toBeDefined();
    expect(message.content).toBeNull();
    expect(message.sequenceNumber).toBe(1);

    // Verify in database
    const messages = await messageService.findByAgentId(agentId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBeNull();
  });

  /**
   * TEST 3: Empty Content Handling
   *
   * Verifies that empty string content is allowed (valid for system messages)
   */
  it('should accept message with empty string content', async () => {
    const agentId = 'test-agent-empty';
    createAgent(agentId);

    // Empty content is valid (system messages from Claude have this)
    const message = await messageService.saveMessage({
      agentId,
      type: 'system',
      role: 'init',
      content: '',
    });

    expect(message.id).toBeDefined();
    expect(message.content).toBe('');
    expect(message.sequenceNumber).toBe(1);

    // Verify in database
    const messages = await messageService.findByAgentId(agentId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('');
  });

  /**
   * TEST 4: Unusual Message Types
   *
   * Verifies that database accepts any string type (validation is app-level)
   */
  it('should accept unusual message types (database is lenient)', async () => {
    const agentId = 'test-agent-unusual-type';
    createAgent(agentId);

    // Database accepts any string type
    const message = await messageService.saveMessage({
      agentId,
      type: 'custom-type' as any,
      role: 'test',
      content: 'Test',
    });

    expect(message.id).toBeDefined();
    expect(message.type).toBe('custom-type');

    // Verify in database
    const messages = await messageService.findByAgentId(agentId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe('custom-type');
  });

  /**
   * TEST 5: Large Message Content
   *
   * Verifies that large messages are handled correctly
   */
  it('should handle large message content', async () => {
    const agentId = 'test-agent-large';
    createAgent(agentId);

    // Create large content (10KB)
    const largeContent = 'X'.repeat(10000);

    const message = await messageService.saveMessage({
      agentId,
      type: 'assistant',
      role: 'test',
      content: largeContent,
    });

    expect(message.id).toBeDefined();
    expect(message.content).toHaveLength(10000);

    // Verify in database
    const messages = await messageService.findByAgentId(agentId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toHaveLength(10000);
  });

  /**
   * TEST 6: Concurrent Errors Don't Block Valid Operations
   *
   * Verifies that errors in one operation don't block others
   */
  it('should continue processing valid messages despite concurrent errors', async () => {
    const agentId = 'test-agent-mixed';
    createAgent(agentId);

    // Mix of valid and invalid operations
    const operations = [
      // Valid messages
      messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: 'Valid 1',
      }),
      messageService.saveMessage({
        agentId,
        type: 'user',
        role: 'test',
        content: 'Valid 2',
      }),
      // Invalid message (will fail)
      messageService.saveMessage({
        agentId: 'fake-agent',
        type: 'assistant',
        role: 'test',
        content: 'Invalid - bad agent',
      }).catch(() => null),
      // More valid messages
      messageService.saveMessage({
        agentId,
        type: 'assistant',
        role: 'test',
        content: 'Valid 3',
      }),
      messageService.saveMessage({
        agentId,
        type: 'system',
        role: 'test',
        content: 'Valid 4',
      }),
    ];

    await Promise.all(operations);

    // Should have 4 valid messages (1 invalid ignored)
    const messages = await messageService.findByAgentId(agentId);
    expect(messages).toHaveLength(4);

    // All should have valid sequences
    const sequences = messages.map((m) => m.sequenceNumber).sort((a, b) => a - b);
    expect(sequences).toEqual([1, 2, 3, 4]);
  });
});
