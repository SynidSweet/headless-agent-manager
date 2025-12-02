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

    it('should allow workingDirectory in configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        workingDirectory: '/home/user/projects/my-app',
      };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration.workingDirectory).toBe('/home/user/projects/my-app');
    });

    it('should allow relative workingDirectory in configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        workingDirectory: './my-project',
      };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration.workingDirectory).toBe('./my-project');
    });

    it('should allow conversationName in configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        conversationName: 'My Important Task',
      };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration.conversationName).toBe('My Important Task');
    });

    it('should allow model in configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        model: 'claude-sonnet-4-5-20250929',
      };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should allow alternative model in configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        model: 'claude-opus-4-20250514',
      };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
      expect(dto.configuration.model).toBe('claude-opus-4-20250514');
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

  describe('conversation name validation', () => {
    it('should pass validation with valid conversation name', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = { conversationName: 'My Task' };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
    });

    it('should throw error when conversation name is empty string after trim', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = { conversationName: '   ' };

      // Act & Assert
      expect(() => dto.validate()).toThrow('Conversation name cannot be empty');
    });

    it('should throw error when conversation name exceeds 100 characters', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = { conversationName: 'a'.repeat(101) };

      // Act & Assert
      expect(() => dto.validate()).toThrow('Conversation name must be 100 characters or less');
    });

    it('should accept conversation name at 100 character limit', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = { conversationName: 'a'.repeat(100) };

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
    });

    it('should pass validation without conversation name', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {};

      // Act & Assert
      expect(() => dto.validate()).not.toThrow();
    });
  });

  describe('toAgentConfiguration', () => {
    it('should convert DTO configuration to domain configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        sessionId: 'test-session',
        outputFormat: 'stream-json',
        customArgs: ['--yolo'],
        timeout: 60000,
        allowedTools: ['read', 'write'],
        disallowedTools: ['web-search'],
      };

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.sessionId).toBe('test-session');
      expect(config.outputFormat).toBe('stream-json');
      expect(config.customArgs).toEqual(['--yolo']);
      expect(config.timeout).toBe(60000);
      expect(config.allowedTools).toEqual(['read', 'write']);
      expect(config.disallowedTools).toEqual(['web-search']);
    });

    it('should include workingDirectory in converted configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        workingDirectory: '/home/user/projects/my-app',
      };

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.workingDirectory).toBe('/home/user/projects/my-app');
    });

    it('should handle relative workingDirectory in converted configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        workingDirectory: './my-project',
      };

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.workingDirectory).toBe('./my-project');
    });

    it('should include conversationName in converted configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        conversationName: 'My Important Task',
      };

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.conversationName).toBe('My Important Task');
    });

    it('should not include conversationName when not provided', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {};

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.conversationName).toBeUndefined();
    });

    it('should include model in converted configuration', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        model: 'claude-sonnet-4-5-20250929',
      };

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should not include model when not provided', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {};

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config.model).toBeUndefined();
    });

    it('should return empty configuration when no configuration provided', () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';

      // Act
      const config = dto.toAgentConfiguration();

      // Assert
      expect(config).toEqual({});
    });
  });
});
