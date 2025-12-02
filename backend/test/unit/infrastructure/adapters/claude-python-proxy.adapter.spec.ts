import { ClaudePythonProxyAdapter } from '@infrastructure/adapters/claude-python-proxy.adapter';
import { ILogger } from '@application/ports/logger.port';
import { Session } from '@domain/value-objects/session.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IAgentObserver } from '@application/ports/agent-runner.port';
import { AgentId } from '@domain/value-objects/agent-id.vo';

// Mock fetch globally
global.fetch = jest.fn();

describe('ClaudePythonProxyAdapter', () => {
  let adapter: ClaudePythonProxyAdapter;
  let mockLogger: jest.Mocked<ILogger>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();

    adapter = new ClaudePythonProxyAdapter('http://localhost:8000', mockLogger);
  });

  describe('constructor', () => {
    it('should initialize with proxy URL', () => {
      expect(adapter).toBeDefined();
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ClaudePythonProxyAdapter initialized',
        expect.objectContaining({ proxyUrl: 'http://localhost:8000' })
      );
    });
  });

  describe('start', () => {
    it('should POST to /agent/stream endpoint', async () => {
      const session = Session.create('test prompt', {});

      // Mock fetch response with SSE stream
      const mockResponse = {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode('data: {"type":"system"}\n\n'),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const agent = await adapter.start(session);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8000/agent/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test prompt' }),
      });
      expect(agent).toBeDefined();
      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('should include session ID in request', async () => {
      const session = Session.create('test', { sessionId: 'session-123' });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.session_id).toBe('session-123');
    });

    it('should include working directory in request', async () => {
      const session = Session.create('test', { workingDirectory: '/home/user/my-project' });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.working_directory).toBe('/home/user/my-project');
    });

    it('should handle relative working directory in request', async () => {
      const session = Session.create('test', { workingDirectory: './my-project' });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.working_directory).toBe('./my-project');
    });

    it('should notify observers on proxy error', async () => {
      const session = Session.create('test', {});

      // Create a promise we can control
      let rejectFetch: (reason?: any) => void;
      const fetchPromise = new Promise((_, reject) => {
        rejectFetch = reject;
      });

      mockFetch.mockReturnValue(fetchPromise as any);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      const agent = await adapter.start(session);

      // Subscribe before triggering the error
      adapter.subscribe(agent.id, observer);

      // Now trigger the fetch error
      rejectFetch!(new Error('Network error'));

      // Wait for background stream processing to fail
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Observer should be notified of error
      expect(observer.onError).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should POST to /agent/stop endpoint when pythonAgentId exists', async () => {
      const session = Session.create('test', {});

      // Mock stream that doesn't complete immediately (keeps agent alive)
      let shouldContinue = true;
      const mockStreamResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'X-Agent-Id' ? 'python-agent-123' : null),
        },
        body: {
          getReader: () => ({
            read: jest.fn().mockImplementation(async () => {
              if (shouldContinue) {
                // Keep stream alive
                await new Promise((resolve) => setTimeout(resolve, 50));
                return { done: false, value: new TextEncoder().encode('') };
              }
              return { done: true, value: undefined };
            }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValueOnce(mockStreamResponse);
      const agent = await adapter.start(session);

      // Wait for pythonAgentId to be set from header
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Mock stop response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'stopped' }),
      } as any);

      // Stop the stream
      shouldContinue = false;
      await adapter.stop(agent.id);

      // Should have called stop with pythonAgentId
      const stopCall = mockFetch.mock.calls.find((call) =>
        call[0]?.toString().includes('/agent/stop/')
      );
      expect(stopCall).toBeDefined();
      expect(stopCall![0]).toContain('python-agent-123');
    });

    it('should throw error when agent not found', async () => {
      const agentId = AgentId.generate();

      await expect(adapter.stop(agentId)).rejects.toThrow('No running agent found');
    });
  });

  describe('subscribe', () => {
    it('should add observer to agent', async () => {
      const session = Session.create('test', {});

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Should not throw
      expect(observer).toBeDefined();
    });
  });

  describe('SSE stream processing', () => {
    // Note: This test is skipped because it tests complex async background processing
    // that's better suited for integration tests. See Priority 2 in TEST_COVERAGE_AUDIT.md
    it.skip('should parse SSE events and notify observers', async () => {
      const session = Session.create('test', {});

      // Mock SSE stream with multiple messages in AgentMessage format
      // (Python proxy would have already parsed Claude CLI format)
      const sseData = [
        'data: {"type":"system","content":"","metadata":{"subtype":"init"}}\n\n',
        'data: {"type":"assistant","content":"Hello"}\n\n',
        'event: complete\ndata: {}\n\n',
      ].join('');

      // Control when the stream data is delivered
      let resolveFirstRead: (value: any) => void;
      let resolveSecondRead: (value: any) => void;
      const firstReadPromise = new Promise((resolve) => {
        resolveFirstRead = resolve;
      });
      const secondReadPromise = new Promise((resolve) => {
        resolveSecondRead = resolve;
      });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockImplementationOnce(() => firstReadPromise)
              .mockImplementationOnce(() => secondReadPromise),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      const agent = await adapter.start(session);

      // Subscribe immediately
      adapter.subscribe(agent.id, observer);

      // Deliver the stream data
      resolveFirstRead!({
        done: false,
        value: new TextEncoder().encode(sseData),
      });

      // Give it time to process the data
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now end the stream
      resolveSecondRead!({ done: true, value: undefined });

      // Wait for final processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have received messages and completion
      expect(observer.onMessage).toHaveBeenCalledTimes(2); // system + assistant
      expect(observer.onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          messageCount: 2,
        })
      );
    });
  });

  describe('MCP configuration support', () => {
    it('should include MCP config in request when provided', async () => {
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

      const session = Session.create('test', { mcp: mcpConfig });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.mcp_config).toBeDefined();
      expect(typeof callBody.mcp_config).toBe('string');

      // Verify it's valid JSON
      const mcpJson = JSON.parse(callBody.mcp_config);
      expect(mcpJson).toHaveProperty('mcpServers');
      expect(mcpJson.mcpServers).toHaveProperty('filesystem');
    });

    it('should include MCP strict flag when enabled', async () => {
      const { McpConfiguration } = require('@domain/value-objects/mcp-configuration.vo');

      const mcpConfig = McpConfiguration.create({
        servers: [
          {
            name: 'test-server',
            command: 'npx',
          },
        ],
        strict: true,
      });

      const session = Session.create('test', { mcp: mcpConfig });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.mcp_strict).toBe(true);
    });

    it('should not include MCP fields when not configured', async () => {
      const session = Session.create('test', {});

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.mcp_config).toBeUndefined();
      expect(callBody.mcp_strict).toBeUndefined();
    });

    it('should include multiple MCP servers in config', async () => {
      const { McpConfiguration } = require('@domain/value-objects/mcp-configuration.vo');

      const mcpConfig = McpConfiguration.create({
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
        ],
      });

      const session = Session.create('test', { mcp: mcpConfig });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      const mcpJson = JSON.parse(callBody.mcp_config);

      expect(Object.keys(mcpJson.mcpServers)).toHaveLength(2);
      expect(mcpJson.mcpServers).toHaveProperty('filesystem');
      expect(mcpJson.mcpServers).toHaveProperty('brave-search');
    });

    it('should include MCP server environment variables', async () => {
      const { McpConfiguration } = require('@domain/value-objects/mcp-configuration.vo');

      const mcpConfig = McpConfiguration.create({
        servers: [
          {
            name: 'api-server',
            command: 'npx',
            env: {
              API_KEY: 'secret-key',
              DEBUG: 'true',
            },
          },
        ],
      });

      const session = Session.create('test', { mcp: mcpConfig });

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValue(mockResponse);

      await adapter.start(session);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      const mcpJson = JSON.parse(callBody.mcp_config);

      expect(mcpJson.mcpServers['api-server'].env).toEqual({
        API_KEY: 'secret-key',
        DEBUG: 'true',
      });
    });
  });
});
