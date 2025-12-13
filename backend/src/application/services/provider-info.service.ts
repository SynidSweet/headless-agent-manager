/**
 * Provider Info Service
 *
 * Application service for retrieving provider information.
 * Delegates to IProviderRegistry port for data access.
 */

import { Injectable, Inject } from '@nestjs/common';
import { IProviderRegistry } from '@application/ports/provider-registry.port';
import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';

@Injectable()
export class ProviderInfoService {
  constructor(
    @Inject('IProviderRegistry')
    private readonly providerRegistry: IProviderRegistry
  ) {}

  /**
   * Get all available providers with their capabilities and models
   */
  async getAvailableProviders(): Promise<ProviderInfo[]> {
    return this.providerRegistry.getAllProviders();
  }

  /**
   * Get provider information by agent type
   * @param type The agent type
   * @returns Provider information
   * @throws Error if provider not found
   */
  async getProviderByType(type: AgentType): Promise<ProviderInfo> {
    return this.providerRegistry.getProviderByType(type);
  }

  /**
   * Check if a provider is available for the given type
   * @param type The agent type
   * @returns True if provider is available
   */
  async isProviderAvailable(type: AgentType): Promise<boolean> {
    return this.providerRegistry.isProviderAvailable(type);
  }
}
