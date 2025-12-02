import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentConfiguration } from '@domain/value-objects/session.vo';

/**
 * Agent Configuration DTO
 * Configuration options for launching an agent
 */
export interface AgentConfigurationDto {
  /**
   * Output format for the CLI
   * @default 'stream-json'
   */
  outputFormat?: string;

  /**
   * Session ID for resuming a previous session
   * Optional for multi-turn conversations
   */
  sessionId?: string;

  /**
   * Custom instructions to temporarily replace CLAUDE.md files
   * When provided, the user-level and project-level CLAUDE.md files
   * are backed up and replaced with these instructions during agent startup.
   * Original files are restored after the agent starts.
   * @maxLength 100000
   */
  instructions?: string;

  /**
   * Custom CLI arguments
   * Optional additional flags for the CLI
   */
  customArgs?: string[];

  /**
   * Additional metadata for tracking/context
   */
  metadata?: Record<string, unknown>;

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Allowed tools
   */
  allowedTools?: string[];

  /**
   * Disallowed tools
   */
  disallowedTools?: string[];

  /**
   * Working directory for the agent process
   * Can be absolute or relative path
   */
  workingDirectory?: string;

  /**
   * Human-readable name for this conversation
   * Displayed in the UI history panel
   * @maxLength 100
   */
  conversationName?: string;

  /**
   * Claude model to use for the agent
   * @example 'claude-sonnet-4-5-20250929', 'claude-opus-4-20250514'
   * @default Uses Claude CLI default model
   */
  model?: string;
}

/**
 * Launch Agent DTO
 * Request body for launching a new agent
 */
export class LaunchAgentDto {
  /**
   * The type of agent to launch
   * Must be 'claude-code' or 'gemini-cli'
   */
  @IsString()
  @IsNotEmpty({ message: 'Agent type is required' })
  type!: string;

  /**
   * The prompt to send to the agent
   * Cannot be empty
   */
  @IsString()
  @IsNotEmpty({ message: 'Prompt is required' })
  prompt!: string;

  /**
   * Optional configuration for the agent
   */
  @IsOptional()
  @IsObject()
  configuration?: AgentConfigurationDto;

  /**
   * Validate the DTO
   * @throws Error if validation fails
   */
  validate(): void {
    if (!this.type || this.type.trim() === '') {
      throw new Error('Agent type is required');
    }

    if (!this.prompt || this.prompt.trim() === '') {
      throw new Error('Prompt is required');
    }

    // Validate agent type
    const validTypes = Object.values(AgentType) as string[];
    if (!validTypes.includes(this.type)) {
      throw new Error(`Invalid agent type: ${this.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    // Validate conversation name if provided
    if (this.configuration?.conversationName !== undefined) {
      const trimmed = this.configuration.conversationName.trim();

      if (trimmed.length === 0) {
        throw new Error('Conversation name cannot be empty');
      }

      if (trimmed.length > 100) {
        throw new Error('Conversation name must be 100 characters or less');
      }
    }
  }

  /**
   * Convert to domain AgentType
   */
  toAgentType(): AgentType {
    return this.type as AgentType;
  }

  /**
   * Convert DTO configuration to domain configuration
   */
  toAgentConfiguration(): AgentConfiguration {
    if (!this.configuration) {
      return {};
    }

    const config: AgentConfiguration = {};

    if (this.configuration.sessionId) {
      config.sessionId = this.configuration.sessionId;
    }

    if (this.configuration.outputFormat) {
      // Validate and convert output format
      if (
        this.configuration.outputFormat === 'stream-json' ||
        this.configuration.outputFormat === 'json'
      ) {
        config.outputFormat = this.configuration.outputFormat;
      }
    }

    if (this.configuration.customArgs) {
      config.customArgs = this.configuration.customArgs;
    }

    if (this.configuration.timeout) {
      config.timeout = this.configuration.timeout;
    }

    if (this.configuration.allowedTools) {
      config.allowedTools = this.configuration.allowedTools;
    }

    if (this.configuration.disallowedTools) {
      config.disallowedTools = this.configuration.disallowedTools;
    }

    if (this.configuration.workingDirectory) {
      config.workingDirectory = this.configuration.workingDirectory;
    }

    if (this.configuration.conversationName) {
      config.conversationName = this.configuration.conversationName;
    }

    if (this.configuration.model) {
      config.model = this.configuration.model;
    }

    return config;
  }
}
