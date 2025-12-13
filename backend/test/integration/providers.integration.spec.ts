import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '@/app.module';

describe('Providers Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/providers', () => {
    it('should return 200 OK', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should return ProvidersResponseDto structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      expect(response.body).toHaveProperty('providers');
      expect(response.body).toHaveProperty('totalCount');
      expect(Array.isArray(response.body.providers)).toBe(true);
      expect(typeof response.body.totalCount).toBe('number');
    });

    it('should return 2 providers (claude-code and gemini-cli)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      expect(response.body.totalCount).toBe(2);
      expect(response.body.providers).toHaveLength(2);
    });

    it('should include Claude Code provider with correct structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const claude = response.body.providers.find(
        (p: any) => p.type === 'claude-code'
      );

      expect(claude).toBeDefined();
      expect(claude.name).toBe('Claude Code');
      expect(claude.description).toContain('Anthropic');
      expect(claude.isAvailable).toBe(true);
      expect(Array.isArray(claude.models)).toBe(true);
      expect(claude.models.length).toBeGreaterThan(0);
      expect(claude.capabilities).toBeDefined();
    });

    it('should include Gemini CLI provider with correct structure', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const gemini = response.body.providers.find(
        (p: any) => p.type === 'gemini-cli'
      );

      expect(gemini).toBeDefined();
      expect(gemini.name).toBe('Gemini CLI');
      expect(gemini.description).toContain('Google');
      expect(gemini.isAvailable).toBe(true);
      expect(Array.isArray(gemini.models)).toBe(true);
      expect(gemini.models.length).toBeGreaterThan(0);
      expect(gemini.capabilities).toBeDefined();
    });

    it('should include complete model information for Claude Code', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const claude = response.body.providers.find(
        (p: any) => p.type === 'claude-code'
      );

      expect(claude.models).toHaveLength(3);

      // Check Sonnet 4.5 (default)
      const sonnet = claude.models.find((m: any) => m.id === 'claude-sonnet-4-5-20250929');
      expect(sonnet).toBeDefined();
      expect(sonnet.name).toBe('Claude Sonnet 4.5');
      expect(sonnet.isDefault).toBe(true);
      expect(sonnet.isAvailable).toBe(true);
      expect(sonnet.contextWindow).toBe(200000);
      expect(sonnet.costTier).toBe('medium');
      expect(Array.isArray(sonnet.capabilities)).toBe(true);
      expect(sonnet.capabilities.length).toBeGreaterThan(0);

      // Check Opus 4.5
      const opus = claude.models.find((m: any) => m.id === 'claude-opus-4-5-20251101');
      expect(opus).toBeDefined();
      expect(opus.name).toBe('Claude Opus 4.5');
      expect(opus.costTier).toBe('high');

      // Check Haiku 4.5
      const haiku = claude.models.find((m: any) => m.id === 'claude-haiku-4-5-20251001');
      expect(haiku).toBeDefined();
      expect(haiku.name).toBe('Claude Haiku 4.5');
      expect(haiku.costTier).toBe('low');
    });

    it('should include complete model information for Gemini CLI', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const gemini = response.body.providers.find(
        (p: any) => p.type === 'gemini-cli'
      );

      expect(gemini.models).toHaveLength(2);

      // Check Gemini 2.5 Pro (default)
      const pro = gemini.models.find((m: any) => m.id === 'gemini-2.5-pro');
      expect(pro).toBeDefined();
      expect(pro.name).toBe('Gemini 2.5 Pro');
      expect(pro.isDefault).toBe(true);
      expect(pro.contextWindow).toBe(1000000);
      expect(pro.costTier).toBe('medium');

      // Check Gemini 2.5 Flash
      const flash = gemini.models.find((m: any) => m.id === 'gemini-2.5-flash');
      expect(flash).toBeDefined();
      expect(flash.name).toBe('Gemini 2.5 Flash');
      expect(flash.costTier).toBe('low');
    });

    it('should include provider capabilities', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const claude = response.body.providers.find(
        (p: any) => p.type === 'claude-code'
      );

      expect(claude.capabilities).toEqual({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: true,
        mcpSupport: true,
        modelSelection: true,
      });

      const gemini = response.body.providers.find(
        (p: any) => p.type === 'gemini-cli'
      );

      expect(gemini.capabilities).toEqual({
        streaming: true,
        multiTurn: true,
        toolUse: true,
        fileAccess: true,
        customInstructions: false,
        mcpSupport: false,
        modelSelection: true,
      });
    });

    it('should return consistent data across multiple requests', async () => {
      const response1 = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      expect(response1.body).toEqual(response2.body);
    });

    it('should have fast response time (< 100ms)', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .get('/api/providers')
        .expect(200);

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100);
    });
  });
});
