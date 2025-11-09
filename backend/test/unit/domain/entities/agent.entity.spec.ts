import { Agent, CreateAgentData } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('Agent Entity', () => {
  describe('create', () => {
    it('should create agent with valid data', () => {
      const data: CreateAgentData = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'Create a todo app',
        configuration: {},
      };

      const agent = Agent.create(data);

      expect(agent.id).toBeDefined();
      expect(agent.type).toBe(AgentType.CLAUDE_CODE);
      expect(agent.status).toBe(AgentStatus.INITIALIZING);
      expect(agent.session.prompt).toBe('Create a todo app');
      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.startedAt).toBeUndefined();
      expect(agent.completedAt).toBeUndefined();
    });

    it('should create agent with Gemini CLI type', () => {
      const data: CreateAgentData = {
        type: AgentType.GEMINI_CLI,
        prompt: 'Build an API',
        configuration: {},
      };

      const agent = Agent.create(data);

      expect(agent.type).toBe(AgentType.GEMINI_CLI);
    });

    it('should create agent with configuration', () => {
      const data: CreateAgentData = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {
          timeout: 60000,
          outputFormat: 'stream-json',
        },
      };

      const agent = Agent.create(data);

      expect(agent.session.configuration.timeout).toBe(60000);
      expect(agent.session.configuration.outputFormat).toBe('stream-json');
    });

    it('should generate unique IDs for each agent', () => {
      const data: CreateAgentData = {
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      };

      const agent1 = Agent.create(data);
      const agent2 = Agent.create(data);

      expect(agent1.id.equals(agent2.id)).toBe(false);
    });

    it('should throw DomainException when prompt is empty', () => {
      const data: CreateAgentData = {
        type: AgentType.CLAUDE_CODE,
        prompt: '',
        configuration: {},
      };

      expect(() => Agent.create(data)).toThrow(DomainException);
    });

    it('should throw DomainException when type is undefined', () => {
      const data = {
        type: undefined,
        prompt: 'test',
        configuration: {},
      } as unknown as CreateAgentData;

      expect(() => Agent.create(data)).toThrow(DomainException);
      expect(() => Agent.create(data)).toThrow('Agent type is required');
    });
  });

  describe('markAsRunning', () => {
    it('should transition from INITIALIZING to RUNNING', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();

      expect(agent.status).toBe(AgentStatus.RUNNING);
      expect(agent.startedAt).toBeInstanceOf(Date);
      expect(agent.startedAt!.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should throw when not in INITIALIZING state', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();

      expect(() => agent.markAsRunning()).toThrow(DomainException);
      expect(() => agent.markAsRunning()).toThrow('Agent must be initializing to start');
    });

    it('should set startedAt timestamp', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      const beforeStart = Date.now();
      agent.markAsRunning();
      const afterStart = Date.now();

      expect(agent.startedAt).toBeDefined();
      expect(agent.startedAt!.getTime()).toBeGreaterThanOrEqual(beforeStart);
      expect(agent.startedAt!.getTime()).toBeLessThanOrEqual(afterStart);
    });
  });

  describe('markAsCompleted', () => {
    it('should transition from RUNNING to COMPLETED', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();
      agent.markAsCompleted();

      expect(agent.status).toBe(AgentStatus.COMPLETED);
      expect(agent.completedAt).toBeInstanceOf(Date);
    });

    it('should throw when not in RUNNING state', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(() => agent.markAsCompleted()).toThrow(DomainException);
      expect(() => agent.markAsCompleted()).toThrow('Agent must be running to complete');
    });

    it('should set completedAt timestamp', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();

      const beforeComplete = Date.now();
      agent.markAsCompleted();
      const afterComplete = Date.now();

      expect(agent.completedAt).toBeDefined();
      expect(agent.completedAt!.getTime()).toBeGreaterThanOrEqual(beforeComplete);
      expect(agent.completedAt!.getTime()).toBeLessThanOrEqual(afterComplete);
    });
  });

  describe('markAsFailed', () => {
    it('should transition from INITIALIZING to FAILED', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      const error = new Error('CLI not found');
      agent.markAsFailed(error);

      expect(agent.status).toBe(AgentStatus.FAILED);
      expect(agent.error).toBe(error);
      expect(agent.completedAt).toBeInstanceOf(Date);
    });

    it('should transition from RUNNING to FAILED', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();
      const error = new Error('Process crashed');
      agent.markAsFailed(error);

      expect(agent.status).toBe(AgentStatus.FAILED);
      expect(agent.error).toBe(error);
    });

    it('should store error information', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      const error = new Error('Test error message');
      agent.markAsFailed(error);

      expect(agent.error).toBe(error);
      expect(agent.error?.message).toBe('Test error message');
    });

    it('should set completedAt timestamp when failed', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsFailed(new Error('test'));

      expect(agent.completedAt).toBeDefined();
      expect(agent.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('markAsTerminated', () => {
    it('should transition from RUNNING to TERMINATED', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();
      agent.markAsTerminated();

      expect(agent.status).toBe(AgentStatus.TERMINATED);
      expect(agent.completedAt).toBeInstanceOf(Date);
    });

    it('should throw when not in RUNNING state', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(() => agent.markAsTerminated()).toThrow(DomainException);
      expect(() => agent.markAsTerminated()).toThrow('Agent must be running to terminate');
    });
  });

  describe('markAsPaused', () => {
    it('should transition from RUNNING to PAUSED', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();
      agent.markAsPaused();

      expect(agent.status).toBe(AgentStatus.PAUSED);
    });

    it('should throw when not in RUNNING state', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(() => agent.markAsPaused()).toThrow(DomainException);
      expect(() => agent.markAsPaused()).toThrow('Agent must be running to pause');
    });
  });

  describe('resume', () => {
    it('should transition from PAUSED to RUNNING', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();
      agent.markAsPaused();
      agent.resume();

      expect(agent.status).toBe(AgentStatus.RUNNING);
    });

    it('should throw when not in PAUSED state', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(() => agent.resume()).toThrow(DomainException);
      expect(() => agent.resume()).toThrow('Agent must be paused to resume');
    });
  });

  describe('isRunning', () => {
    it('should return true when agent is running', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();

      expect(agent.isRunning()).toBe(true);
    });

    it('should return false when agent is not running', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.isRunning()).toBe(false);

      agent.markAsRunning();
      agent.markAsCompleted();

      expect(agent.isRunning()).toBe(false);
    });
  });

  describe('isCompleted', () => {
    it('should return true when agent is completed', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsRunning();
      agent.markAsCompleted();

      expect(agent.isCompleted()).toBe(true);
    });

    it('should return false when agent is not completed', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.isCompleted()).toBe(false);
    });
  });

  describe('isFailed', () => {
    it('should return true when agent failed', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      agent.markAsFailed(new Error('test'));

      expect(agent.isFailed()).toBe(true);
    });

    it('should return false when agent did not fail', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.isFailed()).toBe(false);
    });
  });

  describe('getters', () => {
    it('should expose id as readonly', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.id).toBeInstanceOf(AgentId);
    });

    it('should expose type as readonly', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.type).toBe(AgentType.CLAUDE_CODE);
    });

    it('should expose status as readonly', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.status).toBe(AgentStatus.INITIALIZING);
    });

    it('should expose session as readonly', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test prompt',
        configuration: {},
      });

      expect(agent.session).toBeInstanceOf(Session);
      expect(agent.session.prompt).toBe('test prompt');
    });

    it('should expose createdAt as readonly', () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      expect(agent.createdAt).toBeInstanceOf(Date);
    });
  });
});
