import { ProvidersResponseDto } from '@application/dto/provider-info.dto';
import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';

describe('ProvidersResponseDto', () => {
  describe('fromDomain', () => {
    it('should map single provider correctly', () => {
      const capabilities = ProviderCapabilities.create({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: true,
        modelSelection: true,
      });

      const model = ModelInfo.create({
        id: 'test-model-1',
        name: 'Test Model',
        description: 'Test model description',
        contextWindow: 100000,
        capabilities: ['streaming', 'tool-use'],
        isAvailable: true,
        isDefault: true,
        costTier: 'medium',
      });

      const provider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Test Provider',
        description: 'A test provider',
        models: [model],
        capabilities,
      });

      const dto = ProvidersResponseDto.fromDomain([provider]);
      const firstProvider = dto.providers[0];

      expect(dto.totalCount).toBe(1);
      expect(dto.providers).toHaveLength(1);
      expect(firstProvider).toBeDefined();
      expect(firstProvider?.type).toBe('claude-code');
      expect(firstProvider?.name).toBe('Test Provider');
      expect(firstProvider?.description).toBe('A test provider');
    });

    it('should map provider models correctly', () => {
      const capabilities = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: true,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: true,
      });

      const model1 = ModelInfo.create({
        id: 'model-1',
        name: 'Model 1',
        description: 'First model',
        contextWindow: 50000,
        capabilities: ['streaming'],
        isAvailable: true,
        isDefault: true,
        costTier: 'low',
      });

      const model2 = ModelInfo.create({
        id: 'model-2',
        name: 'Model 2',
        description: 'Second model',
        contextWindow: 100000,
        capabilities: ['streaming', 'tool-use'],
        isAvailable: true,
        isDefault: false,
        costTier: 'high',
      });

      const provider = ProviderInfo.create({
        type: 'gemini-cli' as any,
        name: 'Gemini',
        description: 'Gemini provider',
        models: [model1, model2],
        capabilities,
      });

      const dto = ProvidersResponseDto.fromDomain([provider]);
      const firstProvider = dto.providers[0];
      const firstModel = firstProvider?.models[0];
      const secondModel = firstProvider?.models[1];

      expect(firstProvider?.models).toHaveLength(2);
      expect(firstModel).toBeDefined();
      expect(firstModel?.id).toBe('model-1');
      expect(firstModel?.name).toBe('Model 1');
      expect(firstModel?.contextWindow).toBe(50000);
      expect(firstModel?.costTier).toBe('low');
      expect(secondModel).toBeDefined();
      expect(secondModel?.id).toBe('model-2');
      expect(secondModel?.contextWindow).toBe(100000);
      expect(secondModel?.costTier).toBe('high');
    });

    it('should map capabilities correctly', () => {
      const capabilities = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: true,
        fileAccess: true,
        customInstructions: false,
        mcpSupport: true,
        modelSelection: false,
      });

      const model = ModelInfo.create({
        id: 'test-model',
        name: 'Test',
        description: 'Test model',
        contextWindow: 10000,
        capabilities: [],
        isAvailable: true,
        isDefault: true,
      });

      const provider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Test',
        description: 'Test',
        models: [model],
        capabilities,
      });

      const dto = ProvidersResponseDto.fromDomain([provider]);
      const caps = dto.providers[0]?.capabilities;

      expect(caps).toBeDefined();
      expect(caps?.streaming).toBe(true);
      expect(caps?.multiTurn).toBe(false);
      expect(caps?.toolUse).toBe(true);
      expect(caps?.fileAccess).toBe(true);
      expect(caps?.customInstructions).toBe(false);
      expect(caps?.mcpSupport).toBe(true);
      expect(caps?.modelSelection).toBe(false);
    });

    it('should handle empty providers array', () => {
      const dto = ProvidersResponseDto.fromDomain([]);

      expect(dto.totalCount).toBe(0);
      expect(dto.providers).toEqual([]);
    });

    it('should handle multiple providers', () => {
      const caps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: true,
        mcpSupport: true,
        modelSelection: true,
      });

      const model = ModelInfo.create({
        id: 'test',
        name: 'Test',
        description: 'Test model',
        contextWindow: 10000,
        capabilities: [],
        isAvailable: true,
        isDefault: true,
      });

      const provider1 = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Claude',
        description: 'Claude provider',
        models: [model],
        capabilities: caps,
      });

      const provider2 = ProviderInfo.create({
        type: 'gemini-cli' as any,
        name: 'Gemini',
        description: 'Gemini provider',
        models: [model],
        capabilities: caps,
      });

      const dto = ProvidersResponseDto.fromDomain([provider1, provider2]);

      expect(dto.totalCount).toBe(2);
      expect(dto.providers).toHaveLength(2);
      expect(dto.providers[0]?.type).toBe('claude-code');
      expect(dto.providers[1]?.type).toBe('gemini-cli');
    });

    it('should map model capabilities as string array', () => {
      const providerCaps = ProviderCapabilities.create({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: true,
        mcpSupport: true,
        modelSelection: true,
      });

      const model = ModelInfo.create({
        id: 'test-model',
        name: 'Test Model',
        description: 'Test model with capabilities',
        contextWindow: 50000,
        capabilities: ['streaming', 'tool-use', 'mcp'],
        isAvailable: true,
        isDefault: true,
        costTier: 'medium',
      });

      const provider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Test Provider',
        description: 'Test',
        models: [model],
        capabilities: providerCaps,
      });

      const dto = ProvidersResponseDto.fromDomain([provider]);
      const modelCapabilities = dto.providers[0]?.models[0]?.capabilities;

      expect(modelCapabilities).toBeDefined();
      expect(Array.isArray(modelCapabilities)).toBe(true);
      expect(modelCapabilities).toContain('streaming');
      expect(modelCapabilities).toContain('tool-use');
      expect(modelCapabilities).toContain('mcp');
      expect(modelCapabilities).toHaveLength(3);
    });
  });
});
