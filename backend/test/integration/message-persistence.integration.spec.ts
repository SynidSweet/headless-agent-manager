import { AgentMessageService } from '@application/services/agent-message.service';
import { StreamingService } from '@application/services/streaming.service';
import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';
import { DatabaseService } from '@infrastructure/database/database.service';
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';
import { AgentMessage } from '@application/ports/agent-runner.port';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Message Persistence Pipeline Integration Tests
 *
 * These tests verify the FULL pipeline from parsing to database storage.
 * This is exactly the path that had the production bug:
 *
 * Real Claude Output → Parser → StreamingService → MessageService → Database
 *
 * The bug: System messages from Claude have no `content` field, but database
 * requires `content NOT NULL`. The parser sets `content = ''` but this wasn't
 * tested with real data + real database.
 */
describe('Message Persistence Pipeline (Integration)', () => {
  let db: DatabaseService;
  let messageService: AgentMessageService;
  let streamingService: StreamingService;
  let parser: ClaudeMessageParser;
  let mockWebSocketGateway: jest.Mocked<IWebSocketGateway>;

  beforeEach(() => {
    // Use in-memory SQLite database (real database, no mocks)
    db = new DatabaseService(':memory:');
    db.onModuleInit(); // Connects and runs migrations

    // Real services (no mocks)
    messageService = new AgentMessageService(db);
    parser = new ClaudeMessageParser();

    // Mock WebSocket gateway (only part we mock, since it's IO)
    mockWebSocketGateway = {
      emitToClient: jest.fn(),
      emitToAll: jest.fn(),
      emitToRoom: jest.fn(),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn(),
      getConnectedClients: jest.fn(),
      isClientConnected: jest.fn(),
    };

    // Real streaming service
    streamingService = new StreamingService(mockWebSocketGateway, messageService);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Helper: Create an agent in the database
   * Messages require an agent to exist due to foreign key constraint
   */
  function createAgentInDb(agentId: AgentId): void {
    const database = db.getDatabase();
    const stmt = database.prepare(`
      INSERT INTO agents (id, type, status, prompt, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      agentId.toString(),
      'claude-code',
      'running',
      'test prompt',
      new Date().toISOString()
    );
  }

  describe('Real Claude output formats', () => {
    /**
     * THE BUG TEST #1: System init message without content field
     *
     * This is the exact scenario that caused the production bug.
     * Real Claude output has NO `content` field for system messages.
     */
    it('should save system init message without content field', async () => {
      // Real format from Claude CLI (no content field!)
      const line = '{"type":"system","subtype":"init","session_id":"test-123","model":"claude-sonnet-4"}';
      const message = parser.parse(line);

      // Verify parser sets empty string for content
      expect(message.type).toBe('system');
      expect(message.content).toBe('');

      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      // This should NOT throw database constraint error
      await expect(
        streamingService.broadcastMessage(agentId, message)
      ).resolves.not.toThrow();

      // Verify message was saved to database
      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(1);
      expect(saved[0]!.type).toBe('system');
      expect(saved[0]!.content).toBe('');
      expect(saved[0]!.metadata).toHaveProperty('subtype', 'init');
    });

    /**
     * THE BUG TEST #2: Result message without content field
     *
     * Result messages also have no content, just metadata like duration.
     */
    it('should save result message without content field', async () => {
      const line = '{"type":"result","subtype":"success","duration_ms":1234,"total_cost_usd":0.001}';
      const message = parser.parse(line);

      // Parser maps "result" to "system" type
      expect(message.type).toBe('system');
      expect(message.content).toBe('');

      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      await expect(
        streamingService.broadcastMessage(agentId, message)
      ).resolves.not.toThrow();

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(1);
      expect(saved[0]!.type).toBe('system');
      expect(saved[0]!.content).toBe('');
      expect(saved[0]!.metadata).toHaveProperty('subtype', 'success');
      expect(saved[0]!.metadata).toHaveProperty('duration_ms', 1234);
    });

    /**
     * TEST #3: Assistant message with nested content structure
     *
     * Assistant messages have complex nested content that needs parsing.
     */
    it('should save assistant message with nested content', async () => {
      const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello, world!"}],"role":"assistant"}}';
      const message = parser.parse(line);

      expect(message.type).toBe('assistant');
      expect(message.content).toBe('Hello, world!');

      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      await streamingService.broadcastMessage(agentId, message);

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(1);
      expect(saved[0]!.content).toBe('Hello, world!');
    });

    /**
     * TEST #4: System message with stats but no content
     *
     * Old format system/result messages with stats object.
     */
    it('should save system message with stats but no content', async () => {
      const line = '{"type":"system","role":"result","stats":{"duration":1234,"tokens":{"prompt":45,"completion":78}}}';
      const message = parser.parse(line);

      expect(message.type).toBe('system');
      expect(message.content).toBe('');
      expect(message.metadata?.stats).toBeDefined();

      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      await streamingService.broadcastMessage(agentId, message);

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(1);
      expect(saved[0]!.content).toBe('');
      expect(saved[0]!.metadata).toHaveProperty('stats');
    });
  });

  describe('Full pipeline: Python Proxy → Parser → Service → Database', () => {
    /**
     * TEST #5: Complete conversation flow
     *
     * Simulates a full Claude conversation with init, messages, and result.
     */
    it('should handle complete Claude conversation', async () => {
      const realOutput = [
        '{"type":"system","subtype":"init","session_id":"test-123","model":"claude-sonnet-4"}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"I can help with that."}]}}',
        '{"type":"assistant","message":{"content":[{"type":"text","text":"Here is the solution."}]}}',
        '{"type":"result","subtype":"success","duration_ms":1234,"total_cost_usd":0.001}',
      ];

      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      for (const line of realOutput) {
        const message = parser.parse(line);
        await streamingService.broadcastMessage(agentId, message);
      }

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(4);
      expect(saved[0]!.type).toBe('system');
      expect(saved[0]!.sequenceNumber).toBe(1);
      expect(saved[1]!.type).toBe('assistant');
      expect(saved[1]!.sequenceNumber).toBe(2);
      expect(saved[2]!.type).toBe('assistant');
      expect(saved[2]!.sequenceNumber).toBe(3);
      expect(saved[3]!.type).toBe('system'); // result mapped to system
      expect(saved[3]!.sequenceNumber).toBe(4);
    });

    /**
     * TEST #6: Use real fixture file
     *
     * Tests with the actual fixture from real Claude CLI output.
     */
    it('should handle real fixture from claude-code-real-output.jsonl', async () => {
      const fixturePath = join(__dirname, '../fixtures/claude-code-real-output.jsonl');
      const fixtures = readFileSync(fixturePath, 'utf-8')
        .split('\n')
        .filter((line) => line.trim());

      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      for (const line of fixtures) {
        const message = parser.parse(line);
        // This should NOT throw on messages without content
        await streamingService.broadcastMessage(agentId, message);
      }

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved.length).toBeGreaterThan(0);

      // Verify first message is system init with no content
      expect(saved[0]!.type).toBe('system');
      expect(saved[0]!.content).toBe('');
    });
  });

  describe('Sequence numbers and ordering', () => {
    /**
     * TEST #7: Messages maintain order
     */
    it('should maintain sequential order for messages', async () => {
      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      const messages: AgentMessage[] = [
        { type: 'system', content: '' },
        { type: 'assistant', content: 'First response' },
        { type: 'assistant', content: 'Second response' },
        { type: 'system', content: '' },
      ];

      for (const msg of messages) {
        await streamingService.broadcastMessage(agentId, msg);
      }

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(4);
      expect(saved[0]!.sequenceNumber).toBe(1);
      expect(saved[1]!.sequenceNumber).toBe(2);
      expect(saved[2]!.sequenceNumber).toBe(3);
      expect(saved[3]!.sequenceNumber).toBe(4);
    });

    /**
     * TEST #8: Multiple agents maintain separate sequences
     */
    it('should maintain separate sequences for different agents', async () => {
      const agent1 = AgentId.generate();
      const agent2 = AgentId.generate();
      createAgentInDb(agent1); // Create agents first (foreign key requirement)
      createAgentInDb(agent2);

      const message: AgentMessage = { type: 'assistant', content: 'Test' };

      await streamingService.broadcastMessage(agent1, message);
      await streamingService.broadcastMessage(agent2, message);
      await streamingService.broadcastMessage(agent1, message);

      const saved1 = await messageService.findByAgentId(agent1.toString());
      const saved2 = await messageService.findByAgentId(agent2.toString());

      expect(saved1).toHaveLength(2);
      expect(saved2).toHaveLength(1);
      expect(saved1[0]!.sequenceNumber).toBe(1);
      expect(saved1[1]!.sequenceNumber).toBe(2);
      expect(saved2[0]!.sequenceNumber).toBe(1);
    });
  });

  describe('WebSocket integration', () => {
    /**
     * TEST #9: Messages broadcasted to WebSocket clients
     */
    it('should broadcast saved message to WebSocket with ID and sequence', async () => {
      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)
      const message: AgentMessage = { type: 'assistant', content: 'Hello' };

      await streamingService.broadcastMessage(agentId, message);

      expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
        `agent:${agentId.toString()}`,
        'agent:message',
        expect.objectContaining({
          agentId: agentId.toString(),
          message: expect.objectContaining({
            id: expect.any(String),
            sequenceNumber: 1,
            type: 'assistant',
            content: 'Hello',
          }),
        })
      );
    });
  });

  describe('Error handling', () => {
    /**
     * TEST #10: Database constraint violations are caught
     *
     * While we don't expect constraint errors with proper implementation,
     * this test verifies our error handling is in place.
     */
    it('should handle database constraint violations gracefully', async () => {
      // Directly test the message service with invalid data
      // Note: This bypasses the parser, testing the service layer directly
      await expect(
        messageService.saveMessage({
          agentId: 'test-agent',
          type: 'assistant',
          content: null as any, // Invalid: null not allowed
        })
      ).rejects.toThrow();
    });

    /**
     * TEST #11: Empty content string is valid
     */
    it('should accept empty string as valid content', async () => {
      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      const saved = await messageService.saveMessage({
        agentId: agentId.toString(),
        type: 'system',
        content: '', // Empty string should be valid
      });

      expect(saved.content).toBe('');
    });

    /**
     * TEST #12: Object content is serialized and auto-parsed
     *
     * Objects are stored as JSON strings in the database but automatically
     * parsed back to objects when retrieved for API convenience.
     */
    it('should serialize object content to JSON string', async () => {
      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)
      const objectContent = { key: 'value', nested: { data: 123 } };
      const message: AgentMessage = {
        type: 'system',
        content: objectContent,
      };

      await streamingService.broadcastMessage(agentId, message);

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(1);

      // Content is automatically parsed from JSON back to object
      expect(typeof saved[0]!.content).toBe('object');
      expect(saved[0]!.content).toEqual(objectContent);
    });
  });

  describe('Performance and concurrency', () => {
    /**
     * TEST #13: High volume message handling
     */
    it('should handle rapid message bursts', async () => {
      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)
      const messageCount = 50;

      const messages = Array.from({ length: messageCount }, (_, i) => ({
        type: 'assistant' as const,
        content: `Message ${i + 1}`,
      }));

      // Send all messages rapidly
      await Promise.all(
        messages.map((msg) => streamingService.broadcastMessage(agentId, msg))
      );

      const saved = await messageService.findByAgentId(agentId.toString());
      expect(saved).toHaveLength(messageCount);

      // Verify sequence numbers are correct (1, 2, 3, ...)
      const sequenceNumbers = saved.map((m) => m.sequenceNumber);
      const expectedSequence = Array.from({ length: messageCount }, (_, i) => i + 1);
      expect(sequenceNumbers).toEqual(expectedSequence);
    });
  });

  describe('Message retrieval', () => {
    /**
     * TEST #14: Find messages since sequence number
     */
    it('should retrieve messages since a given sequence number', async () => {
      const agentId = AgentId.generate();
      createAgentInDb(agentId); // Create agent first (foreign key requirement)

      // Save 5 messages
      for (let i = 1; i <= 5; i++) {
        await streamingService.broadcastMessage(agentId, {
          type: 'assistant',
          content: `Message ${i}`,
        });
      }

      // Get messages since sequence 3
      const recent = await messageService.findByAgentIdSince(agentId.toString(), 3);

      expect(recent).toHaveLength(2); // Messages 4 and 5
      expect(recent[0]!.sequenceNumber).toBe(4);
      expect(recent[1]!.sequenceNumber).toBe(5);
    });
  });
});
