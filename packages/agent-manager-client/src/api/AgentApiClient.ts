/**
 * Agent API Client
 * Configurable REST client for agent management API
 * No framework dependencies - works in any JS environment
 */

import type {
  Agent,
  AgentMessage,
  LaunchAgentRequest,
  AgentClientConfig,
} from '../types';

/**
 * Static configuration for API client
 */
class AgentApiClientClass {
  private baseUrl: string = '';
  private headers: Record<string, string> = {};

  /**
   * Configure the API client
   */
  configure(config: { baseUrl: string; headers?: Record<string, string> }): void {
    this.baseUrl = config.baseUrl;
    this.headers = config.headers || {};
  }

  /**
   * Get all agents
   */
  async getAllAgents(): Promise<Agent[]> {
    const response = await this.fetch('/api/agents', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch agents: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<Agent[]>;
  }

  /**
   * Launch a new agent
   */
  async launchAgent(request: LaunchAgentRequest): Promise<Agent> {
    const response = await this.fetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to launch agent: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<Agent>;
  }

  /**
   * Get all messages for an agent
   */
  async getAgentMessages(agentId: string): Promise<AgentMessage[]> {
    const response = await this.fetch(`/api/agents/${agentId}/messages`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch messages: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<AgentMessage[]>;
  }

  /**
   * Get messages since a specific sequence number (for gap filling)
   */
  async getAgentMessagesSince(
    agentId: string,
    sinceSequence: number
  ): Promise<AgentMessage[]> {
    const response = await this.fetch(
      `/api/agents/${agentId}/messages?since=${sinceSequence}`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch messages since ${sinceSequence}: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<AgentMessage[]>;
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string): Promise<void> {
    const response = await this.fetch(`/api/agents/${agentId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(
        `Failed to terminate agent: ${response.status} ${response.statusText}`
      );
    }
  }

  /**
   * Internal fetch wrapper with configured headers
   */
  private async fetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...options.headers,
      },
    });

    return response;
  }
}

/**
 * Export singleton instance
 */
export const AgentApiClient = new AgentApiClientClass();
