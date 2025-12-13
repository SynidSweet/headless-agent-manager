/**
 * DTOs for Provider Information API
 *
 * Maps domain models to API response format following Clean Architecture.
 */

import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';
import { CostTier } from '@domain/value-objects/model-info.vo';

/**
 * DTO for provider capabilities
 */
export interface ProviderCapabilitiesDto {
  streaming: boolean;
  multiTurn: boolean;
  toolUse: boolean;
  fileAccess: boolean;
  customInstructions: boolean;
  mcpSupport: boolean;
  modelSelection: boolean;
}

/**
 * DTO for model information
 */
export interface ModelInfoDto {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  capabilities: string[];
  isAvailable: boolean;
  isDefault: boolean;
  costTier?: CostTier;
}

/**
 * DTO for provider information
 */
export interface ProviderInfoDto {
  type: string;
  name: string;
  description: string;
  isAvailable: boolean;
  capabilities: ProviderCapabilitiesDto;
  models: ModelInfoDto[];
}

/**
 * Response DTO for GET /api/providers
 */
export class ProvidersResponseDto {
  constructor(
    public readonly totalCount: number,
    public readonly providers: ProviderInfoDto[]
  ) {}

  /**
   * Maps domain models to response DTO
   */
  static fromDomain(providers: ProviderInfo[]): ProvidersResponseDto {
    const dtos = providers.map((provider) => this.mapProviderToDto(provider));
    return new ProvidersResponseDto(dtos.length, dtos);
  }

  /**
   * Maps a single ProviderInfo to DTO
   */
  private static mapProviderToDto(provider: ProviderInfo): ProviderInfoDto {
    return {
      type: provider.type,
      name: provider.name,
      description: provider.description,
      isAvailable: provider.isAvailable,
      capabilities: this.mapCapabilitiesToDto(provider.capabilities),
      models: provider.models.map((model) => this.mapModelToDto(model)),
    };
  }

  /**
   * Maps ModelInfo to DTO
   */
  private static mapModelToDto(model: ModelInfo): ModelInfoDto {
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      contextWindow: model.contextWindow,
      capabilities: model.capabilities,
      isAvailable: model.isAvailable,
      isDefault: model.isDefault,
      costTier: model.costTier,
    };
  }

  /**
   * Maps ProviderCapabilities to DTO
   */
  private static mapCapabilitiesToDto(
    capabilities: ProviderCapabilities
  ): ProviderCapabilitiesDto {
    return {
      streaming: capabilities.streaming,
      multiTurn: capabilities.multiTurn,
      toolUse: capabilities.toolUse,
      fileAccess: capabilities.fileAccess,
      customInstructions: capabilities.customInstructions,
      mcpSupport: capabilities.mcpSupport,
      modelSelection: capabilities.modelSelection,
    };
  }
}
