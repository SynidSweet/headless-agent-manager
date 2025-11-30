import { DomainException } from '@domain/exceptions/domain.exception';

/**
 * Agent Configuration
 * Options for configuring agent execution
 */
export interface AgentConfiguration {
  sessionId?: string;
  outputFormat?: 'stream-json' | 'json';
  customArgs?: string[];
  timeout?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  instructions?: string; // Custom instructions to temporarily replace CLAUDE.md files
  metadata?: Record<string, unknown>; // Additional metadata for tracking/context
  agentId?: string; // Workaround: Pass agent ID to runner (TODO: refactor interface)
  workingDirectory?: string; // Working directory for the agent process
}

/**
 * Session Value Object
 * Represents a conversation session with an agent.
 * Immutable and self-validating.
 */
export class Session {
  readonly prompt: string;
  readonly configuration: AgentConfiguration;
  readonly id?: string;

  private constructor(prompt: string, configuration: AgentConfiguration) {
    this.prompt = prompt;
    this.configuration = configuration;
    this.id = configuration.sessionId;
  }

  /**
   * Create a new session
   * @param prompt - The user prompt for the agent
   * @param configuration - Configuration options
   * @throws DomainException if prompt is invalid
   */
  static create(prompt: string, configuration: AgentConfiguration): Session {
    // Validate prompt
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || trimmedPrompt.length === 0) {
      throw new DomainException('Session prompt cannot be empty');
    }

    return new Session(trimmedPrompt, configuration);
  }

  /**
   * Check equality with another session
   */
  equals(other: Session): boolean {
    return (
      this.prompt === other.prompt &&
      JSON.stringify(this.configuration) === JSON.stringify(other.configuration)
    );
  }
}
