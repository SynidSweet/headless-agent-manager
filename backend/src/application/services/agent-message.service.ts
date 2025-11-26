import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentMessageDto, CreateMessageDto } from '@application/dto';

/**
 * Agent Message Service
 * Manages persistence of agent messages with UUID and sequence numbers
 * Implements single source of truth for message state
 */
@Injectable()
export class AgentMessageService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService
  ) {}

  /**
   * Save a new message to the database
   * Automatically generates UUID and increments sequence number
   * @param createDto - Message data to save
   * @returns Saved message with ID and sequence number
   */
  async saveMessage(createDto: CreateMessageDto): Promise<AgentMessageDto> {
    const db = this.databaseService.getDatabase();

    // Generate unique ID
    const id = randomUUID();

    // Create timestamp
    const createdAt = new Date().toISOString();

    // Prepare content (serialize objects to JSON)
    const contentString = typeof createDto.content === 'string'
      ? createDto.content
      : JSON.stringify(createDto.content);

    // Use atomic INSERT with subquery to prevent race conditions on sequence numbers
    // The subquery calculates the next sequence number within the same statement
    const insertStmt = db.prepare(`
      INSERT INTO agent_messages (
        id, agent_id, sequence_number, type, role, content, raw, metadata, created_at
      ) VALUES (
        ?,
        ?,
        COALESCE((SELECT MAX(sequence_number) FROM agent_messages WHERE agent_id = ?), 0) + 1,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `);

    // Execute insert - the subquery ensures atomicity
    // Will throw SqliteError if FK constraint fails
    insertStmt.run(
      id,
      createDto.agentId,
      createDto.agentId, // For the subquery
      createDto.type,
      createDto.role || null,
      contentString,
      createDto.raw || null,
      createDto.metadata ? JSON.stringify(createDto.metadata) : null,
      createdAt
    );

    // Get the actual sequence number that was inserted
    const selectStmt = db.prepare(`
      SELECT sequence_number FROM agent_messages WHERE id = ?
    `);
    const result = selectStmt.get(id) as { sequence_number: number };

    // Return DTO
    return {
      id,
      agentId: createDto.agentId,
      sequenceNumber: result.sequence_number,
      type: createDto.type,
      role: createDto.role,
      content: createDto.content,
      raw: createDto.raw,
      metadata: createDto.metadata,
      createdAt,
    };
  }

  /**
   * Find all messages for an agent, sorted by sequence number
   * @param agentId - Agent ID
   * @returns Array of messages in chronological order
   */
  async findByAgentId(agentId: string): Promise<AgentMessageDto[]> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM agent_messages
      WHERE agent_id = ?
      ORDER BY sequence_number ASC
    `);

    const rows = stmt.all(agentId);

    return rows.map((row: any) => this.mapRowToDto(row));
  }

  /**
   * Find messages for an agent since a specific sequence number
   * Used for gap filling when WebSocket reconnects
   * @param agentId - Agent ID
   * @param since - Sequence number to start from (exclusive)
   * @returns Array of messages after the specified sequence
   */
  async findByAgentIdSince(agentId: string, since: number): Promise<AgentMessageDto[]> {
    const db = this.databaseService.getDatabase();

    const stmt = db.prepare(`
      SELECT * FROM agent_messages
      WHERE agent_id = ? AND sequence_number > ?
      ORDER BY sequence_number ASC
    `);

    const rows = stmt.all(agentId, since);

    return rows.map((row: any) => this.mapRowToDto(row));
  }

  /**
   * Map database row to DTO
   * Handles JSON parsing for content and metadata
   * @param row - Database row
   * @returns AgentMessageDto
   */
  private mapRowToDto(row: any): AgentMessageDto {
    let content: string | object = row.content;
    try {
      // Try to parse content as JSON (for structured messages)
      content = JSON.parse(row.content);
    } catch {
      // Keep as string if not valid JSON
      content = row.content;
    }

    let metadata: Record<string, unknown> | undefined;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch {
        // Ignore parse errors for metadata
        metadata = undefined;
      }
    }

    return {
      id: row.id,
      agentId: row.agent_id,
      sequenceNumber: row.sequence_number,
      type: row.type,
      role: row.role || undefined,
      content,
      raw: row.raw || undefined,
      metadata,
      createdAt: row.created_at,
    };
  }
}
