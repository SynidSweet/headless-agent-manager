import { DatabaseService } from '@infrastructure/database/database.service';
import { unlinkSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Integration Test: DELETE Mode Persistence on Shutdown
 *
 * Verifies DELETE mode behavior: Messages are immediately written to main database file,
 * no WAL checkpoint needed.
 *
 * This test verifies that:
 * 1. Messages are saved directly to main database file (DELETE mode)
 * 2. No WAL or SHM files are created
 * 3. New database connection can read messages from main file after shutdown
 */
describe('DELETE Mode Persistence on Shutdown (Integration)', () => {
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

  it('should persist messages to main database with DELETE mode (no WAL checkpoint needed)', async () => {
    // Step 1: Create database and save messages
    let db1: DatabaseService;
    {
      db1 = new DatabaseService(testDbPath);
      db1.onModuleInit();

      const database = db1.getDatabase();

      // Verify DELETE mode is active
      const journalMode = database.pragma('journal_mode', { simple: true }) as string;
      console.log('Journal mode:', journalMode);
      expect(journalMode.toLowerCase()).toBe('delete');

      // Create test agent
      database
        .prepare(
          `
        INSERT INTO agents (id, type, status, prompt, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run('test-agent-1', 'claude-code', 'running', 'Test', new Date().toISOString());

      // Insert messages (these go directly to main database file with DELETE mode)
      for (let i = 1; i <= 5; i++) {
        database
          .prepare(
            `
          INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
          )
          .run(
            `msg-${i}`,
            'test-agent-1',
            i,
            'assistant',
            `Message ${i}`,
            new Date().toISOString()
          );
      }

      // Verify messages exist
      const count1 = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as {
        c: number;
      };
      expect(count1.c).toBe(5);

      // Verify NO WAL file exists (DELETE mode doesn't create WAL files)
      const fs = require('fs');
      const walExists = fs.existsSync(`${testDbPath}-wal`);
      const shmExists = fs.existsSync(`${testDbPath}-shm`);
      console.log('WAL file exists:', walExists);
      console.log('SHM file exists:', shmExists);
      expect(walExists).toBe(false);
      expect(shmExists).toBe(false);
    }

    // Step 2: Shutdown database (DELETE mode: data already in main file)
    db1.onModuleDestroy();

    // Step 3: Create NEW database connection (simulates backend restart)
    const db2 = new DatabaseService(testDbPath);
    db2.onModuleInit();

    const database2 = db2.getDatabase();

    // Step 4: Query messages with new connection
    const count2 = database2.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as {
      c: number;
    };

    console.log('Message count after restart:', count2.c);

    // DELETE mode: messages immediately written to main file, no checkpoint needed
    expect(count2.c).toBe(5);

    // Verify messages are in main database file
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

      database
        .prepare(
          `
        INSERT INTO agents (id, type, status, prompt, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run('test-agent-1', 'claude-code', 'running', 'Test', new Date().toISOString());

      database
        .prepare(
          `
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('msg-1', 'test-agent-1', 1, 'assistant', 'Message 1', new Date().toISOString());

      database
        .prepare(
          `
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('msg-2', 'test-agent-1', 2, 'assistant', 'Message 2', new Date().toISOString());

      db.onModuleDestroy();
    }

    // Cycle 2: Read and add 1 more message
    {
      const db = new DatabaseService(testDbPath);
      db.onModuleInit();
      const database = db.getDatabase();

      const count1 = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as {
        c: number;
      };
      expect(count1.c).toBe(2); // Should see previous 2 messages

      database
        .prepare(
          `
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run('msg-3', 'test-agent-1', 3, 'assistant', 'Message 3', new Date().toISOString());

      db.onModuleDestroy();
    }

    // Cycle 3: Verify all 3 messages exist
    {
      const db = new DatabaseService(testDbPath);
      db.onModuleInit();
      const database = db.getDatabase();

      const count2 = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as {
        c: number;
      };
      expect(count2.c).toBe(3); // Should see all 3 messages

      const messages = database
        .prepare('SELECT content FROM agent_messages ORDER BY sequence_number')
        .all();
      expect(messages).toHaveLength(3);
      expect((messages[0] as any).content).toBe('Message 1');
      expect((messages[1] as any).content).toBe('Message 2');
      expect((messages[2] as any).content).toBe('Message 3');

      db.onModuleDestroy();
    }
  });
});
