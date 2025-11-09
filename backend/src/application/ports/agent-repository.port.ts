import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * Agent Repository Port
 * Interface for agent persistence
 */
export interface IAgentRepository {
  /**
   * Save or update an agent
   * @param agent - The agent to save
   */
  save(agent: Agent): Promise<void>;

  /**
   * Find an agent by ID
   * @param id - The agent ID
   * @returns The agent or null if not found
   */
  findById(id: AgentId): Promise<Agent | null>;

  /**
   * Find all agents
   * @returns All agents
   */
  findAll(): Promise<Agent[]>;

  /**
   * Find agents by status
   * @param status - The status to filter by
   * @returns Agents with the specified status
   */
  findByStatus(status: AgentStatus): Promise<Agent[]>;

  /**
   * Find agents by type
   * @param type - The type to filter by
   * @returns Agents of the specified type
   */
  findByType(type: AgentType): Promise<Agent[]>;

  /**
   * Delete an agent
   * @param id - The agent ID to delete
   */
  delete(id: AgentId): Promise<void>;

  /**
   * Check if an agent exists
   * @param id - The agent ID
   * @returns True if agent exists
   */
  exists(id: AgentId): Promise<boolean>;
}
