import { Agent } from '@domain/entities/agent.entity';

/**
 * Session Response DTO
 * Session information in API responses
 */
export interface SessionResponseDto {
  id: string;
  prompt: string;
  messageCount?: number;
}

/**
 * Agent Response DTO
 * Response format for agent data in API
 */
export class AgentResponseDto {
  /**
   * Agent ID
   */
  id!: string;

  /**
   * Agent type
   */
  type!: string;

  /**
   * Current status
   */
  status!: string;

  /**
   * Session information
   */
  session?: SessionResponseDto;

  /**
   * Creation timestamp
   */
  createdAt!: string;

  /**
   * Start timestamp
   */
  startedAt?: string;

  /**
   * Completion timestamp
   */
  completedAt?: string;

  /**
   * Create from domain Agent entity
   */
  static fromAgent(agent: Agent): AgentResponseDto {
    const dto = new AgentResponseDto();
    dto.id = agent.id.toString();
    dto.type = agent.type.toString();
    dto.status = agent.status.toString();
    dto.createdAt = agent.createdAt.toISOString();

    if (agent.startedAt) {
      dto.startedAt = agent.startedAt.toISOString();
    }

    if (agent.completedAt) {
      dto.completedAt = agent.completedAt.toISOString();
    }

    if (agent.session) {
      dto.session = {
        id: agent.session.id || '',
        prompt: agent.session.prompt,
        messageCount: 0, // TODO: Track conversation history in domain
      };
    }

    return dto;
  }

  /**
   * Create an array of DTOs from Agent entities
   */
  static fromAgents(agents: Agent[]): AgentResponseDto[] {
    return agents.map((agent) => AgentResponseDto.fromAgent(agent));
  }
}

/**
 * Launch Agent Response DTO
 * Response for successful agent launch
 */
export class LaunchAgentResponseDto {
  /**
   * Agent ID
   */
  agentId!: string;

  /**
   * Initial status
   */
  status!: string;

  /**
   * Creation timestamp
   */
  createdAt!: string;

  /**
   * Create from domain Agent entity
   */
  static fromAgent(agent: Agent): LaunchAgentResponseDto {
    const dto = new LaunchAgentResponseDto();
    dto.agentId = agent.id.toString();
    dto.status = agent.status.toString();
    dto.createdAt = agent.createdAt.toISOString();
    return dto;
  }
}
