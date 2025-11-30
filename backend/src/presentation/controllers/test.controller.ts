import { Controller, Post, Get, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
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
   * Debug: Query messages directly using backend's database connection
   * GET /test/debug-messages
   */
  @Get('debug-messages')
  debugMessages(): any {
    const database = this.db.getDatabase();

    // Force WAL checkpoint before reading
    database.pragma('wal_checkpoint(FULL)');

    const totalCount = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as { c: number };
    const messages = database.prepare('SELECT id, agent_id, sequence_number, type, substr(content, 1, 40) as content FROM agent_messages LIMIT 10').all();

    return {
      totalCount: totalCount.c,
      inTransaction: database.inTransaction,
      messages,
      walCheckpoint: 'FULL',
    };
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
    // Pre-generate agent ID for configuration
    const agentId = AgentId.generate();

    // Configure synthetic adapter with schedule BEFORE creating session
    // This allows start() to find the configuration
    this.syntheticAdapter.configure(agentId, {
      schedule: dto.schedule,
    });

    const session = Session.create(dto.prompt, {
      sessionId: agentId.toString(),
      outputFormat: 'stream-json',
    });

    // **FIX**: Save to database BEFORE starting agent
    // This ensures the agent record exists when messages start arriving
    // Prevents FOREIGN KEY constraint failures on agent_messages.agent_id
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

    // Start synthetic agent (emits events on schedule)
    // Now conforms to IAgentRunner interface - creates and returns Agent
    const agent = await this.syntheticAdapter.start(session);

    // Register runner with orchestration service (LSP - synthetic agents work like regular agents)
    // This allows clients to subscribe to synthetic agents for message events
    this.orchestrationService.registerRunner(agent.id, this.syntheticAdapter);

    // **CRITICAL FIX**: Auto-subscribe via StreamingService (like AgentOrchestrationService does)
    // This ensures messages are persisted to database even if no WebSocket clients are connected
    // Use 'system-test-controller' as client ID to indicate this is test controller initiated
    this.streamingService.subscribeToAgent(agent.id, 'system-test-controller', this.syntheticAdapter);
    this.logger.log(`Auto-subscribed to synthetic agent ${agent.id.toString()} for message persistence`);

    this.logger.log(
      `Synthetic agent ${agent.id.toString()} launched with ${dto.schedule.length} scheduled events`
    );

    // EVENT-DRIVEN: Emit agent:created event to all WebSocket clients
    this.logger.log(`[DEBUG] About to emit agent:created for ${agent.id.toString()}`);
    this.logger.log(`[DEBUG] Gateway available: ${!!this.gateway}`);

    try {
      this.gateway.emitToAll('agent:created', {
        agent: {
          id: agent.id.toString(),
          type: 'synthetic',
          status: 'running',
          session: {
            id: agent.session.id,
            prompt: agent.session.prompt,
            messageCount: 0
          },
          createdAt: agent.createdAt.toISOString(),
          startedAt: agent.startedAt?.toISOString() || null,
          completedAt: null
        },
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`[DEBUG] ✅ agent:created emitted successfully for ${agent.id.toString()}`);
    } catch (error) {
      this.logger.error(`[DEBUG] ❌ Failed to emit agent:created:`, error);
      throw error;
    }

    return {
      agentId: agent.id.toString(),
      status: agent.status.toString(),
      createdAt: agent.createdAt.toISOString(),
    };
  }

  /**
   * REMOVED: createObserver() method
   *
   * **WHY**: This was causing duplicate message emissions!
   *
   * **OLD BUGGY FLOW**:
   * 1. TestController.createObserver() → Creates observer and subscribes
   * 2. Client subscribes via WebSocket → StreamingService.createObserver() → Creates ANOTHER observer
   * 3. Result: Every message emitted TWICE (once to each observer)
   *
   * **NEW CORRECT FLOW**:
   * 1. TestController calls streamingService.subscribeToAgent() (line 138)
   * 2. StreamingService creates THE ONLY observer and subscribes
   * 3. Result: Every message emitted ONCE
   *
   * StreamingService handles all observer creation and event routing.
   */
}
