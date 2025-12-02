import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';
import { DomainExceptionFilter } from '@/presentation/filters/domain-exception.filter';

/**
 * End-to-End Integration Test
 * Tests complete agent lifecycle: launch, query, terminate
 *
 * Note: This test uses the in-memory repository
 * Real agent launching is tested separately due to CLI requirements
 */
describe('Agent Flow (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply same configuration as main.ts
    app.enableCors();
    app.useGlobalFilters(new DomainExceptionFilter());
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should complete full agent lifecycle', async () => {
    // 1. Launch agent
    const launchDto: LaunchAgentDto = {
      type: 'claude-code',
      prompt: 'Test prompt for E2E',
      configuration: {},
    } as LaunchAgentDto;

    const launchResponse = await request(app.getHttpServer())
      .post('/api/agents')
      .send(launchDto)
      .expect(201);

    expect(launchResponse.body).toHaveProperty('agentId');
    expect(launchResponse.body).toHaveProperty('status');
    expect(launchResponse.body).toHaveProperty('createdAt');

    const agentId = launchResponse.body.agentId;

    // 2. Query all agents
    const listResponse = await request(app.getHttpServer()).get('/api/agents').expect(200);

    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.length).toBeGreaterThan(0);

    // 3. Get specific agent
    const getResponse = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}`)
      .expect(200);

    expect(getResponse.body.id).toBe(agentId);
    expect(getResponse.body.type).toBe('claude-code');

    // 4. Get agent status
    const statusResponse = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}/status`)
      .expect(200);

    expect(statusResponse.body.agentId).toBe(agentId);
    expect(statusResponse.body).toHaveProperty('status');

    // 5. Terminate agent using force=true (agent may not be running in test environment)
    // Force mode bypasses status checks for testing
    await request(app.getHttpServer()).delete(`/api/agents/${agentId}?force=true`).expect(204);
  });

  it('should handle invalid agent ID', async () => {
    await request(app.getHttpServer()).get('/api/agents/invalid-uuid').expect(400);
  });

  it('should return 404 for non-existent agent', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    await request(app.getHttpServer()).get(`/api/agents/${fakeUuid}`).expect(404);
  });

  it('should validate launch request body', async () => {
    const invalidDto = {
      type: '',
      prompt: '',
    };

    await request(app.getHttpServer()).post('/api/agents').send(invalidDto).expect(400);
  });

  it('should list active agents separately', async () => {
    const response = await request(app.getHttpServer()).get('/api/agents/active').expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
