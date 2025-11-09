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
   * Custom CLI arguments
   * Optional additional flags for the CLI
   */
  customArgs?: string[];

  /**
   * Additional metadata
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
      throw new Error(
        `Invalid agent type: ${this.type}. Must be one of: ${validTypes.join(', ')}`
      );
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

    return config;
  }
}
