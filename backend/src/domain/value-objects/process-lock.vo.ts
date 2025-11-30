import { DomainException } from '@domain/exceptions/domain.exception';

/**
 * Data required to create a ProcessLock
 */
export interface ProcessLockData {
  pid: number;
  startedAt: Date;
  port: number;
  nodeVersion: string;
  instanceId: string;
}

/**
 * ProcessLock Value Object
 * Represents a process lock with metadata about the running instance.
 * Immutable and self-validating.
 */
export class ProcessLock {
  private readonly pid: number;
  private readonly startedAt: Date;
  private readonly port: number;
  private readonly nodeVersion: string;
  private readonly instanceId: string;

  private constructor(data: ProcessLockData) {
    this.pid = data.pid;
    this.startedAt = data.startedAt;
    this.port = data.port;
    this.nodeVersion = data.nodeVersion;
    this.instanceId = data.instanceId;
  }

  /**
   * Create a new ProcessLock
   * @param data - Process lock data
   * @returns New ProcessLock instance
   * @throws DomainException if data is invalid
   */
  static create(data: ProcessLockData): ProcessLock {
    // Validate PID is positive
    if (!data.pid || data.pid <= 0) {
      throw new DomainException('PID must be a positive number');
    }

    // Validate port is in valid range
    if (!data.port || data.port < 1 || data.port > 65535) {
      throw new DomainException('Port must be between 1 and 65535');
    }

    // Validate required fields
    if (!data.nodeVersion) {
      throw new DomainException('Node version is required');
    }

    if (!data.instanceId) {
      throw new DomainException('Instance ID is required');
    }

    if (!data.startedAt) {
      throw new DomainException('Started at timestamp is required');
    }

    return new ProcessLock(data);
  }

  /**
   * Create ProcessLock from PID file content
   * @param content - JSON string from PID file
   * @returns ProcessLock instance
   * @throws DomainException if content is invalid
   */
  static fromFile(content: string): ProcessLock {
    try {
      const parsed = JSON.parse(content);

      // Validate required fields exist
      if (!parsed.pid) {
        throw new DomainException('PID file missing required field: pid');
      }
      if (!parsed.port) {
        throw new DomainException('PID file missing required field: port');
      }
      if (!parsed.nodeVersion) {
        throw new DomainException('PID file missing required field: nodeVersion');
      }
      if (!parsed.instanceId) {
        throw new DomainException('PID file missing required field: instanceId');
      }
      if (!parsed.startedAt) {
        throw new DomainException('PID file missing required field: startedAt');
      }

      return ProcessLock.create({
        pid: parsed.pid,
        startedAt: new Date(parsed.startedAt),
        port: parsed.port,
        nodeVersion: parsed.nodeVersion,
        instanceId: parsed.instanceId,
      });
    } catch (error) {
      if (error instanceof DomainException) {
        throw error;
      }
      throw new DomainException('Invalid PID file format');
    }
  }

  /**
   * Serialize to JSON string for PID file
   * @returns JSON string representation
   */
  toJSON(): string {
    return JSON.stringify({
      pid: this.pid,
      startedAt: this.startedAt.toISOString(),
      port: this.port,
      nodeVersion: this.nodeVersion,
      instanceId: this.instanceId,
    });
  }

  /**
   * Check if the process lock is stale (process no longer running)
   * @returns true if process is not running, false otherwise
   */
  isStale(): boolean {
    try {
      // Sending signal 0 checks if process exists without killing it
      process.kill(this.pid, 0);
      return false; // Process is running
    } catch (error) {
      // ESRCH = No such process
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        return true; // Process not found
      }
      // Other errors (permission, etc.) - assume process is running
      return false;
    }
  }

  /**
   * Check equality with another ProcessLock
   * Compares PID and instanceId
   */
  equals(other: ProcessLock): boolean {
    return this.pid === other.pid && this.instanceId === other.instanceId;
  }

  // Getters for readonly access
  getPid(): number {
    return this.pid;
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
