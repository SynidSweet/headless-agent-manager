import { ProviderInfo } from '../../domain/value-objects/provider-info.vo';
import { AgentType } from '../../domain/value-objects/agent-type.vo';

/**
 * Port interface for provider registry.
 * Defines contract for retrieving provider information.
 */
export interface IProviderRegistry {
  /**
   * Get all available providers.
   * @returns Promise resolving to array of provider information
   */
  getAllProviders(): Promise<ProviderInfo[]>;

  /**
   * Get provider by agent type.
   * @param type The agent type
   * @returns Promise resolving to provider information
   * @throws Error if provider not found
   */
  getProviderByType(type: AgentType): Promise<ProviderInfo>;

  /**
   * Check if provider is available for given type.
   * @param type The agent type
   * @returns Promise resolving to availability boolean
   */
  isProviderAvailable(type: AgentType): Promise<boolean>;
}
