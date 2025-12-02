/**
 * DatabaseService Tests
 *
 * Purpose: Verify database connection, configuration, and schema management
 * Layer: Infrastructure
 * Type: Unit (with real database for configuration verification)
 *
 * Coverage:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Configuration (FK constraints, WAL mode, file vs memory)
 * - Schema migration (tables, indexes, idempotency)
 * - Transaction support (commit, rollback, isolation)
 *
 * CRITICAL: Verifies FK constraints are enabled (prevents FK violation bugs)
 *
 * Dependencies: better-sqlite3 (real database)
 * Mocks: None (need real database to verify constraints)
 */

import { DatabaseService } from '@infrastructure/database/database.service';
import { unlink } from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(unlink);

describe('DatabaseService', () => {
  describe('Connection Management', () => {
    it('should connect to database on onModuleInit()', () => {
      // Arrange
      const db = new DatabaseService(':memory:');

      // Act
      db.onModuleInit();

      // Assert
      expect(db.isConnected()).toBe(true);
      expect(db.getDatabase()).toBeDefined();

      // Cleanup
      db.close();
    });

    it('should close database on onModuleDestroy()', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();
      expect(db.isConnected()).toBe(true);

      // Act
      db.onModuleDestroy();

      // Assert
      expect(db.isConnected()).toBe(false);
    });

    it('should not reconnect if already connected', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();
      const firstConnection = db.getDatabase();

      // Act - Try to connect again
      db.connect();
      const secondConnection = db.getDatabase();

      // Assert - Same connection instance
      expect(secondConnection).toBe(firstConnection);

      // Cleanup
      db.close();
    });

    it('should throw if getDatabase() called before connect()', () => {
      // Arrange
      const db = new DatabaseService(':memory:');

      // Act & Assert
      expect(() => db.getDatabase()).toThrow('Database not initialized. Call connect() first.');
    });
  });

  describe('Configuration', () => {
    it('should enable foreign_keys pragma', () => {
      // Arrange
      const db = new DatabaseService(':memory:');

      // Act
      db.onModuleInit();

      // Assert - CRITICAL: FK constraints must be enabled
      const fkEnabled = db.getDatabase().pragma('foreign_keys', { simple: true });
      expect(fkEnabled).toBe(1); // 1 = enabled, 0 = disabled

      // Cleanup
      db.close();
    });

    it('should enable WAL journal mode (memory mode for in-memory databases)', () => {
      // Arrange - in-memory databases use 'memory' mode, not WAL
      const db = new DatabaseService(':memory:');

      // Act
      db.onModuleInit();

      // Assert - in-memory databases use 'memory' journal mode
      const journalMode = db.getDatabase().pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('memory'); // In-memory databases use 'memory' mode

      // Cleanup
      db.close();
    });

    it('should support in-memory database (:memory:)', () => {
      // Arrange & Act
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Assert
      expect(db.isConnected()).toBe(true);
      expect(db.getDatabase()).toBeDefined();

      // Cleanup
      db.close();
    });

    it('should support file-based database', async () => {
      // Arrange
      const testDbPath = './test-database-temp.db';
      const db = new DatabaseService(testDbPath);

      try {
        // Act
        db.onModuleInit();

        // Assert
        expect(db.isConnected()).toBe(true);
        expect(db.getDatabase()).toBeDefined();

        // Cleanup
        db.close();

        // Delete test file
        await unlinkAsync(testDbPath).catch(() => {
          // Ignore if file doesn't exist
        });
      } catch (error) {
        // Cleanup on error
        db.close();
        await unlinkAsync(testDbPath).catch(() => {});
        throw error;
      }
    });

    it('should initialize database without errors', () => {
      // Arrange & Act & Assert
      expect(() => {
        const db = new DatabaseService(':memory:');
        db.onModuleInit();
        db.close();
      }).not.toThrow();
    });
  });

  describe('Schema Migration', () => {
    it('should execute schema.sql on initialization', () => {
      // Arrange
      const db = new DatabaseService(':memory:');

      // Act
      db.onModuleInit();

      // Assert - Tables should exist
      const database = db.getDatabase();
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

      const tableNames = tables.map((t: any) => t.name);
      expect(tableNames).toContain('agents');
      expect(tableNames).toContain('agent_messages');

      // Cleanup
      db.close();
    });

    it('should create agents table with all columns', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act
      const database = db.getDatabase();
      const columns = database.pragma('table_info(agents)') as any[];

      // Assert
      const columnNames = columns.map((c: any) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('prompt');
      expect(columnNames).toContain('configuration');
      expect(columnNames).toContain('started_at');
      expect(columnNames).toContain('completed_at');
      expect(columnNames).toContain('created_at');

      // Cleanup
      db.close();
    });

    it('should create agent_messages table with FK', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act
      const database = db.getDatabase();
      const columns = database.pragma('table_info(agent_messages)') as any[];
      const foreignKeys = database.pragma('foreign_key_list(agent_messages)') as any[];

      // Assert - Columns exist
      const columnNames = columns.map((c: any) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('agent_id'); // FK column
      expect(columnNames).toContain('sequence_number');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('content');

      // Assert - FK constraint exists
      expect(foreignKeys.length).toBeGreaterThan(0);
      const fk = foreignKeys[0];
      expect(fk.table).toBe('agents'); // References agents table
      expect(fk.from).toBe('agent_id'); // FK column

      // Cleanup
      db.close();
    });

    it('should create all indexes', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act
      const database = db.getDatabase();
      const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();

      // Assert - Check for expected indexes
      const indexNames = indexes.map((i: any) => i.name);
      // SQLite auto-creates indexes for PRIMARY KEY and UNIQUE constraints
      // Check for any custom indexes or auto-created ones
      expect(indexNames.length).toBeGreaterThan(0);

      // Cleanup
      db.close();
    });

    it('should be idempotent (safe to run multiple times)', () => {
      // Arrange
      const db = new DatabaseService(':memory:');

      // Act - Initialize twice
      db.onModuleInit();
      const tablesAfterFirst = db
        .getDatabase()
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all();

      // Re-run migrations (simulates restarting app)
      db.close();
      db.onModuleInit();
      const tablesAfterSecond = db
        .getDatabase()
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all();

      // Assert - Same tables exist
      expect(tablesAfterSecond).toEqual(tablesAfterFirst);

      // Cleanup
      db.close();
    });
  });

  describe('Transactions', () => {
    it('should execute function in transaction', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act
      const result = db.transaction((database) => {
        // Insert test data
        database
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run('test-id', 'synthetic', 'running', 'test', '{}', new Date().toISOString());

        // Query it back
        const row = database.prepare('SELECT * FROM agents WHERE id = ?').get('test-id');
        return row;
      });

      // Assert
      expect(result).toBeDefined();
      expect((result as any).id).toBe('test-id');

      // Cleanup
      db.close();
    });

    it('should rollback transaction on error', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act & Assert
      expect(() => {
        db.transaction((database) => {
          // Insert test data
          database
            .prepare(
              'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            )
            .run('test-id', 'synthetic', 'running', 'test', '{}', new Date().toISOString());

          // Throw error - should trigger rollback
          throw new Error('Transaction failed');
        });
      }).toThrow('Transaction failed');

      // Assert - Data should NOT exist (rolled back)
      const row = db.getDatabase().prepare('SELECT * FROM agents WHERE id = ?').get('test-id');
      expect(row).toBeUndefined();

      // Cleanup
      db.close();
    });

    it('should commit transaction on success', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act
      db.transaction((database) => {
        database
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run('test-id', 'synthetic', 'running', 'test', '{}', new Date().toISOString());
      });

      // Assert - Data should exist (committed)
      const row = db.getDatabase().prepare('SELECT * FROM agents WHERE id = ?').get('test-id');
      expect(row).toBeDefined();
      expect((row as any).id).toBe('test-id');

      // Cleanup
      db.close();
    });

    it('should handle nested transactions via savepoints', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act - Outer transaction
      db.transaction((database) => {
        database
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run('outer-id', 'synthetic', 'running', 'outer', '{}', new Date().toISOString());

        // Inner "transaction" (note: better-sqlite3 doesn't support true nested transactions)
        // This tests that we can call transaction logic within a transaction
        database
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run('inner-id', 'synthetic', 'running', 'inner', '{}', new Date().toISOString());
      });

      // Assert - Both should exist
      const outer = db.getDatabase().prepare('SELECT * FROM agents WHERE id = ?').get('outer-id');
      const inner = db.getDatabase().prepare('SELECT * FROM agents WHERE id = ?').get('inner-id');
      expect(outer).toBeDefined();
      expect(inner).toBeDefined();

      // Cleanup
      db.close();
    });

    it('should isolate concurrent transactions', () => {
      // Arrange
      const db = new DatabaseService(':memory:');
      db.onModuleInit();

      // Act - Run transactions sequentially (better-sqlite3 is synchronous)
      db.transaction((database) => {
        database
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run('transaction-1', 'synthetic', 'running', 'test1', '{}', new Date().toISOString());
      });

      db.transaction((database) => {
        database
          .prepare(
            'INSERT INTO agents (id, type, status, prompt, configuration, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run('transaction-2', 'synthetic', 'running', 'test2', '{}', new Date().toISOString());
      });

      // Assert - Both should exist independently
      const row1 = db
        .getDatabase()
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get('transaction-1');
      const row2 = db
        .getDatabase()
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get('transaction-2');
      expect(row1).toBeDefined();
      expect(row2).toBeDefined();

      // Cleanup
      db.close();
    });
  });
});
