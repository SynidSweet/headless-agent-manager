import { Controller, Post, Get, Body, HttpCode, HttpStatus, Logger, Inject } from '@nestjs/common';
import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import {
  SyntheticAgentAdapter,
  SyntheticEvent,
} from '@infrastructure/adapters/synthetic-agent.adapter';
import { StreamingService } from '@application/services/streaming.service';
import { AgentGateway } from '@application/gateways/agent.gateway';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { Session } from '@domain/value-objects/session.vo';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { AgentResponseDto } from '@application/dto';

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
    private readonly gateway: AgentGateway,
    @Inject('IAgentRepository') private readonly agentRepository: IAgentRepository
  ) {}

  /**
   * Reset database (clear all data)
   * POST /test/reset-database
   * WARNING: Only use in testing!
   *
   * Complete cleanup procedure:
   * 1. Get count before deletion
   * 2. Clean up subscriptions and rooms for each agent
   * 3. Truncate all tables
   * 4. Verify deletion succeeded
   *
   * @returns Object with success status and deleted count
   * @throws Error if deletion verification fails
   */
  @Post('reset-database')
  @HttpCode(HttpStatus.OK)
  async resetDatabase(): Promise<{ success: boolean; deletedCount: number }> {
    // 1. Get count before deletion
    const beforeCount = this.db.countTable('agents');
    this.logger.log(`[TestController] Resetting database (${beforeCount} agents to delete)`);

    // 2. Get all agents for cleanup
    const agents = await this.agentRepository.findAll();

    // 3. Clean up subscriptions and rooms for each agent
    for (const agent of agents) {
      this.streamingService.unsubscribeAllForAgent(agent.id);
      await this.gateway.cleanupAgentRooms(agent.id);
    }

    // 4. Truncate all tables (faster than DELETE, ensures clean state)
    this.db.truncateTable('agent_messages'); // Delete messages first (FK constraint)
    this.db.truncateTable('agents');

    // 5. Verify deletion succeeded
    const afterCount = this.db.countTable('agents');
    if (afterCount !== 0) {
      throw new Error(`Reset failed: ${afterCount} agents remain`);
    }

    this.logger.log(`[TestController] Database reset complete - ${beforeCount} agents deleted`);

    return {
      success: true,
      deletedCount: beforeCount,
    };
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

    const totalCount = database.prepare('SELECT COUNT(*) as c FROM agent_messages').get() as {
      c: number;
    };
    const messages = database
      .prepare(
        'SELECT id, agent_id, sequence_number, type, substr(content, 1, 40) as content FROM agent_messages LIMIT 10'
      )
      .all();

    return {
      totalCount: totalCount.c,
      inTransaction: database.inTransaction,
      messages,
      walCheckpoint: 'FULL',
    };
  }

  /**
   * Get cleanup status
   * GET /test/cleanup-status
   *
   * Returns whether the system is in a clean state (no agents).
   * Useful for E2E tests to verify cleanup completed successfully.
   */
  @Get('cleanup-status')
  async getCleanupStatus(): Promise<{
    isClean: boolean;
    agentCount: number;
  }> {
    const agents = await this.agentRepository.findAll();

    return {
      isClean: agents.length === 0,
      agentCount: agents.length,
    };
  }

  /**
   * Verify clean state (comprehensive check)
   * GET /test/verify-clean-state
   *
   * Returns detailed information about database state including:
   * - Whether the system is clean (no agents, no messages)
   * - List of specific issues if not clean
   * - Agent count
   * - Message count
   *
   * This is more comprehensive than cleanup-status and includes
   * actionable information for debugging test isolation issues.
   */
  @Get('verify-clean-state')
  async verifyCleanState(): Promise<{
    isClean: boolean;
    issues: string[];
    agentCount: number;
    messageCount: number;
  }> {
    const agents = await this.agentRepository.findAll();
    const messageCount = this.db.countTable('agent_messages');

    const issues: string[] = [];

    if (agents.length > 0) {
      const agentList = agents
        .map((a) => `${a.id.toString()} [${a.status.toString()}]`)
        .join(', ');
      issues.push(`${agents.length} agents exist: ${agentList}`);
    }

    if (messageCount > 0) {
      issues.push(`${messageCount} messages exist`);
    }

    return {
      isClean: issues.length === 0,
      issues,
      agentCount: agents.length,
      messageCount,
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
    this.streamingService.subscribeToAgent(
      agent.id,
      'system-test-controller',
      this.syntheticAdapter
    );
    this.logger.log(
      `Auto-subscribed to synthetic agent ${agent.id.toString()} for message persistence`
    );

    this.logger.log(
      `Synthetic agent ${agent.id.toString()} launched with ${dto.schedule.length} scheduled events`
    );

    // EVENT-DRIVEN: Emit agent:created event to all WebSocket clients
    // **FIX**: Use AgentResponseDto.fromAgent() for consistency with AgentController
    // This ensures the payload structure matches what clients expect
    this.gateway.emitToAll('agent:created', {
      agent: AgentResponseDto.fromAgent(agent),
      timestamp: new Date().toISOString(),
    });

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
