import { Session, AgentConfiguration } from '@domain/value-objects/session.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('Session Value Object', () => {
  describe('create', () => {
    it('should create session with valid prompt and configuration', () => {
      const prompt = 'Create a todo app';
      const config: AgentConfiguration = {
        outputFormat: 'stream-json',
      };

      const session = Session.create(prompt, config);

      expect(session.prompt).toBe(prompt);
      expect(session.configuration).toEqual(config);
      expect(session.id).toBeUndefined();
    });

    it('should create session with minimal configuration', () => {
      const session = Session.create('test prompt', {});

      expect(session.prompt).toBe('test prompt');
      expect(session.configuration).toEqual({});
    });

    it('should create session with session ID for resume', () => {
      const sessionId = 'session-123';
      const config: AgentConfiguration = {
        sessionId,
        outputFormat: 'stream-json',
      };

      const session = Session.create('test', config);

      expect(session.id).toBe(sessionId);
      expect(session.configuration.sessionId).toBe(sessionId);
    });

    it('should throw DomainException when prompt is empty', () => {
      expect(() => Session.create('', {})).toThrow(DomainException);
      expect(() => Session.create('', {})).toThrow('Session prompt cannot be empty');
    });

    it('should throw DomainException when prompt is whitespace', () => {
      expect(() => Session.create('   ', {})).toThrow(DomainException);
      expect(() => Session.create('   ', {})).toThrow('Session prompt cannot be empty');
    });

    it('should trim prompt whitespace', () => {
      const session = Session.create('  test prompt  ', {});

      expect(session.prompt).toBe('test prompt');
    });
  });

  describe('configuration options', () => {
    it('should support outputFormat configuration', () => {
      const config: AgentConfiguration = {
        outputFormat: 'stream-json',
      };

      const session = Session.create('test', config);

      expect(session.configuration.outputFormat).toBe('stream-json');
    });

    it('should support customArgs configuration', () => {
      const config: AgentConfiguration = {
        customArgs: ['--yolo', '--verbose'],
      };

      const session = Session.create('test', config);

      expect(session.configuration.customArgs).toEqual(['--yolo', '--verbose']);
    });

    it('should support timeout configuration', () => {
      const config: AgentConfiguration = {
        timeout: 60000,
      };

      const session = Session.create('test', config);

      expect(session.configuration.timeout).toBe(60000);
    });

    it('should support allowedTools configuration', () => {
      const config: AgentConfiguration = {
        allowedTools: ['read', 'write', 'bash'],
      };

      const session = Session.create('test', config);

      expect(session.configuration.allowedTools).toEqual(['read', 'write', 'bash']);
    });

    it('should support disallowedTools configuration', () => {
      const config: AgentConfiguration = {
        disallowedTools: ['web-search', 'web-fetch'],
      };

      const session = Session.create('test', config);

      expect(session.configuration.disallowedTools).toEqual(['web-search', 'web-fetch']);
    });

    it('should support workingDirectory configuration', () => {
      const config: AgentConfiguration = {
        workingDirectory: '/home/user/projects/my-app',
      };

      const session = Session.create('test', config);

      expect(session.configuration.workingDirectory).toBe('/home/user/projects/my-app');
    });

    it('should support relative workingDirectory configuration', () => {
      const config: AgentConfiguration = {
        workingDirectory: './my-project',
      };

      const session = Session.create('test', config);

      expect(session.configuration.workingDirectory).toBe('./my-project');
    });

    it('should support conversationName configuration', () => {
      const config: AgentConfiguration = {
        conversationName: 'My Important Task',
      };

      const session = Session.create('test', config);

      expect(session.configuration.conversationName).toBe('My Important Task');
    });

    it('should support model configuration', () => {
      const config: AgentConfiguration = {
        model: 'claude-sonnet-4-5-20250929',
      };

      const session = Session.create('test', config);

      expect(session.configuration.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('should support alternative model configuration', () => {
      const config: AgentConfiguration = {
        model: 'claude-opus-4-20250514',
      };

      const session = Session.create('test', config);

      expect(session.configuration.model).toBe('claude-opus-4-20250514');
    });

    it('should support multiple configuration options together', () => {
      const config: AgentConfiguration = {
        sessionId: 'resume-123',
        outputFormat: 'stream-json',
        customArgs: ['--yolo'],
        timeout: 120000,
        allowedTools: ['read', 'write'],
        workingDirectory: '/tmp/test-project',
        model: 'claude-sonnet-4-5-20250929',
      };

      const session = Session.create('test', config);

      expect(session.configuration).toEqual(config);
    });
  });

  describe('conversation name validation', () => {
    it('should create session with conversation name', () => {
      const session = Session.create('test prompt', {
        conversationName: 'My Important Task',
      });

      expect(session.configuration.conversationName).toBe('My Important Task');
    });

    it('should create session without conversation name', () => {
      const session = Session.create('test prompt', {});

      expect(session.configuration.conversationName).toBeUndefined();
    });

    it('should trim conversation name whitespace', () => {
      const session = Session.create('test prompt', {
        conversationName: '  Spaced Name  ',
      });

      expect(session.configuration.conversationName).toBe('Spaced Name');
    });

    it('should throw DomainException when conversation name is empty after trimming', () => {
      expect(() =>
        Session.create('test prompt', {
          conversationName: '   ',
        })
      ).toThrow(DomainException);
      expect(() =>
        Session.create('test prompt', {
          conversationName: '   ',
        })
      ).toThrow('Conversation name cannot be empty');
    });

    it('should throw DomainException when conversation name exceeds 100 characters', () => {
      const longName = 'a'.repeat(101);

      expect(() =>
        Session.create('test prompt', {
          conversationName: longName,
        })
      ).toThrow(DomainException);
      expect(() =>
        Session.create('test prompt', {
          conversationName: longName,
        })
      ).toThrow('Conversation name must be 100 characters or less');
    });

    it('should accept conversation name at 100 character limit', () => {
      const maxName = 'a'.repeat(100);

      const session = Session.create('test prompt', {
        conversationName: maxName,
      });

      expect(session.configuration.conversationName).toBe(maxName);
      expect(session.configuration.conversationName?.length).toBe(100);
    });

    it('should accept conversation name at 99 characters', () => {
      const name = 'a'.repeat(99);

      const session = Session.create('test prompt', {
        conversationName: name,
      });

      expect(session.configuration.conversationName).toBe(name);
    });

    it('should trim long conversation name before checking length', () => {
      // 98 'a' + 2 spaces = 100, but after trim it's 98 which is valid
      const name = ' ' + 'a'.repeat(98) + ' ';

      const session = Session.create('test prompt', {
        conversationName: name,
      });

      expect(session.configuration.conversationName).toBe('a'.repeat(98));
    });
  });

  describe('session ID', () => {
    it('should extract session ID from configuration', () => {
      const config: AgentConfiguration = {
        sessionId: 'my-session-id',
      };

      const session = Session.create('test', config);

      expect(session.id).toBe('my-session-id');
    });

    it('should return undefined when no session ID provided', () => {
      const session = Session.create('test', {});

      expect(session.id).toBeUndefined();
    });
  });

  describe('equals', () => {
    it('should return true for sessions with same prompt and configuration', () => {
      const config: AgentConfiguration = {
        outputFormat: 'stream-json',
        timeout: 60000,
      };

      const session1 = Session.create('test prompt', config);
      const session2 = Session.create('test prompt', config);

      expect(session1.equals(session2)).toBe(true);
    });

    it('should return false for sessions with different prompts', () => {
      const config: AgentConfiguration = {};

      const session1 = Session.create('prompt 1', config);
      const session2 = Session.create('prompt 2', config);

      expect(session1.equals(session2)).toBe(false);
    });

    it('should return false for sessions with different configurations', () => {
      const config1: AgentConfiguration = { timeout: 60000 };
      const config2: AgentConfiguration = { timeout: 120000 };

      const session1 = Session.create('test', config1);
      const session2 = Session.create('test', config2);

      expect(session1.equals(session2)).toBe(false);
    });

    it('should return true when comparing same instance', () => {
      const session = Session.create('test', {});

      expect(session.equals(session)).toBe(true);
    });
  });

  describe('immutability', () => {
    it('should maintain consistent prompt across multiple accesses', () => {
      const session = Session.create('original prompt', {});
      const prompt1 = session.prompt;
      const prompt2 = session.prompt;

      expect(prompt1).toBe('original prompt');
      expect(prompt2).toBe('original prompt');
      expect(prompt1).toBe(prompt2);
    });

    it('should maintain consistent configuration across multiple accesses', () => {
      const config: AgentConfiguration = { timeout: 60000 };
      const session = Session.create('test', config);

      const config1 = session.configuration;
      const config2 = session.configuration;

      expect(config1).toEqual(config);
      expect(config2).toEqual(config);
      expect(config1).toBe(config2);
    });

    it('should maintain original values after creation', () => {
      const config: AgentConfiguration = {
        outputFormat: 'stream-json',
        timeout: 60000,
      };

      const session = Session.create('test prompt', config);

      expect(session.prompt).toBe('test prompt');
      expect(session.configuration).toEqual(config);
    });
  });

  describe('MCP configuration support', () => {
    it('should create session with MCP configuration', () => {
      const { McpConfiguration } = require('@domain/value-objects/mcp-configuration.vo');

      const mcpConfig = McpConfiguration.create({
        servers: [
          {
            name: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
          },
        ],
      });

      const config: AgentConfiguration = {
        mcp: mcpConfig,
      };

      const session = Session.create('test prompt', config);

      expect(session.configuration.mcp).toBeDefined();
      expect(session.configuration.mcp?.servers.size).toBe(1);
      expect(session.configuration.mcp?.hasServer('filesystem')).toBe(true);
    });

    it('should create session without MCP configuration', () => {
      const config: AgentConfiguration = {
        outputFormat: 'stream-json',
      };

      const session = Session.create('test prompt', config);

      expect(session.configuration.mcp).toBeUndefined();
    });

    it('should include MCP in session configuration', () => {
      const { McpConfiguration } = require('@domain/value-objects/mcp-configuration.vo');

      const mcpConfig = McpConfiguration.create({
        servers: [
          {
            name: 'brave-search',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            env: {
              BRAVE_API_KEY: 'test-key',
            },
          },
        ],
        strict: true,
      });

      const config: AgentConfiguration = {
        mcp: mcpConfig,
        workingDirectory: '/path/to/project',
      };

      const session = Session.create('test prompt', config);

      expect(session.configuration.mcp).toBe(mcpConfig);
      expect(session.configuration.mcp?.strict).toBe(true);
      expect(session.configuration.workingDirectory).toBe('/path/to/project');
    });
  });
});
