/**
 * Agent Message DTO
 * Represents a single message in an agent conversation
 * Includes unique ID and sequence number for deduplication and ordering
 */
export class AgentMessageDto {
  /**
   * Unique message ID (UUID v4)
   */
  id!: string;

  /**
   * Agent ID this message belongs to
   */
  agentId!: string;

  /**
   * Monotonic sequence number (1, 2, 3...)
   * Used for ordering and gap detection
   */
  sequenceNumber!: number;

  /**
   * Message type
   */
  type!: 'user' | 'assistant' | 'system' | 'error';

  /**
   * Message role (optional, for certain message types)
   */
  role?: string;

  /**
   * Message content (can be string or structured object)
   */
  content!: string | object;

  /**
   * Additional metadata (JSON serializable)
   */
  metadata?: Record<string, unknown>;

  /**
   * Creation timestamp (ISO 8601)
   */
  createdAt!: string;
}

/**
 * Create Message DTO
 * Input for creating a new agent message
 */
export class CreateMessageDto {
  /**
   * Agent ID
   */
  agentId!: string;

  /**
   * Message type
   */
  type!: 'user' | 'assistant' | 'system' | 'error';

  /**
   * Message role (optional)
   */
  role?: string;

  /**
   * Message content
   */
  content!: string | object;

  /**
   * Additional metadata (optional)
   */
  metadata?: Record<string, unknown>;
}
