import { ProcessState } from '@domain/entities/process-state.entity';

/**
 * Memory usage information
 */
export interface MemoryUsage {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Database connection status
 */
export type DatabaseStatus = 'connected' | 'disconnected';

/**
 * InstanceMetadata Value Object
 * Represents runtime metadata about a backend instance.
 * Immutable snapshot of process state.
 */
export class InstanceMetadata {
  private readonly pid: number;
  private readonly uptime: number;
  private readonly memoryUsage: MemoryUsage;
  private readonly activeAgents: number;
  private readonly databaseStatus: DatabaseStatus;
  private readonly startedAt: Date;
  private readonly port: number;
  private readonly nodeVersion: string;
  private readonly instanceId: string;

  private constructor(
    pid: number,
    uptime: number,
    memoryUsage: MemoryUsage,
    activeAgents: number,
    databaseStatus: DatabaseStatus,
    startedAt: Date,
    port: number,
    nodeVersion: string,
    instanceId: string
  ) {
    this.pid = pid;
    this.uptime = uptime;
    this.memoryUsage = memoryUsage;
    this.activeAgents = activeAgents;
    this.databaseStatus = databaseStatus;
    this.startedAt = startedAt;
    this.port = port;
    this.nodeVersion = nodeVersion;
    this.instanceId = instanceId;
  }

  /**
   * Create InstanceMetadata from ProcessState
   * @param state - Current process state
   * @param uptime - Uptime in seconds
   * @param databaseStatus - Database connection status
   * @param activeAgents - Number of active agents (default: 0)
   * @returns New InstanceMetadata instance
   */
  static fromProcess(
    state: ProcessState,
    uptime: number,
    databaseStatus: DatabaseStatus,
    activeAgents: number = 0
  ): InstanceMetadata {
    const lock = state.getLock();

    // Get current memory usage
    const memUsage = process.memoryUsage();
    const memoryUsage: MemoryUsage = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };

    return new InstanceMetadata(
      lock.getPid(),
      uptime,
      memoryUsage,
      activeAgents,
      databaseStatus,
      lock.getStartedAt(),
      lock.getPort(),
      lock.getNodeVersion(),
      lock.getInstanceId()
    );
  }

  // Getters for readonly access
  getPid(): number {
    return this.pid;
  }

  getUptime(): number {
    return this.uptime;
  }

  getMemoryUsage(): MemoryUsage {
    return this.memoryUsage;
  }

  getActiveAgents(): number {
    return this.activeAgents;
  }

  getDatabaseStatus(): DatabaseStatus {
    return this.databaseStatus;
  }

  getStartedAt(): Date {
    return this.startedAt;
  }

  getPort(): number {
    return this.port;
  }

  getNodeVersion(): string {
    return this.nodeVersion;
  }

  getInstanceId(): string {
    return this.instanceId;
  }
}
