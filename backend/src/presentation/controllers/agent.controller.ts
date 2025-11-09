import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import {
  LaunchAgentDto,
  AgentResponseDto,
  LaunchAgentResponseDto,
} from '@application/dto';
import { AgentId } from '@domain/value-objects/agent-id.vo';

/**
 * Agent Controller
 * REST API endpoints for agent management
 * Base path: /api/agents (global prefix applied)
 */
@Controller('agents')
export class AgentController {
  constructor(
    private readonly orchestrationService: AgentOrchestrationService
  ) {}

  /**
   * Launch a new agent
   * POST /agents
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async launchAgent(@Body() dto: LaunchAgentDto): Promise<LaunchAgentResponseDto> {
    try {
      const agent = await this.orchestrationService.launchAgent(dto);
      return LaunchAgentResponseDto.fromAgent(agent);
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
   * Terminate (stop) an agent
   * DELETE /agents/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateAgent(@Param('id') id: string): Promise<void> {
    try {
      const agentId = AgentId.fromString(id);
      await this.orchestrationService.terminateAgent(agentId);
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
}
