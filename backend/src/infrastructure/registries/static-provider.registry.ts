/**
 * Static Provider Registry
 *
 * Infrastructure adapter that provides static provider configuration
 * by mapping PROVIDER_CONFIGS to domain value objects.
 *
 * Implements IProviderRegistry port from Application Layer.
 */

import { Injectable } from '@nestjs/common';
import { IProviderRegistry } from '@application/ports/provider-registry.port';
import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { PROVIDER_CONFIGS } from '../config/provider-registry.config';

@Injectable()
export class StaticProviderRegistry implements IProviderRegistry {
  /**
   * Get all available providers
   */
  async getAllProviders(): Promise<ProviderInfo[]> {
    type ProviderConfigKey = keyof typeof PROVIDER_CONFIGS;
    const providerTypes = Object.keys(PROVIDER_CONFIGS) as ProviderConfigKey[];

    return providerTypes.map((type) => {
      const config = PROVIDER_CONFIGS[type];

      // Map models to ModelInfo domain objects
      const models = config.models.map((modelConfig: any) =>
        ModelInfo.create({
          id: modelConfig.id,
          name: modelConfig.name,
          description: modelConfig.description,
          contextWindow: modelConfig.contextWindow,
          capabilities: modelConfig.capabilities,
          isAvailable: modelConfig.isAvailable,
          isDefault: modelConfig.isDefault,
          costTier: modelConfig.costTier,
        })
      );

      // Map capabilities to ProviderCapabilities domain object
      const capabilities = ProviderCapabilities.create(config.capabilities);

      // Create ProviderInfo domain object
      return ProviderInfo.create({
        type: type as AgentType,
        name: config.name,
        description: config.description,
        capabilities,
        models,
        isAvailable: config.isAvailable,
      });
    });
  }

  /**
   * Get provider by agent type
   * @throws Error if provider not found
   */
  async getProviderByType(type: AgentType): Promise<ProviderInfo> {
    type ProviderConfigKey = keyof typeof PROVIDER_CONFIGS;
    const config = PROVIDER_CONFIGS[type as ProviderConfigKey];

    if (!config) {
      throw new Error(`Provider not found: ${type}`);
    }

    // Map models to ModelInfo domain objects
    const models = config.models.map((modelConfig: any) =>
      ModelInfo.create({
        id: modelConfig.id,
        name: modelConfig.name,
        description: modelConfig.description,
        contextWindow: modelConfig.contextWindow,
        capabilities: modelConfig.capabilities,
        isAvailable: modelConfig.isAvailable,
        isDefault: modelConfig.isDefault,
        costTier: modelConfig.costTier,
      })
    );

    // Map capabilities to ProviderCapabilities domain object
    const capabilities = ProviderCapabilities.create(config.capabilities);

    // Create ProviderInfo domain object
    return ProviderInfo.create({
      type,
      name: config.name,
      description: config.description,
      capabilities,
      models,
      isAvailable: config.isAvailable,
    });
  }

  /**
   * Check if provider is available for given type
   */
  async isProviderAvailable(type: AgentType): Promise<boolean> {
    type ProviderConfigKey = keyof typeof PROVIDER_CONFIGS;
    const config = PROVIDER_CONFIGS[type as ProviderConfigKey];
    return config !== undefined && config.isAvailable;
  }
}
