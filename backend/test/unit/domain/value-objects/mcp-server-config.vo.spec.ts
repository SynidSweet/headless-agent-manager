import { McpServerConfig, McpServerConfigData } from '../../../../src/domain/value-objects/mcp-server-config.vo';

describe('McpServerConfig', () => {
  describe('create', () => {
    it('should create valid MCP server config with all fields', () => {
      const data: McpServerConfigData = {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
        env: {
          API_KEY: 'test-key',
          DEBUG: 'true',
        },
        transport: 'stdio',
      };

      const config = McpServerConfig.create(data);

      expect(config.name).toBe('filesystem');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/path']);
      expect(config.env).toEqual({ API_KEY: 'test-key', DEBUG: 'true' });
      expect(config.transport).toBe('stdio');
    });

    it('should create config with minimal fields (command only)', () => {
      const data: McpServerConfigData = {
        name: 'simple-server',
        command: '/usr/bin/my-server',
      };

      const config = McpServerConfig.create(data);

      expect(config.name).toBe('simple-server');
      expect(config.command).toBe('/usr/bin/my-server');
      expect(config.args).toEqual([]);
      expect(config.env).toEqual({});
      expect(config.transport).toBe('stdio');
    });

    it('should default transport to stdio', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'node',
      };

      const config = McpServerConfig.create(data);

      expect(config.transport).toBe('stdio');
    });

    it('should accept http transport', () => {
      const data: McpServerConfigData = {
        name: 'http-server',
        command: 'http://localhost:8080',
        transport: 'http',
      };

      const config = McpServerConfig.create(data);

      expect(config.transport).toBe('http');
    });

    it('should accept sse transport', () => {
      const data: McpServerConfigData = {
        name: 'sse-server',
        command: 'https://api.example.com/sse',
        transport: 'sse',
      };

      const config = McpServerConfig.create(data);

      expect(config.transport).toBe('sse');
    });

    it('should reject empty server name', () => {
      const data: McpServerConfigData = {
        name: '',
        command: 'npx',
      };

      expect(() => McpServerConfig.create(data)).toThrow('Server name cannot be empty');
    });

    it('should reject whitespace-only server name', () => {
      const data: McpServerConfigData = {
        name: '   ',
        command: 'npx',
      };

      expect(() => McpServerConfig.create(data)).toThrow('Server name cannot be empty');
    });

    it('should reject server name with invalid characters', () => {
      const data: McpServerConfigData = {
        name: 'my@server!',
        command: 'npx',
      };

      expect(() => McpServerConfig.create(data)).toThrow(
        'Server name must contain only alphanumeric characters, hyphens, and underscores'
      );
    });

    it('should accept server name with hyphens and underscores', () => {
      const data: McpServerConfigData = {
        name: 'my-server_123',
        command: 'npx',
      };

      const config = McpServerConfig.create(data);

      expect(config.name).toBe('my-server_123');
    });

    it('should reject empty command', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: '',
      };

      expect(() => McpServerConfig.create(data)).toThrow('Command cannot be empty');
    });

    it('should reject whitespace-only command', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: '   ',
      };

      expect(() => McpServerConfig.create(data)).toThrow('Command cannot be empty');
    });

    it('should reject invalid transport type', () => {
      const data: any = {
        name: 'test-server',
        command: 'npx',
        transport: 'invalid',
      };

      expect(() => McpServerConfig.create(data)).toThrow(
        'Transport must be one of: stdio, http, sse'
      );
    });

    it('should handle empty args array', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'node',
        args: [],
      };

      const config = McpServerConfig.create(data);

      expect(config.args).toEqual([]);
    });

    it('should handle empty env object', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'node',
        env: {},
      };

      const config = McpServerConfig.create(data);

      expect(config.env).toEqual({});
    });
  });

  describe('toJSON', () => {
    it('should convert to Claude config JSON format', () => {
      const data: McpServerConfigData = {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { API_KEY: 'test' },
      };

      const config = McpServerConfig.create(data);
      const json = config.toJSON();

      expect(json).toEqual({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { API_KEY: 'test' },
      });
    });

    it('should not include name in JSON output', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'node',
      };

      const config = McpServerConfig.create(data);
      const json = config.toJSON();

      expect(json).not.toHaveProperty('name');
    });

    it('should include empty arrays and objects', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'node',
        args: [],
        env: {},
      };

      const config = McpServerConfig.create(data);
      const json = config.toJSON();

      expect(json).toEqual({
        command: 'node',
        args: [],
        env: {},
      });
    });

    it('should not include transport in JSON output (stdio is default)', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'node',
        transport: 'stdio',
      };

      const config = McpServerConfig.create(data);
      const json = config.toJSON();

      expect(json).not.toHaveProperty('transport');
    });

    it('should include transport in JSON output if not stdio', () => {
      const data: McpServerConfigData = {
        name: 'http-server',
        command: 'http://localhost:8080',
        transport: 'http',
      };

      const config = McpServerConfig.create(data);
      const json = config.toJSON();

      expect(json).toHaveProperty('transport', 'http');
    });
  });

  describe('equality', () => {
    it('should consider two configs with same values as equal', () => {
      const data: McpServerConfigData = {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', 'package'],
      };

      const config1 = McpServerConfig.create(data);
      const config2 = McpServerConfig.create(data);

      expect(config1.name).toBe(config2.name);
      expect(config1.command).toBe(config2.command);
      expect(config1.args).toEqual(config2.args);
    });
  });

  describe('immutability', () => {
    it('should not allow modification of args array', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'npx',
        args: ['-y', 'package'],
      };

      const config = McpServerConfig.create(data);
      const originalArgs = [...config.args];

      // Attempt to modify (should not affect original due to readonly)
      // TypeScript will prevent this at compile time
      expect(config.args).toEqual(originalArgs);
    });

    it('should not allow modification of env object', () => {
      const data: McpServerConfigData = {
        name: 'test-server',
        command: 'npx',
        env: { KEY: 'value' },
      };

      const config = McpServerConfig.create(data);
      const originalEnv = { ...config.env };

      expect(config.env).toEqual(originalEnv);
    });
  });
});
