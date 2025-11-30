import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { StreamingService } from '@application/services/streaming.service';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { IAgentLaunchQueue } from '@application/ports/agent-launch-queue.port';
import { IInstructionHandler } from '@application/ports/instruction-handler.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';

describe('AgentOrchestrationService', () => {
  let service: AgentOrchestrationService;
  let mockAgentFactory: jest.Mocked<IAgentFactory>;
  let mockAgentRepository: jest.Mocked<IAgentRepository>;
  let mockAgentRunner: jest.Mocked<IAgentRunner>;
  let mockStreamingService: jest.Mocked<StreamingService>;
  let mockLaunchQueue: jest.Mocked<IAgentLaunchQueue>;
  let mockInstructionHandler: jest.Mocked<IInstructionHandler>;

  beforeEach(() => {
    // Create mock agent runner
    mockAgentRunner = {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    // Create mock factory
    mockAgentFactory = {
      create: jest.fn().mockReturnValue(mockAgentRunner),
    };

    // Create mock repository
    mockAgentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByStatus: jest.fn(),
      findByType: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
    };

    // Create mock streaming service
    mockStreamingService = {
      subscribeToAgent: jest.fn(),
      unsubscribeFromAgent: jest.fn(),
      unsubscribeClient: jest.fn(),
    } as any;

    // Create mock launch queue
    mockLaunchQueue = {
      enqueue: jest.fn(),
      getQueueLength: jest.fn().mockReturnValue(0),
      cancelRequest: jest.fn(),
    };

    // Create mock instruction handler
    mockInstructionHandler = {
      prepareEnvironment: jest.fn().mockResolvedValue(null),
      restoreEnvironment: jest.fn().mockResolvedValue(undefined),
    };

    // Create service with mocks
    service = new AgentOrchestrationService(
      mockAgentFactory,
      mockAgentRepository,
      mockStreamingService,
      mockLaunchQueue,
      mockInstructionHandler,
    );
  });

  describe('launchAgent', () => {
    it('should enqueue launch request via queue', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {};

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });
      mockAgent.markAsRunning();

      // Mock queue to return agent
      mockLaunchQueue.enqueue.mockResolvedValue(mockAgent);

      // Act
      const result = await service.launchAgent(dto);

      // Assert
      expect(result).toBe(mockAgent);
      expect(result.type).toBe(AgentType.CLAUDE_CODE);
      expect(result.status).toBe(AgentStatus.RUNNING);

      // Verify queue was called
      expect(mockLaunchQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: AgentType.CLAUDE_CODE,
          prompt: 'Test prompt',
        })
      );

      // Direct operations should NOT be called (queue handles those)
      expect(mockAgentFactory.create).not.toHaveBeenCalled();
      expect(mockAgentRunner.start).not.toHaveBeenCalled();
      expect(mockAgentRepository.save).not.toHaveBeenCalled();
    });

    it('should pass instructions to queue when provided', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        instructions: 'Custom instructions for this agent',
      };

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });

      mockLaunchQueue.enqueue.mockResolvedValue(mockAgent);

      // Act
      await service.launchAgent(dto);

      // Assert
      expect(mockLaunchQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: AgentType.CLAUDE_CODE,
          prompt: 'Test prompt',
          instructions: 'Custom instructions for this agent',
        })
      );
    });

    it('should pass metadata to queue when provided', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        metadata: { userId: 'user-123', projectId: 'project-456' },
      };

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });

      mockLaunchQueue.enqueue.mockResolvedValue(mockAgent);

      // Act
      await service.launchAgent(dto);

      // Assert
      expect(mockLaunchQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { userId: 'user-123', projectId: 'project-456' },
        })
      );
    });
  });

  describe('terminateAgent', () => {
    it('should terminate a running agent', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {},
      });
      mockAgent.markAsRunning();

      mockAgentRepository.findById.mockResolvedValue(mockAgent);
      mockAgentRunner.stop.mockResolvedValue(undefined);

      // Act
      await service.terminateAgent(agentId);

      // Assert
      expect(mockAgentRepository.findById).toHaveBeenCalledWith(agentId);
      expect(mockAgentFactory.create).toHaveBeenCalledWith(AgentType.CLAUDE_CODE);
      expect(mockAgentRunner.stop).toHaveBeenCalledWith(agentId);
      expect(mockAgent.status).toBe(AgentStatus.TERMINATED);
      expect(mockAgentRepository.save).toHaveBeenCalledWith(mockAgent);
    });

    it('should throw error if agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      mockAgentRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.terminateAgent(agentId)).rejects.toThrow(
        `Agent not found: ${agentId.toString()}`
      );
    });

    it('should handle runner stop failure gracefully', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {},
      });
      mockAgent.markAsRunning();

      mockAgentRepository.findById.mockResolvedValue(mockAgent);
      mockAgentRunner.stop.mockRejectedValue(new Error('Process not found'));

      // Act
      await service.terminateAgent(agentId);

      // Assert - Should still mark agent as terminated
      expect(mockAgent.status).toBe(AgentStatus.TERMINATED);
      expect(mockAgentRepository.save).toHaveBeenCalledWith(mockAgent);
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent status', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {},
      });
      mockAgent.markAsRunning();

      mockAgentRepository.findById.mockResolvedValue(mockAgent);

      // Act
      const status = await service.getAgentStatus(agentId);

      // Assert
      expect(status).toBe(AgentStatus.RUNNING);
      expect(mockAgentRepository.findById).toHaveBeenCalledWith(agentId);
    });

    it('should throw error if agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      mockAgentRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getAgentStatus(agentId)).rejects.toThrow(
        `Agent not found: ${agentId.toString()}`
      );
    });
  });

  describe('listActiveAgents', () => {
    it('should return all running agents', async () => {
      // Arrange
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test 1',
        configuration: {},
      });
      agent1.markAsRunning();

      const agent2 = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'Test 2',
        configuration: {},
      });
      agent2.markAsRunning();

      mockAgentRepository.findByStatus.mockResolvedValue([agent1, agent2]);

      // Act
      const agents = await service.listActiveAgents();

      // Assert
      expect(agents).toHaveLength(2);
      expect(mockAgentRepository.findByStatus).toHaveBeenCalledWith(AgentStatus.RUNNING);
    });

    it('should return empty array when no agents are running', async () => {
      // Arrange
      mockAgentRepository.findByStatus.mockResolvedValue([]);

      // Act
      const agents = await service.listActiveAgents();

      // Assert
      expect(agents).toEqual([]);
    });
  });

  describe('listAllAgents', () => {
    it('should return all agents regardless of status', async () => {
      // Arrange
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test 1',
        configuration: {},
      });
      const agent2 = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'Test 2',
        configuration: {},
      });
      agent2.markAsRunning();

      mockAgentRepository.findAll.mockResolvedValue([agent1, agent2]);

      // Act
      const agents = await service.listAllAgents();

      // Assert
      expect(agents).toHaveLength(2);
      expect(mockAgentRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('getAgentById', () => {
    it('should return agent by ID', async () => {
      // Arrange
      const agentId = AgentId.generate();
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {},
      });

      mockAgentRepository.findById.mockResolvedValue(mockAgent);

      // Act
      const agent = await service.getAgentById(agentId);

      // Assert
      expect(agent).toBe(mockAgent);
      expect(mockAgentRepository.findById).toHaveBeenCalledWith(agentId);
    });

    it('should throw error if agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      mockAgentRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getAgentById(agentId)).rejects.toThrow(
        `Agent not found: ${agentId.toString()}`
      );
    });
  });

  describe('getRunnerForAgent', () => {
    it('should return runner for registered agent', () => {
      // Arrange
      const agentId = AgentId.generate();

      // Manually register runner (simulates what launchAgentDirect does)
      service.registerRunner(agentId, mockAgentRunner);

      // Act
      const runner = service.getRunnerForAgent(agentId);

      // Assert
      expect(runner).toBeDefined();
      expect(runner).toBe(mockAgentRunner);
    });

    it('should throw error if agent not found', () => {
      // Arrange
      const fakeId = AgentId.generate();

      // Act & Assert
      expect(() => service.getRunnerForAgent(fakeId)).toThrow(
        `No runner found for agent: ${fakeId.toString()}`
      );
    });

    it('should return same runner instance across multiple calls', () => {
      // Arrange
      const agentId = AgentId.generate();

      // Manually register runner
      service.registerRunner(agentId, mockAgentRunner);

      // Act
      const runner1 = service.getRunnerForAgent(agentId);
      const runner2 = service.getRunnerForAgent(agentId);

      // Assert
      expect(runner1).toBe(runner2);
      expect(runner1).toBe(mockAgentRunner);
    });
  });

  describe('queue management', () => {
    it('should return queue length', () => {
      mockLaunchQueue.getQueueLength.mockReturnValue(5);

      const length = service.getQueueLength();

      expect(length).toBe(5);
      expect(mockLaunchQueue.getQueueLength).toHaveBeenCalled();
    });

    it('should cancel launch request', () => {
      const requestId = 'test-request-id';

      service.cancelLaunchRequest(requestId);

      expect(mockLaunchQueue.cancelRequest).toHaveBeenCalledWith(requestId);
    });
  });
});
