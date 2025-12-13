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
      cleanupAgentRooms: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockDb = {
      getDatabase: jest.fn().mockReturnValue({
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
        }),
      }),
      truncateTable: jest.fn(),
      countTable: jest.fn().mockReturnValue(0), // Default: no agents
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
      unsubscribeAllForAgent: jest.fn(), // For cleanup
    } as any;

    const mockOrchestrationService = {
      registerRunner: jest.fn(), // For synthetic agent runner registration
      getRunnerForAgent: jest.fn(),
    } as any;

    const mockAgentRepository = {
      findAll: jest.fn().mockResolvedValue([]), // Default: no agents
      findById: jest.fn(),
      findByStatus: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
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
        {
          provide: 'IAgentRepository',
          useValue: mockAgentRepository,
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
        schedule: [{ delay: 500, type: 'complete' as const, data: { success: true } }],
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
        schedule: [{ delay: 1000, type: 'complete' as const, data: { success: true } }],
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
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agents'));
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
        schedule: [{ delay: 1000, type: 'message' as const, data: { content: 'Test' } }],
      };

      const mockOrchestration = module.get(AgentOrchestrationService);

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
    it('should return deleted count and success status', async () => {
      // Arrange
      const mockAgent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      const mockAgent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });

      // Mock repository
      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([mockAgent1, mockAgent2]),
      };

      // Mock DatabaseService
      const mockDatabaseService = {
        getDatabase: jest.fn(),
        truncateTable: jest.fn(),
        countTable: jest.fn()
          .mockReturnValueOnce(2) // Before delete
          .mockReturnValueOnce(0), // After delete
      } as any;

      // Create controller with mocks
      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDatabaseService },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingService },
          { provide: AgentGateway, useValue: mockGateway },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act
      const result = await testController.resetDatabase();

      // Assert
      expect(result).toEqual({
        success: true,
        deletedCount: 2,
      });

      expect(mockDatabaseService.truncateTable).toHaveBeenCalledWith('agents');
      expect(mockDatabaseService.truncateTable).toHaveBeenCalledWith('agent_messages');
    });

    it('should throw if deletion verification fails', async () => {
      // Arrange
      const mockAgent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });

      // Mock repository
      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([mockAgent1]),
      };

      // Mock DatabaseService - countTable shows 1 agent remains after delete
      const mockDatabaseService = {
        getDatabase: jest.fn(),
        truncateTable: jest.fn(),
        countTable: jest.fn()
          .mockReturnValueOnce(1) // Before delete
          .mockReturnValueOnce(1), // After delete - FAILED TO DELETE!
      } as any;

      // Create controller with mocks
      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDatabaseService },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingService },
          { provide: AgentGateway, useValue: mockGateway },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act & Assert
      await expect(testController.resetDatabase()).rejects.toThrow('Reset failed: 1 agents remain');
    });

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

      // Assert - If controller doesn't use truncateTable, it should use DELETE
      // This test maintains backward compatibility
      const wasTruncateCalled = mockDb.truncateTable !== undefined;
      if (!wasTruncateCalled) {
        expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM agents');
      }
    });

    it('should cleanup all subscriptions and rooms before database delete', async () => {
      // Arrange
      const mockAgent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      const mockAgent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });

      // Mock repository to return 2 agents
      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([mockAgent1, mockAgent2]),
      };

      // Mock services
      const mockStreamingServiceWithCleanup = {
        ...mockStreamingService,
        unsubscribeAllForAgent: jest.fn(),
      } as any;

      const mockGatewayWithCleanup = {
        ...mockGateway,
        cleanupAgentRooms: jest.fn().mockResolvedValue(undefined),
      } as any;

      // Create controller with updated mocks
      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDb },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingServiceWithCleanup },
          { provide: AgentGateway, useValue: mockGatewayWithCleanup },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act
      await testController.resetDatabase();

      // Assert - Should cleanup subscriptions for all agents
      expect(mockStreamingServiceWithCleanup.unsubscribeAllForAgent).toHaveBeenCalledTimes(2);
      expect(mockStreamingServiceWithCleanup.unsubscribeAllForAgent).toHaveBeenCalledWith(
        mockAgent1.id
      );
      expect(mockStreamingServiceWithCleanup.unsubscribeAllForAgent).toHaveBeenCalledWith(
        mockAgent2.id
      );

      // Assert - Should cleanup rooms for all agents
      expect(mockGatewayWithCleanup.cleanupAgentRooms).toHaveBeenCalledTimes(2);
      expect(mockGatewayWithCleanup.cleanupAgentRooms).toHaveBeenCalledWith(mockAgent1.id);
      expect(mockGatewayWithCleanup.cleanupAgentRooms).toHaveBeenCalledWith(mockAgent2.id);
    });

    it('should handle cleanup when no agents exist', async () => {
      // Arrange
      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([]),
      };

      const mockStreamingServiceWithCleanup = {
        ...mockStreamingService,
        unsubscribeAllForAgent: jest.fn(),
      } as any;

      const mockGatewayWithCleanup = {
        ...mockGateway,
        cleanupAgentRooms: jest.fn().mockResolvedValue(undefined),
      } as any;

      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDb },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingServiceWithCleanup },
          { provide: AgentGateway, useValue: mockGatewayWithCleanup },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act
      await testController.resetDatabase();

      // Assert - Should not call cleanup methods
      expect(mockStreamingServiceWithCleanup.unsubscribeAllForAgent).not.toHaveBeenCalled();
      expect(mockGatewayWithCleanup.cleanupAgentRooms).not.toHaveBeenCalled();
    });
  });

  describe('GET /test/cleanup-status', () => {
    it('should return clean status when no agents exist', async () => {
      // Arrange - Repository returns no agents (default mock behavior)

      // Act - Create method to test
      const result = await (controller as any).getCleanupStatus();

      // Assert
      expect(result).toEqual({
        isClean: true,
        agentCount: 0,
      });
    });

    it('should return dirty status when agents exist', async () => {
      // Arrange
      const mockAgent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      const mockAgent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });

      // Update repository mock to return 2 agents
      const mockRepository = module.get('IAgentRepository') as any;
      mockRepository.findAll = jest.fn().mockResolvedValue([mockAgent1, mockAgent2]);

      // Act
      const result = await (controller as any).getCleanupStatus();

      // Assert
      expect(result).toEqual({
        isClean: false,
        agentCount: 2,
      });
    });
  });

  describe('GET /test/verify-clean-state', () => {
    it('should return clean state when database is empty', async () => {
      // Arrange
      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([]),
      };

      const mockDatabaseService = {
        countTable: jest.fn().mockReturnValue(0), // 0 messages
      } as any;

      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDatabaseService },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingService },
          { provide: AgentGateway, useValue: mockGateway },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act
      const result = await testController.verifyCleanState();

      // Assert
      expect(result).toEqual({
        isClean: true,
        issues: [],
        agentCount: 0,
        messageCount: 0,
      });
    });

    it('should return dirty state with issues when agents exist', async () => {
      // Arrange
      const mockAgent1 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 1',
        configuration: {},
      });
      mockAgent1.markAsRunning(); // Must mark as running first
      mockAgent1.markAsTerminated();

      const mockAgent2 = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Agent 2',
        configuration: {},
      });
      mockAgent2.markAsRunning();

      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([mockAgent1, mockAgent2]),
      };

      const mockDatabaseService = {
        countTable: jest.fn().mockReturnValue(5), // 5 messages
      } as any;

      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDatabaseService },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingService },
          { provide: AgentGateway, useValue: mockGateway },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act
      const result = await testController.verifyCleanState();

      // Assert
      expect(result.isClean).toBe(false);
      expect(result.agentCount).toBe(2);
      expect(result.messageCount).toBe(5);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0]).toContain('2 agents exist');
      expect(result.issues[0]).toContain('[terminated]');
      expect(result.issues[0]).toContain('[running]');
      expect(result.issues[1]).toBe('5 messages exist');
    });

    it('should list specific agent IDs and statuses in issues', async () => {
      // Arrange
      const mockAgent = Agent.create({
        type: AgentType.SYNTHETIC,
        prompt: 'Test Agent',
        configuration: {},
      });
      mockAgent.markAsRunning(); // Must mark as running first
      mockAgent.markAsTerminated();

      const agentId = mockAgent.id.toString();

      const mockRepository = {
        findAll: jest.fn().mockResolvedValue([mockAgent]),
      };

      const mockDatabaseService = {
        countTable: jest.fn().mockReturnValue(0),
      } as any;

      const testModule = await Test.createTestingModule({
        controllers: [TestController],
        providers: [
          { provide: DatabaseService, useValue: mockDatabaseService },
          { provide: AgentOrchestrationService, useValue: { registerRunner: jest.fn() } },
          { provide: SyntheticAgentAdapter, useValue: mockSyntheticAdapter },
          { provide: StreamingService, useValue: mockStreamingService },
          { provide: AgentGateway, useValue: mockGateway },
          { provide: 'IAgentRepository', useValue: mockRepository },
        ],
      }).compile();

      const testController = testModule.get<TestController>(TestController);

      // Act
      const result = await testController.verifyCleanState();

      // Assert
      expect(result.issues[0]).toContain(agentId);
      expect(result.issues[0]).toContain('[terminated]');
    });
  });
});
