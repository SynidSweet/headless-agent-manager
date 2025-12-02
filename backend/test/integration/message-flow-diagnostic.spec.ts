import { AgentMessageService } from '@application/services/agent-message.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { CreateMessageDto } from '@application/dto';
import { unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Diagnostic Test: Message Flow Analysis
 *
 * This test verifies message persistence with DELETE journal mode.
 * Tests use REAL file-based database with DELETE mode (not :memory:).
 *
 * DELETE mode ensures immediate data persistence without WAL files.
 */
describe('Message Flow Diagnostic (File-based DB with DELETE mode)', () => {
  let messageService: AgentMessageService;
  let databaseService: DatabaseService;
  const testDbPath = join(__dirname, '../../data/test-diagnostic.db');

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore if files don't exist
    }

    // Create REAL database service with FILE-BASED database (like production)
    databaseService = new DatabaseService(testDbPath);
    databaseService.onModuleInit();

    // Create message service with REAL database
    messageService = new AgentMessageService(databaseService);

    // Create a test agent so FK constraint passes
    const db = databaseService.getDatabase();
    db.prepare(
      `
      INSERT INTO agents (id, type, status, prompt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run('test-agent-1', 'claude-code', 'running', 'Test prompt', new Date().toISOString());
  });

  afterEach(() => {
    databaseService.onModuleDestroy();

    // Clean up test database
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('DELETE Mode Persistence Diagnostic', () => {
    it('should save and retrieve messages from file-based database with DELETE mode', async () => {
      // Arrange
      const message: CreateMessageDto = {
        agentId: 'test-agent-1',
        type: 'assistant',
        role: 'assistant',
        content: 'Hello world',
      };

      // Act 1: Save message via service
      console.log('\n=== STEP 1: Save message ===');
      const saved = await messageService.saveMessage(message);
      console.log('Saved message:', saved.id);

      // Act 2: Query database DIRECTLY (bypass service to eliminate caching)
      console.log('\n=== STEP 2: Direct DB query (same connection) ===');
      const db = databaseService.getDatabase();
      const directQuery1 = db.prepare('SELECT * FROM agent_messages WHERE agent_id = ?');
      const rows1 = directQuery1.all('test-agent-1');
      console.log('Direct query result (same connection):', rows1.length, 'rows');

      // Act 3: Query via service
      console.log('\n=== STEP 3: Service query ===');
      const serviceMessages = await messageService.findByAgentId('test-agent-1');
      console.log('Service query result:', serviceMessages.length, 'messages');

      // Act 4: Verify journal mode
      console.log('\n=== STEP 4: Verify journal mode ===');
      const journalMode = db.pragma('journal_mode', { simple: true }) as string;
      console.log('Journal mode:', journalMode);
      expect(['delete', 'memory']).toContain(journalMode.toLowerCase());

      // Act 5: Query again (DELETE mode has immediate persistence)
      console.log('\n=== STEP 5: Query again (immediate persistence) ===');
      const rows2 = directQuery1.all('test-agent-1');
      console.log('Direct query result (immediate persistence):', rows2.length, 'rows');

      // Act 6: Create NEW database connection to same file
      console.log('\n=== STEP 6: Fresh database connection ===');
      const BetterSqlite3 = require('better-sqlite3');
      const freshDb = new BetterSqlite3(testDbPath);
      freshDb.pragma('foreign_keys = ON');
      const freshQuery = freshDb.prepare('SELECT * FROM agent_messages WHERE agent_id = ?');
      const rows3 = freshQuery.all('test-agent-1');
      console.log('Fresh connection result:', rows3.length, 'rows');
      freshDb.close();

      // Assert: All queries should return the same data (DELETE mode ensures immediate persistence)
      console.log('\n=== ASSERTION ===');
      expect(rows1.length).toBeGreaterThan(0);
      expect(serviceMessages.length).toBe(rows1.length);
      expect(rows2.length).toBe(rows1.length); // DELETE mode: immediate persistence
      expect(rows3.length).toBe(rows1.length); // DELETE mode: data in main file
    });

    it('should handle multiple messages with DELETE mode', async () => {
      // Arrange: Create 3 messages
      const messages: CreateMessageDto[] = [
        { agentId: 'test-agent-1', type: 'user', content: 'Message 1' },
        { agentId: 'test-agent-1', type: 'assistant', content: 'Message 2' },
        { agentId: 'test-agent-1', type: 'user', content: 'Message 3' },
      ];

      // Act: Save all messages
      console.log('\n=== Saving multiple messages ===');
      for (const msg of messages) {
        const saved = await messageService.saveMessage(msg);
        console.log('Saved:', saved.id, saved.sequenceNumber);
      }

      // Query immediately (DELETE mode ensures immediate persistence)
      const db = databaseService.getDatabase();
      const count = db.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as {
        c: number;
      };
      console.log('Message count:', count.c);

      // Verify journal mode
      const journalMode = db.pragma('journal_mode', { simple: true }) as string;
      console.log('Journal mode:', journalMode);
      expect(['delete', 'memory']).toContain(journalMode.toLowerCase());

      // Verify all messages persisted
      expect(count.c).toBe(3); // DELETE mode: immediate persistence
    });

    it('should verify DELETE mode does not create WAL files', async () => {
      // Arrange
      const message: CreateMessageDto = {
        agentId: 'test-agent-1',
        type: 'assistant',
        content: 'DELETE mode test message',
      };

      // Act: Save message
      await messageService.saveMessage(message);

      // Check file existence
      const fs = require('fs');
      const mainSize = fs.statSync(testDbPath).size;
      const walPath = `${testDbPath}-wal`;
      const shmPath = `${testDbPath}-shm`;
      const walExists = fs.existsSync(walPath);
      const shmExists = fs.existsSync(shmPath);

      console.log('\n=== File status ===');
      console.log('Main DB:', mainSize, 'bytes');
      console.log('WAL file exists:', walExists);
      console.log('SHM file exists:', shmExists);

      // DELETE mode should NOT create WAL or SHM files
      expect(walExists).toBe(false);
      expect(shmExists).toBe(false);

      // Main database file should contain data
      expect(mainSize).toBeGreaterThan(0);
    });
  });

  describe('Transaction Isolation', () => {
    it('should verify messages are not in an uncommitted transaction', async () => {
      // Arrange
      const message: CreateMessageDto = {
        agentId: 'test-agent-1',
        type: 'system',
        content: 'Transaction test',
      };

      // Act: Save message
      const db = databaseService.getDatabase();
      console.log('\n=== Before save ===');
      console.log('In transaction:', db.inTransaction);

      await messageService.saveMessage(message);

      console.log('\n=== After save ===');
      console.log('In transaction:', db.inTransaction);

      // Assert: Should NOT be in transaction
      expect(db.inTransaction).toBe(false);
    });
  });
});
