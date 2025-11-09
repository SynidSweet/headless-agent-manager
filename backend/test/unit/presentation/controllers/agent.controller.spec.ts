import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from '@presentation/controllers/agent.controller';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AgentController', () => {
  let controller: AgentController;
  let orchestrationService: jest.Mocked<AgentOrchestrationService>;

  beforeEach(async () => {
    // Create mock services
    const mockOrchestrationService = {
      launchAgent: jest.fn(),
      terminateAgent: jest.fn(),
      getAgentStatus: jest.fn(),
      listActiveAgents: jest.fn(),
      listAllAgents: jest.fn(),
      getAgentById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentOrchestrationService,
          useValue: mockOrchestrationService,
        },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    orchestrationService = module.get(AgentOrchestrationService);
  });

  describe('launchAgent (POST /agents)', () => {
    it('should launch a new agent and return response', async () => {
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

      orchestrationService.launchAgent.mockResolvedValue(mockAgent);

      // Act
      const result = await controller.launchAgent(dto);

      // Assert
      expect(orchestrationService.launchAgent).toHaveBeenCalledWith(dto);
      expect(result.agentId).toBe(mockAgent.id.toString());
      expect(result.status).toBe('running');
      expect(result.createdAt).toBeDefined();
    });

    it('should throw BadRequestException on validation error', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = '';
      dto.prompt = 'Test';

      orchestrationService.launchAgent.mockRejectedValue(new Error('Agent type is required'));

      // Act & Assert
      await expect(controller.launchAgent(dto)).rejects.toThrow(BadRequestException);
    });

    it('should propagate service errors', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test';

      orchestrationService.launchAgent.mockRejectedValue(new Error('Failed to start agent'));

      // Act & Assert
      await expect(controller.launchAgent(dto)).rejects.toThrow('Failed to start agent');
    });
  });

  describe('listAllAgents (GET /agents)', () => {
    it('should return all agents', async () => {
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

      orchestrationService.listAllAgents.mockResolvedValue([agent1, agent2]);

      // Act
      const result = await controller.listAllAgents();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe(agent1.id.toString());
      expect(result[0]!.type).toBe('claude-code');
      expect(result[1]!.id).toBe(agent2.id.toString());
      expect(result[1]!.status).toBe('running');
    });

    it('should return empty array when no agents exist', async () => {
      // Arrange
      orchestrationService.listAllAgents.mockResolvedValue([]);

      // Act
      const result = await controller.listAllAgents();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('listActiveAgents (GET /agents/active)', () => {
    it('should return only running agents', async () => {
      // Arrange
      const runningAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Running',
        configuration: {},
      });
      runningAgent.markAsRunning();

      orchestrationService.listActiveAgents.mockResolvedValue([runningAgent]);

      // Act
      const result = await controller.listActiveAgents();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('running');
    });
  });

  describe('getAgent (GET /agents/:id)', () => {
    it('should return agent by ID', async () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test',
        configuration: {},
      });

      orchestrationService.getAgentById.mockResolvedValue(agent);

      // Act
      const result = await controller.getAgent(agent.id.toString());

      // Assert
      expect(result.id).toBe(agent.id.toString());
      expect(result.type).toBe('claude-code');
      expect(orchestrationService.getAgentById).toHaveBeenCalledWith(
        expect.objectContaining({
          toString: expect.any(Function),
        })
      );
    });

    it('should throw NotFoundException when agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      orchestrationService.getAgentById.mockRejectedValue(
        new Error(`Agent not found: ${agentId.toString()}`)
      );

      // Act & Assert
      await expect(controller.getAgent(agentId.toString())).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid UUID', async () => {
      // Arrange
      const invalidId = 'invalid-uuid';

      // Act & Assert
      await expect(controller.getAgent(invalidId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('terminateAgent (DELETE /agents/:id)', () => {
    it('should terminate agent successfully', async () => {
      // Arrange
      const agentId = AgentId.generate();
      orchestrationService.terminateAgent.mockResolvedValue(undefined);

      // Act
      await controller.terminateAgent(agentId.toString());

      // Assert
      expect(orchestrationService.terminateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          toString: expect.any(Function),
        })
      );
    });

    it('should throw NotFoundException when agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      orchestrationService.terminateAgent.mockRejectedValue(
        new Error(`Agent not found: ${agentId.toString()}`)
      );

      // Act & Assert
      await expect(controller.terminateAgent(agentId.toString())).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException for invalid UUID', async () => {
      // Arrange
      const invalidId = 'not-a-uuid';

      // Act & Assert
      await expect(controller.terminateAgent(invalidId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAgentStatus (GET /agents/:id/status)', () => {
    it('should return agent status', async () => {
      // Arrange
      const agentId = AgentId.generate();
      orchestrationService.getAgentStatus.mockResolvedValue(AgentStatus.RUNNING);

      // Act
      const result = await controller.getAgentStatus(agentId.toString());

      // Assert
      expect(result.status).toBe('running');
      expect(result.agentId).toBe(agentId.toString());
    });

    it('should throw NotFoundException when agent not found', async () => {
      // Arrange
      const agentId = AgentId.generate();
      orchestrationService.getAgentStatus.mockRejectedValue(
        new Error(`Agent not found: ${agentId.toString()}`)
      );

      // Act & Assert
      await expect(controller.getAgentStatus(agentId.toString())).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
