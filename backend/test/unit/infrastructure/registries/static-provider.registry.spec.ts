import { Test, TestingModule } from '@nestjs/testing';
import { StaticProviderRegistry } from '@infrastructure/registries/static-provider.registry';
import { IProviderRegistry } from '@application/ports/provider-registry.port';

describe('StaticProviderRegistry', () => {
  let registry: IProviderRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StaticProviderRegistry],
    }).compile();

    registry = module.get<StaticProviderRegistry>(StaticProviderRegistry);
  });

  describe('getAllProviders', () => {
    it('should return array of providers', async () => {
      const providers = await registry.getAllProviders();

      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should return 2 providers (claude-code and gemini-cli)', async () => {
      const providers = await registry.getAllProviders();

      expect(providers).toHaveLength(2);
    });

    it('should include Claude Code provider', async () => {
      const providers = await registry.getAllProviders();
      const claude = providers.find(p => p.type === 'claude-code');

      expect(claude).toBeDefined();
      expect(claude?.name).toBe('Claude Code');
      expect(claude?.description).toContain('Anthropic');
    });

    it('should include Gemini CLI provider', async () => {
      const providers = await registry.getAllProviders();
      const gemini = providers.find(p => p.type === 'gemini-cli');

      expect(gemini).toBeDefined();
      expect(gemini?.name).toBe('Gemini CLI');
      expect(gemini?.description).toContain('Google');
    });

    it('should return providers with valid domain objects', async () => {
      const providers = await registry.getAllProviders();

      providers.forEach(provider => {
        expect(provider.type).toBeDefined();
        expect(provider.name).toBeDefined();
        expect(provider.description).toBeDefined();
        expect(Array.isArray(provider.models)).toBe(true);
        expect(provider.models.length).toBeGreaterThan(0);
        expect(provider.capabilities).toBeDefined();
      });
    });

    it('should return Claude Code with 3 models', async () => {
      const providers = await registry.getAllProviders();
      const claude = providers.find(p => p.type === 'claude-code');

      expect(claude).toBeDefined();
      if (!claude) return;

      const models = Array.from(claude.models);
      expect(models).toHaveLength(3);
      expect(models[0]?.id).toBe('claude-sonnet-4-5-20250929');
      expect(models[1]?.id).toBe('claude-opus-4-5-20251101');
      expect(models[2]?.id).toBe('claude-haiku-4-5-20251001');
    });

    it('should return Gemini CLI with 2 models', async () => {
      const providers = await registry.getAllProviders();
      const gemini = providers.find(p => p.type === 'gemini-cli');

      expect(gemini).toBeDefined();
      if (!gemini) return;

      const models = Array.from(gemini.models);
      expect(models).toHaveLength(2);
      expect(models[0]?.id).toBe('gemini-2.5-pro');
      expect(models[1]?.id).toBe('gemini-2.5-flash');
    });
  });

  describe('getProviderByType', () => {
    it('should return Claude Code provider', async () => {
      const provider = await registry.getProviderByType('claude-code' as any);

      expect(provider).toBeDefined();
      expect(provider.type).toBe('claude-code');
      expect(provider.name).toBe('Claude Code');
    });

    it('should return Gemini CLI provider', async () => {
      const provider = await registry.getProviderByType('gemini-cli' as any);

      expect(provider).toBeDefined();
      expect(provider.type).toBe('gemini-cli');
      expect(provider.name).toBe('Gemini CLI');
    });

    it('should throw error for unknown provider type', async () => {
      await expect(registry.getProviderByType('unknown' as any)).rejects.toThrow('Provider not found');
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for Claude Code', async () => {
      const available = await registry.isProviderAvailable('claude-code' as any);

      expect(available).toBe(true);
    });

    it('should return true for Gemini CLI', async () => {
      const available = await registry.isProviderAvailable('gemini-cli' as any);

      expect(available).toBe(true);
    });

    it('should return false for unknown provider', async () => {
      const available = await registry.isProviderAvailable('unknown' as any);

      expect(available).toBe(false);
    });
  });
});
