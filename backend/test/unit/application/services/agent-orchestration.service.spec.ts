import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
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

    // Create service with mocks
    service = new AgentOrchestrationService(mockAgentFactory, mockAgentRepository);
  });

  describe('launchAgent', () => {
    it('should create and launch an agent successfully', async () => {
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

      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      const result = await service.launchAgent(dto);

      // Assert
      expect(result).toBeDefined();
      expect(result.type).toBe(AgentType.CLAUDE_CODE);
      expect(mockAgentFactory.create).toHaveBeenCalledWith(AgentType.CLAUDE_CODE);
      expect(mockAgentRunner.start).toHaveBeenCalled();
      expect(mockAgentRepository.save).toHaveBeenCalledWith(result);
    });

    it('should validate DTO before launching', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = ''; // Invalid
      dto.prompt = 'Test prompt';

      // Act & Assert
      await expect(service.launchAgent(dto)).rejects.toThrow('Agent type is required');
    });

    it('should create agent entity with correct data', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        sessionId: 'test-session',
        outputFormat: 'stream-json',
      };

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {
          sessionId: 'test-session',
          outputFormat: 'stream-json',
        },
      });
      mockAgent.markAsRunning();

      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      const result = await service.launchAgent(dto);

      // Assert
      expect(result.session?.id).toBe('test-session');
      expect(result.session?.prompt).toBe('Test prompt');
    });

    it('should handle runner start failure', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt';

      const error = new Error('Failed to start CLI');
      mockAgentRunner.start.mockRejectedValue(error);

      // Act & Assert
      await expect(service.launchAgent(dto)).rejects.toThrow('Failed to start CLI');
    });

    it('should pass configuration to agent factory', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'gemini-cli';
      dto.prompt = 'Test prompt';
      dto.configuration = {
        customArgs: ['--yolo'],
      };

      const mockAgent = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'Test prompt',
        configuration: { customArgs: ['--yolo'] },
      });
      mockAgent.markAsRunning();

      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      await service.launchAgent(dto);

      // Assert
      expect(mockAgentFactory.create).toHaveBeenCalledWith(AgentType.GEMINI_CLI);
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
});
