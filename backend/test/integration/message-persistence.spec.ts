import { AgentMessageService } from '@application/services/agent-message.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { CreateMessageDto } from '@application/dto';

/**
 * Integration Test: Message Persistence
 *
 * This test verifies that messages are ACTUALLY saved to the database
 * and can be retrieved by subsequent queries.
 *
 * BUG REPRODUCTION: Messages insert successfully (changes: 1) but
 * subsequent queries return empty results.
 *
 * This test uses REAL DatabaseService to catch persistence bugs.
 */
describe('Message Persistence (Integration)', () => {
  let messageService: AgentMessageService;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Create REAL database service (in-memory for speed)
    databaseService = new DatabaseService(':memory:');
    databaseService.onModuleInit();

    // Create message service with REAL database
    messageService = new AgentMessageService(databaseService);

    // Create a test agent so FK constraint passes
    const db = databaseService.getDatabase();
    db.prepare(`
      INSERT INTO agents (id, type, status, prompt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('test-agent-1', 'claude-code', 'running', 'Test prompt', new Date().toISOString());
  });

  afterEach(() => {
    databaseService.onModuleDestroy();
  });

  describe('saveMessage', () => {
    it('should persist message to database and retrieve it', async () => {
      // Arrange
      const createDto: CreateMessageDto = {
        agentId: 'test-agent-1',
        type: 'assistant',
        role: 'assistant',
        content: 'Test message content',
        raw: '{"test": true}',
        metadata: { test: 'value' },
      };

      // Act: Save message
      const savedMessage = await messageService.saveMessage(createDto);

      // Assert: Message was saved with correct data
      expect(savedMessage).toBeDefined();
      expect(savedMessage.id).toBeDefined();
      expect(savedMessage.agentId).toBe('test-agent-1');
      expect(savedMessage.sequenceNumber).toBe(1);
      expect(savedMessage.content).toBe('Test message content');

      // CRITICAL: Verify message actually persists in database
      const retrievedMessages = await messageService.findByAgentId('test-agent-1');

      // THIS TEST WILL FAIL if persistence is broken!
      expect(retrievedMessages).toHaveLength(1);
      expect(retrievedMessages[0]?.id).toBe(savedMessage.id);
      expect(retrievedMessages[0]?.content).toBe('Test message content');
      expect(retrievedMessages[0]?.sequenceNumber).toBe(1);
    });

    it('should persist multiple messages with incrementing sequence numbers', async () => {
      // Arrange
      const messages = [
        { content: 'Message 1', type: 'assistant' as const },
        { content: 'Message 2', type: 'user' as const },
        { content: 'Message 3', type: 'assistant' as const },
      ];

      // Act: Save multiple messages
      const savedMessages = [];
      for (const msg of messages) {
        const saved = await messageService.saveMessage({
          agentId: 'test-agent-1',
          type: msg.type,
          role: msg.type,
          content: msg.content,
        });
        savedMessages.push(saved);
      }

      // Assert: All messages saved with correct sequence
      expect(savedMessages).toHaveLength(3);
      expect(savedMessages[0]?.sequenceNumber).toBe(1);
      expect(savedMessages[1]?.sequenceNumber).toBe(2);
      expect(savedMessages[2]?.sequenceNumber).toBe(3);

      // CRITICAL: Verify all messages persist
      const retrievedMessages = await messageService.findByAgentId('test-agent-1');

      expect(retrievedMessages).toHaveLength(3);
      expect(retrievedMessages[0]?.content).toBe('Message 1');
      expect(retrievedMessages[1]?.content).toBe('Message 2');
      expect(retrievedMessages[2]?.content).toBe('Message 3');
    });

    it('should persist messages and retrieve them via direct database query', async () => {
      // Arrange
      const createDto: CreateMessageDto = {
        agentId: 'test-agent-1',
        type: 'assistant',
        content: 'Direct query test',
      };

      // Act: Save via service
      const savedMessage = await messageService.saveMessage(createDto);

      // Assert: Query database directly (bypassing service)
      const db = databaseService.getDatabase();
      const directResult = db.prepare(`
        SELECT * FROM agent_messages WHERE id = ?
      `).get(savedMessage.id);

      // THIS TEST WILL FAIL if data isn't actually in the database!
      expect(directResult).toBeDefined();
      expect((directResult as any).id).toBe(savedMessage.id);
      expect((directResult as any).agent_id).toBe('test-agent-1');
      expect((directResult as any).content).toBe('Direct query test');
    });

    it('should handle database transaction commit properly', async () => {
      // Arrange
      const createDto: CreateMessageDto = {
        agentId: 'test-agent-1',
        type: 'system',
        content: 'Transaction test',
      };

      // Act: Save message
      await messageService.saveMessage(createDto);

      // Get a FRESH database connection to ensure we're not reading from cache
      const freshDb = databaseService.getDatabase();

      // Force WAL checkpoint to ensure data is written to main database
      freshDb.pragma('wal_checkpoint(FULL)');

      // Query with fresh connection
      const messages = freshDb.prepare(`
        SELECT * FROM agent_messages WHERE agent_id = ?
      `).all('test-agent-1');

      // THIS TEST WILL FAIL if transactions aren't committed!
      expect(messages).toHaveLength(1);
    });
  });

  describe('findByAgentId', () => {
    it('should return empty array when no messages exist', async () => {
      // Act
      const messages = await messageService.findByAgentId('test-agent-1');

      // Assert
      expect(messages).toEqual([]);
    });

    it('should return messages in sequence order', async () => {
      // Arrange: Create messages out of order
      await messageService.saveMessage({
        agentId: 'test-agent-1',
        type: 'assistant',
        content: 'First',
      });
      await messageService.saveMessage({
        agentId: 'test-agent-1',
        type: 'user',
        content: 'Second',
      });
      await messageService.saveMessage({
        agentId: 'test-agent-1',
        type: 'assistant',
        content: 'Third',
      });

      // Act
      const messages = await messageService.findByAgentId('test-agent-1');

      // Assert: Should be in sequence order
      expect(messages).toHaveLength(3);
      expect(messages[0]?.sequenceNumber).toBe(1);
      expect(messages[0]?.content).toBe('First');
      expect(messages[1]?.sequenceNumber).toBe(2);
      expect(messages[1]?.content).toBe('Second');
      expect(messages[2]?.sequenceNumber).toBe(3);
      expect(messages[2]?.content).toBe('Third');
    });
  });

  describe('findByAgentIdSince', () => {
    beforeEach(async () => {
      // Create 5 messages
      for (let i = 1; i <= 5; i++) {
        await messageService.saveMessage({
          agentId: 'test-agent-1',
          type: 'assistant',
          content: `Message ${i}`,
        });
      }
    });

    it('should return messages after specified sequence', async () => {
      // Act: Get messages after sequence 2
      const messages = await messageService.findByAgentIdSince('test-agent-1', 2);

      // Assert: Should return messages 3, 4, 5
      expect(messages).toHaveLength(3);
      expect(messages[0]?.sequenceNumber).toBe(3);
      expect(messages[1]?.sequenceNumber).toBe(4);
      expect(messages[2]?.sequenceNumber).toBe(5);
    });

    it('should return all messages when since is 0', async () => {
      // Act
      const messages = await messageService.findByAgentIdSince('test-agent-1', 0);

      // Assert
      expect(messages).toHaveLength(5);
    });
  });
});
