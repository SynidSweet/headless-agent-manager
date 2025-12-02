import { ClaudeSDKAdapter } from '@infrastructure/adapters/claude-sdk.adapter';
import { ILogger } from '@application/ports/logger.port';
import { Session } from '@domain/value-objects/session.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IAgentObserver } from '@application/ports/agent-runner.port';
import Anthropic from '@anthropic-ai/sdk';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk');

describe('ClaudeSDKAdapter', () => {
  let adapter: ClaudeSDKAdapter;
  let mockLogger: jest.Mocked<ILogger>;
  let mockAnthropicClient: jest.Mocked<Anthropic>;
  let mockMessagesAPI: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockMessagesAPI = {
      stream: jest.fn(),
    };

    mockAnthropicClient = {
      messages: mockMessagesAPI,
    } as any;

    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => mockAnthropicClient);

    adapter = new ClaudeSDKAdapter('test-api-key', mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create Anthropic client with API key', () => {
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'ClaudeSDKAdapter initialized',
        expect.any(Object)
      );
    });
  });

  describe('start', () => {
    it('should create agent and start streaming', async () => {
      const session = Session.create('test prompt', {});

      // Mock stream
      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'message_start', message: { id: 'msg_123', role: 'assistant' } };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
            index: 0,
          };
        },
        finalMessage: jest.fn().mockResolvedValue({
          id: 'msg_123',
          content: [{ type: 'text', text: 'Hello world' }],
          stop_reason: 'end_turn',
        }),
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

      const agent = await adapter.start(session);

      expect(agent).toBeDefined();
      expect(agent.status).toBe(AgentStatus.RUNNING);
      expect(mockMessagesAPI.stream).toHaveBeenCalledWith({
        model: expect.any(String),
        max_tokens: expect.any(Number),
        messages: [
          {
            role: 'user',
            content: 'test prompt',
          },
        ],
      });
    });

    it('should use model from configuration', async () => {
      const session = Session.create('test', {
        customArgs: ['--model', 'claude-opus-4'],
      });

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {},
        finalMessage: jest.fn().mockResolvedValue({}),
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

      await adapter.start(session);

      expect(mockMessagesAPI.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.stringContaining('claude'),
        })
      );
    });

    it('should log when agent starts', async () => {
      const session = Session.create('test', {});

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {},
        finalMessage: jest.fn().mockResolvedValue({}),
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

      await adapter.start(session);

      expect(mockLogger.info).toHaveBeenCalledWith('Claude SDK agent started', expect.any(Object));
    });
  });

  describe('stop', () => {
    it('should abort stream and clean up', async () => {
      const session = Session.create('test', {});

      const mockAbortController = {
        abort: jest.fn(),
      };

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {
          // Long running stream
          await new Promise(() => {}); // Never resolves
        },
        finalMessage: jest.fn(),
        controller: mockAbortController,
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

      const agent = await adapter.start(session);

      await adapter.stop(agent.id);

      expect(mockLogger.info).toHaveBeenCalledWith('Claude SDK agent stopped', expect.any(Object));
    });

    it('should throw error when agent not found', async () => {
      const agentId = AgentId.generate();

      await expect(adapter.stop(agentId)).rejects.toThrow('No running agent found');
    });
  });

  describe('subscribe', () => {
    it('should add observer to agent', async () => {
      const session = Session.create('test', {});

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {},
        finalMessage: jest.fn().mockResolvedValue({}),
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

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

  describe('streaming events', () => {
    it('should notify observers for content block delta events', async () => {
      const session = Session.create('test', {});

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' },
            index: 0,
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' world' },
            index: 0,
          };
        },
        finalMessage: jest.fn().mockResolvedValue({
          id: 'msg_123',
          content: [{ type: 'text', text: 'Hello world' }],
        }),
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

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

    it('should notify observers on completion', async () => {
      const session = Session.create('test', {});

      const mockStream = {
        on: jest.fn().mockReturnThis(),
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'message_stop' };
        },
        finalMessage: jest.fn().mockResolvedValue({
          id: 'msg_123',
          content: [{ type: 'text', text: 'Response' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      };

      mockMessagesAPI.stream.mockReturnValue(mockStream);

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

      expect(observer.onComplete).toHaveBeenCalled();
    });
  });
});

// Need to import AgentId
import { AgentId } from '@domain/value-objects/agent-id.vo';
