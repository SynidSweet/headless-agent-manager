import { DatabaseService } from '@infrastructure/database/database.service';
import { unlinkSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Integration Test: WAL Checkpoint on Shutdown
 *
 * REPRODUCES BUG: Messages saved to WAL file are lost when process restarts
 * without checkpointing WAL to main database file.
 *
 * This test verifies that:
 * 1. Messages are saved to WAL file during runtime
 * 2. WAL is checkpointed to main database on shutdown
 * 3. New database connection can read messages from main file
 */
describe('WAL Checkpoint on Shutdown (Integration)', () => {
  const testDbPath = join(__dirname, '../../data/test-shutdown.db');

  beforeEach(() => {
    // Clean up any existing test database
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore if files don't exist
    }
  });

  afterEach(() => {
    // Clean up test database
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should checkpoint WAL to main database on shutdown', async () => {
    // Step 1: Create database and save messages
    let db1: DatabaseService;
    {
      db1 = new DatabaseService(testDbPath);
      db1.onModuleInit();

      const database = db1.getDatabase();

      // Create test agent
      database.prepare(`
        INSERT INTO agents (id, type, status, prompt, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('test-agent-1', 'claude-code', 'running', 'Test', new Date().toISOString());

      // Insert messages (these go to WAL file)
      for (let i = 1; i <= 5; i++) {
        database.prepare(`
          INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`msg-${i}`, 'test-agent-1', i, 'assistant', `Message ${i}`, new Date().toISOString());
      }

      // Verify messages exist in WAL
      const count1 = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as { c: number };
      expect(count1.c).toBe(5);

      // Check WAL file size (should be > 0 because data is in WAL)
      const walSize1 = statSync(`${testDbPath}-wal`).size;
      console.log('WAL file size before shutdown:', walSize1, 'bytes');
      expect(walSize1).toBeGreaterThan(0);
    }

    // Step 2: Shutdown database (THIS IS WHERE THE BUG OCCURS)
    db1.onModuleDestroy();

    // Step 3: Create NEW database connection (simulates backend restart)
    const db2 = new DatabaseService(testDbPath);
    db2.onModuleInit();

    const database2 = db2.getDatabase();

    // Step 4: Query messages with new connection
    const count2 = database2.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as { c: number };

    console.log('Message count after restart:', count2.c);

    // THIS TEST WILL FAIL if WAL wasn't checkpointed on shutdown!
    // Expected: 5 messages
    // Actual (BUG): 0 messages
    expect(count2.c).toBe(5);

    // Verify messages are actually in main database file (not just WAL)
    const mainFileSize = statSync(testDbPath).size;
    console.log('Main DB file size after restart:', mainFileSize, 'bytes');
    expect(mainFileSize).toBeGreaterThan(40000); // Should contain data (schema + messages)

    // Cleanup
    db2.onModuleDestroy();
  });

  it('should preserve messages across multiple restart cycles', async () => {
    // Cycle 1: Save 2 messages
    {
      const db = new DatabaseService(testDbPath);
      db.onModuleInit();
      const database = db.getDatabase();

      database.prepare(`
        INSERT INTO agents (id, type, status, prompt, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('test-agent-1', 'claude-code', 'running', 'Test', new Date().toISOString());

      database.prepare(`
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('msg-1', 'test-agent-1', 1, 'assistant', 'Message 1', new Date().toISOString());

      database.prepare(`
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('msg-2', 'test-agent-1', 2, 'assistant', 'Message 2', new Date().toISOString());

      db.onModuleDestroy();
    }

    // Cycle 2: Read and add 1 more message
    {
      const db = new DatabaseService(testDbPath);
      db.onModuleInit();
      const database = db.getDatabase();

      const count1 = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as { c: number };
      expect(count1.c).toBe(2); // Should see previous 2 messages

      database.prepare(`
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('msg-3', 'test-agent-1', 3, 'assistant', 'Message 3', new Date().toISOString());

      db.onModuleDestroy();
    }

    // Cycle 3: Verify all 3 messages exist
    {
      const db = new DatabaseService(testDbPath);
      db.onModuleInit();
      const database = db.getDatabase();

      const count2 = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as { c: number };
      expect(count2.c).toBe(3); // Should see all 3 messages

      const messages = database.prepare('SELECT content FROM agent_messages ORDER BY sequence_number').all();
      expect(messages).toHaveLength(3);
      expect((messages[0] as any).content).toBe('Message 1');
      expect((messages[1] as any).content).toBe('Message 2');
      expect((messages[2] as any).content).toBe('Message 3');

      db.onModuleDestroy();
    }
  });
});
