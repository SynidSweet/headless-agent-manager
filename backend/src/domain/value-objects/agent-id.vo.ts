import { randomUUID } from 'crypto';
import { DomainException } from '@domain/exceptions/domain.exception';

/**
 * Agent ID Value Object
 * Represents a unique identifier for an agent.
 * Immutable and self-validating.
 */
export class AgentId {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  /**
   * Generate a new unique AgentId
   */
  static generate(): AgentId {
    return new AgentId(randomUUID());
  }

  /**
   * Create AgentId from string
   * @param value - UUID string
   * @throws DomainException if value is invalid
   */
  static fromString(value: string): AgentId {
    // Validate not empty
    if (!value || value.trim().length === 0) {
      throw new DomainException('AgentId cannot be empty');
    }

    // Validate UUID format
    if (!AgentId.UUID_REGEX.test(value)) {
      throw new DomainException('Invalid UUID format');
    }

    return new AgentId(value.toLowerCase());
  }

  /**
   * Get string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Check equality with another AgentId
   */
  equals(other: AgentId): boolean {
    return this.value.toLowerCase() === other.value.toLowerCase();
  }
}
