import { Controller, Get } from '@nestjs/common';
import { ApplicationLifecycleService } from '@application/services/application-lifecycle.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { HealthCheckDto } from '@application/dto/health-check.dto';

/**
 * Health Controller
 * Provides health check endpoint for monitoring
 * Base path: /api/health (global prefix applied)
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly lifecycle: ApplicationLifecycleService,
    private readonly orchestration: AgentOrchestrationService,
  ) {}

  /**
   * Get system health status
   * GET /health
   *
   * Returns instance metadata, agent counts, and database status
   */
  @Get()
  async getHealth(): Promise<HealthCheckDto> {
    const metadata = this.lifecycle.getInstanceMetadata();
    const agents = await this.orchestration.listAllAgents();
    const activeAgents = agents.filter((a) => a.isRunning()).length;

    return {
      status: 'ok',
      pid: metadata.getPid(),
      uptime: metadata.getUptime(),
      memoryUsage: metadata.getMemoryUsage(),
      activeAgents,
      totalAgents: agents.length,
      databaseStatus: metadata.getDatabaseStatus(),
      startedAt: metadata.getStartedAt(),
      timestamp: new Date(),
      port: metadata.getPort(),
      nodeVersion: metadata.getNodeVersion(),
      instanceId: metadata.getInstanceId(),
    };
  }
}
