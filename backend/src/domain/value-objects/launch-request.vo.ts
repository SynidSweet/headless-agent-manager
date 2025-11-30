import { randomUUID } from 'crypto';
import { AgentType } from './agent-type.vo';
import { AgentConfiguration } from './session.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

/**
 * Data required to create a LaunchRequest
 */
export interface CreateLaunchRequestData {
  agentType: AgentType;
  prompt: string;
  instructions?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  configuration?: Partial<AgentConfiguration>;
}

/**
 * LaunchRequest Value Object
 * Represents a request to launch an agent with optional custom instructions.
 * Immutable and self-validating.
 *
 * This value object is queued and processed sequentially to prevent
 * file conflicts when manipulating CLAUDE.md files for custom instructions.
 */
export class LaunchRequest {
  private static readonly MAX_INSTRUCTIONS_LENGTH = 100000;

  readonly id!: string;
  readonly agentType!: AgentType;
  readonly prompt!: string;
  readonly instructions?: string;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly configuration?: Partial<AgentConfiguration>;

  private constructor(
    id: string,
    agentType: AgentType,
    prompt: string,
    instructions?: string,
    sessionId?: string,
    metadata?: Record<string, unknown>,
    configuration?: Partial<AgentConfiguration>,
  ) {
    // Use Object.defineProperty to make properties truly readonly and immutable
    Object.defineProperty(this, 'id', { value: id, writable: false, configurable: false });
    Object.defineProperty(this, 'agentType', { value: agentType, writable: false, configurable: false });
    Object.defineProperty(this, 'prompt', { value: prompt, writable: false, configurable: false });
    Object.defineProperty(this, 'instructions', { value: instructions, writable: false, configurable: false });
    Object.defineProperty(this, 'sessionId', { value: sessionId, writable: false, configurable: false });
    Object.defineProperty(this, 'metadata', { value: metadata, writable: false, configurable: false });
    Object.defineProperty(this, 'configuration', { value: configuration, writable: false, configurable: false });
  }

  /**
   * Create a new launch request
   * @param data - Launch request data
   * @throws DomainException if validation fails
   */
  static create(data: CreateLaunchRequestData): LaunchRequest {
    // Validate prompt
    const trimmedPrompt = data.prompt.trim();
    if (!trimmedPrompt || trimmedPrompt.length === 0) {
      throw new DomainException('Prompt cannot be empty');
    }

    // Validate instructions length (if provided)
    if (data.instructions && data.instructions.length > this.MAX_INSTRUCTIONS_LENGTH) {
      throw new DomainException(
        `Instructions exceed maximum length of ${this.MAX_INSTRUCTIONS_LENGTH} characters`
      );
    }

    // Generate unique ID for this request
    const id = randomUUID();

    return new LaunchRequest(
      id,
      data.agentType,
      trimmedPrompt,
      data.instructions,
      data.sessionId,
      data.metadata,
      data.configuration,
    );
  }

  /**
   * Check if this request has custom instructions
   * @returns true if instructions are provided and non-empty
   */
  hasInstructions(): boolean {
    return !!this.instructions && this.instructions.trim().length > 0;
  }

  /**
   * Convert to AgentConfiguration for use in Session
   * Merges instructions and metadata with existing configuration
   * @returns AgentConfiguration with all settings
   */
  toConfiguration(): AgentConfiguration {
    return {
      ...this.configuration,
      sessionId: this.sessionId,
      instructions: this.instructions,
      metadata: this.metadata,
    };
  }
}
