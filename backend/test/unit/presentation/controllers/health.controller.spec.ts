import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '@presentation/controllers/health.controller';
import { ApplicationLifecycleService } from '@application/services/application-lifecycle.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { InstanceMetadata } from '@domain/value-objects/instance-metadata.vo';

describe('HealthController', () => {
  let controller: HealthController;
  let lifecycleService: jest.Mocked<ApplicationLifecycleService>;
  let orchestrationService: jest.Mocked<AgentOrchestrationService>;

  // Helper to create mock InstanceMetadata
  const createMockMetadata = (overrides?: Partial<{
    pid: number;
    uptime: number;
    databaseStatus: 'connected' | 'disconnected';
  }>): InstanceMetadata => {
    const defaults = {
      pid: 12345,
      uptime: 3600,
      databaseStatus: 'connected' as const,
    };
    const data = { ...defaults, ...overrides };

    return {
      getPid: jest.fn().mockReturnValue(data.pid),
      getUptime: jest.fn().mockReturnValue(data.uptime),
      getMemoryUsage: jest.fn().mockReturnValue({
        heapUsed: 45000000,
        heapTotal: 80000000,
        external: 2000000,
        rss: 120000000,
      }),
      getActiveAgents: jest.fn().mockReturnValue(0),
      getDatabaseStatus: jest.fn().mockReturnValue(data.databaseStatus),
      getStartedAt: jest.fn().mockReturnValue(new Date('2025-11-27T20:00:00.000Z')),
      getPort: jest.fn().mockReturnValue(3000),
      getNodeVersion: jest.fn().mockReturnValue('v18.17.0'),
      getInstanceId: jest.fn().mockReturnValue('test-instance-123'),
    } as unknown as InstanceMetadata;
  };

  beforeEach(async () => {
    // Create mock services
    const mockLifecycleService = {
      getInstanceMetadata: jest.fn(),
    };

    const mockOrchestrationService = {
      listAllAgents: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: ApplicationLifecycleService,
          useValue: mockLifecycleService,
        },
        {
          provide: AgentOrchestrationService,
          useValue: mockOrchestrationService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    lifecycleService = module.get(ApplicationLifecycleService);
    orchestrationService = module.get(AgentOrchestrationService);
  });

  describe('getHealth (GET /health)', () => {
    it('should return 200 OK with health data', async () => {
      // Arrange
      const mockMetadata = createMockMetadata();

      lifecycleService.getInstanceMetadata.mockReturnValue(mockMetadata);
      orchestrationService.listAllAgents.mockResolvedValue([]);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result).toBeDefined();
      expect(result.status).toBe('ok');
      expect(lifecycleService.getInstanceMetadata).toHaveBeenCalled();
      expect(orchestrationService.listAllAgents).toHaveBeenCalled();
    });

    it('should contain all required fields', async () => {
      // Arrange
      const mockMetadata = createMockMetadata();

      lifecycleService.getInstanceMetadata.mockReturnValue(mockMetadata);
      orchestrationService.listAllAgents.mockResolvedValue([]);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result).toMatchObject({
        status: 'ok',
        pid: 12345,
        uptime: 3600,
        memoryUsage: {
          heapUsed: 45000000,
          heapTotal: 80000000,
          external: 2000000,
          rss: 120000000,
        },
        activeAgents: 0,
        totalAgents: 0,
        databaseStatus: 'connected',
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: 'test-instance-123',
      });
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should include active agent count', async () => {
      // Arrange
      const mockMetadata = createMockMetadata();

      const runningAgent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test 1',
        configuration: {},
      });
      runningAgent1.markAsRunning();

      const runningAgent2 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test 2',
        configuration: {},
      });
      runningAgent2.markAsRunning();

      const completedAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test 3',
        configuration: {},
      });
      completedAgent.markAsRunning();
      completedAgent.markAsCompleted();

      lifecycleService.getInstanceMetadata.mockReturnValue(mockMetadata);
      orchestrationService.listAllAgents.mockResolvedValue([
        runningAgent1,
        runningAgent2,
        completedAgent,
      ]);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.activeAgents).toBe(2); // Only running agents
      expect(result.totalAgents).toBe(3); // All agents
    });

    it('should include database status', async () => {
      // Arrange
      const mockMetadata = createMockMetadata({ databaseStatus: 'disconnected' });

      lifecycleService.getInstanceMetadata.mockReturnValue(mockMetadata);
      orchestrationService.listAllAgents.mockResolvedValue([]);

      // Act
      const result = await controller.getHealth();

      // Assert
      expect(result.databaseStatus).toBe('disconnected');
    });

    it('should include timestamp', async () => {
      // Arrange
      const mockMetadata = createMockMetadata();

      lifecycleService.getInstanceMetadata.mockReturnValue(mockMetadata);
      orchestrationService.listAllAgents.mockResolvedValue([]);

      const beforeCall = new Date();

      // Act
      const result = await controller.getHealth();

      const afterCall = new Date();

      // Assert
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      lifecycleService.getInstanceMetadata.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      // Act & Assert
      await expect(controller.getHealth()).rejects.toThrow('Service unavailable');
    });
  });
});
