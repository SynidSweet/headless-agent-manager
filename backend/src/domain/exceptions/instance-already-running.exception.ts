import { ProcessLock } from '@domain/value-objects/process-lock.vo';

/**
 * Exception thrown when attempting to start a backend instance
 * but another instance is already running.
 */
export class InstanceAlreadyRunningError extends Error {
  public readonly lock: ProcessLock;

  constructor(lock: ProcessLock) {
    super(`Backend instance already running (PID: ${lock.getPid()})`);
    this.name = 'InstanceAlreadyRunningError';
    this.lock = lock;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InstanceAlreadyRunningError);
    }
  }
}
