import { AgentMessageService } from '@application/services/agent-message.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { CreateMessageDto, AgentMessageDto } from '@application/dto';

/**
 * AgentMessageService Unit Tests
 * Tests for message persistence with UUID and sequence numbers
 */
describe('AgentMessageService', () => {
  let service: AgentMessageService;
  let mockDatabase: jest.Mocked<DatabaseService>;
  let mockDb: any;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      prepare: jest.fn(),
      exec: jest.fn(),
    };

    mockDatabase = {
      getDatabase: jest.fn().mockReturnValue(mockDb),
    } as any;

    // Create service with mock database
    service = new AgentMessageService(mockDatabase);
  });

  describe('saveMessage', () => {
    it('should save message with unique UUID and sequence number 1 for first message', async () => {
      // Arrange
      const createDto: CreateMessageDto = {
        agentId: 'agent-123',
        type: 'assistant',
        content: 'Hello, world!',
      };

      // Mock: Atomic INSERT with subquery + SELECT to get sequence
      const mockInsertStmt = {
        run: jest.fn(),
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ sequence_number: 1 }),
      };

      mockDb.prepare
        .mockReturnValueOnce(mockInsertStmt) // For INSERT with subquery
        .mockReturnValueOnce(mockSelectStmt); // For SELECT sequence_number

      // Act
      const result = await service.saveMessage(createDto);

      // Assert
      expect(result.id).toMatch(/^[a-f0-9-]{36}$/); // UUID v4 format
      expect(result.sequenceNumber).toBe(1);
      expect(result.agentId).toBe('agent-123');
      expect(result.type).toBe('assistant');
      expect(result.content).toBe('Hello, world!');
      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    });

    it('should increment sequence number for same agent', async () => {
      // Arrange
      const createDto: CreateMessageDto = {
        agentId: 'agent-123',
        type: 'user',
        content: 'Second message',
      };

      // Mock: Atomic INSERT + SELECT returning sequence 2
      const mockInsertStmt = {
        run: jest.fn(),
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ sequence_number: 2 }),
      };

      mockDb.prepare
        .mockReturnValueOnce(mockInsertStmt)
        .mockReturnValueOnce(mockSelectStmt);

      // Act
      const result = await service.saveMessage(createDto);

      // Assert
      expect(result.sequenceNumber).toBe(2);
    });

    it('should maintain separate sequences for different agents', async () => {
      // Arrange
      const createDtoA: CreateMessageDto = {
        agentId: 'agent-A',
        type: 'assistant',
        content: 'Message A',
      };
      const createDtoB: CreateMessageDto = {
        agentId: 'agent-B',
        type: 'assistant',
        content: 'Message B',
      };

      // Mock: Both agents start at sequence 1
      const mockInsertStmt = {
        run: jest.fn(),
      };
      const mockSelectStmt1 = {
        get: jest.fn().mockReturnValue({ sequence_number: 1 }),
      };
      const mockSelectStmt2 = {
        get: jest.fn().mockReturnValue({ sequence_number: 1 }),
      };

      mockDb.prepare
        .mockReturnValueOnce(mockInsertStmt)  // INSERT for agent A
        .mockReturnValueOnce(mockSelectStmt1) // SELECT for agent A
        .mockReturnValueOnce(mockInsertStmt)  // INSERT for agent B
        .mockReturnValueOnce(mockSelectStmt2); // SELECT for agent B

      // Act
      const resultA = await service.saveMessage(createDtoA);
      const resultB = await service.saveMessage(createDtoB);

      // Assert
      expect(resultA.sequenceNumber).toBe(1);
      expect(resultB.sequenceNumber).toBe(1);
      expect(resultA.agentId).toBe('agent-A');
      expect(resultB.agentId).toBe('agent-B');
    });

    it('should save metadata as JSON string', async () => {
      // Arrange
      const createDto: CreateMessageDto = {
        agentId: 'agent-123',
        type: 'system',
        content: 'System message',
        metadata: { key: 'value', nested: { data: 123 } },
      };

      const mockInsertStmt = {
        run: jest.fn(),
      };
      const mockSelectStmt = {
        get: jest.fn().mockReturnValue({ sequence_number: 1 }),
      };

      mockDb.prepare
        .mockReturnValueOnce(mockInsertStmt)
        .mockReturnValueOnce(mockSelectStmt);

      // Act
      const result = await service.saveMessage(createDto);

      // Assert
      expect(result.metadata).toEqual({ key: 'value', nested: { data: 123 } });
      // Verify the INSERT call had metadata as JSON string (7th parameter, index 6)
      const insertCall = mockInsertStmt.run.mock.calls[0];
      const metadataParam = insertCall[6]; // metadata parameter
      expect(typeof metadataParam).toBe('string');
      expect(JSON.parse(metadataParam)).toEqual({ key: 'value', nested: { data: 123 } });
    });
  });

  describe('findByAgentId', () => {
    it('should return messages sorted by sequence number', async () => {
      // Arrange
      const agentId = 'agent-123';
      const mockMessages = [
        {
          id: 'msg-1',
          agent_id: 'agent-123',
          sequence_number: 1,
          type: 'user',
          content: 'First',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'msg-2',
          agent_id: 'agent-123',
          sequence_number: 2,
          type: 'assistant',
          content: 'Second',
          created_at: '2025-01-01T00:00:01Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockMessages),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      // Act
      const result = await service.findByAgentId(agentId);

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.sequenceNumber).toBe(1);
      expect(result[1]!.sequenceNumber).toBe(2);
      expect(result[0]!.content).toBe('First');
      expect(result[1]!.content).toBe('Second');
    });

    it('should parse metadata from JSON string', async () => {
      // Arrange
      const agentId = 'agent-123';
      const mockMessages = [
        {
          id: 'msg-1',
          agent_id: 'agent-123',
          sequence_number: 1,
          type: 'system',
          content: 'Test',
          metadata: JSON.stringify({ key: 'value' }),
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockMessages),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      // Act
      const result = await service.findByAgentId(agentId);

      // Assert
      expect(result[0]!.metadata).toEqual({ key: 'value' });
    });

    it('should return empty array when no messages exist', async () => {
      // Arrange
      const agentId = 'agent-123';
      const mockStmt = {
        all: jest.fn().mockReturnValue([]),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      // Act
      const result = await service.findByAgentId(agentId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findByAgentIdSince', () => {
    it('should return messages after specified sequence number', async () => {
      // Arrange
      const agentId = 'agent-123';
      const sinceSequence = 2;
      const mockMessages = [
        {
          id: 'msg-3',
          agent_id: 'agent-123',
          sequence_number: 3,
          type: 'user',
          content: 'Third',
          created_at: '2025-01-01T00:00:02Z',
        },
        {
          id: 'msg-4',
          agent_id: 'agent-123',
          sequence_number: 4,
          type: 'assistant',
          content: 'Fourth',
          created_at: '2025-01-01T00:00:03Z',
        },
      ];

      const mockStmt = {
        all: jest.fn().mockReturnValue(mockMessages),
      };
      mockDb.prepare.mockReturnValue(mockStmt);

      // Act
      const result = await service.findByAgentIdSince(agentId, sinceSequence);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((msg: AgentMessageDto) => msg.sequenceNumber > sinceSequence)).toBe(true);
    });
  });
});
