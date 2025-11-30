import { Injectable, Inject, Logger } from '@nestjs/common';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { IInstanceLockManager } from '@application/ports/instance-lock-manager.port';
import { InstanceAlreadyRunningError } from '@domain/exceptions/instance-already-running.exception';
import { InstanceMetadata, DatabaseStatus } from '@domain/value-objects/instance-metadata.vo';
import { ProcessState } from '@domain/entities/process-state.entity';

/**
 * Application Lifecycle Service
 * Manages the startup and shutdown lifecycle of the backend application.
 * Ensures single instance operation through process locking.
 *
 * **Responsibilities:**
 * - Startup: Check for existing instances, clean stale locks, acquire lock
 * - Shutdown: Stop agents, close database, release lock (in that order)
 * - Metadata: Provide runtime information about the instance
 *
 * **Following SOLID Principles:**
 * - SRP: Only manages application lifecycle (not agent or database logic)
 * - DIP: Depends on abstractions (IInstanceLockManager, not concrete implementations)
 * - OCP: Extensible through interface implementations
 */
@Injectable()
export class ApplicationLifecycleService {
  private processState: ProcessState | null = null;

  constructor(
    @Inject('IInstanceLockManager') private readonly lockManager: IInstanceLockManager,
    private readonly orchestration: AgentOrchestrationService,
    private readonly database: DatabaseService,
    @Inject('ILogger') private readonly logger: Logger,
  ) {}

  /**
   * Startup the application instance
   * Checks for existing instances and acquires lock
   *
   * @throws InstanceAlreadyRunningError if another instance is running
   * @throws Error if lock cannot be acquired (file system errors, etc.)
   */
  async startup(): Promise<void> {
    this.logger.log('Checking for existing instance...');

    // Check if another instance is already running
    if (await this.lockManager.hasRunningInstance()) {
      const lock = await this.lockManager.getCurrentLock();
      if (lock) {
        throw new InstanceAlreadyRunningError(lock);
      }
    }

    // Clean up stale locks from crashed instances
    const cleaned = await this.lockManager.cleanupStaleLock();
    if (cleaned) {
      this.logger.warn('Removed stale PID file from crashed instance');
    }

    // Acquire the instance lock
    const lock = await this.lockManager.acquireLock();
    this.logger.log('Instance lock acquired', {
      pid: lock.getPid(),
      port: lock.getPort(),
      instanceId: lock.getInstanceId(),
    });

    // Store process state for metadata queries
    this.processState = ProcessState.create(lock);
  }

  /**
   * Shutdown the application instance gracefully
   * Stops all agents, closes database, and releases lock
   *
   * **Error Handling:**
   * - Continues shutdown even if agent stop fails
   * - Continues shutdown even if database close fails
   * - ALWAYS releases lock (critical for restart)
   */
  async shutdown(): Promise<void> {
    this.logger.log('Graceful shutdown initiated');

    // Step 1: Stop all active agents
    try {
      const agents = await this.orchestration.listActiveAgents();
      this.logger.log(`Stopping ${agents.length} active agents`);

      for (const agent of agents) {
        try {
          await this.orchestration.terminateAgent(agent.id);
        } catch (error) {
          // Continue shutdown even if agent stop fails
          this.logger.warn('Failed to stop agent', {
            agentId: agent.id.toString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      // Continue shutdown even if listing agents fails
      this.logger.warn('Failed to list agents during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 2: Close database connection
    try {
      this.database.close();
      this.logger.log('Database connection closed');
    } catch (error) {
      // Continue shutdown even if database close fails
      this.logger.warn('Failed to close database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 3: Release lock (CRITICAL - must always happen)
    try {
      await this.lockManager.releaseLock();
      this.logger.log('Instance lock released');
    } catch (error) {
      // Log but don't throw - lock release is best-effort
      this.logger.warn('Failed to release lock', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get current instance metadata
   * Returns runtime information about the running instance
   *
   * NOTE: Active agent count is always 0 in this synchronous method.
   * To get real-time agent counts, the orchestration service would need to
   * maintain a cached count or this method would need to be async.
   * This is a known limitation of the MVP implementation.
   *
   * @returns InstanceMetadata with PID, uptime, memory, etc.
   */
  getInstanceMetadata(): InstanceMetadata {
    if (!this.processState) {
      throw new Error('Instance not started. Call startup() first.');
    }

    // Get uptime from process
    const uptime = process.uptime();

    // Get database status
    const databaseStatus: DatabaseStatus = this.database.isConnected()
      ? 'connected'
      : 'disconnected';

    // Agent count is 0 - see note above about synchronous limitations
    const activeAgents = 0;

    // Create metadata from process state
    return InstanceMetadata.fromProcess(
      this.processState,
      uptime,
      databaseStatus,
      activeAgents
    );
  }
}
