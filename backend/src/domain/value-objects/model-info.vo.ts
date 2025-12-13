/**
 * Model Info Value Object
 *
 * Represents metadata for a specific AI model.
 * Immutable value object following Clean Architecture principles.
 */

import { DomainException } from '../exceptions/domain.exception';

export type CostTier = 'low' | 'medium' | 'high';

export interface ModelInfoData {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  capabilities: string[];
  isAvailable: boolean;
  isDefault: boolean;
  costTier?: CostTier;
}

export class ModelInfo {
  private constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string,
    public readonly contextWindow: number,
    public readonly capabilities: string[],
    public readonly isAvailable: boolean,
    public readonly isDefault: boolean,
    public readonly costTier?: CostTier
  ) {}

  /**
   * Creates a new ModelInfo instance with validation
   */
  static create(data: ModelInfoData): ModelInfo {
    // Validate id
    if (!data.id || data.id.trim().length === 0) {
      throw new DomainException('Model ID cannot be empty');
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new DomainException('Model name cannot be empty');
    }

    // Validate description
    if (!data.description || data.description.trim().length === 0) {
      throw new DomainException('Model description cannot be empty');
    }

    // Validate contextWindow
    if (data.contextWindow <= 0) {
      throw new DomainException('Context window must be a positive integer');
    }

    // Validate capabilities is an array
    if (!Array.isArray(data.capabilities)) {
      throw new DomainException('Capabilities must be an array');
    }

    return new ModelInfo(
      data.id,
      data.name,
      data.description,
      data.contextWindow,
      data.capabilities,
      data.isAvailable,
      data.isDefault,
      data.costTier
    );
  }

  /**
   * Checks if the model has a specific capability
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Compares two models by their ID
   */
  equals(other: ModelInfo): boolean {
    return this.id === other.id;
  }
}
