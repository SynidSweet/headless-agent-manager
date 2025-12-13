import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('ModelInfo Value Object', () => {
  const validCapabilities = ['streaming', 'tool-use', 'vision', 'file-access'];

  describe('create', () => {
    it('should create with valid data including all fields', () => {
      const model = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Advanced AI model for coding tasks',
        contextWindow: 200000,
        capabilities: validCapabilities,
        isAvailable: true,
        isDefault: true,
        costTier: 'medium',
      });

      expect(model.id).toBe('claude-3-5-sonnet-20241022');
      expect(model.name).toBe('Claude 3.5 Sonnet');
      expect(model.description).toBe('Advanced AI model for coding tasks');
      expect(model.contextWindow).toBe(200000);
      expect(model.capabilities).toEqual(validCapabilities);
      expect(model.isAvailable).toBe(true);
      expect(model.isDefault).toBe(true);
      expect(model.costTier).toBe('medium');
    });

    it('should create with valid data without costTier', () => {
      const model = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Advanced AI model for coding tasks',
        contextWindow: 200000,
        capabilities: validCapabilities,
        isAvailable: true,
        isDefault: false,
      });

      expect(model.id).toBe('claude-3-5-sonnet-20241022');
      expect(model.name).toBe('Claude 3.5 Sonnet');
      expect(model.description).toBe('Advanced AI model for coding tasks');
      expect(model.contextWindow).toBe(200000);
      expect(model.capabilities).toEqual(validCapabilities);
      expect(model.isAvailable).toBe(true);
      expect(model.isDefault).toBe(false);
      expect(model.costTier).toBeUndefined();
    });

    it('should throw DomainException when id is empty', () => {
      expect(() =>
        ModelInfo.create({
          id: '',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: '',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Model ID cannot be empty');
    });

    it('should throw DomainException when id is whitespace only', () => {
      expect(() =>
        ModelInfo.create({
          id: '   ',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: '   ',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Model ID cannot be empty');
    });

    it('should throw DomainException when name is empty', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: '',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: '',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Model name cannot be empty');
    });

    it('should throw DomainException when name is whitespace only', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: '   ',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: '   ',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Model name cannot be empty');
    });

    it('should throw DomainException when description is empty', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: '',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: '',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Model description cannot be empty');
    });

    it('should throw DomainException when description is whitespace only', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: '   ',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: '   ',
          contextWindow: 200000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Model description cannot be empty');
    });

    it('should throw DomainException when contextWindow is zero', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 0,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 0,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Context window must be a positive integer');
    });

    it('should throw DomainException when contextWindow is negative', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: -1000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: -1000,
          capabilities: validCapabilities,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Context window must be a positive integer');
    });

    it('should accept large context window values', () => {
      const model = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Advanced AI model',
        contextWindow: 1000000,
        capabilities: validCapabilities,
        isAvailable: true,
        isDefault: false,
      });

      expect(model.contextWindow).toBe(1000000);
    });

    it('should throw DomainException when capabilities is not an array', () => {
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: 'not-an-array' as any,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow(DomainException);
      expect(() =>
        ModelInfo.create({
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Advanced AI model',
          contextWindow: 200000,
          capabilities: 'not-an-array' as any,
          isAvailable: true,
          isDefault: false,
        })
      ).toThrow('Capabilities must be an array');
    });
  });

  describe('hasCapability', () => {
    const model = ModelInfo.create({
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      description: 'Advanced AI model',
      contextWindow: 200000,
      capabilities: ['streaming', 'tool-use', 'vision'],
      isAvailable: true,
      isDefault: true,
    });

    it('should return true for capabilities that exist', () => {
      expect(model.hasCapability('streaming')).toBe(true);
      expect(model.hasCapability('tool-use')).toBe(true);
      expect(model.hasCapability('vision')).toBe(true);
    });

    it('should return false for capabilities that do not exist', () => {
      expect(model.hasCapability('file-access')).toBe(false);
      expect(model.hasCapability('multimodal')).toBe(false);
      expect(model.hasCapability('audio')).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for models with same id', () => {
      const model1 = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Model 1',
        contextWindow: 200000,
        capabilities: ['streaming'],
        isAvailable: true,
        isDefault: true,
      });

      const model2 = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Different Name',
        description: 'Model 2',
        contextWindow: 100000,
        capabilities: ['vision'],
        isAvailable: false,
        isDefault: false,
      });

      expect(model1.equals(model2)).toBe(true);
    });

    it('should return false for models with different id', () => {
      const model1 = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Model 1',
        contextWindow: 200000,
        capabilities: ['streaming'],
        isAvailable: true,
        isDefault: true,
      });

      const model2 = ModelInfo.create({
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Model 2',
        contextWindow: 200000,
        capabilities: ['streaming'],
        isAvailable: true,
        isDefault: false,
      });

      expect(model1.equals(model2)).toBe(false);
    });

    it('should return true when comparing model to itself', () => {
      const model = ModelInfo.create({
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Advanced AI model',
        contextWindow: 200000,
        capabilities: ['streaming'],
        isAvailable: true,
        isDefault: true,
      });

      expect(model.equals(model)).toBe(true);
    });
  });
});
