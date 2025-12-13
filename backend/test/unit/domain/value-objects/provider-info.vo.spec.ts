import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('ProviderInfo Value Object', () => {
  const capabilities = ProviderCapabilities.create({
    streaming: true,
    multiTurn: true,
    toolUse: true,
    fileAccess: true,
    customInstructions: true,
    mcpSupport: true,
    modelSelection: true,
  });

  const model1 = ModelInfo.create({
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Advanced AI model for coding',
    contextWindow: 200000,
    capabilities: ['streaming', 'tool-use', 'vision', 'file-access'],
    isAvailable: true,
    isDefault: true,
  });

  const model2 = ModelInfo.create({
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    description: 'Most capable Claude model',
    contextWindow: 200000,
    capabilities: ['streaming', 'tool-use', 'vision', 'file-access'],
    isAvailable: true,
    isDefault: false,
  });

  const model3 = ModelInfo.create({
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    description: 'Fast and efficient model',
    contextWindow: 200000,
    capabilities: ['streaming', 'tool-use', 'vision'],
    isAvailable: true,
    isDefault: false,
  });

  describe('create', () => {
    it('should create with valid data', () => {
      const provider = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model1, model2, model3],
      });

      expect(provider.type).toBe(AgentType.CLAUDE_CODE);
      expect(provider.name).toBe('Claude Code');
      expect(provider.description).toBe('Anthropic Claude with official CLI');
      expect(provider.capabilities).toBe(capabilities);
      expect(provider.models).toHaveLength(3);
      expect(provider.models[0]).toBe(model1);
      expect(provider.models[1]).toBe(model2);
      expect(provider.models[2]).toBe(model3);
    });

    it('should throw DomainException when name is empty', () => {
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: '',
          description: 'Anthropic Claude with official CLI',
          capabilities,
          models: [model1],
        })
      ).toThrow(DomainException);
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: '',
          description: 'Anthropic Claude with official CLI',
          capabilities,
          models: [model1],
        })
      ).toThrow('Provider name cannot be empty');
    });

    it('should throw DomainException when name is whitespace only', () => {
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: '   ',
          description: 'Anthropic Claude with official CLI',
          capabilities,
          models: [model1],
        })
      ).toThrow(DomainException);
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: '   ',
          description: 'Anthropic Claude with official CLI',
          capabilities,
          models: [model1],
        })
      ).toThrow('Provider name cannot be empty');
    });

    it('should throw DomainException when description is empty', () => {
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: 'Claude Code',
          description: '',
          capabilities,
          models: [model1],
        })
      ).toThrow(DomainException);
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: 'Claude Code',
          description: '',
          capabilities,
          models: [model1],
        })
      ).toThrow('Provider description cannot be empty');
    });

    it('should throw DomainException when description is whitespace only', () => {
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: 'Claude Code',
          description: '   ',
          capabilities,
          models: [model1],
        })
      ).toThrow(DomainException);
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: 'Claude Code',
          description: '   ',
          capabilities,
          models: [model1],
        })
      ).toThrow('Provider description cannot be empty');
    });

    it('should throw DomainException when models array is empty', () => {
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: 'Claude Code',
          description: 'Anthropic Claude with official CLI',
          capabilities,
          models: [],
        })
      ).toThrow(DomainException);
      expect(() =>
        ProviderInfo.create({
          type: AgentType.CLAUDE_CODE,
          name: 'Claude Code',
          description: 'Anthropic Claude with official CLI',
          capabilities,
          models: [],
        })
      ).toThrow('Provider must have at least one model');
    });

    it('should accept single model', () => {
      const provider = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model1],
      });

      expect(provider.models).toHaveLength(1);
      expect(provider.models[0]).toBe(model1);
    });

    it('should preserve model order', () => {
      const provider = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model2, model3, model1],
      });

      expect(provider.models[0]).toBe(model2);
      expect(provider.models[1]).toBe(model3);
      expect(provider.models[2]).toBe(model1);
    });
  });

  describe('getAvailableModels', () => {
    it('should return all models', () => {
      const provider = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model1, model2, model3],
      });

      const available = provider.getAvailableModels();
      expect(available).toHaveLength(3);
      expect(available).toContain(model1);
      expect(available).toContain(model2);
      expect(available).toContain(model3);
    });

    it('should return models with specific capability', () => {
      const streamingModel = ModelInfo.create({
        id: 'model-with-streaming',
        name: 'Streaming Model',
        description: 'Model with streaming',
        contextWindow: 100000,
        capabilities: ['streaming'],
        isAvailable: true,
        isDefault: false,
      });

      const nonStreamingModel = ModelInfo.create({
        id: 'model-without-streaming',
        name: 'Non-Streaming Model',
        description: 'Model without streaming',
        contextWindow: 100000,
        capabilities: ['tool-use', 'vision'],
        isAvailable: true,
        isDefault: false,
      });

      const provider = ProviderInfo.create({
        type: AgentType.SYNTHETIC,
        name: 'Test Provider',
        description: 'Test provider for filtering',
        capabilities: ProviderCapabilities.create({
          streaming: true,
          multiTurn: true,
          toolUse: true,
          fileAccess: false,
          customInstructions: false,
          mcpSupport: false,
          modelSelection: false,
        }),
        models: [streamingModel, nonStreamingModel],
      });

      const filtered = provider.getAvailableModels('streaming');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toBe(streamingModel);
    });

    it('should return empty array when no models have the capability', () => {
      const modelWithoutMcp = ModelInfo.create({
        id: 'model-no-mcp',
        name: 'No MCP Model',
        description: 'Model without MCP support',
        contextWindow: 100000,
        capabilities: ['streaming', 'tool-use'],
        isAvailable: true,
        isDefault: false,
      });

      const provider = ProviderInfo.create({
        type: AgentType.SYNTHETIC,
        name: 'Test Provider',
        description: 'Test provider',
        capabilities: ProviderCapabilities.create({
          streaming: true,
          multiTurn: true,
          toolUse: false,
          fileAccess: false,
          customInstructions: false,
          mcpSupport: false,
          modelSelection: false,
        }),
        models: [modelWithoutMcp],
      });

      const filtered = provider.getAvailableModels('mcpSupport');
      expect(filtered).toHaveLength(0);
    });
  });

  describe('hasCapability', () => {
    const provider = ProviderInfo.create({
      type: AgentType.CLAUDE_CODE,
      name: 'Claude Code',
      description: 'Anthropic Claude with official CLI',
      capabilities,
      models: [model1],
    });

    it('should return true for enabled capabilities', () => {
      expect(provider.hasCapability('streaming')).toBe(true);
      expect(provider.hasCapability('multiTurn')).toBe(true);
      expect(provider.hasCapability('toolUse')).toBe(true);
      expect(provider.hasCapability('fileAccess')).toBe(true);
      expect(provider.hasCapability('customInstructions')).toBe(true);
      expect(provider.hasCapability('mcpSupport')).toBe(true);
      expect(provider.hasCapability('modelSelection')).toBe(true);
    });

    it('should return false for disabled capabilities', () => {
      const limitedCapabilities = ProviderCapabilities.create({
        streaming: true,
        multiTurn: false,
        toolUse: false,
        fileAccess: false,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: false,
      });

      const limitedProvider = ProviderInfo.create({
        type: AgentType.SYNTHETIC,
        name: 'Limited Provider',
        description: 'Provider with limited capabilities',
        capabilities: limitedCapabilities,
        models: [model1],
      });

      expect(limitedProvider.hasCapability('multiTurn')).toBe(false);
      expect(limitedProvider.hasCapability('toolUse')).toBe(false);
      expect(limitedProvider.hasCapability('fileAccess')).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for providers with same type', () => {
      const provider1 = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model1],
      });

      const provider2 = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Different Name',
        description: 'Different description',
        capabilities: ProviderCapabilities.create({
          streaming: false,
          multiTurn: false,
          toolUse: false,
          fileAccess: false,
          customInstructions: false,
          mcpSupport: false,
          modelSelection: false,
        }),
        models: [model2],
      });

      expect(provider1.equals(provider2)).toBe(true);
    });

    it('should return false for providers with different type', () => {
      const provider1 = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model1],
      });

      const provider2 = ProviderInfo.create({
        type: AgentType.GEMINI_CLI,
        name: 'Gemini CLI',
        description: 'Google Gemini with CLI',
        capabilities,
        models: [model1],
      });

      expect(provider1.equals(provider2)).toBe(false);
    });

    it('should return true when comparing provider to itself', () => {
      const provider = ProviderInfo.create({
        type: AgentType.CLAUDE_CODE,
        name: 'Claude Code',
        description: 'Anthropic Claude with official CLI',
        capabilities,
        models: [model1],
      });

      expect(provider.equals(provider)).toBe(true);
    });
  });
});
