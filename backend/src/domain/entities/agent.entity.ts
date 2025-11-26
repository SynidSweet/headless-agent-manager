import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session, AgentConfiguration } from '@domain/value-objects/session.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

/**
 * Data required to create an Agent
 */
export interface CreateAgentData {
  type: AgentType;
  prompt: string;
  configuration: AgentConfiguration;
}

/**
 * Agent Entity
 * Core domain entity representing an AI agent instance.
 * Enforces business rules and state transitions.
 */
export class Agent {
  private readonly _id: AgentId;
  private readonly _type: AgentType;
  private _status: AgentStatus;
  private readonly _session: Session;
  private readonly _createdAt: Date;
  private _startedAt?: Date;
  private _completedAt?: Date;
  private _error?: Error;

  private constructor(
    id: AgentId,
    type: AgentType,
    status: AgentStatus,
    session: Session,
    createdAt: Date
  ) {
    this._id = id;
    this._type = type;
    this._status = status;
    this._session = session;
    this._createdAt = createdAt;
  }

  /**
   * Create a new agent
   * @param data - Agent creation data
   * @returns New agent instance in INITIALIZING state
   * @throws DomainException if data is invalid
   */
  static create(data: CreateAgentData): Agent {
    // Validate type
    if (!data.type) {
      throw new DomainException('Agent type is required');
    }

    // Create session (will validate prompt)
    const session = Session.create(data.prompt, data.configuration);

    // Generate unique ID
    const id = AgentId.generate();

    return new Agent(id, data.type, AgentStatus.INITIALIZING, session, new Date());
  }

  /**
   * Create agent with specific ID (for testing and special cases)
   * @param id - Pre-determined agent ID
   * @param data - Agent creation data
   * @returns New agent instance in INITIALIZING state
   * @throws DomainException if data is invalid
   */
  static createWithId(id: AgentId, data: CreateAgentData): Agent {
    // Validate type
    if (!data.type) {
      throw new DomainException('Agent type is required');
    }

    // Create session (will validate prompt)
    const session = Session.create(data.prompt, data.configuration);

    return new Agent(id, data.type, AgentStatus.INITIALIZING, session, new Date());
  }

  /**
   * Mark agent as running
   * Transitions from INITIALIZING to RUNNING
   * @throws DomainException if not in INITIALIZING state
   */
  markAsRunning(): void {
    if (this._status !== AgentStatus.INITIALIZING) {
      throw new DomainException('Agent must be initializing to start');
    }

    this._status = AgentStatus.RUNNING;
    this._startedAt = new Date();
  }

  /**
   * Mark agent as completed successfully
   * Transitions from RUNNING to COMPLETED
   * @throws DomainException if not in RUNNING state
   */
  markAsCompleted(): void {
    if (this._status !== AgentStatus.RUNNING) {
      throw new DomainException('Agent must be running to complete');
    }

    this._status = AgentStatus.COMPLETED;
    this._completedAt = new Date();
  }

  /**
   * Mark agent as failed
   * Can transition from INITIALIZING or RUNNING to FAILED
   * @param error - The error that caused the failure
   */
  markAsFailed(error: Error): void {
    this._status = AgentStatus.FAILED;
    this._error = error;
    this._completedAt = new Date();
  }

  /**
   * Mark agent as terminated
   * Transitions from RUNNING to TERMINATED
   * @throws DomainException if not in RUNNING state
   */
  markAsTerminated(): void {
    if (this._status !== AgentStatus.RUNNING) {
      throw new DomainException('Agent must be running to terminate');
    }

    this._status = AgentStatus.TERMINATED;
    this._completedAt = new Date();
  }

  /**
   * Mark agent as paused
   * Transitions from RUNNING to PAUSED
   * @throws DomainException if not in RUNNING state
   */
  markAsPaused(): void {
    if (this._status !== AgentStatus.RUNNING) {
      throw new DomainException('Agent must be running to pause');
    }

    this._status = AgentStatus.PAUSED;
  }

  /**
   * Resume paused agent
   * Transitions from PAUSED to RUNNING
   * @throws DomainException if not in PAUSED state
   */
  resume(): void {
    if (this._status !== AgentStatus.PAUSED) {
      throw new DomainException('Agent must be paused to resume');
    }

    this._status = AgentStatus.RUNNING;
  }

  /**
   * Check if agent is currently running
   */
  isRunning(): boolean {
    return this._status === AgentStatus.RUNNING;
  }

  /**
   * Check if agent has completed successfully
   */
  isCompleted(): boolean {
    return this._status === AgentStatus.COMPLETED;
  }

  /**
   * Check if agent has failed
   */
  isFailed(): boolean {
    return this._status === AgentStatus.FAILED;
  }

  // Getters for readonly access
  get id(): AgentId {
    return this._id;
  }

  get type(): AgentType {
    return this._type;
  }

  get status(): AgentStatus {
    return this._status;
  }

  get session(): Session {
    return this._session;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get startedAt(): Date | undefined {
    return this._startedAt;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  get error(): Error | undefined {
    return this._error;
  }
}
