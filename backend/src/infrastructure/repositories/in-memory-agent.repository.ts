import { IAgentRepository } from '@application/ports/agent-repository.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * In-Memory Agent Repository
 * Simple in-memory storage for agents (MVP implementation)
 * For production, replace with database-backed repository
 */
export class InMemoryAgentRepository implements IAgentRepository {
  private agents = new Map<string, Agent>();

  /**
   * Save or update an agent
   */
  async save(agent: Agent): Promise<void> {
    this.agents.set(agent.id.toString(), agent);
  }

  /**
   * Find an agent by ID
   */
  async findById(id: AgentId): Promise<Agent | null> {
    return this.agents.get(id.toString()) ?? null;
  }

  /**
   * Find all agents
   */
  async findAll(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Find agents by status
   */
  async findByStatus(status: AgentStatus): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter((agent) => agent.status === status);
  }

  /**
   * Find agents by type
   */
  async findByType(type: AgentType): Promise<Agent[]> {
    return Array.from(this.agents.values()).filter((agent) => agent.type === type);
  }

  /**
   * Delete an agent
   */
  async delete(id: AgentId): Promise<void> {
    this.agents.delete(id.toString());
  }

  /**
   * Check if an agent exists
   */
  async exists(id: AgentId): Promise<boolean> {
    return this.agents.has(id.toString());
  }
}
