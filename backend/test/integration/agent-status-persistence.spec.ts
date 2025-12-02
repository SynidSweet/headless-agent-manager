import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { StreamingService } from '@application/services/streaming.service';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { SqliteAgentRepository } from '@infrastructure/repositories/sqlite-agent.repository';
import { DatabaseService } from '@infrastructure/database/database.service';
import { Agent } from '@domain/entities/agent.entity';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { LaunchAgentDto } from '@application/dto/launch-agent.dto';

/**
 * Integration Test: Agent Status Persistence
 *
 * This test verifies the COMPLETE agent lifecycle with REAL database persistence.
 * It catches bugs that unit tests miss by testing the full stack.
 *
 * Why this test matters:
 * - Unit tests mock the repository, hiding persistence bugs
 * - This test uses SqliteAgentRepository with real database
 * - Verifies agent status transitions are actually saved
 * - Would have caught the "agents stuck in INITIALIZING" bug
 */
describe('Agent Status Persistence (Integration)', () => {
  let orchestrationService: AgentOrchestrationService;
  let repository: SqliteAgentRepository;
  let databaseService: DatabaseService;
  let mockAgentFactory: jest.Mocked<IAgentFactory>;
  let mockAgentRunner: jest.Mocked<IAgentRunner>;
  let mockStreamingService: jest.Mocked<StreamingService>;
  let mockLaunchQueue: any;
  let mockInstructionHandler: any;
  let mockMessageService: any;

  beforeEach(() => {
    // Use REAL database (in-memory for speed)
    databaseService = new DatabaseService(':memory:');
    databaseService.onModuleInit();
    repository = new SqliteAgentRepository(databaseService);

    // Mock only the external dependencies (runner, streaming)
    mockAgentRunner = {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    mockAgentFactory = {
      create: jest.fn().mockReturnValue(mockAgentRunner),
    };

    mockStreamingService = {
      subscribeToAgent: jest.fn(),
    } as any;

    // Mock launch queue
    mockLaunchQueue = {
      enqueue: jest.fn().mockImplementation(async (request) => {
        // Simulate queue processing by calling launchAgentDirect
        return orchestrationService.launchAgentDirect(request);
      }),
      getQueueLength: jest.fn().mockReturnValue(0),
      cancelRequest: jest.fn(),
    };

    // Mock instruction handler
    mockInstructionHandler = {
      prepareEnvironment: jest.fn().mockResolvedValue(null),
      restoreEnvironment: jest.fn().mockResolvedValue(undefined),
    };

    // Mock message service
    mockMessageService = {
      saveMessage: jest.fn().mockResolvedValue({
        id: 'msg-uuid',
        agentId: 'agent-id',
        sequenceNumber: 1,
        type: 'user',
        role: 'user',
        content: 'test',
        createdAt: new Date().toISOString(),
      }),
      findByAgentId: jest.fn().mockResolvedValue([]),
      findByAgentIdSince: jest.fn().mockResolvedValue([]),
    };

    // Service uses REAL repository
    orchestrationService = new AgentOrchestrationService(
      mockAgentFactory,
      repository,
      mockStreamingService,
      mockLaunchQueue,
      mockInstructionHandler,
      mockMessageService
    );
  });

  afterEach(() => {
    databaseService.onModuleDestroy();
  });

  describe('launchAgent with real database', () => {
    it('should persist agent status changes through the complete lifecycle', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test prompt for integration';
      dto.configuration = {};

      // Mock runner to return agent with RUNNING status (simulating real adapter behavior)
      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt for integration',
        configuration: {},
      });
      mockAgent.markAsRunning();
      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      const launchedAgent = await orchestrationService.launchAgent(dto);

      // Assert: Verify returned agent has correct status
      expect(launchedAgent.status).toBe(AgentStatus.RUNNING);

      // CRITICAL: Verify database actually contains RUNNING status
      // This is what unit tests miss!
      const persistedAgent = await repository.findById(launchedAgent.id);

      expect(persistedAgent).toBeDefined();
      expect(persistedAgent!.id.toString()).toBe(launchedAgent.id.toString());

      // THIS TEST WILL FAIL if status update isn't persisted!
      expect(persistedAgent!.status).toBe(AgentStatus.RUNNING);
      expect(persistedAgent!.startedAt).toBeDefined();
    });

    it('should allow querying active agents after launch', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test active query';
      dto.configuration = {};

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test active query',
        configuration: {},
      });
      mockAgent.markAsRunning();
      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      await orchestrationService.launchAgent(dto);

      // Assert: Active agents query should return the running agent
      const activeAgents = await orchestrationService.listActiveAgents();

      // THIS TEST WILL FAIL if agent is stuck in INITIALIZING!
      expect(activeAgents).toHaveLength(1);
      expect(activeAgents[0]?.status).toBe(AgentStatus.RUNNING);
    });

    it('should persist status across multiple repository queries', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test persistence';
      dto.configuration = {};

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test persistence',
        configuration: {},
      });
      mockAgent.markAsRunning();
      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      const agent = await orchestrationService.launchAgent(dto);

      // Assert: Multiple queries should return consistent status
      const query1 = await repository.findById(agent.id);
      const query2 = await repository.findById(agent.id);
      const query3 = await orchestrationService.getAgentById(agent.id);

      expect(query1!.status).toBe(AgentStatus.RUNNING);
      expect(query2!.status).toBe(AgentStatus.RUNNING);
      expect(query3.status).toBe(AgentStatus.RUNNING);
    });

    it('should verify findAll returns agents with correct status', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test findAll';
      dto.configuration = {};

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test findAll',
        configuration: {},
      });
      mockAgent.markAsRunning();
      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act
      await orchestrationService.launchAgent(dto);

      // Assert: findAll should show RUNNING status
      const allAgents = await repository.findAll();

      expect(allAgents).toHaveLength(1);
      expect(allAgents[0]?.status).toBe(AgentStatus.RUNNING);
    });
  });

  describe('status transition persistence', () => {
    it('should persist INITIALIZING -> RUNNING -> TERMINATED transitions', async () => {
      // Arrange
      const dto = new LaunchAgentDto();
      dto.type = 'claude-code';
      dto.prompt = 'Test full lifecycle';
      dto.configuration = {};

      const mockAgent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Test full lifecycle',
        configuration: {},
      });
      mockAgent.markAsRunning();
      mockAgentRunner.start.mockResolvedValue(mockAgent);

      // Act 1: Launch (INITIALIZING -> RUNNING)
      const agent = await orchestrationService.launchAgent(dto);

      // Assert 1: Should be RUNNING in database
      let persisted = await repository.findById(agent.id);
      expect(persisted!.status).toBe(AgentStatus.RUNNING);

      // Act 2: Terminate (RUNNING -> TERMINATED)
      await orchestrationService.terminateAgent(agent.id);

      // Assert 2: Should be TERMINATED in database
      persisted = await repository.findById(agent.id);
      expect(persisted!.status).toBe(AgentStatus.TERMINATED);
    });
  });
});
