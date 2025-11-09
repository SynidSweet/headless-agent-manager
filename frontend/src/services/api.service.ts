import { Agent, LaunchAgentRequest, LaunchAgentResponse } from '../types/agent.types';

// Use relative URLs in production, absolute in development
const getApiBaseUrl = () => {
  // If VITE_API_BASE_URL is set, use it
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // In production (served via domain), use relative URLs
  if (window.location.hostname !== 'localhost') {
    return window.location.origin + '/api';
  }

  // In development, use localhost
  return 'http://localhost:3000/api';
};

const API_BASE_URL = getApiBaseUrl();

/**
 * API Service
 * Handles all HTTP requests to the backend API
 */
export class ApiService {
  /**
   * Launch a new agent
   */
  static async launchAgent(request: LaunchAgentRequest): Promise<LaunchAgentResponse> {
    const response = await fetch(`${API_BASE_URL}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to launch agent');
    }

    return response.json();
  }

  /**
   * Get all agents
   */
  static async getAllAgents(): Promise<Agent[]> {
    const response = await fetch(`${API_BASE_URL}/agents`);

    if (!response.ok) {
      throw new Error('Failed to fetch agents');
    }

    return response.json();
  }

  /**
   * Get active (running) agents
   */
  static async getActiveAgents(): Promise<Agent[]> {
    const response = await fetch(`${API_BASE_URL}/agents/active`);

    if (!response.ok) {
      throw new Error('Failed to fetch active agents');
    }

    return response.json();
  }

  /**
   * Get specific agent by ID
   */
  static async getAgent(id: string): Promise<Agent> {
    const response = await fetch(`${API_BASE_URL}/agents/${id}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Agent not found');
      }
      throw new Error('Failed to fetch agent');
    }

    return response.json();
  }

  /**
   * Terminate an agent
   */
  static async terminateAgent(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/agents/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 204) {
      throw new Error('Failed to terminate agent');
    }
  }

  /**
   * Get agent status
   */
  static async getAgentStatus(id: string): Promise<{ agentId: string; status: string }> {
    const response = await fetch(`${API_BASE_URL}/agents/${id}/status`);

    if (!response.ok) {
      throw new Error('Failed to fetch agent status');
    }

    return response.json();
  }
}
