import {
  AgentResponseDto,
  LaunchAgentResponseDto,
} from '@application/dto/agent-response.dto';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

describe('AgentResponseDto', () => {
  describe('fromAgent', () => {
    it('should convert Agent entity to DTO with minimal data', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });

      // Act
      const dto = AgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.id).toBe(agent.id.toString());
      expect(dto.type).toBe('claude-code');
      expect(dto.status).toBe('initializing');
      expect(dto.createdAt).toBeDefined();
      expect(dto.startedAt).toBeUndefined();
      expect(dto.completedAt).toBeUndefined();
    });

    it('should include session information', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {
          sessionId: 'test-session-id',
        },
      });

      // Act
      const dto = AgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.session).toBeDefined();
      expect(dto.session?.id).toBe('test-session-id');
      expect(dto.session?.prompt).toBe('Test prompt');
      expect(dto.session?.messageCount).toBe(0);
    });

    it('should include startedAt when agent is running', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });
      agent.markAsRunning();

      // Act
      const dto = AgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.status).toBe('running');
      expect(dto.startedAt).toBeDefined();
      expect(dto.completedAt).toBeUndefined();
    });

    it('should include completedAt when agent is completed', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });
      agent.markAsRunning();
      agent.markAsCompleted();

      // Act
      const dto = AgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.status).toBe('completed');
      expect(dto.startedAt).toBeDefined();
      expect(dto.completedAt).toBeDefined();
    });

    it('should include completedAt when agent is failed', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });
      agent.markAsRunning();
      agent.markAsFailed(new Error('Test error'));

      // Act
      const dto = AgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.status).toBe('failed');
      expect(dto.startedAt).toBeDefined();
      expect(dto.completedAt).toBeDefined();
    });

    it('should format timestamps as ISO strings', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });

      // Act
      const dto = AgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('fromAgents', () => {
    it('should convert empty array', () => {
      // Arrange
      const agents: Agent[] = [];

      // Act
      const dtos = AgentResponseDto.fromAgents(agents);

      // Assert
      expect(dtos).toEqual([]);
    });

    it('should convert multiple agents to DTOs', () => {
      // Arrange
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt 1',
        configuration: {},
      });
      const agent2 = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'Test prompt 2',
        configuration: {},
      });
      const agents = [agent1, agent2];

      // Act
      const dtos = AgentResponseDto.fromAgents(agents);

      // Assert
      expect(dtos).toHaveLength(2);
      expect(dtos[0]!.id).toBe(agent1.id.toString());
      expect(dtos[0]!.type).toBe('claude-code');
      expect(dtos[1]!.id).toBe(agent2.id.toString());
      expect(dtos[1]!.type).toBe('gemini-cli');
    });
  });
});

describe('LaunchAgentResponseDto', () => {
  describe('fromAgent', () => {
    it('should convert Agent to launch response', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });

      // Act
      const dto = LaunchAgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.agentId).toBe(agent.id.toString());
      expect(dto.status).toBe('initializing');
      expect(dto.createdAt).toBeDefined();
    });

    it('should format timestamp as ISO string', () => {
      // Arrange
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        configuration: {},
      });

      // Act
      const dto = LaunchAgentResponseDto.fromAgent(agent);

      // Assert
      expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
