/**
 * Provider Info Value Object
 *
 * Represents complete information about an AI provider including
 * its capabilities and available models.
 * Immutable value object following Clean Architecture principles.
 */

import { DomainException } from '../exceptions/domain.exception';
import { AgentType } from './agent-type.vo';
import {
  ProviderCapabilities,
  CapabilityName,
} from './provider-capabilities.vo';
import { ModelInfo } from './model-info.vo';

export interface ProviderInfoData {
  type: AgentType;
  name: string;
  description: string;
  capabilities: ProviderCapabilities;
  models: ModelInfo[];
  isAvailable?: boolean;
}

export class ProviderInfo {
  private constructor(
    public readonly type: AgentType,
    public readonly name: string,
    public readonly description: string,
    public readonly capabilities: ProviderCapabilities,
    public readonly models: ReadonlyArray<ModelInfo>,
    public readonly isAvailable: boolean = true
  ) {}

  /**
   * Creates a new ProviderInfo instance with validation
   */
  static create(data: ProviderInfoData): ProviderInfo {
    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new DomainException('Provider name cannot be empty');
    }

    // Validate description
    if (!data.description || data.description.trim().length === 0) {
      throw new DomainException('Provider description cannot be empty');
    }

    // Validate models array
    if (!data.models || data.models.length === 0) {
      throw new DomainException('Provider must have at least one model');
    }

    return new ProviderInfo(
      data.type,
      data.name,
      data.description,
      data.capabilities,
      data.models,
      data.isAvailable ?? true
    );
  }

  /**
   * Gets all available models, optionally filtered by capability
   */
  getAvailableModels(capability?: CapabilityName): ModelInfo[] {
    if (!capability) {
      return Array.from(this.models);
    }

    return Array.from(this.models).filter((model) =>
      model.hasCapability(capability)
    );
  }

  /**
   * Checks if the provider has a specific capability
   */
  hasCapability(capability: CapabilityName): boolean {
    return this.capabilities.has(capability);
  }

  /**
   * Compares two providers by their type
   */
  equals(other: ProviderInfo): boolean {
    return this.type === other.type;
  }
}
