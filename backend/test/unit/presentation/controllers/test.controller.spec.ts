import { Test, TestingModule } from '@nestjs/testing';
import { TestController } from '@presentation/controllers/test.controller';
import { DatabaseService } from '@infrastructure/database/database.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { SyntheticAgentAdapter } from '@infrastructure/adapters/synthetic-agent.adapter';
import { StreamingService } from '@application/services/streaming.service';
import { AgentGateway } from '@application/gateways/agent.gateway';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * TDD Test for TestController
 *
 * Purpose: Verify that launchSyntheticAgent emits agent:created WebSocket event
 *
 * This test catches the bug where synthetic agents are created but the
 * agent:created event is not emitted, causing E2E tests to timeout.
 */
describe('TestController', () => {
  let controller: TestController;
  let module: TestingModule;
  let mockGateway: jest.Mocked<AgentGateway>;
  let mockDb: any;
  let mockSyntheticAdapter: jest.Mocked<SyntheticAgentAdapter>;
  let mockStreamingService: jest.Mocked<StreamingService>;

  beforeEach(async () => {
    // Create mocks
    mockGateway = {
      emitToAll: jest.fn(),
    } as any;

    mockDb = {
      getDatabase: jest.fn().mockReturnValue({
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
        }),
      }),
    };

    // Create a mock agent to return from start()
    const mockAgent = Agent.create({
      type: AgentType.SYNTHETIC,
      prompt: 'Test agent',
      configuration: { outputFormat: 'stream-json' },
    });
    mockAgent.markAsRunning();

    mockSyntheticAdapter = {
      configure: jest.fn(),
      subscribe: jest.fn(),
      start: jest.fn().mockResolvedValue(mockAgent),
    } as any;

    mockStreamingService = {
      broadcastMessage: jest.fn(),
      broadcastStatusChange: jest.fn(),
      broadcastError: jest.fn(),
      broadcastComplete: jest.fn(),
      subscribeToAgent: jest.fn(), // **FIX**: Added missing method that TestController now calls
    } as any;

    const mockOrchestrationService = {
      registerRunner: jest.fn(), // For synthetic agent runner registration
      getRunnerForAgent: jest.fn(),
    } as any;

    module = await Test.createTestingModule({
      controllers: [TestController],
      providers: [
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: AgentOrchestrationService,
          useValue: mockOrchestrationService,
        },
        {
          provide: SyntheticAgentAdapter,
          useValue: mockSyntheticAdapter,
        },
        {
          provide: StreamingService,
          useValue: mockStreamingService,
        },
        {
          provide: AgentGateway,
          useValue: mockGateway,
        },
      ],
    }).compile();

    controller = module.get<TestController>(TestController);
  });

  describe('launchSyntheticAgent', () => {
    /**
     * TDD RED: This test should FAIL initially
     *
     * This verifies the critical requirement: synthetic agents must emit
     * agent:created events just like regular agents do.
     */
    it('should emit agent:created event to all WebSocket clients', async () => {
      // Arrange
      const dto = {
        prompt: 'Test synthetic agent',
        schedule: [
          { delay: 1000, type: 'message' as const, data: { content: 'Test' } },
          { delay: 2000, type: 'complete' as const, data: { success: true } },
        ],
      };

      // Act
      const result = await controller.launchSyntheticAgent(dto);

      // Assert
      expect(mockGateway.emitToAll).toHaveBeenCalledTimes(1);
      expect(mockGateway.emitToAll).toHaveBeenCalledWith(
        'agent:created',
        expect.objectContaining({
          agent: expect.objectContaining({
            id: result.agentId,
            type: 'synthetic',
            status: 'running',
            session: expect.objectContaining({
              prompt: expect.any(String), // Agent prompt from mock
            }),
          }),
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit agent:created with correct payload structure', async () => {
      // Arrange
      const dto = {
        prompt: 'Another test',
        schedule: [
          { delay: 500, type: 'complete' as const, data: { success: true } },
        ],
      };

      // Act
      await controller.launchSyntheticAgent(dto);

      // Assert
      expect(mockGateway.emitToAll).toHaveBeenCalled();

      const emitCall = mockGateway.emitToAll.mock.calls[0];
      expect(emitCall).toBeDefined();
      expect(emitCall![0]).toBe('agent:created');

      const payload = emitCall![1] as any;
      expect(payload.agent).toHaveProperty('id');
      expect(payload.agent).toHaveProperty('type', 'synthetic');
      expect(payload.agent).toHaveProperty('status', 'running');
      expect(payload.agent).toHaveProperty('session');
      expect(payload.agent).toHaveProperty('createdAt');
      expect(payload.agent).toHaveProperty('startedAt');
      expect(payload).toHaveProperty('timestamp');
    });

    it('should configure and start synthetic adapter', async () => {
      // Arrange
      const dto = {
        prompt: 'Test',
        schedule: [
          { delay: 1000, type: 'complete' as const, data: { success: true } },
        ],
      };

      // Act
      await controller.launchSyntheticAgent(dto);

      // Assert
      expect(mockSyntheticAdapter.configure).toHaveBeenCalled();
      // **UPDATED**: TestController no longer subscribes directly - it delegates to StreamingService
      // expect(mockSyntheticAdapter.subscribe).toHaveBeenCalled(); // OLD BEHAVIOR (caused duplicate subscriptions!)
      expect(mockStreamingService.subscribeToAgent).toHaveBeenCalled(); // NEW BEHAVIOR (single subscription via StreamingService)
      expect(mockSyntheticAdapter.start).toHaveBeenCalled();
    });

    it('should save agent to database', async () => {
      // Arrange
      const dto = {
        prompt: 'DB test',
        schedule: [],
      };

      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
      });

      mockDb.getDatabase.mockReturnValue({
        prepare: mockPrepare,
      });

      // Act
      await controller.launchSyntheticAgent(dto);

      // Assert
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents')
      );
    });

    /**
     * TDD Test: Synthetic agents should be subscribable
     *
     * Following LSP (Liskov Substitution Principle):
     * Synthetic agents should work like regular agents - clients should be
     * able to subscribe to them to receive messages.
     *
     * This requires registering the synthetic runner with the orchestration
     * service so that gateway.handleSubscribe() can find it.
     */
    it('should register synthetic adapter runner for subscriptions', async () => {
      // Arrange
      const dto = {
        prompt: 'Subscription test',
        schedule: [
          { delay: 1000, type: 'message' as const, data: { content: 'Test' } },
        ],
      };

      const mockOrchestration = module.get(AgentOrchestrationService) as any;

      // Act
      const result = await controller.launchSyntheticAgent(dto);

      // Assert
      // The synthetic adapter should be registered with orchestration service
      // so clients can subscribe to receive messages
      expect(mockOrchestration.registerRunner).toHaveBeenCalledTimes(1);
      expect(mockOrchestration.registerRunner).toHaveBeenCalledWith(
        expect.any(Object), // AgentId
        mockSyntheticAdapter
      );

      console.log('✅ Synthetic runner registered for agent:', result.agentId);
    });
  });

  describe('resetDatabase', () => {
    it('should delete all agents from database', async () => {
      // Arrange
      const mockPrepare = jest.fn().mockReturnValue({
        run: jest.fn(),
      });

      mockDb.getDatabase.mockReturnValue({
        prepare: mockPrepare,
      });

      // Act
      await controller.resetDatabase();

      // Assert
      expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM agents');
    });
  });
});
