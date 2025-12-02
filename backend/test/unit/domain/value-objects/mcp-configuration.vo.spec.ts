import {
  McpConfiguration,
  McpConfigurationData,
} from '../../../../src/domain/value-objects/mcp-configuration.vo';
import { McpServerConfigData } from '../../../../src/domain/value-objects/mcp-server-config.vo';

describe('McpConfiguration', () => {
  const validServer1: McpServerConfigData = {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
  };

  const validServer2: McpServerConfigData = {
    name: 'brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: {
      BRAVE_API_KEY: 'test-key',
    },
  };

  describe('create', () => {
    it('should create configuration with single server', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);

      expect(config.servers.size).toBe(1);
      expect(config.servers.has('filesystem')).toBe(true);
      expect(config.strict).toBe(false);
    });

    it('should create configuration with multiple servers', () => {
      const data: McpConfigurationData = {
        servers: [validServer1, validServer2],
      };

      const config = McpConfiguration.create(data);

      expect(config.servers.size).toBe(2);
      expect(config.servers.has('filesystem')).toBe(true);
      expect(config.servers.has('brave-search')).toBe(true);
    });

    it('should create configuration with strict mode enabled', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
        strict: true,
      };

      const config = McpConfiguration.create(data);

      expect(config.strict).toBe(true);
    });

    it('should default strict to false', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);

      expect(config.strict).toBe(false);
    });

    it('should handle empty servers list', () => {
      const data: McpConfigurationData = {
        servers: [],
      };

      const config = McpConfiguration.create(data);

      expect(config.servers.size).toBe(0);
    });

    it('should reject duplicate server names', () => {
      const duplicate: McpServerConfigData = {
        name: 'filesystem',
        command: 'different-command',
      };

      const data: McpConfigurationData = {
        servers: [validServer1, duplicate],
      };

      expect(() => McpConfiguration.create(data)).toThrow(
        'Duplicate MCP server name: filesystem'
      );
    });

    it('should reject servers with invalid configuration', () => {
      const invalidServer: McpServerConfigData = {
        name: '',
        command: 'npx',
      };

      const data: McpConfigurationData = {
        servers: [invalidServer],
      };

      expect(() => McpConfiguration.create(data)).toThrow('Server name cannot be empty');
    });

    it('should create servers with different transports', () => {
      const stdioServer: McpServerConfigData = {
        name: 'stdio-server',
        command: 'npx',
        transport: 'stdio',
      };

      const httpServer: McpServerConfigData = {
        name: 'http-server',
        command: 'http://localhost:8080',
        transport: 'http',
      };

      const data: McpConfigurationData = {
        servers: [stdioServer, httpServer],
      };

      const config = McpConfiguration.create(data);

      expect(config.servers.size).toBe(2);
      expect(config.servers.get('stdio-server')?.transport).toBe('stdio');
      expect(config.servers.get('http-server')?.transport).toBe('http');
    });
  });

  describe('toClaudeConfigJSON', () => {
    it('should convert to Claude config JSON string', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('mcpServers');
      expect(parsed.mcpServers).toHaveProperty('filesystem');
    });

    it('should generate valid JSON for multiple servers', () => {
      const data: McpConfigurationData = {
        servers: [validServer1, validServer2],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();
      const parsed = JSON.parse(json);

      expect(Object.keys(parsed.mcpServers)).toHaveLength(2);
      expect(parsed.mcpServers.filesystem).toBeDefined();
      expect(parsed.mcpServers['brave-search']).toBeDefined();
    });

    it('should include server command in JSON', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();
      const parsed = JSON.parse(json);

      expect(parsed.mcpServers.filesystem.command).toBe('npx');
    });

    it('should include server args in JSON', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();
      const parsed = JSON.parse(json);

      expect(parsed.mcpServers.filesystem.args).toEqual([
        '-y',
        '@modelcontextprotocol/server-filesystem',
        '/path',
      ]);
    });

    it('should include server env in JSON', () => {
      const data: McpConfigurationData = {
        servers: [validServer2],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();
      const parsed = JSON.parse(json);

      expect(parsed.mcpServers['brave-search'].env).toEqual({
        BRAVE_API_KEY: 'test-key',
      });
    });

    it('should handle empty servers list', () => {
      const data: McpConfigurationData = {
        servers: [],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();
      const parsed = JSON.parse(json);

      expect(parsed.mcpServers).toEqual({});
    });

    it('should generate valid JSON string for --mcp-config flag', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const json = config.toClaudeConfigJSON();

      // Should be parseable JSON
      expect(() => JSON.parse(json)).not.toThrow();

      // Should have correct structure
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('mcpServers');
      expect(typeof parsed.mcpServers).toBe('object');
    });
  });

  describe('getServerNames', () => {
    it('should return list of server names', () => {
      const data: McpConfigurationData = {
        servers: [validServer1, validServer2],
      };

      const config = McpConfiguration.create(data);
      const names = config.getServerNames();

      expect(names).toHaveLength(2);
      expect(names).toContain('filesystem');
      expect(names).toContain('brave-search');
    });

    it('should return empty array for no servers', () => {
      const data: McpConfigurationData = {
        servers: [],
      };

      const config = McpConfiguration.create(data);
      const names = config.getServerNames();

      expect(names).toEqual([]);
    });

    it('should return array in consistent order', () => {
      const data: McpConfigurationData = {
        servers: [validServer1, validServer2],
      };

      const config = McpConfiguration.create(data);
      const names1 = config.getServerNames();
      const names2 = config.getServerNames();

      expect(names1).toEqual(names2);
    });
  });

  describe('hasServer', () => {
    it('should return true if server exists', () => {
      const data: McpConfigurationData = {
        servers: [validServer1, validServer2],
      };

      const config = McpConfiguration.create(data);

      expect(config.hasServer('filesystem')).toBe(true);
      expect(config.hasServer('brave-search')).toBe(true);
    });

    it('should return false if server does not exist', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);

      expect(config.hasServer('nonexistent')).toBe(false);
    });
  });

  describe('getServer', () => {
    it('should return server config if exists', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const server = config.getServer('filesystem');

      expect(server).toBeDefined();
      expect(server?.name).toBe('filesystem');
      expect(server?.command).toBe('npx');
    });

    it('should return undefined if server does not exist', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const server = config.getServer('nonexistent');

      expect(server).toBeUndefined();
    });
  });

  describe('immutability', () => {
    it('should not allow modification of servers map', () => {
      const data: McpConfigurationData = {
        servers: [validServer1],
      };

      const config = McpConfiguration.create(data);
      const originalSize = config.servers.size;

      // TypeScript will prevent this at compile time via ReadonlyMap
      expect(config.servers.size).toBe(originalSize);
    });
  });

  describe('edge cases', () => {
    it('should handle server with only required fields', () => {
      const minimalServer: McpServerConfigData = {
        name: 'minimal',
        command: 'echo',
      };

      const data: McpConfigurationData = {
        servers: [minimalServer],
      };

      const config = McpConfiguration.create(data);
      const json = JSON.parse(config.toClaudeConfigJSON());

      expect(json.mcpServers.minimal).toBeDefined();
      expect(json.mcpServers.minimal.command).toBe('echo');
    });

    it('should handle server with all optional fields', () => {
      const fullServer: McpServerConfigData = {
        name: 'full-server',
        command: 'npx',
        args: ['arg1', 'arg2'],
        env: { KEY1: 'value1', KEY2: 'value2' },
        transport: 'http',
      };

      const data: McpConfigurationData = {
        servers: [fullServer],
      };

      const config = McpConfiguration.create(data);
      const json = JSON.parse(config.toClaudeConfigJSON());

      expect(json.mcpServers['full-server'].args).toEqual(['arg1', 'arg2']);
      expect(json.mcpServers['full-server'].env).toEqual({
        KEY1: 'value1',
        KEY2: 'value2',
      });
    });
  });
});
