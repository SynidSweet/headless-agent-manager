import { Injectable } from '@nestjs/common';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { DatabaseService } from '@infrastructure/database/database.service';

/**
 * Agent Database Row
 * Represents how agents are stored in the database
 */
interface AgentRow {
  id: string;
  type: string;
  status: string;
  prompt: string;
  configuration: string; // JSON
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  error_name: string | null;
}

/**
 * SQLite Agent Repository
 * Persistent storage for agents using SQLite database
 * Implements IAgentRepository interface
 */
@Injectable()
export class SqliteAgentRepository implements IAgentRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Save or update an agent
   */
  async save(agent: Agent): Promise<void> {
    const db = this.databaseService.getDatabase();

    const row: Omit<AgentRow, 'started_at' | 'completed_at' | 'error_message' | 'error_name'> & {
      started_at: string | null;
      completed_at: string | null;
      error_message: string | null;
      error_name: string | null;
    } = {
      id: agent.id.toString(),
      type: agent.type.toString(),
      status: agent.status.toString(),
      prompt: agent.session.prompt,
      configuration: JSON.stringify(agent.session.configuration),
      created_at: agent.createdAt.toISOString(),
      started_at: agent.startedAt?.toISOString() || null,
      completed_at: agent.completedAt?.toISOString() || null,
      error_message: agent.error?.message || null,
      error_name: agent.error?.name || null,
    };

    // Check if agent exists to avoid CASCADE DELETE of messages
    const existsStmt = db.prepare(`SELECT 1 FROM agents WHERE id = ?`);
    const exists = existsStmt.get(row.id);

    if (exists) {
      // UPDATE existing agent (preserves foreign key relationships, doesn't delete messages)
      const updateStmt = db.prepare(`
        UPDATE agents SET
          type = @type,
          status = @status,
          prompt = @prompt,
          configuration = @configuration,
          created_at = @created_at,
          started_at = @started_at,
          completed_at = @completed_at,
          error_message = @error_message,
          error_name = @error_name
        WHERE id = @id
      `);
      updateStmt.run(row);
    } else {
      // INSERT new agent
      const insertStmt = db.prepare(`
        INSERT INTO agents (
          id, type, status, prompt, configuration,
          created_at, started_at, completed_at,
          error_message, error_name
        ) VALUES (
          @id, @type, @status, @prompt, @configuration,
          @created_at, @started_at, @completed_at,
          @error_message, @error_name
        )
      `);
      insertStmt.run(row);
    }
  }

  /**
   * Find an agent by ID
   */
  async findById(id: AgentId): Promise<Agent | null> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
    const row = stmt.get(id.toString()) as AgentRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToAgent(row);
  }

  /**
   * Find all agents
   */
  async findAll(): Promise<Agent[]> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare('SELECT * FROM agents ORDER BY created_at DESC');
    const rows = stmt.all() as AgentRow[];

    return rows.map((row) => this.rowToAgent(row));
  }

  /**
   * Find agents by status
   */
  async findByStatus(status: AgentStatus): Promise<Agent[]> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare('SELECT * FROM agents WHERE status = ? ORDER BY created_at DESC');
    const rows = stmt.all(status.toString()) as AgentRow[];

    return rows.map((row) => this.rowToAgent(row));
  }

  /**
   * Find agents by type
   */
  async findByType(type: AgentType): Promise<Agent[]> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare('SELECT * FROM agents WHERE type = ? ORDER BY created_at DESC');
    const rows = stmt.all(type.toString()) as AgentRow[];

    return rows.map((row) => this.rowToAgent(row));
  }

  /**
   * Delete an agent
   */
  async delete(id: AgentId): Promise<void> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
    stmt.run(id.toString());
  }

  /**
   * Check if an agent exists
   */
  async exists(id: AgentId): Promise<boolean> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare('SELECT 1 FROM agents WHERE id = ? LIMIT 1');
    const result = stmt.get(id.toString());

    return result !== undefined;
  }

  /**
   * Convert database row to Agent entity
   */
  private rowToAgent(row: AgentRow): Agent {
    // Parse configuration
    const configuration = JSON.parse(row.configuration || '{}');

    // Create agent using internal reconstruction
    // Note: We can't use Agent.create() because it sets INITIALIZING status
    // We need to reconstruct the full state from the database

    const agent = Agent.create({
      type: row.type as AgentType,
      prompt: row.prompt,
      configuration,
    });

    // Restore the actual ID from database
    (agent as any)._id = AgentId.fromString(row.id);

    // Restore timestamps
    (agent as any)._createdAt = new Date(row.created_at);
    if (row.started_at) {
      (agent as any)._startedAt = new Date(row.started_at);
    }
    if (row.completed_at) {
      (agent as any)._completedAt = new Date(row.completed_at);
    }

    // Restore error if exists
    if (row.error_message) {
      const error = new Error(row.error_message);
      error.name = row.error_name || 'Error';
      (agent as any)._error = error;
    }

    // Restore status (must be last to avoid validation errors)
    (agent as any)._status = row.status as AgentStatus;

    return agent;
  }
}
