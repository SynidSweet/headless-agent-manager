import { AgentFactoryAdapter } from '@infrastructure/adapters/agent-factory.adapter';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { IAgentRunner } from '@application/ports/agent-runner.port';

describe('AgentFactoryAdapter', () => {
  let factory: AgentFactoryAdapter;
  let mockClaudeAdapter: jest.Mocked<IAgentRunner>;
  let mockGeminiAdapter: jest.Mocked<IAgentRunner>;

  beforeEach(() => {
    mockClaudeAdapter = {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    } as any;

    mockGeminiAdapter = {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    } as any;

    factory = new AgentFactoryAdapter(mockClaudeAdapter, mockGeminiAdapter);
  });

  describe('create', () => {
    it('should create Claude adapter for CLAUDE_CODE type', () => {
      const adapter = factory.create(AgentType.CLAUDE_CODE);

      expect(adapter).toBe(mockClaudeAdapter);
    });

    it('should return GeminiCLIAdapter for GEMINI_CLI type', () => {
      const adapter = factory.create(AgentType.GEMINI_CLI);

      expect(adapter).toBe(mockGeminiAdapter);
    });

    it('should throw error for unknown agent type', () => {
      const invalidType = 'invalid-type' as AgentType;

      expect(() => factory.create(invalidType)).toThrow('Agent type not supported');
    });
  });
});
