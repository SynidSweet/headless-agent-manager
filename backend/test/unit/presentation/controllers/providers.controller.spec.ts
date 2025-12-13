import { Test, TestingModule } from '@nestjs/testing';
import { ProvidersController } from '@presentation/controllers/providers.controller';
import { ProviderInfoService } from '@application/services/provider-info.service';
import { ProviderInfo } from '@domain/value-objects/provider-info.vo';
import { ModelInfo } from '@domain/value-objects/model-info.vo';
import { ProviderCapabilities } from '@domain/value-objects/provider-capabilities.vo';

describe('ProvidersController', () => {
  let controller: ProvidersController;
  let mockService: jest.Mocked<ProviderInfoService>;

  beforeEach(async () => {
    mockService = {
      getAvailableProviders: jest.fn(),
      getProviderByType: jest.fn(),
      isProviderAvailable: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProvidersController],
      providers: [
        {
          provide: ProviderInfoService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ProvidersController>(ProvidersController);
  });

  describe('getProviders', () => {
    it('should be defined', () => {
      expect(controller.getProviders).toBeDefined();
    });

    it('should call service.getAvailableProviders', async () => {
      mockService.getAvailableProviders.mockResolvedValue([]);

      await controller.getProviders();

      expect(mockService.getAvailableProviders).toHaveBeenCalledTimes(1);
    });

    it('should return ProvidersResponseDto', async () => {
      const mockProvider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Claude Code',
        description: 'Test',
        models: [
          ModelInfo.create({
            id: 'test-model',
            name: 'Test Model',
            description: 'Test model',
            contextWindow: 100000,
            capabilities: ['streaming'],
            isAvailable: true,
            isDefault: true,
            costTier: 'medium',
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

      mockService.getAvailableProviders.mockResolvedValue([mockProvider]);

      const result = await controller.getProviders();

      expect(result).toBeDefined();
      expect(result.totalCount).toBe(1);
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0]).toBeDefined();
      expect(result.providers[0]!.type).toBe('claude-code');
      expect(result.providers[0]!.name).toBe('Claude Code');
    });

    it('should include model information in response', async () => {
      const mockProvider = ProviderInfo.create({
        type: 'claude-code' as any,
        name: 'Claude',
        description: 'Test',
        models: [
          ModelInfo.create({
            id: 'sonnet',
            name: 'Sonnet',
            description: 'Sonnet model',
            contextWindow: 200000,
            capabilities: ['streaming', 'tool-use'],
            isAvailable: true,
            isDefault: true,
            costTier: 'medium',
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

      mockService.getAvailableProviders.mockResolvedValue([mockProvider]);

      const result = await controller.getProviders();

      expect(result.providers[0]).toBeDefined();
      expect(result.providers[0]!.models).toHaveLength(1);
      expect(result.providers[0]!.models[0]).toBeDefined();
      expect(result.providers[0]!.models[0]!.id).toBe('sonnet');
      expect(result.providers[0]!.models[0]!.name).toBe('Sonnet');
      expect(result.providers[0]!.models[0]!.contextWindow).toBe(200000);
    });

    it('should handle empty providers list', async () => {
      mockService.getAvailableProviders.mockResolvedValue([]);

      const result = await controller.getProviders();

      expect(result.totalCount).toBe(0);
      expect(result.providers).toEqual([]);
    });
  });
});
