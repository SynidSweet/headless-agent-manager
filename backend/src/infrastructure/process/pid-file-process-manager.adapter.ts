/**
 * PID File Process Manager
 *
 * File-based implementation of IInstanceLockManager
 *
 * Features:
 * - Creates PID file on lock acquisition
 * - Reads PID file to check for running instances
 * - Cleans up stale locks from crashed processes
 * - Idempotent lock release
 *
 * PID File Format:
 * ```json
 * {
 *   "pid": 12345,
 *   "startedAt": "2025-11-27T20:00:00.000Z",
 *   "port": 3000,
 *   "nodeVersion": "v18.17.0"
 * }
 * ```
 */

import { Injectable, Inject } from '@nestjs/common';
import { IInstanceLockManager } from '@application/ports/instance-lock-manager.port';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';
import { IFileSystem } from '@application/ports/filesystem.port';
import { ProcessUtils } from './process.utils';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PidFileProcessManager implements IInstanceLockManager {
  constructor(
    @Inject('PID_FILE_PATH') private readonly pidFilePath: string,
    @Inject('IFileSystem') private readonly fileSystem: IFileSystem,
    private readonly processUtils: ProcessUtils,
    @Inject('ILogger') private readonly logger: Logger,
    private readonly configService: ConfigService
  ) {}

  /**
   * Check if another instance is already running
   */
  async hasRunningInstance(): Promise<boolean> {
    // Check if PID file exists
    if (!(await this.fileSystem.exists(this.pidFilePath))) {
      return false;
    }

    // Get the lock information
    const lock = await this.getCurrentLock();
    if (!lock) {
      return false;
    }

    // Check if the process is still running
    return this.processUtils.isProcessRunning(lock.getPid());
  }

  /**
   * Get the current lock information if it exists
   */
  async getCurrentLock(): Promise<ProcessLock | null> {
    try {
      const content = await this.fileSystem.readFile(this.pidFilePath);
      return ProcessLock.fromFile(content);
    } catch {
      return null;
    }
  }

  /**
   * Acquire the instance lock
   */
  async acquireLock(): Promise<ProcessLock> {
    const port = parseInt(this.configService.get<string>('PORT') || '3000', 10);

    const lock = ProcessLock.create({
      pid: process.pid,
      startedAt: new Date(),
      port,
      nodeVersion: process.version,
      instanceId: `instance-${process.pid}-${Date.now()}`,
    });

    // Write lock to file
    const lockContent = lock.toJSON();
    await this.fileSystem.writeFile(this.pidFilePath, lockContent);

    this.logger.log?.(`Instance lock acquired: PID ${lock.getPid()}`);

    return lock;
  }

  /**
   * Release the instance lock
   */
  async releaseLock(): Promise<void> {
    await this.fileSystem.deleteFile(this.pidFilePath);
    this.logger.log?.('Instance lock released');
  }

  /**
   * Clean up stale locks from crashed instances
   */
  async cleanupStaleLock(): Promise<boolean> {
    const lock = await this.getCurrentLock();
    if (!lock) {
      return false;
    }

    // Check if the process is stale (not running)
    if (!this.processUtils.isProcessRunning(lock.getPid())) {
      this.logger.warn?.(
        `Removing stale PID file (PID: ${lock.getPid()}, started: ${lock.getStartedAt()})`
      );
      await this.releaseLock();
      return true;
    }

    return false;
  }

  /**
   * Terminate a process by PID
   */
  async terminateProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    process.kill(pid, signal);
  }
}
