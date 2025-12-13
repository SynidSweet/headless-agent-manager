/**
 * Provider Capabilities Value Object
 *
 * Represents the feature set supported by an AI provider.
 * Immutable value object following Clean Architecture principles.
 */

export type CapabilityName =
  | 'streaming'
  | 'multiTurn'
  | 'toolUse'
  | 'fileAccess'
  | 'customInstructions'
  | 'mcpSupport'
  | 'modelSelection';

export interface ProviderCapabilitiesData {
  streaming: boolean;
  multiTurn: boolean;
  toolUse: boolean;
  fileAccess: boolean;
  customInstructions: boolean;
  mcpSupport: boolean;
  modelSelection: boolean;
}

export class ProviderCapabilities {
  private constructor(
    public readonly streaming: boolean,
    public readonly multiTurn: boolean,
    public readonly toolUse: boolean,
    public readonly fileAccess: boolean,
    public readonly customInstructions: boolean,
    public readonly mcpSupport: boolean,
    public readonly modelSelection: boolean
  ) {}

  /**
   * Creates a new ProviderCapabilities instance
   */
  static create(data: ProviderCapabilitiesData): ProviderCapabilities {
    return new ProviderCapabilities(
      data.streaming,
      data.multiTurn,
      data.toolUse,
      data.fileAccess,
      data.customInstructions,
      data.mcpSupport,
      data.modelSelection
    );
  }

  /**
   * Checks if a specific capability is enabled
   */
  has(capability: CapabilityName): boolean {
    return this[capability];
  }

  /**
   * Returns an array of enabled capability names
   */
  toArray(): CapabilityName[] {
    const capabilities: CapabilityName[] = [];

    if (this.streaming) capabilities.push('streaming');
    if (this.multiTurn) capabilities.push('multiTurn');
    if (this.toolUse) capabilities.push('toolUse');
    if (this.fileAccess) capabilities.push('fileAccess');
    if (this.customInstructions) capabilities.push('customInstructions');
    if (this.mcpSupport) capabilities.push('mcpSupport');
    if (this.modelSelection) capabilities.push('modelSelection');

    return capabilities;
  }
}
