import { Test, TestingModule } from '@nestjs/testing';
import { GeminiCLIAdapter } from '@infrastructure/adapters/gemini-cli.adapter';
import { IProcessManager } from '@application/ports/process-manager.port';
import { ILogger } from '@application/ports/logger.port';
import { GeminiMessageParser } from '@infrastructure/parsers/gemini-message.parser';
import { Session } from '@domain/value-objects/session.vo';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

describe('GeminiCLIAdapter', () => {
  let adapter: GeminiCLIAdapter;
  let mockProcessManager: jest.Mocked<IProcessManager>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockParser: jest.Mocked<GeminiMessageParser>;
  let mockProcess: ChildProcess & EventEmitter;

  beforeEach(async () => {
    // Create mock process
    mockProcess = new EventEmitter() as ChildProcess & EventEmitter;
    Object.defineProperty(mockProcess, 'pid', { value: 12345, writable: false });
    mockProcess.stdin = {} as any;
    mockProcess.stdout = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter() as any;
    mockProcess.kill = jest.fn();

    // Create mocks
    mockProcessManager = {
      spawn: jest.fn().mockReturnValue(mockProcess),
      kill: jest.fn(),
      getStreamReader: jest.fn(),
      isRunning: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockParser = {
      parse: jest.fn(),
      isComplete: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: GeminiCLIAdapter,
          useFactory: () => new GeminiCLIAdapter(mockProcessManager, mockLogger, mockParser),
        },
      ],
    }).compile();

    adapter = module.get<GeminiCLIAdapter>(GeminiCLIAdapter);
  });

  describe('Constructor', () => {
    it('should inject dependencies correctly', () => {
      expect(adapter).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith('GeminiCLIAdapter initialized', {});
    });
  });

  describe('start()', () => {
    const testPrompt = 'Test prompt';
    let testSession: Session;

    beforeEach(() => {
      testSession = Session.create(testPrompt, {});
      process.env.GEMINI_API_KEY = 'test-api-key';
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should spawn gemini process with correct arguments', async () => {
      const agent = await adapter.start(testSession);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith(
        'gemini',
        ['-p', testPrompt, '--output-format', 'stream-json'], // With -p flag for proper escaping
        expect.objectContaining({
          env: expect.objectContaining({
            GEMINI_API_KEY: 'test-api-key',
          }),
          shell: false, // Gemini doesn't need shell and it causes quote issues
        })
      );

      expect(agent).toBeDefined();
      expect(agent.type.toString()).toBe('gemini-cli');
    });

    it('should pass working directory from session configuration', async () => {
      const sessionWithCwd = Session.create(testPrompt, {
        workingDirectory: '/test/path',
      });

      await adapter.start(sessionWithCwd);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({
          cwd: '/test/path',
        })
      );
    });

    it('should use default working directory if not specified', async () => {
      await adapter.start(testSession);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({
          cwd: undefined,
        })
      );
    });

    it('should set GEMINI_API_KEY from environment', async () => {
      await adapter.start(testSession);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith(
        'gemini',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            GEMINI_API_KEY: 'test-api-key',
          }),
        })
      );
    });

    it('should throw error if GEMINI_API_KEY is missing', async () => {
      delete process.env.GEMINI_API_KEY;

      await expect(adapter.start(testSession)).rejects.toThrow('GEMINI_API_KEY environment variable is required');
    });

    it('should return agent instance with GEMINI_CLI type', async () => {
      const agent = await adapter.start(testSession);

      expect(agent).toBeDefined();
      expect(agent.type.toString()).toBe('gemini-cli');
    });

    it('should mark agent as running', async () => {
      const agent = await adapter.start(testSession);

      expect(agent.status.toString()).toBe('running');
    });

    it('should log agent start', async () => {
      const agent = await adapter.start(testSession);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting Gemini agent',
        expect.objectContaining({
          agentId: agent.id.toString(),
        })
      );
    });
  });

  describe('stdout parsing', () => {
    let testSession: Session;
    let testAgent: any;

    beforeEach(async () => {
      testSession = Session.create('Test prompt', {});
      process.env.GEMINI_API_KEY = 'test-api-key';
      testAgent = await adapter.start(testSession);
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should parse lines with GeminiMessageParser', (done) => {
      const testMessage: AgentMessage = {
        type: 'assistant',
        role: 'assistant',
        content: 'Test response',
      };

      mockParser.parse.mockReturnValue(testMessage);

      const observer: IAgentObserver = {
        onMessage: jest.fn(async (msg) => {
          expect(mockParser.parse).toHaveBeenCalledWith('{"type":"message","role":"assistant","content":"Test response"}');
          expect(msg).toEqual(testMessage);
          done();
        }),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer);
      mockProcess.stdout!.emit('data', '{"type":"message","role":"assistant","content":"Test response"}\n');
    });

    it('should handle partial lines by buffering', (done) => {
      const testMessage: AgentMessage = {
        type: 'assistant',
        role: 'assistant',
        content: 'Complete message',
      };

      mockParser.parse.mockReturnValue(testMessage);

      const observer: IAgentObserver = {
        onMessage: jest.fn(async (msg) => {
          expect(msg).toEqual(testMessage);
          expect(mockParser.parse).toHaveBeenCalledTimes(1);
          done();
        }),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer);

      // Emit partial line
      mockProcess.stdout!.emit('data', '{"type":"message","role":"ass');
      // Complete the line
      mockProcess.stdout!.emit('data', 'istant","content":"Complete message"}\n');
    });

    it('should skip null results from parser', (done) => {
      mockParser.parse.mockReturnValue(null);

      const observer: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer);

      mockProcess.stdout!.emit('data', '{"type":"init"}\n');

      // Wait a bit to ensure no message was emitted
      setTimeout(() => {
        expect(observer.onMessage).not.toHaveBeenCalled();
        done();
      }, 50);
    });

    it('should notify all subscribed observers', (done) => {
      const testMessage: AgentMessage = {
        type: 'assistant',
        content: 'Test',
      };

      mockParser.parse.mockReturnValue(testMessage);

      const observer1: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      const observer2: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer1);
      adapter.subscribe(testAgent.id, observer2);

      mockProcess.stdout!.emit('data', '{"type":"message"}\n');

      setTimeout(() => {
        expect(observer1.onMessage).toHaveBeenCalledWith(testMessage);
        expect(observer2.onMessage).toHaveBeenCalledWith(testMessage);
        done();
      }, 50);
    });

    it('should handle parser errors gracefully', (done) => {
      mockParser.parse.mockImplementation(() => {
        throw new Error('Parse error');
      });

      const observer: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer);

      mockProcess.stdout!.emit('data', 'invalid json\n');

      setTimeout(() => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to parse Gemini output',
          expect.objectContaining({
            error: 'Parse error',
          })
        );
        expect(observer.onMessage).not.toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('stderr handling', () => {
    let testSession: Session;
    let testAgent: any;

    beforeEach(async () => {
      testSession = Session.create('Test prompt', {});
      process.env.GEMINI_API_KEY = 'test-api-key';
      testAgent = await adapter.start(testSession);
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should log stderr output', (done) => {
      mockProcess.stderr!.emit('data', 'Warning: test warning\n');

      setTimeout(() => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Gemini stderr',
          expect.objectContaining({
            message: 'Warning: test warning',
          })
        );
        done();
      }, 50);
    });

    it('should not crash on stderr', (done) => {
      const observer: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer);

      mockProcess.stderr!.emit('data', 'Error message\n');

      setTimeout(() => {
        expect(observer.onError).not.toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('process exit handling', () => {
    let testSession: Session;
    let testAgent: any;

    beforeEach(async () => {
      testSession = Session.create('Test prompt', {});
      process.env.GEMINI_API_KEY = 'test-api-key';
      testAgent = await adapter.start(testSession);
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should notify observers on successful exit', (done) => {
      const observer: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn(async (result) => {
          expect(result.status).toBe('success');
          expect(result.messageCount).toBe(0);
          expect(result.duration).toBeGreaterThanOrEqual(0);
          done();
        }),
      };

      adapter.subscribe(testAgent.id, observer);
      mockProcess.emit('close', 0, null);
    });

    it('should notify observers on error exit', (done) => {
      const observer: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn(async (error) => {
          expect(error.message).toContain('code 1');
          done();
        }),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      adapter.subscribe(testAgent.id, observer);
      mockProcess.emit('close', 1, null);
    });

    it('should clean up on exit', (done) => {
      mockProcess.emit('close', 0, null);

      setTimeout(async () => {
        await expect(adapter.getStatus(testAgent.id)).rejects.toThrow('No running agent found');
        done();
      }, 50);
    });
  });

  describe('stop()', () => {
    let testSession: Session;
    let testAgent: any;

    beforeEach(async () => {
      testSession = Session.create('Test prompt', {});
      process.env.GEMINI_API_KEY = 'test-api-key';
      testAgent = await adapter.start(testSession);
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should kill the process', async () => {
      await adapter.stop(testAgent.id);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should clean up running agent info', async () => {
      await adapter.stop(testAgent.id);

      await expect(adapter.getStatus(testAgent.id)).rejects.toThrow('No running agent found');
    });

    it('should throw error if agent not found', async () => {
      const nonExistentId = AgentId.generate();

      await expect(adapter.stop(nonExistentId)).rejects.toThrow('No running agent found');
    });

    it('should log agent stop', async () => {
      await adapter.stop(testAgent.id);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Gemini agent stopped',
        expect.objectContaining({
          agentId: testAgent.id.toString(),
        })
      );
    });
  });

  describe('getStatus()', () => {
    it('should return agent status', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key';
      const session = Session.create('Test prompt', {});
      const agent = await adapter.start(session);

      const status = await adapter.getStatus(agent.id);

      expect(status.toString()).toBe('running');

      delete process.env.GEMINI_API_KEY;
    });

    it('should throw error if agent not found', async () => {
      const nonExistentId = AgentId.generate();

      await expect(adapter.getStatus(nonExistentId)).rejects.toThrow('No running agent found');
    });
  });

  describe('subscribe() and unsubscribe()', () => {
    let testAgent: any;
    let observer: IAgentObserver;

    beforeEach(async () => {
      process.env.GEMINI_API_KEY = 'test-api-key';
      const session = Session.create('Test prompt', {});
      testAgent = await adapter.start(session);

      observer = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };
    });

    afterEach(() => {
      delete process.env.GEMINI_API_KEY;
    });

    it('should add observer to agent', () => {
      adapter.subscribe(testAgent.id, observer);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Observer subscribed',
        expect.objectContaining({
          agentId: testAgent.id.toString(),
        })
      );
    });

    it('should buffer observers added before start() is called', async () => {
      const mockObserver: IAgentObserver = {
        onMessage: jest.fn().mockResolvedValue(undefined),
        onStatusChange: jest.fn().mockResolvedValue(undefined),
        onError: jest.fn().mockResolvedValue(undefined),
        onComplete: jest.fn().mockResolvedValue(undefined),
      };

      // Subscribe BEFORE start (like AgentOrchestrationService does)
      const agentId = AgentId.generate();
      const session = Session.create('Test prompt for buffering', {
        agentId: agentId.toString(), // Pass agent ID in config
      });

      adapter.subscribe(agentId, mockObserver);

      // Verify observer was buffered (logged)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Observer buffered (agent not started)',
        expect.objectContaining({
          agentId: agentId.toString(),
        })
      );

      // Start the agent
      await adapter.start(session);

      // Verify pending observers were attached
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Attached pending observers',
        expect.objectContaining({
          agentId: agentId.toString(),
          observerCount: 1,
        })
      );

      // Simulate message emission
      const testMessage: AgentMessage = {
        type: 'assistant',
        role: 'assistant',
        content: 'Test response',
      };
      mockParser.parse.mockReturnValue(testMessage);

      mockProcess.stdout!.emit('data', '{"type":"message","role":"assistant","content":"Test response"}\n');

      // Wait for async message processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert observer was called despite subscribing before start
      expect(mockObserver.onMessage).toHaveBeenCalledWith(testMessage);
    });

    it('should remove observer from agent', () => {
      adapter.subscribe(testAgent.id, observer);
      adapter.unsubscribe(testAgent.id, observer);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Observer unsubscribed',
        expect.objectContaining({
          agentId: testAgent.id.toString(),
        })
      );
    });

    it('should not fail when subscribing to non-existent agent', () => {
      const nonExistentId = AgentId.generate();

      expect(() => adapter.subscribe(nonExistentId, observer)).not.toThrow();
    });

    it('should not fail when unsubscribing from non-existent agent', () => {
      const nonExistentId = AgentId.generate();

      expect(() => adapter.unsubscribe(nonExistentId, observer)).not.toThrow();
    });
  });
});
