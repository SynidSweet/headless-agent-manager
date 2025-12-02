/**
 * MCP Configuration Integration Tests
 *
 * Tests the complete flow of MCP configuration from API request through to CLI execution.
 *
 * Flow tested:
 * 1. HTTP POST → LaunchAgentDto validation
 * 2. DTO → Domain (McpConfiguration value objects)
 * 3. Domain → Session creation
 * 4. Session → Adapter extraction
 * 5. Adapter → Python proxy HTTP request
 *
 * These are REAL integration tests:
 * - Full NestJS app initialization
 * - Actual DTO validation
 * - Real domain object creation
 * - Mocked HTTP for adapter (since Python proxy may not be running)
 * - Tests actual data flow and transformations
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AgentType } from '../../src/domain/value-objects/agent-type.vo';
import { DomainExceptionFilter } from '../../src/presentation/filters/domain-exception.filter';

// Mock fetch globally for adapter tests
global.fetch = jest.fn();

describe('MCP Configuration (Integration)', () => {
  let app: INestApplication;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Configure app like main.ts does
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    app.setGlobalPrefix('api');

    await app.init();

    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockFetch.mockClear();

    // Default mock response for all tests
    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      },
      headers: {
        get: (key: string) => (key === 'X-Agent-Id' ? 'test-agent-id' : null),
      },
    } as any;

    mockFetch.mockResolvedValue(mockResponse);
  });

  describe('Single MCP Server', () => {
    it('should launch agent with filesystem MCP server', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'List files using MCP',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
              },
            ],
          },
        },
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Agent created successfully
      expect(response.body).toHaveProperty('agentId');
      expect(response.body).toHaveProperty('status');

      // Assert: Adapter called Python proxy with MCP config
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agent/stream'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        })
      );

      // Assert: Request body contains MCP config
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(fetchCallBody).toHaveProperty('mcp_config');
      expect(typeof fetchCallBody.mcp_config).toBe('string');

      // Assert: MCP config is valid JSON
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);
      expect(mcpJson).toHaveProperty('mcpServers');
      expect(mcpJson.mcpServers).toHaveProperty('filesystem');
      expect(mcpJson.mcpServers.filesystem).toMatchObject({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
      });
    });

    it('should launch agent with MCP server environment variables', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Search using Brave',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'brave-search',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-brave-search'],
                env: {
                  BRAVE_API_KEY: 'test-api-key-12345',
                  DEBUG: 'true',
                },
              },
            ],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: MCP config includes environment variables
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);

      expect(mcpJson.mcpServers['brave-search'].env).toEqual({
        BRAVE_API_KEY: 'test-api-key-12345',
        DEBUG: 'true',
      });
    });
  });

  describe('Multiple MCP Servers', () => {
    it('should launch agent with multiple MCP servers', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Use filesystem and search',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem'],
              },
              {
                name: 'brave-search',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-brave-search'],
                env: {
                  BRAVE_API_KEY: 'test-key',
                },
              },
              {
                name: 'github',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
                env: {
                  GITHUB_TOKEN: 'gh_token',
                },
              },
            ],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: All three servers in MCP config
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);

      expect(Object.keys(mcpJson.mcpServers)).toHaveLength(3);
      expect(mcpJson.mcpServers).toHaveProperty('filesystem');
      expect(mcpJson.mcpServers).toHaveProperty('brave-search');
      expect(mcpJson.mcpServers).toHaveProperty('github');
    });

    it('should preserve all server configurations in multi-server setup', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Multi-tool test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'server-a',
                command: 'cmd-a',
                args: ['arg1', 'arg2'],
                env: { KEY_A: 'value-a' },
              },
              {
                name: 'server-b',
                command: 'cmd-b',
                args: ['arg3'],
                env: { KEY_B: 'value-b' },
              },
            ],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Each server preserves its unique configuration
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);

      expect(mcpJson.mcpServers['server-a']).toMatchObject({
        command: 'cmd-a',
        args: ['arg1', 'arg2'],
        env: { KEY_A: 'value-a' },
      });

      expect(mcpJson.mcpServers['server-b']).toMatchObject({
        command: 'cmd-b',
        args: ['arg3'],
        env: { KEY_B: 'value-b' },
      });
    });
  });

  describe('MCP Strict Mode', () => {
    it('should enable strict mode when specified', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Isolated MCP test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem'],
              },
            ],
            strict: true,
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Strict flag is set
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      expect(fetchCallBody.mcp_strict).toBe(true);
    });

    it('should not include strict flag when false', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Non-strict test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
              },
            ],
            strict: false,
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: No strict flag in request
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      expect(fetchCallBody.mcp_strict).toBeUndefined();
    });

    it('should not include strict flag when omitted', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Default strict test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
              },
            ],
            // strict omitted (defaults to false)
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: No strict flag in request
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      expect(fetchCallBody.mcp_strict).toBeUndefined();
    });
  });

  describe('Combined Configuration', () => {
    it('should support MCP alongside other configuration options', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Combined config test',
        configuration: {
          workingDirectory: '/home/user/project',
          model: 'claude-sonnet-4-5-20250929',
          sessionId: 'session-123',
          conversationName: 'Test Conversation',
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem'],
              },
            ],
            strict: true,
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: All configuration options passed through
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);

      expect(fetchCallBody.working_directory).toBe('/home/user/project');
      expect(fetchCallBody.model).toBe('claude-sonnet-4-5-20250929');
      expect(fetchCallBody.session_id).toBe('session-123');
      expect(fetchCallBody.mcp_config).toBeDefined();
      expect(fetchCallBody.mcp_strict).toBe(true);
    });

    it('should handle MCP with minimal additional config', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Minimal config test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'simple-server',
                command: 'echo',
              },
            ],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Only prompt and MCP config in request
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);

      expect(fetchCallBody.prompt).toBe('Minimal config test');
      expect(fetchCallBody.mcp_config).toBeDefined();
      expect(fetchCallBody.working_directory).toBeUndefined();
      expect(fetchCallBody.model).toBeUndefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should launch agent without MCP configuration', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'No MCP test',
        configuration: {
          workingDirectory: '/path',
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: No MCP fields in request
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);

      expect(fetchCallBody.mcp_config).toBeUndefined();
      expect(fetchCallBody.mcp_strict).toBeUndefined();
      expect(fetchCallBody.working_directory).toBe('/path');
    });

    it('should launch agent with empty configuration', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Empty config test',
        configuration: {},
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Only prompt in request
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);

      expect(fetchCallBody.prompt).toBe('Empty config test');
      expect(fetchCallBody.mcp_config).toBeUndefined();
    });

    it('should launch agent without configuration object', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'No config object test',
        // configuration omitted entirely
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Only prompt in request
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);

      expect(fetchCallBody.prompt).toBe('No config object test');
      expect(fetchCallBody.mcp_config).toBeUndefined();
    });
  });

  describe('Validation and Error Handling', () => {
    it('should reject invalid MCP server name', async () => {
      // Arrange: Server name with invalid characters
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Invalid name test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'invalid@name!',
                command: 'npx',
              },
            ],
          },
        },
      };

      // Act & Assert: Should fail validation
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(400);
    });

    it('should reject empty MCP server name', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Empty name test',
        configuration: {
          mcp: {
            servers: [
              {
                name: '',
                command: 'npx',
              },
            ],
          },
        },
      };

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(400);
    });

    it('should reject empty MCP command', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Empty command test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'test-server',
                command: '',
              },
            ],
          },
        },
      };

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(400);
    });

    it('should reject duplicate MCP server names', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Duplicate name test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'filesystem',
                command: 'npx',
              },
              {
                name: 'filesystem', // Duplicate
                command: 'different-command',
              },
            ],
          },
        },
      };

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(400);
    });

    it('should reject invalid transport type', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Invalid transport test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'test-server',
                command: 'npx',
                transport: 'invalid-transport',
              },
            ],
          },
        },
      };

      // Act & Assert
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(400);
    });
  });

  describe('Edge Cases', () => {
    it('should handle MCP server with empty args array', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Empty args test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'test-server',
                command: 'node',
                args: [],
              },
            ],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Empty args preserved
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);

      expect(mcpJson.mcpServers['test-server'].args).toEqual([]);
    });

    it('should handle MCP server with empty env object', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Empty env test',
        configuration: {
          mcp: {
            servers: [
              {
                name: 'test-server',
                command: 'node',
                env: {},
              },
            ],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Empty env preserved
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);

      expect(mcpJson.mcpServers['test-server'].env).toEqual({});
    });

    it('should handle MCP with empty servers array', async () => {
      // Arrange
      const requestBody = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Empty servers test',
        configuration: {
          mcp: {
            servers: [],
          },
        },
      };

      // Act
      await request(app.getHttpServer())
        .post('/api/agents')
        .send(requestBody)
        .expect(201);

      // Assert: Empty mcpServers object
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0]?.[1]?.body as string);
      const mcpJson = JSON.parse(fetchCallBody.mcp_config);

      expect(mcpJson.mcpServers).toEqual({});
    });
  });
});
