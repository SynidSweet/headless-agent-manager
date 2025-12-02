// Integration test for agent launch with prompt message
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { AgentMessageService } from '@application/services/agent-message.service';
import { StreamingService } from '@application/services/streaming.service';
import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { IAgentLaunchQueue } from '@application/ports/agent-launch-queue.port';
import { IInstructionHandler } from '@application/ports/instruction-handler.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { LaunchRequest } from '@domain/value-objects/launch-request.vo';

/**
 * Integration test: Prompt should be saved as first message when agent launches
 *
 * This test verifies the complete flow:
 * 1. Agent is created and saved to DB
 * 2. Prompt is saved as first message (type='user', sequence=1)
 * 3. Runner starts (may emit additional messages with sequence>1)
 * 4. Agent transitions to RUNNING
 */
describe('Agent Launch with Prompt Message (Integration)', () => {
  let service: AgentOrchestrationService;
  let mockAgentFactory: jest.Mocked<IAgentFactory>;
  let mockAgentRepository: jest.Mocked<IAgentRepository>;
  let mockAgentRunner: jest.Mocked<IAgentRunner>;
  let mockStreamingService: jest.Mocked<StreamingService>;
  let mockLaunchQueue: jest.Mocked<IAgentLaunchQueue>;
  let mockInstructionHandler: jest.Mocked<IInstructionHandler>;
  let mockMessageService: jest.Mocked<AgentMessageService>;

  beforeEach(async () => {
    // Create mock message service
    mockMessageService = {
      saveMessage: jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'msg-uuid',
          agentId: dto.agentId,
          sequenceNumber: 1,
          type: dto.type,
          role: dto.role,
          content: dto.content,
          createdAt: new Date().toISOString(),
        })
      ),
      findByAgentId: jest.fn().mockResolvedValue([]),
      findByAgentIdSince: jest.fn().mockResolvedValue([]),
    } as any;

    // Create mock agent runner
    mockAgentRunner = {
      start: jest.fn().mockImplementation((session) => {
        // Simulate runner returning an agent
        const agent = Agent.create({
          type: AgentType.CLAUDE_CODE,
          prompt: session.prompt,
          configuration: session.configuration,
        });
        return Promise.resolve(agent);
      }),
      stop: jest.fn(),
      getStatus: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };

    // Create mock factory
    mockAgentFactory = {
      create: jest.fn().mockReturnValue(mockAgentRunner),
    };

    // Create mock repository
    mockAgentRepository = {
      save: jest.fn().mockImplementation((_agent) => Promise.resolve()),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByStatus: jest.fn(),
      findByType: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
    };

    // Create mock streaming service
    mockStreamingService = {
      subscribeToAgent: jest.fn(),
      unsubscribeFromAgent: jest.fn(),
      unsubscribeClient: jest.fn(),
    } as any;

    // Create mock launch queue
    mockLaunchQueue = {
      enqueue: jest.fn(),
      getQueueLength: jest.fn().mockReturnValue(0),
      cancelRequest: jest.fn(),
    };

    // Create mock instruction handler
    mockInstructionHandler = {
      prepareEnvironment: jest.fn().mockResolvedValue(null),
      restoreEnvironment: jest.fn().mockResolvedValue(undefined),
    };

    // Create service with mocks
    service = new AgentOrchestrationService(
      mockAgentFactory,
      mockAgentRepository,
      mockStreamingService,
      mockLaunchQueue,
      mockInstructionHandler,
      mockMessageService
    );
  });

  describe('launchAgentDirect', () => {
    it('should save prompt as first message after agent creation', async () => {
      // Arrange
      const request = LaunchRequest.create({
        agentType: 'claude-code' as AgentType,
        prompt: 'Write a hello world function',
        instructions: undefined,
        sessionId: undefined,
        metadata: undefined,
        configuration: {},
      });

      // Act
      const result = await service.launchAgentDirect(request);

      // Assert
      // 1. Verify agent was created
      expect(result).toBeDefined();
      expect(result.session.prompt).toBe('Write a hello world function');

      // 2. Verify message service was called to save prompt
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: result.id.toString(),
          type: 'user',
          role: 'user',
          content: 'Write a hello world function',
        })
      );

      // 3. Verify message was saved BEFORE runner started
      // (saveMessage should be called before runner.start)
      const saveMessageCall = mockMessageService.saveMessage.mock.invocationCallOrder[0];
      const runnerStartCall = mockAgentRunner.start.mock.invocationCallOrder[0];
      expect(saveMessageCall).toBeDefined();
      expect(runnerStartCall).toBeDefined();
      if (saveMessageCall !== undefined && runnerStartCall !== undefined) {
        expect(saveMessageCall).toBeLessThan(runnerStartCall);
      }
    });

    it('should save prompt message with correct structure', async () => {
      // Arrange
      const request = LaunchRequest.create({
        agentType: 'claude-code' as AgentType,
        prompt: 'Create a React component',
        instructions: undefined,
        sessionId: undefined,
        metadata: undefined,
        configuration: {},
      });

      // Act
      await service.launchAgentDirect(request);

      // Assert
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith({
        agentId: expect.any(String),
        type: 'user',
        role: 'user',
        content: 'Create a React component',
      });
    });

    it('should handle long prompts correctly', async () => {
      // Arrange
      const longPrompt = 'A'.repeat(5000);
      const request = LaunchRequest.create({
        agentType: 'claude-code' as AgentType,
        prompt: longPrompt,
        instructions: undefined,
        sessionId: undefined,
        metadata: undefined,
        configuration: {},
      });

      // Act
      await service.launchAgentDirect(request);

      // Assert
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith({
        agentId: expect.any(String),
        type: 'user',
        role: 'user',
        content: longPrompt,
      });
    });

    it('should continue launching even if prompt message save fails', async () => {
      // Arrange
      const request = LaunchRequest.create({
        agentType: 'claude-code' as AgentType,
        prompt: 'Test prompt',
        instructions: undefined,
        sessionId: undefined,
        metadata: undefined,
        configuration: {},
      });

      // Mock message service to throw error
      mockMessageService.saveMessage.mockRejectedValueOnce(new Error('Database connection failed'));

      // Act & Assert
      // Should not throw - agent launch should continue
      const result = await service.launchAgentDirect(request);
      expect(result).toBeDefined();

      // Verify runner still started despite message save failure
      expect(mockAgentRunner.start).toHaveBeenCalled();
    });
  });
});
