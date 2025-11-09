import { LaunchAgentDto } from '@application/dto/launch-agent.dto';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('LaunchAgentDto', () => {
  describe('validate', () => {
    it('should pass validation with valid data', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
    });

    it('should throw error when type is missing', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).toThrow('Agent type is required');
    });

    it('should throw error when type is empty string', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = '   ';
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).toThrow('Agent type is required');
    });

    it('should throw error when prompt is missing', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';

      // Act & Assert
      expect(() => dto.validate()).toThrow('Prompt is required');
    });

    it('should throw error when prompt is empty string', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = '   ';

      // Act & Assert
      expect(() => dto.validate()).toThrow('Prompt is required');
    });

    it('should throw error when type is invalid', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'invalid-type';
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).toThrow('Invalid agent type: invalid-type');
    });

    it('should accept claude-code as valid type', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
    });

    it('should accept gemini-cli as valid type', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'gemini-cli';
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
    });
  });

  describe('toAgentType', () => {
    it('should convert claude-code string to AgentType', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';

      // Act
      const agentType = dto.toAgentType();

      // Assert
      expect(agentType).toBe(AgentType.CLAUDE_CODE);
      expect(agentType).toBe('claude-code');
    });

    it('should convert gemini-cli string to AgentType', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'gemini-cli';
      dto.prompt = 'Test prompt';

      // Act
      const agentType = dto.toAgentType();

      // Assert
      expect(agentType).toBe(AgentType.GEMINI_CLI);
      expect(agentType).toBe('gemini-cli');
    });
  });

  describe('configuration', () => {
    it('should allow optional configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        outputFormat: 'stream-json',
        sessionId: 'test-session',
        customArgs: ['--yolo'],
        metadata: { foo: 'bar' },
      };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration.outputFormat).toBe('stream-json');
      expect(dto.configuration.sessionId).toBe('test-session');
      expect(dto.configuration.customArgs).toEqual(['--yolo']);
      expect(dto.configuration.metadata).toEqual({ foo: 'bar' });
    });

    it('should work without configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration).toBeUndefined();
    });
  });
});
