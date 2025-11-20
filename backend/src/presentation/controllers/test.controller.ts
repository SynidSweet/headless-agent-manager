import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { SyntheticAgentAdapter, SyntheticEvent } from '@infrastructure/adapters/synthetic-agent.adapter';
import { StreamingService } from '@application/services/streaming.service';
import { AgentGateway } from '@application/gateways/agent.gateway';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { Session } from '@domain/value-objects/session.vo';

/**
 * Test Controller
 * Endpoints for E2E test support (should be disabled in production)
 *
 * PHASE 4: Added synthetic agent endpoint for controllable timing in tests
 */
@Controller('test')
export class TestController {
  private readonly logger = new Logger(TestController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly orchestrationService: AgentOrchestrationService,
    private readonly syntheticAdapter: SyntheticAgentAdapter,
    private readonly streamingService: StreamingService,
    private readonly gateway: AgentGateway
  ) {}

  /**
   * Reset database (clear all data)
   * POST /test/reset-database
   * WARNING: Only use in testing!
   */
  @Post('reset-database')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetDatabase(): Promise<void> {
    const database = this.db.getDatabase();

    // Delete all data (CASCADE will handle messages)
    database.prepare('DELETE FROM agents').run();

    console.log('[TestController] Database reset - all agents deleted');
  }

  /**
   * Launch synthetic agent with controllable timing
   * POST /test/agents/synthetic
   *
   * PHASE 4: Testing Infrastructure
   *
   * Creates an agent that emits scripted events on a precise schedule.
   * Enables deterministic testing with full control over timing.
   *
   * @example
   * ```json
   * POST /test/agents/synthetic
   * {
   *   "prompt": "Test agent",
   *   "schedule": [
   *     { "delay": 1000, "type": "message", "data": { "content": "First message" } },
   *     { "delay": 2000, "type": "message", "data": { "content": "Second message" } },
   *     { "delay": 5000, "type": "complete", "data": { "success": true } }
   *   ]
   * }
   * ```
   *
   * Events will arrive at exactly 1s, 2s, and 5s - perfect for testing!
   */
  @Post('agents/synthetic')
  @HttpCode(HttpStatus.CREATED)
  async launchSyntheticAgent(
    @Body() dto: { prompt: string; schedule: SyntheticEvent[] }
  ): Promise<{ agentId: string; status: string; createdAt: string }> {
    // Create agent manually (bypass normal launch flow)
    const agentId = AgentId.generate();
    const session = Session.create(dto.prompt, {
      sessionId: agentId.toString(),
      outputFormat: 'stream-json',
    });

    // Configure synthetic adapter with schedule
    this.syntheticAdapter.configure(agentId, {
      schedule: dto.schedule,
    });

    // Create observer and subscribe streaming service
    const observer = this.createObserver(agentId);
    this.syntheticAdapter.subscribe(agentId, observer);

    // Register runner with orchestration service (LSP - synthetic agents work like regular agents)
    // This allows clients to subscribe to synthetic agents for message events
    this.orchestrationService.registerRunner(agentId, this.syntheticAdapter);

    // Start synthetic agent (emits events on schedule)
    await this.syntheticAdapter.start(session, agentId);

    // Save to database (minimal agent record)
    const database = this.db.getDatabase();
    database
      .prepare(
        `INSERT INTO agents (id, type, status, prompt, created_at, started_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        agentId.toString(),
        'synthetic', // Special type for synthetic agents
        'running',
        dto.prompt,
        new Date().toISOString(),
        new Date().toISOString()
      );

    this.logger.log(
      `Synthetic agent ${agentId.toString()} launched with ${dto.schedule.length} scheduled events`
    );

    // EVENT-DRIVEN: Emit agent:created event to all WebSocket clients
    this.logger.log(`[DEBUG] About to emit agent:created for ${agentId.toString()}`);
    this.logger.log(`[DEBUG] Gateway available: ${!!this.gateway}`);

    try {
      this.gateway.emitToAll('agent:created', {
        agent: {
          id: agentId.toString(),
          type: 'synthetic',
          status: 'running',
          session: {
            id: '',
            prompt: dto.prompt,
            messageCount: 0
          },
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: null
        },
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`[DEBUG] ✅ agent:created emitted successfully for ${agentId.toString()}`);
    } catch (error) {
      this.logger.error(`[DEBUG] ❌ Failed to emit agent:created:`, error);
      throw error;
    }

    return {
      agentId: agentId.toString(),
      status: 'running',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create observer for synthetic agent
   * Routes events to streaming service (which broadcasts via WebSocket)
   */
  private createObserver(agentId: AgentId): any {
    return {
      onMessage: (message: any) => {
        this.streamingService.broadcastMessage(agentId, message).catch((err) => {
          this.logger.error('Error broadcasting synthetic message:', err);
        });
      },
      onStatusChange: (status: any) => {
        this.streamingService.broadcastStatusChange(agentId, status);
      },
      onError: (error: Error) => {
        this.streamingService.broadcastError(agentId, error);
      },
      onComplete: (result: any) => {
        this.streamingService.broadcastComplete(agentId, result);

        // Update agent status in database
        const database = this.db.getDatabase();
        database
          .prepare('UPDATE agents SET status = ?, completed_at = ? WHERE id = ?')
          .run('completed', new Date().toISOString(), agentId.toString());
      },
    };
  }
}
