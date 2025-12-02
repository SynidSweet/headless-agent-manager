/**
 * MCP Configuration Value Object
 *
 * Represents a collection of MCP server configurations that will be
 * passed to Claude CLI via the --mcp-config flag.
 */

import {
  McpServerConfig,
  McpServerConfigData,
} from './mcp-server-config.vo';
import { DomainException } from '../exceptions/domain.exception';

export interface McpConfigurationData {
  servers: McpServerConfigData[];
  strict?: boolean;
}

export class McpConfiguration {
  private constructor(
    public readonly servers: ReadonlyMap<string, McpServerConfig>,
    public readonly strict: boolean
  ) {}

  /**
   * Creates a new MCP configuration with validation
   */
  static create(data: McpConfigurationData): McpConfiguration {
    const serverMap = new Map<string, McpServerConfig>();

    // Process and validate each server
    for (const serverData of data.servers) {
      // Create server (will validate internally)
      const server = McpServerConfig.create(serverData);

      // Check for duplicate names
      if (serverMap.has(server.name)) {
        throw new DomainException(`Duplicate MCP server name: ${server.name}`);
      }

      serverMap.set(server.name, server);
    }

    const strict = data.strict ?? false;

    // Create read-only map for immutability
    const readonlyMap = new Map(serverMap) as ReadonlyMap<string, McpServerConfig>;

    return new McpConfiguration(readonlyMap, strict);
  }

  /**
   * Converts to JSON string for Claude CLI --mcp-config flag
   * Format: {"mcpServers": {"server-name": {...}, ...}}
   */
  toClaudeConfigJSON(): string {
    const mcpServers: Record<string, any> = {};

    this.servers.forEach((server, name) => {
      mcpServers[name] = server.toJSON();
    });

    return JSON.stringify({ mcpServers });
  }

  /**
   * Gets a list of all server names
   */
  getServerNames(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Checks if a server with the given name exists
   */
  hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Gets a server by name
   */
  getServer(name: string): McpServerConfig | undefined {
    return this.servers.get(name);
  }
}
