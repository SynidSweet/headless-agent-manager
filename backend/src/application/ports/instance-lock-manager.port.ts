import { ProcessLock } from '@domain/value-objects/process-lock.vo';

/**
 * Instance Lock Manager Port
 * Interface for managing single-instance locks
 *
 * This port ensures only one backend instance runs at a time by:
 * - Managing PID files (or other locking mechanisms)
 * - Detecting existing running instances
 * - Cleaning up stale locks from crashed instances
 * - Terminating processes when needed
 *
 * Implementation examples:
 * - PidFileProcessManager: File-based locking using PID files
 * - RedisProcessManager: Distributed locking using Redis
 * - ConsulProcessManager: Service discovery-based locking
 */

export interface IInstanceLockManager {
  /**
   * Check if another instance is already running
   * @returns true if an instance is running, false otherwise
   */
  hasRunningInstance(): Promise<boolean>;

  /**
   * Get the current lock information if it exists
   * @returns ProcessLock if lock exists, null otherwise
   */
  getCurrentLock(): Promise<ProcessLock | null>;

  /**
   * Acquire the instance lock
   * Creates a PID file (or equivalent) with current process information
   * @throws Error if lock cannot be acquired (e.g., another instance running)
   * @returns The created lock information
   */
  acquireLock(): Promise<ProcessLock>;

  /**
   * Release the instance lock
   * Removes the PID file (or equivalent)
   * Idempotent - does not throw if lock doesn't exist
   */
  releaseLock(): Promise<void>;

  /**
   * Clean up stale locks from crashed instances
   * A lock is stale if the process referenced by the PID is not running
   * @returns true if a stale lock was cleaned up, false otherwise
   */
  cleanupStaleLock(): Promise<boolean>;

  /**
   * Terminate a process by PID
   * @param pid - Process ID to terminate
   * @param signal - Signal to send (default: SIGTERM)
   * @throws Error if process cannot be terminated
   */
  terminateProcess(pid: number, signal?: NodeJS.Signals): Promise<void>;
}
