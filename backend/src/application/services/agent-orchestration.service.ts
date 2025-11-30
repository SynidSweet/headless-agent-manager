import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';
import { LaunchRequest } from '@domain/value-objects/launch-request.vo';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { IAgentLaunchQueue } from '@application/ports/agent-launch-queue.port';
import { IInstructionHandler, ClaudeFileBackup } from '@application/ports/instruction-handler.port';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';
import { StreamingService } from './streaming.service';

/**
 * Agent Orchestration Service
 * Coordinates agent lifecycle: launch, terminate, and query operations
 * Application layer service implementing use cases
 *
 * **UPDATED**: Now uses queue-based launch with custom instruction support
 * - Launches are serialized via IAgentLaunchQueue (one at a time)
 * - Custom instructions temporarily replace CLAUDE.md files via IInstructionHandler
 * - Auto-subscribes to launched agents via StreamingService for status persistence
 */
@Injectable()
export class AgentOrchestrationService {
  private readonly logger = new Logger(AgentOrchestrationService.name);
  private readonly runnerStorage: Map<string, IAgentRunner> = new Map();

  constructor(
    @Inject('IAgentFactory') private readonly agentFactory: IAgentFactory,
    @Inject('IAgentRepository') private readonly agentRepository: IAgentRepository,
    @Inject(forwardRef(() => StreamingService))
    private readonly streamingService: StreamingService,
    @Inject('IAgentLaunchQueue') private readonly launchQueue: IAgentLaunchQueue,
    @Inject('IInstructionHandler') private readonly instructionHandler: IInstructionHandler,
  ) {}

  /**
   * Launch a new agent (PUBLIC API - via queue)
   *
   * This is the main entry point for launching agents. It enqueues the request
   * which will be processed sequentially by the queue. This ensures only ONE
   * agent launches at a time, preventing file conflicts when using custom instructions.
   *
   * @param dto - Launch configuration (includes optional instructions)
   * @returns The created and started agent
   * @throws Error if validation fails or agent fails to start
   */
  async launchAgent(dto: LaunchAgentDto): Promise<Agent> {
    this.logger.log('Launching agent via queue', {
      type: dto.type,
      hasInstructions: !!dto.configuration?.instructions,
    });

    // Convert DTO to LaunchRequest
    const request = LaunchRequest.create({
      agentType: dto.type as AgentType,
      prompt: dto.prompt,
      instructions: dto.configuration?.instructions,
      sessionId: dto.configuration?.sessionId,
      metadata: dto.configuration?.metadata,
      configuration: dto.configuration as any, // DTO to domain type conversion
    });

    // Enqueue the request (will be processed sequentially)
    return this.launchQueue.enqueue(request);
  }

  /**
   * Launch agent directly (INTERNAL API - called by queue)
   *
   * This method performs the actual agent launch with instruction handling.
   * It is called by the queue and should NOT be called directly by external code.
   *
   * Flow:
   * 1. Prepare instruction environment (if instructions provided)
   * 2. Create and save agent entity
   * 3. Start runner
   * 4. Restore instruction environment
   * 5. Auto-subscribe for status persistence
   *
   * @param request - Launch request from queue
   * @returns The launched agent
   * @throws Error if launch fails
   */
  async launchAgentDirect(request: LaunchRequest): Promise<Agent> {
    let backup: ClaudeFileBackup | null = null;

    try {
      // Step 1: Prepare instruction environment (if needed)
      if (request.hasInstructions()) {
        this.logger.log('Preparing custom instruction environment', {
          requestId: request.id,
          instructionsLength: request.instructions?.length,
        });
        backup = await this.instructionHandler.prepareEnvironment(
          request.instructions,
        );
      }

      // Step 2: Create agent entity with full configuration
      const configuration = request.toConfiguration();
      const agent = Agent.create({
        type: request.agentType,
        prompt: request.prompt,
        configuration,
      });

      // Step 3: Save agent to database BEFORE starting runner
      // This ensures agent exists in DB before any messages are emitted
      await this.agentRepository.save(agent);
      this.logger.log('Agent created and saved', {
        agentId: agent.id.toString(),
        status: agent.status,
      });

      // Step 4: Get appropriate runner from factory
      const runner = this.agentFactory.create(agent.type);

      // Step 5: Create session with agent ID workaround
      const sessionWithAgentId = Session.create(agent.session.prompt, {
        ...agent.session.configuration,
        agentId: agent.id.toString(),
      });

      // Step 6: Start runner (will emit messages)
      const startedAgent = await runner.start(sessionWithAgentId);

      // Step 7: Update agent status to RUNNING
      if (startedAgent.id.toString() !== agent.id.toString()) {
        this.logger.warn('Runner returned different agent ID!', {
          expectedId: agent.id.toString(),
          returnedId: startedAgent.id.toString(),
        });
      }
      agent.markAsRunning();

      // Step 8: Save RUNNING status to database
      await this.agentRepository.save(agent);

      // Step 9: Store runner for this agent
      this.runnerStorage.set(agent.id.toString(), runner);

      // Step 10: Auto-subscribe via StreamingService
      this.streamingService.subscribeToAgent(agent.id, 'system-orchestrator', runner);
      this.logger.log(`Auto-subscribed to agent ${agent.id.toString()}`);

      // Step 11: Restore instruction environment (instructions now cached by Claude)
      if (backup) {
        this.logger.log('Restoring environment after agent start', {
          requestId: request.id,
        });
        await this.instructionHandler.restoreEnvironment(backup);
      }

      return agent;
    } catch (error) {
      this.logger.error('Failed to launch agent', {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // CRITICAL: Restore environment even on failure
      if (backup) {
        try {
          await this.instructionHandler.restoreEnvironment(backup);
          this.logger.log('Environment restored after error');
        } catch (restoreError) {
          this.logger.error('Failed to restore environment after error', {
            error: restoreError instanceof Error
              ? restoreError.message
              : String(restoreError),
          });
        }
      }

      throw error;
    }
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

  /**
   * Get current queue length
   * @returns Number of pending launch requests
   */
  getQueueLength(): number {
    return this.launchQueue.getQueueLength();
  }

  /**
   * Cancel a pending launch request
   * @param requestId - UUID of the launch request to cancel
   */
  cancelLaunchRequest(requestId: string): void {
    this.logger.log('Cancelling launch request', { requestId });
    this.launchQueue.cancelRequest(requestId);
  }
}
