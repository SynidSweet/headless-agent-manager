import { Test, TestingModule } from '@nestjs/testing';
import { ProviderInfoService } from '@application/services/provider-info.service';
import { IProviderRegistry } from '@application/ports/provider-registry.port';
import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';

describe('ProviderInfoService', () => {
  let service: ProviderInfoService;
  let mockRegistry: jest.Mocked<IProviderRegistry>;

  beforeEach(async () => {
    mockRegistry = {
      getAllProviders: jest.fn(),
      getProviderByType: jest.fn(),
      isProviderAvailable: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderInfoService,
        {
          provide: 'IProviderRegistry',
          useValue: mockRegistry,
        },
      ],
    }).compile();

    service = module.get<ProviderInfoService>(ProviderInfoService);
  });

  describe('getAvailableProviders', () => {
    it('should call registry.getAllProviders', async () => {
      mockRegistry.getAllProviders.mockResolvedValue([]);

      await service.getAvailableProviders();

      expect(mockRegistry.getAllProviders).toHaveBeenCalledTimes(1);
    });

    it('should return providers from registry', async () => {
      const mockProvider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Claude',
        description: 'Test',
        models: [
          ModelInfo.create({
            id: 'test',
            name: 'Test',
            description: 'Test model',
            contextWindow: 10000,
            capabilities: [],
            isAvailable: true,
            isDefault: true,
          }),
        ],
        capabilities: ProviderCapabilities.create({
          streaming: true,
          multiTurn: true,
          toolUse: true,
          fileAccess: true,
          customInstructions: true,
          mcpSupport: true,
          modelSelection: true,
        }),
      });

      mockRegistry.getAllProviders.mockResolvedValue([mockProvider]);

      const result = await service.getAvailableProviders();

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mockProvider);
    });

    it('should return multiple providers', async () => {
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

      mockRegistry.getAllProviders.mockResolvedValue([provider1, provider2]);

      const result = await service.getAvailableProviders();

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(provider1);
      expect(result[1]).toBe(provider2);
    });

    it('should return empty array when no providers', async () => {
      mockRegistry.getAllProviders.mockResolvedValue([]);

      const result = await service.getAvailableProviders();

      expect(result).toEqual([]);
    });
  });

  describe('getProviderByType', () => {
    it('should call registry.getProviderByType with correct type', async () => {
      const mockProvider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Claude',
        description: 'Test',
        models: [
          ModelInfo.create({
            id: 'test',
            name: 'Test',
            description: 'Test model',
            contextWindow: 10000,
            capabilities: [],
            isAvailable: true,
            isDefault: true,
          }),
        ],
        capabilities: ProviderCapabilities.create({
          streaming: true,
          multiTurn: true,
          toolUse: true,
          fileAccess: true,
          customInstructions: true,
          mcpSupport: true,
          modelSelection: true,
        }),
      });

      mockRegistry.getProviderByType.mockResolvedValue(mockProvider);

      await service.getProviderByType('claude-code' as any);

      expect(mockRegistry.getProviderByType).toHaveBeenCalledWith('claude-code');
    });

    it('should return provider from registry', async () => {
      const mockProvider = ProviderInfo.create({
        type: 'gemini-cli' as any,
        name: 'Gemini',
        description: 'Test',
        models: [
          ModelInfo.create({
            id: 'test',
            name: 'Test',
            description: 'Test model',
            contextWindow: 10000,
            capabilities: [],
            isAvailable: true,
            isDefault: true,
          }),
        ],
        capabilities: ProviderCapabilities.create({
          streaming: true,
          multiTurn: false,
          toolUse: true,
          fileAccess: false,
          customInstructions: false,
          mcpSupport: false,
          modelSelection: true,
        }),
      });

      mockRegistry.getProviderByType.mockResolvedValue(mockProvider);

      const result = await service.getProviderByType('gemini-cli' as any);

      expect(result).toBe(mockProvider);
      expect(result.type).toBe('gemini-cli');
    });

    it('should propagate errors from registry', async () => {
      mockRegistry.getProviderByType.mockRejectedValue(new Error('Provider not found'));

      await expect(service.getProviderByType('unknown' as any)).rejects.toThrow(
        'Provider not found'
      );
    });
  });

  describe('isProviderAvailable', () => {
    it('should call registry.isProviderAvailable with correct type', async () => {
      mockRegistry.isProviderAvailable.mockResolvedValue(true);

      await service.isProviderAvailable('claude-code' as any);

      expect(mockRegistry.isProviderAvailable).toHaveBeenCalledWith('claude-code');
    });

    it('should return true for available provider', async () => {
      mockRegistry.isProviderAvailable.mockResolvedValue(true);

      const result = await service.isProviderAvailable('claude-code' as any);

      expect(result).toBe(true);
    });

    it('should return false for unavailable provider', async () => {
      mockRegistry.isProviderAvailable.mockResolvedValue(false);

      const result = await service.isProviderAvailable('gemini-cli' as any);

      expect(result).toBe(false);
    });

    it('should propagate errors from registry', async () => {
      mockRegistry.isProviderAvailable.mockRejectedValue(
        new Error('Registry unavailable')
      );

      await expect(service.isProviderAvailable('claude-code' as any)).rejects.toThrow(
        'Registry unavailable'
      );
    });
  });
});
