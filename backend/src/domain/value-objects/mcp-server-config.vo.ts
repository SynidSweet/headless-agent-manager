/**
 * MCP Server Configuration Value Object
 *
 * Represents a single MCP (Model Context Protocol) server configuration
 * that can be passed to Claude CLI via --mcp-config flag.
 */

import { DomainException } from '../exceptions/domain.exception';

export type McpTransport = 'stdio' | 'http' | 'sse';

export interface McpServerConfigData {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: McpTransport;
}

export class McpServerConfig {
  private constructor(
    public readonly name: string,
    public readonly command: string,
    public readonly args: ReadonlyArray<string>,
    public readonly env: Readonly<Record<string, string>>,
    public readonly transport: McpTransport
  ) {}

  /**
   * Creates a new MCP server configuration with validation
   */
  static create(data: McpServerConfigData): McpServerConfig {
    // Validate server name
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0) {
      throw new DomainException('Server name cannot be empty');
    }

    // Server name must be alphanumeric with hyphens and underscores only
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedName)) {
      throw new DomainException(
        'Server name must contain only alphanumeric characters, hyphens, and underscores'
      );
    }

    // Validate command
    const trimmedCommand = data.command.trim();
    if (trimmedCommand.length === 0) {
      throw new DomainException('Command cannot be empty');
    }

    // Validate transport
    const transport = data.transport || 'stdio';
    const validTransports: McpTransport[] = ['stdio', 'http', 'sse'];
    if (!validTransports.includes(transport)) {
      throw new DomainException('Transport must be one of: stdio, http, sse');
    }

    // Default values for optional fields
    const args = data.args || [];
    const env = data.env || {};

    return new McpServerConfig(
      trimmedName,
      trimmedCommand,
      Object.freeze([...args]), // Deep freeze for immutability
      Object.freeze({ ...env }), // Deep freeze for immutability
      transport
    );
  }

  /**
   * Converts to JSON format for Claude CLI --mcp-config flag
   * Format matches claude_desktop_config.json structure
   */
  toJSON(): object {
    const json: any = {
      command: this.command,
      args: [...this.args],
      env: { ...this.env },
    };

    // Only include transport if not stdio (stdio is default)
    if (this.transport !== 'stdio') {
      json.transport = this.transport;
    }

    return json;
  }
}
