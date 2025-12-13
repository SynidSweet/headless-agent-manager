import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { AgentMessageService } from '@application/services/agent-message.service';
import { StreamingService } from '@application/services/streaming.service';
import { AgentGateway } from '@application/gateways/agent.gateway';
import {
  LaunchAgentDto,
  AgentResponseDto,
  LaunchAgentResponseDto,
  AgentMessageDto,
} from '@application/dto';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { IAgentRepository } from '@application/ports/agent-repository.port';

/**
 * Agent Controller
 * REST API endpoints for agent management
 * Base path: /api/agents (global prefix applied)
 *
 * ARCHITECTURE: Event-Driven
 * This controller emits WebSocket events for all agent lifecycle changes:
 * - agent:created (when agent launches)
 * - agent:deleted (when agent terminates)
 * Status updates (agent:updated) are emitted by StreamingService
 */
@Controller('agents')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(
    private readonly orchestrationService: AgentOrchestrationService,
    private readonly messageService: AgentMessageService,
    private readonly gateway: AgentGateway,
    private readonly streamingService: StreamingService,
    @Inject('IAgentRepository') private readonly agentRepository: IAgentRepository
  ) {}

  /**
   * Launch a new agent
   * POST /agents
   *
   * Event-Driven: Emits 'agent:created' to all connected WebSocket clients
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async launchAgent(@Body() dto: LaunchAgentDto): Promise<LaunchAgentResponseDto> {
    try {
      const agent = await this.orchestrationService.launchAgent(dto);
      const response = LaunchAgentResponseDto.fromAgent(agent);

      // EVENT-DRIVEN: Broadcast agent creation to all clients
      this.gateway.emitToAll('agent:created', {
        agent: AgentResponseDto.fromAgent(agent),
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error) {
      if (error instanceof Error && error.message.includes('required')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  /**
   * List all agents
   * GET /agents
   */
  @Get()
  async listAllAgents(): Promise<AgentResponseDto[]> {
    const agents = await this.orchestrationService.listAllAgents();
    return AgentResponseDto.fromAgents(agents);
  }

  /**
   * List active (running) agents
   * GET /agents/active
   */
  @Get('active')
  async listActiveAgents(): Promise<AgentResponseDto[]> {
    const agents = await this.orchestrationService.listActiveAgents();
    return AgentResponseDto.fromAgents(agents);
  }

  /**
   * Get specific agent by ID
   * GET /agents/:id
   */
  @Get(':id')
  async getAgent(@Param('id') id: string): Promise<AgentResponseDto> {
    try {
      const agentId = AgentId.fromString(id);
      const agent = await this.orchestrationService.getAgentById(agentId);
      return AgentResponseDto.fromAgent(agent);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid UUID')) {
          throw new BadRequestException('Invalid agent ID format');
        }
        if (error.message.includes('not found')) {
          throw new NotFoundException(error.message);
        }
      }
      throw error;
    }
  }

  /**
   * Get agent status
   * GET /agents/:id/status
   */
  @Get(':id/status')
  async getAgentStatus(@Param('id') id: string): Promise<{ agentId: string; status: string }> {
    try {
      const agentId = AgentId.fromString(id);
      const status = await this.orchestrationService.getAgentStatus(agentId);
      return {
        agentId: id,
        status: status.toString(),
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid UUID')) {
          throw new BadRequestException('Invalid agent ID format');
        }
        if (error.message.includes('not found')) {
          throw new NotFoundException(error.message);
        }
      }
      throw error;
    }
  }

  /**
   * Get agent message history
   * GET /agents/:id/messages
   * GET /agents/:id/messages?since=N  (messages after sequence N)
   */
  @Get(':id/messages')
  async getAgentMessages(
    @Param('id') id: string,
    @Query('since') since?: string
  ): Promise<AgentMessageDto[]> {
    const fs = require('fs');
    const logFile = '/tmp/controller-debug.log';
    const log = (msg: string) =>
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);

    log(`START: getAgentMessages(${id}, since=${since})`);
    try {
      // Validate agent ID exists
      const agentId = AgentId.fromString(id);
      log(`Agent ID parsed: ${agentId.toString()}`);

      await this.orchestrationService.getAgentById(agentId);
      log('Agent exists in database');

      // Get messages
      if (since) {
        const sinceSeq = parseInt(since, 10);
        if (isNaN(sinceSeq) || sinceSeq < 0) {
          throw new BadRequestException('Invalid since parameter - must be a positive number');
        }
        log('Calling findByAgentIdSince');
        return await this.messageService.findByAgentIdSince(id, sinceSeq);
      }

      log('About to call findByAgentId');
      const result = await this.messageService.findByAgentId(id);
      log(`findByAgentId returned: ${result.length} messages`);
      return result;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid UUID')) {
          throw new BadRequestException('Invalid agent ID format');
        }
        if (error.message.includes('not found')) {
          throw new NotFoundException(error.message);
        }
      }
      throw error;
    }
  }

  /**
   * Terminate (stop) an agent
   * DELETE /agents/:id?force=true (force deletes regardless of status - for testing)
   *
   * Event-Driven: Emits 'agent:deleted' to all connected WebSocket clients
   *
   * Complete cleanup procedure:
   * 1. Terminate the agent (stop CLI process)
   * 2. Clean up all subscriptions (remove all clients)
   * 3. Clean up WebSocket rooms (remove all sockets)
   * 4. Broadcast deletion event
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateAgent(@Param('id') id: string, @Query('force') force?: string): Promise<void> {
    try {
      const agentId = AgentId.fromString(id);

      if (force === 'true') {
        // Force mode - for testing: silently succeed even if agent already completed
        try {
          // 1. Terminate agent
          await this.orchestrationService.terminateAgent(agentId);

          // 2. Clean up subscriptions (removes all clients from this agent)
          this.streamingService.unsubscribeAllForAgent(agentId);

          // 3. Clean up WebSocket rooms (removes all sockets from agent's room)
          await this.gateway.cleanupAgentRooms(agentId);

          // 4. EVENT-DRIVEN: Broadcast deletion (even in force mode)
          this.gateway.emitToAll('agent:deleted', {
            agentId: id,
            timestamp: new Date().toISOString(),
          });
        } catch (e) {
          // Silently ignore errors in force mode (agent may already be completed)
          // This allows tests to clean up all agents regardless of status
        }
      } else {
        // Normal terminate (requires running status)
        // 1. Terminate agent
        await this.orchestrationService.terminateAgent(agentId);

        // 2. Clean up subscriptions
        this.streamingService.unsubscribeAllForAgent(agentId);

        // 3. Clean up WebSocket rooms
        await this.gateway.cleanupAgentRooms(agentId);

        // 4. EVENT-DRIVEN: Broadcast deletion
        this.gateway.emitToAll('agent:deleted', {
          agentId: id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid UUID')) {
          throw new BadRequestException('Invalid agent ID format');
        }
        if (error.message.includes('not found')) {
          throw new NotFoundException(error.message);
        }
      }
      throw error;
    }
  }

  /**
   * Get queue status
   * GET /agents/queue
   *
   * Returns the current number of pending launch requests in the queue.
   * Useful for monitoring and UI feedback.
   */
  @Get('queue')
  getQueueStatus(): { queueLength: number } {
    return {
      queueLength: this.orchestrationService.getQueueLength(),
    };
  }

  /**
   * Cancel a pending launch request
   * DELETE /agents/queue/:requestId
   *
   * Cancels a launch request that is pending in the queue.
   * Has no effect if the request is already processing or completed.
   */
  @Delete('queue/:requestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelQueuedRequest(@Param('requestId') requestId: string): void {
    this.orchestrationService.cancelLaunchRequest(requestId);
  }

  /**
   * Delete an agent from the database
   * DELETE /agents/:id/delete?force=true
   *
   * This is separate from terminateAgent (which stops the process).
   * This method removes the agent record from the database.
   *
   * Safety rules:
   * - Without force: Only allows deletion of completed/terminated/failed agents
   * - With force=true: Attempts to terminate first, then deletes regardless of status
   *
   * Use force=true for test cleanup or emergency deletion.
   */
  @Delete(':id/delete')
  async deleteAgent(
    @Param('id') id: string,
    @Query('force') force?: string
  ): Promise<{ success: boolean }> {
    const agentId = AgentId.fromString(id);
    const agent = await this.agentRepository.findById(agentId);

    if (!agent) {
      throw new NotFoundException(`Agent ${id} not found`);
    }

    // FORCE DELETE: Skip all checks and attempt termination
    if (force === 'true') {
      this.logger.log(`Force deleting agent ${id} (status: ${agent.status.toString()})`);

      try {
        // Try to terminate if running, but ignore errors
        await this.orchestrationService.terminateAgent(agentId);
      } catch (error) {
        // Ignore termination errors for force delete
        this.logger.warn(`Termination failed during force delete (ignored): ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Always delete from database
      await this.agentRepository.delete(agentId);
      return { success: true };
    }

    // NORMAL DELETION: Enforce safety checks
    if (agent.status.toString() === 'running') {
      throw new BadRequestException('Cannot delete running agent. Stop it first or use force=true.');
    }

    await this.agentRepository.delete(agentId);
    return { success: true };
  }
}
