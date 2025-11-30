import { randomUUID } from 'crypto';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

/**
 * Process state status values
 */
export type ProcessStatus = 'starting' | 'running' | 'stopping' | 'stopped';

/**
 * ProcessState Entity
 * Represents the state of a backend process instance.
 * Enforces valid state transitions and lifecycle management.
 */
export class ProcessState {
  private readonly _instanceId: string;
  private readonly _lock: ProcessLock;
  private _status: ProcessStatus;

  private constructor(instanceId: string, lock: ProcessLock, status: ProcessStatus) {
    this._instanceId = instanceId;
    this._lock = lock;
    this._status = status;
  }

  /**
   * Create a new ProcessState
   * @param lock - Process lock with PID and metadata
   * @returns New ProcessState in 'starting' status
   */
  static create(lock: ProcessLock): ProcessState {
    const instanceId = randomUUID();
    return new ProcessState(instanceId, lock, 'starting');
  }

  /**
   * Mark process as running
   * Valid transition: starting → running
   * @throws DomainException if not in 'starting' state
   */
  markAsRunning(): void {
    if (this._status !== 'starting') {
      throw new DomainException(
        `Invalid state transition: cannot transition from '${this._status}' to 'running'`
      );
    }
    this._status = 'running';
  }

  /**
   * Mark process as stopping
   * Valid transition: running → stopping
   * @throws DomainException if not in 'running' state
   */
  markAsStopping(): void {
    if (this._status !== 'running') {
      throw new DomainException(
        `Invalid state transition: cannot transition from '${this._status}' to 'stopping'`
      );
    }
    this._status = 'stopping';
  }

  /**
   * Mark process as stopped
   * Valid transition: stopping → stopped
   * @throws DomainException if not in 'stopping' state
   */
  markAsStopped(): void {
    if (this._status !== 'stopping') {
      throw new DomainException(
        `Invalid state transition: cannot transition from '${this._status}' to 'stopped'`
      );
    }
    this._status = 'stopped';
  }

  // Getters for readonly access
  getInstanceId(): string {
    return this._instanceId;
  }

  getLock(): ProcessLock {
    return this._lock;
  }

  getStatus(): ProcessStatus {
    return this._status;
  }
}
