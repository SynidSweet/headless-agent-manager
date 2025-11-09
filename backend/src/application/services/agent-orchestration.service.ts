import { Injectable, Inject } from '@nestjs/common';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentConfiguration } from '@domain/value-objects/session.vo';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';

/**
 * Agent Orchestration Service
 * Coordinates agent lifecycle: launch, terminate, and query operations
 * Application layer service implementing use cases
 */
@Injectable()
export class AgentOrchestrationService {
  constructor(
    @Inject('IAgentFactory') private readonly agentFactory: IAgentFactory,
    @Inject('IAgentRepository') private readonly agentRepository: IAgentRepository
  ) {}

  /**
   * Launch a new agent
   * @param dto - Launch configuration
   * @returns The created and started agent
   * @throws Error if validation fails or agent fails to start
   */
  async launchAgent(dto: LaunchAgentDto): Promise<Agent> {
    // Validation handled by NestJS ValidationPipe

    // Convert DTO to domain types
    const agentType = dto.type as AgentType;

    // Convert configuration safely
    const configuration: AgentConfiguration = {};
    if (dto.configuration) {
      if (dto.configuration.sessionId) {
        configuration.sessionId = dto.configuration.sessionId;
      }
      if (dto.configuration.outputFormat === 'stream-json' || dto.configuration.outputFormat === 'json') {
        configuration.outputFormat = dto.configuration.outputFormat;
      }
      if (dto.configuration.customArgs) {
        configuration.customArgs = dto.configuration.customArgs;
      }
    }

    // Create agent entity
    const agent = Agent.create({
      type: agentType,
      prompt: dto.prompt,
      configuration,
    });

    // Get appropriate runner from factory
    const runner = this.agentFactory.create(agent.type);

    // Start the agent
    const startedAgent = await runner.start(agent.session);

    // Save to repository
    await this.agentRepository.save(startedAgent);

    return startedAgent;
  }

  /**
   * Terminate a running agent
   * @param agentId - ID of agent to terminate
   * @throws Error if agent not found
   */
  async terminateAgent(agentId: AgentId): Promise<void> {
    // Find agent
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId.toString()}`);
    }

    // Get runner for this agent type
    const runner = this.agentFactory.create(agent.type);

    // Try to stop the runner (gracefully handle if process already dead)
    try {
      await runner.stop(agentId);
    } catch (error) {
      // Log but continue - we still want to mark agent as terminated
      console.warn(`Failed to stop agent runner: ${error}`);
    }

    // Mark agent as terminated
    agent.markAsTerminated();

    // Save updated state
    await this.agentRepository.save(agent);
  }

  /**
   * Get status of an agent
   * @param agentId - Agent ID
   * @returns Current agent status
   * @throws Error if agent not found
   */
  async getAgentStatus(agentId: AgentId): Promise<AgentStatus> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId.toString()}`);
    }
    return agent.status;
  }

  /**
   * List all active (running) agents
   * @returns Array of running agents
   */
  async listActiveAgents(): Promise<Agent[]> {
    return this.agentRepository.findByStatus(AgentStatus.RUNNING);
  }

  /**
   * List all agents regardless of status
   * @returns Array of all agents
   */
  async listAllAgents(): Promise<Agent[]> {
    return this.agentRepository.findAll();
  }

  /**
   * Get a specific agent by ID
   * @param agentId - Agent ID
   * @returns The agent
   * @throws Error if agent not found
   */
  async getAgentById(agentId: AgentId): Promise<Agent> {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId.toString()}`);
    }
    return agent;
  }
}
