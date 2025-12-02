import { LaunchRequest } from '@domain/value-objects/launch-request.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('LaunchRequest Value Object', () => {
  describe('create', () => {
    it('should create valid launch request with required fields', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
      });

      expect(request.id).toBeDefined();
      expect(request.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(request.agentType).toBe(AgentType.CLAUDE_CODE);
      expect(request.prompt).toBe('Test prompt');
      expect(request.instructions).toBeUndefined();
      expect(request.sessionId).toBeUndefined();
      expect(request.metadata).toBeUndefined();
      expect(request.configuration).toBeUndefined();
    });

    it('should create launch request with instructions', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions for this agent',
      });

      expect(request.instructions).toBe('Custom instructions for this agent');
    });

    it('should create launch request with all optional fields', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
        sessionId: 'session-123',
        metadata: { key: 'value', userId: 42 },
        configuration: {
          outputFormat: 'stream-json',
          timeout: 60000,
        },
      });

      expect(request.instructions).toBe('Custom instructions');
      expect(request.sessionId).toBe('session-123');
      expect(request.metadata).toEqual({ key: 'value', userId: 42 });
      expect(request.configuration).toEqual({
        outputFormat: 'stream-json',
        timeout: 60000,
      });
    });

    it('should throw DomainException when prompt is empty', () => {
      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: '',
        })
      ).toThrow(DomainException);
      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: '',
        })
      ).toThrow('Prompt cannot be empty');
    });

    it('should throw DomainException when prompt is whitespace', () => {
      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: '   ',
        })
      ).toThrow(DomainException);
      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: '   ',
        })
      ).toThrow('Prompt cannot be empty');
    });

    it('should throw DomainException when instructions exceed max length', () => {
      const longInstructions = 'x'.repeat(100001);

      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: 'Test',
          instructions: longInstructions,
        })
      ).toThrow(DomainException);
      expect(() =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: 'Test',
          instructions: longInstructions,
        })
      ).toThrow('Instructions exceed maximum length of 100000 characters');
    });

    it('should trim prompt whitespace', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: '  test prompt  ',
      });

      expect(request.prompt).toBe('test prompt');
    });

    it('should generate unique IDs for each request', () => {
      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test 1',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test 2',
      });

      expect(request1.id).not.toBe(request2.id);
      expect(request1.id).toBeDefined();
      expect(request2.id).toBeDefined();
    });

    it('should accept different agent types', () => {
      const claudeRequest = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });
      const geminiRequest = LaunchRequest.create({
        agentType: AgentType.GEMINI_CLI,
        prompt: 'Test',
      });
      const syntheticRequest = LaunchRequest.create({
        agentType: AgentType.SYNTHETIC,
        prompt: 'Test',
      });

      expect(claudeRequest.agentType).toBe(AgentType.CLAUDE_CODE);
      expect(geminiRequest.agentType).toBe(AgentType.GEMINI_CLI);
      expect(syntheticRequest.agentType).toBe(AgentType.SYNTHETIC);
    });
  });

  describe('hasInstructions', () => {
    it('should return true when instructions are provided', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        instructions: 'Custom instructions',
      });

      expect(request.hasInstructions()).toBe(true);
    });

    it('should return false when instructions are not provided', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      expect(request.hasInstructions()).toBe(false);
    });

    it('should return false when instructions are empty string', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        instructions: '',
      });

      expect(request.hasInstructions()).toBe(false);
    });

    it('should return false when instructions are whitespace only', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        instructions: '   ',
      });

      expect(request.hasInstructions()).toBe(false);
    });
  });

  describe('toConfiguration', () => {
    it('should convert to AgentConfiguration with instructions', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
        sessionId: 'session-123',
        metadata: { key: 'value' },
      });

      const config = request.toConfiguration();

      expect(config.sessionId).toBe('session-123');
      expect(config.instructions).toBe('Custom instructions');
      expect(config.metadata).toEqual({ key: 'value' });
    });

    it('should merge with existing configuration', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
        sessionId: 'session-123',
        configuration: {
          outputFormat: 'stream-json',
          timeout: 60000,
          allowedTools: ['read', 'write'],
        },
      });

      const config = request.toConfiguration();

      expect(config.sessionId).toBe('session-123');
      expect(config.instructions).toBe('Custom instructions');
      expect(config.outputFormat).toBe('stream-json');
      expect(config.timeout).toBe(60000);
      expect(config.allowedTools).toEqual(['read', 'write']);
    });

    it('should return configuration without instructions when not provided', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        sessionId: 'session-123',
      });

      const config = request.toConfiguration();

      expect(config.sessionId).toBe('session-123');
      expect(config.instructions).toBeUndefined();
    });

    it('should preserve metadata in configuration', () => {
      const metadata = {
        userId: 'user-123',
        projectId: 'project-456',
        tags: ['urgent', 'api-development'],
      };

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        metadata,
      });

      const config = request.toConfiguration();

      expect(config.metadata).toEqual(metadata);
    });
  });

  describe('immutability', () => {
    it('should maintain consistent values across multiple accesses', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
      });

      const id1 = request.id;
      const id2 = request.id;
      const prompt1 = request.prompt;
      const prompt2 = request.prompt;
      const instructions1 = request.instructions;
      const instructions2 = request.instructions;

      expect(id1).toBe(id2);
      expect(prompt1).toBe(prompt2);
      expect(instructions1).toBe(instructions2);
    });

    it('should not allow modification of readonly properties', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
      });

      // TypeScript will prevent this at compile time
      // Testing runtime behavior
      expect(() => {
        (request as any).prompt = 'Modified prompt';
      }).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle very long prompts', () => {
      const longPrompt = 'A'.repeat(10000);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: longPrompt,
      });

      expect(request.prompt).toBe(longPrompt);
    });

    it('should handle maximum allowed instructions length', () => {
      const maxInstructions = 'x'.repeat(100000);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        instructions: maxInstructions,
      });

      expect(request.instructions).toBe(maxInstructions);
      expect(request.instructions?.length).toBe(100000);
    });

    it('should handle empty configuration object', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {},
      });

      const config = request.toConfiguration();
      expect(config).toBeDefined();
    });

    it('should handle empty metadata object', () => {
      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        metadata: {},
      });

      expect(request.metadata).toEqual({});
    });

    it('should handle special characters in prompt', () => {
      const specialPrompt = 'Test with "quotes", \'apostrophes\', and <brackets>';

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: specialPrompt,
      });

      expect(request.prompt).toBe(specialPrompt);
    });

    it('should handle special characters in instructions', () => {
      const specialInstructions = 'Instructions with\nnewlines\tand\ttabs';

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        instructions: specialInstructions,
      });

      expect(request.instructions).toBe(specialInstructions);
    });

    it('should handle unicode characters in prompt', () => {
      const unicodePrompt = '测试提示 🚀 Tëst prömpt';

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: unicodePrompt,
      });

      expect(request.prompt).toBe(unicodePrompt);
    });
  });
});
