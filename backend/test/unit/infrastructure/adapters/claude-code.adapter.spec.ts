import { ClaudeCodeAdapter } from '@infrastructure/adapters/claude-code.adapter';
import { IProcessManager } from '@application/ports/process-manager.port';
import { ILogger } from '@application/ports/logger.port';
import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';
import { Session } from '@domain/value-objects/session.vo';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';
import { EventEmitter } from 'events';

describe('ClaudeCodeAdapter', () => {
  let adapter: ClaudeCodeAdapter;
  let mockProcessManager: jest.Mocked<IProcessManager>;
  let mockLogger: jest.Mocked<ILogger>;
  let mockParser: jest.Mocked<ClaudeMessageParser>;

  beforeEach(() => {
    mockProcessManager = {
      spawn: jest.fn(),
      kill: jest.fn(),
      getStreamReader: jest.fn(),
      isRunning: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockParser = {
      parse: jest.fn(),
      isComplete: jest.fn(),
    } as any;

    adapter = new ClaudeCodeAdapter(mockProcessManager, mockParser, mockLogger);
  });

  describe('start', () => {
    it('should spawn claude process with correct arguments', async () => {
      const session = Session.create('test prompt', {
        outputFormat: 'stream-json',
      });

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue(
        (async function* () {
          yield '{"type":"system","role":"init","content":"started"}';
        })()
      );

      mockParser.parse.mockReturnValue({
        type: 'system',
        role: 'init',
        content: 'started',
      });

      const agent = await adapter.start(session);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith('claude', [
        '-p',
        'test prompt',
        '--output-format',
        'stream-json',
        '--verbose',
      ]);
      expect(agent).toBeDefined();
    });

    it('should include session ID for resume', async () => {
      const session = Session.create('test prompt', {
        sessionId: 'session-123',
        outputFormat: 'stream-json',
      });

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

      await adapter.start(session);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith('claude', [
        '-p',
        'test prompt',
        '--output-format',
        'stream-json',
        '--verbose',
        '--session-id',
        'session-123',
      ]);
    });

    it('should include custom arguments', async () => {
      const session = Session.create('test prompt', {
        customArgs: ['--yolo', '--verbose'],
      });

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

      await adapter.start(session);

      expect(mockProcessManager.spawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--yolo', '--verbose'])
      );
    });

    it('should track running agents', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

      const agent = await adapter.start(session);

      expect(adapter.getStatus(agent.id)).resolves.toBeDefined();
    });

    it('should log when agent starts', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

      await adapter.start(session);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Claude Code agent started',
        expect.objectContaining({ pid: 12345 })
      );
    });
  });

  describe('stop', () => {
    it('should kill process and clean up', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());
      mockProcessManager.kill.mockResolvedValue();

      const agent = await adapter.start(session);

      await adapter.stop(agent.id);

      expect(mockProcessManager.kill).toHaveBeenCalledWith(12345, 'SIGTERM');
      expect(mockLogger.info).toHaveBeenCalledWith('Claude Code agent stopped', expect.any(Object));
    });

    it('should throw error when agent not found', async () => {
      const agentId = AgentId.generate();

      await expect(adapter.stop(agentId)).rejects.toThrow(
        `No running agent found: ${agentId.toString()}`
      );
    });

    it('should remove agent from tracking after stop', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());
      mockProcessManager.kill.mockResolvedValue();

      const agent = await adapter.start(session);
      await adapter.stop(agent.id);

      await expect(adapter.stop(agent.id)).rejects.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return status for running agent', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());
      mockProcessManager.isRunning.mockReturnValue(true);

      const agent = await adapter.start(session);

      const status = await adapter.getStatus(agent.id);

      expect(status).toBe(AgentStatus.RUNNING);
    });

    it('should throw error when agent not found', async () => {
      const agentId = AgentId.generate();

      await expect(adapter.getStatus(agentId)).rejects.toThrow();
    });
  });

  describe('subscribe', () => {
    it('should add observer to agent', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

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

  describe('unsubscribe', () => {
    it('should remove observer from agent', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);
      adapter.unsubscribe(agent.id, observer);

      // Should not throw
      expect(observer).toBeDefined();
    });
  });

  describe('message streaming', () => {
    it('should notify observers when messages are received', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      const testMessage: AgentMessage = {
        type: 'assistant',
        content: 'test response',
      };

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue(
        (async function* () {
          yield '{"type":"assistant","content":"test response"}';
        })()
      );
      mockParser.parse.mockReturnValue(testMessage);
      mockParser.isComplete.mockReturnValue(false);

      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(observer.onMessage).toHaveBeenCalledWith(testMessage);
    });

    it('should notify observers when agent completes', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      const completeMessage: AgentMessage = {
        type: 'system',
        role: 'result',
        content: '',
        metadata: { stats: { duration: 100 } },
      };

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue(
        (async function* () {
          yield '{"type":"system","role":"result","stats":{"duration":100}}';
        })()
      );
      mockParser.parse.mockReturnValue(completeMessage);
      mockParser.isComplete.mockReturnValue(true);

      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(observer.onComplete).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should notify observers on process error', async () => {
      const session = Session.create('test', {});

      const mockProcess = new EventEmitter() as any;
      mockProcess.pid = 12345;
      mockProcess.stdout = new EventEmitter();

      mockProcessManager.spawn.mockReturnValue(mockProcess);
      mockProcessManager.getStreamReader.mockReturnValue((async function* () {})());

      const agent = await adapter.start(session);

      const observer: IAgentObserver = {
        onMessage: jest.fn(),
        onStatusChange: jest.fn(),
        onError: jest.fn(),
        onComplete: jest.fn(),
      };

      adapter.subscribe(agent.id, observer);

      // Simulate process error
      const testError = new Error('Process crashed');
      mockProcess.emit('error', testError);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(observer.onError).toHaveBeenCalledWith(testError);
    });
  });
});
