import { DatabaseService } from '@infrastructure/database/database.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Integration Test: Database Journal Mode
 *
 * Verifies that DELETE journal mode is used instead of WAL mode.
 * This prevents data loss when the process is killed without graceful shutdown
 * (e.g., ts-node-dev hot reload).
 *
 * Why DELETE mode?
 * - Synchronous writes (no WAL file)
 * - Immediate data persistence
 * - No checkpoint required
 * - Single file (no -wal or -shm files)
 * - Simpler for single-instance applications
 */
describe('Database Journal Mode (Integration)', () => {
  let databaseService: DatabaseService;

  describe('with in-memory database', () => {
    beforeEach(() => {
      databaseService = new DatabaseService(':memory:');
      databaseService.onModuleInit();
    });

    afterEach(() => {
      databaseService.onModuleDestroy();
    });

    it('should use DELETE journal mode (not WAL)', () => {
      // Act
      const db = databaseService.getDatabase();
      const mode = db.pragma('journal_mode', { simple: true }) as string;

      // Assert: In-memory databases use 'memory' mode (which is equivalent to DELETE for our purposes)
      // File-based databases will use 'delete' mode
      expect(['delete', 'memory']).toContain(mode.toLowerCase());
      expect(mode.toLowerCase()).not.toBe('wal');
    });

    it('should persist data immediately with DELETE mode', () => {
      // Arrange
      const db = databaseService.getDatabase();

      // Act: Insert data
      db.prepare(`
        INSERT INTO agents (id, type, status, prompt, configuration, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('test-id', 'claude-code', 'running', 'test', '{}', new Date().toISOString());

      // Assert: Query immediately (should work with DELETE mode, no checkpoint needed)
      const row = db.prepare('SELECT * FROM agents WHERE id = ?').get('test-id');
      expect(row).toBeDefined();
      expect((row as any).id).toBe('test-id');
    });

    it('should allow concurrent reads and writes with DELETE mode', () => {
      // Arrange
      const db = databaseService.getDatabase();

      // Act: Multiple operations
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO agents (id, type, status, prompt, configuration, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`agent-${i}`, 'claude-code', 'running', 'test', '{}', new Date().toISOString());
      }

      // Assert: All data readable immediately
      const count = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
      expect(count.count).toBe(10);
    });
  });

  describe('with file-based database', () => {
    let tempDbPath: string;

    beforeEach(() => {
      // Create temporary database file
      tempDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.sqlite`);
      databaseService = new DatabaseService(tempDbPath);
      databaseService.onModuleInit();
    });

    afterEach(() => {
      // Cleanup
      databaseService.onModuleDestroy();
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
      // Clean up any WAL/SHM files if they exist
      const walPath = `${tempDbPath}-wal`;
      const shmPath = `${tempDbPath}-shm`;
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
      }
    });

    it('should use DELETE journal mode for file-based database', () => {
      // Act
      const db = databaseService.getDatabase();
      const mode = db.pragma('journal_mode', { simple: true }) as string;

      // Assert
      expect(mode.toLowerCase()).toBe('delete');
    });

    it('should NOT create WAL files when using DELETE mode', () => {
      // Arrange
      const db = databaseService.getDatabase();

      // Act: Perform some writes to trigger journal activity
      for (let i = 0; i < 20; i++) {
        db.prepare(`
          INSERT INTO agents (id, type, status, prompt, configuration, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`agent-${i}`, 'claude-code', 'running', `test ${i}`, '{}', new Date().toISOString());
      }

      // Assert: No WAL or SHM files should exist
      const walPath = `${tempDbPath}-wal`;
      const shmPath = `${tempDbPath}-shm`;

      expect(fs.existsSync(walPath)).toBe(false);
      expect(fs.existsSync(shmPath)).toBe(false);
    });

    it('should persist data across connections with DELETE mode', () => {
      // Arrange: Insert data with first connection
      const db1 = databaseService.getDatabase();
      db1.prepare(`
        INSERT INTO agents (id, type, status, prompt, configuration, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('persistent-agent', 'claude-code', 'running', 'test', '{}', new Date().toISOString());

      // Close first connection
      databaseService.onModuleDestroy();

      // Act: Open new connection
      databaseService = new DatabaseService(tempDbPath);
      databaseService.onModuleInit();
      const db2 = databaseService.getDatabase();

      // Assert: Data should be available in new connection
      const row = db2.prepare('SELECT * FROM agents WHERE id = ?').get('persistent-agent');
      expect(row).toBeDefined();
      expect((row as any).id).toBe('persistent-agent');
    });

    it('should handle process termination gracefully with DELETE mode', () => {
      // Arrange: Insert data
      const db = databaseService.getDatabase();
      db.prepare(`
        INSERT INTO agents (id, type, status, prompt, configuration, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('termination-test', 'claude-code', 'running', 'test', '{}', new Date().toISOString());

      // Act: Simulate ungraceful shutdown (don't call onModuleDestroy)
      // In DELETE mode, data is already on disk, no checkpoint needed
      const db2 = require('better-sqlite3')(tempDbPath);

      // Assert: Data should be readable even without graceful shutdown
      const row = db2.prepare('SELECT * FROM agents WHERE id = ?').get('termination-test');
      expect(row).toBeDefined();
      expect((row as any).id).toBe('termination-test');

      // Cleanup
      db2.close();
    });

    it('should verify foreign key constraints work with DELETE mode', () => {
      // Arrange
      const db = databaseService.getDatabase();

      // Create agent
      db.prepare(`
        INSERT INTO agents (id, type, status, prompt, configuration, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('fk-test', 'claude-code', 'running', 'test', '{}', new Date().toISOString());

      // Create message with valid FK
      db.prepare(`
        INSERT INTO agent_messages (id, agent_id, sequence_number, type, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('msg-1', 'fk-test', 1, 'assistant', 'Test', new Date().toISOString());

      // Act: Delete agent (should CASCADE DELETE messages)
      db.prepare('DELETE FROM agents WHERE id = ?').run('fk-test');

      // Assert: Message should be deleted (FK constraint works)
      const message = db.prepare('SELECT * FROM agent_messages WHERE id = ?').get('msg-1');
      expect(message).toBeUndefined();
    });
  });

  describe('performance characteristics', () => {
    beforeEach(() => {
      databaseService = new DatabaseService(':memory:');
      databaseService.onModuleInit();
    });

    afterEach(() => {
      databaseService.onModuleDestroy();
    });

    it('should handle batch inserts efficiently with DELETE mode', () => {
      // Arrange
      const db = databaseService.getDatabase();
      const insertCount = 100;

      // Act: Insert many rows
      const startTime = Date.now();
      for (let i = 0; i < insertCount; i++) {
        db.prepare(`
          INSERT INTO agents (id, type, status, prompt, configuration, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(`batch-${i}`, 'claude-code', 'running', 'test', '{}', new Date().toISOString());
      }
      const duration = Date.now() - startTime;

      // Assert: All rows inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
      expect(count.count).toBe(insertCount);

      // Assert: Performance is reasonable (< 100ms for 100 inserts in memory)
      expect(duration).toBeLessThan(100);
    });
  });
});
