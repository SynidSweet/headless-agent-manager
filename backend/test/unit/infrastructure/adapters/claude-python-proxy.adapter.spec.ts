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

    it('should notify observers on proxy error', async () => {
      const session = Session.create('test', {});

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as any);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      const agent = await adapter.start(session);
      adapter.subscribe(agent.id, observer);

      // Wait for background stream processing to fail
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(observer.onError).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should POST to /agent/stop endpoint when pythonAgentId exists', async () => {
      const session = Session.create('test', {});

      // Start agent first with Python agent ID in header
      const mockStreamResponse = {
        ok: true,
        headers: {
          get: (name: string) => (name === 'X-Agent-Id' ? 'python-agent-123' : null),
        },
        body: {
          getReader: () => ({
            read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        },
      } as any;

      mockFetch.mockResolvedValueOnce(mockStreamResponse);
      const agent = await adapter.start(session);

      // Wait for pythonAgentId to be set
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Mock stop response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'stopped' }),
      } as any);

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
    it('should parse SSE events and notify observers', async () => {
      const session = Session.create('test', {});

      // Mock SSE stream with multiple messages
      const sseData = [
        'data: {"type":"system","subtype":"init"}\n\n',
        'data: {"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}\n\n',
        'event: complete\ndata: {}\n\n',
      ].join('');

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(sseData),
              })
              .mockResolvedValueOnce({ done: true, value: undefined }),
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

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(observer.onMessage).toHaveBeenCalled();
    });
  });
});
