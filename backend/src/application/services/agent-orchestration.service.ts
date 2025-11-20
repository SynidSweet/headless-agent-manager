import { Injectable, Inject, Logger } from '@nestjs/common';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentConfiguration } from '@domain/value-objects/session.vo';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';

/**
 * Agent Orchestration Service
 * Coordinates agent lifecycle: launch, terminate, and query operations
 * Application layer service implementing use cases
 */
@Injectable()
export class AgentOrchestrationService {
  private readonly logger = new Logger(AgentOrchestrationService.name);
  private readonly runnerStorage: Map<string, IAgentRunner> = new Map();

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

    // **FIX**: Save agent to database BEFORE starting runner
    // This ensures the agent record exists when messages start arriving
    // Prevents FOREIGN KEY constraint failures on agent_messages.agent_id
    await this.agentRepository.save(agent);

    // Start the agent (messages can now reference existing agent in DB)
    const startedAgent = await runner.start(agent.session);

    // Store runner for this agent
    this.runnerStorage.set(startedAgent.id.toString(), runner);

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

    // Remove runner from storage
    this.runnerStorage.delete(agentId.toString());

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

  /**
   * Get the runner instance for a specific agent
   * This is the actual runner that's running the agent, not a new instance
   * @param agentId - Agent ID
   * @returns The runner instance
   * @throws Error if no runner found for agent
   */
  getRunnerForAgent(agentId: AgentId): IAgentRunner {
    const runner = this.runnerStorage.get(agentId.toString());
    if (!runner) {
      throw new Error(`No runner found for agent: ${agentId.toString()}`);
    }
    return runner;
  }

  /**
   * Register a runner for an agent (for test/synthetic agents)
   *
   * Following LSP (Liskov Substitution Principle):
   * Synthetic agents created outside the normal launch flow need to register
   * their runners so clients can subscribe to them.
   *
   * Following OCP (Open/Closed Principle):
   * This method extends the system to support synthetic agents without
   * modifying existing launch logic.
   *
   * @param agentId - Agent ID
   * @param runner - Runner instance
   */
  registerRunner(agentId: AgentId, runner: IAgentRunner): void {
    this.runnerStorage.set(agentId.toString(), runner);
    this.logger.log(`Runner registered for agent: ${agentId.toString()}`);
  }
}
