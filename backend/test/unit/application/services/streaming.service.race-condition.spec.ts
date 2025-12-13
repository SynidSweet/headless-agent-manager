import { Test, TestingModule } from '@nestjs/testing';
import { StreamingService } from '@application/services/streaming.service';
import { AgentMessageService } from '@application/services/agent-message.service';
import { IWebSocketGateway } from '@application/ports/websocket-gateway.port';
import { IAgentRepository } from '@application/ports/agent-repository.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentMessage, IAgentObserver } from '@application/ports/agent-runner.port';

/**
 * StreamingService Race Condition Tests
 *
 * These tests verify that the fire-and-forget race condition is fixed.
 * The bug: broadcastMessage() uses fire-and-forget async, causing messages
 * to be queried from database before writes complete.
 *
 * The fix: Make observer callbacks async and await broadcastMessage().
 */
describe('StreamingService - Race Condition Fix', () => {
  let streamingService: StreamingService;
  let mockMessageService: jest.Mocked<AgentMessageService>;
  let mockWebSocketGateway: jest.Mocked<IWebSocketGateway>;
  let mockAgentRepository: jest.Mocked<IAgentRepository>;

  beforeEach(async () => {
    // Create mocks
    mockMessageService = {
      saveMessage: jest.fn(),
      getMessagesByAgentId: jest.fn(),
      getLastSequenceNumber: jest.fn(),
      clearMessages: jest.fn(),
    } as any;

    mockWebSocketGateway = {
      emitToRoom: jest.fn(),
      emitToAll: jest.fn(),
      joinRoom: jest.fn(),
      leaveRoom: jest.fn(),
    } as any;

    mockAgentRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamingService,
        {
          provide: AgentMessageService,
          useValue: mockMessageService,
        },
        {
          provide: 'IWebSocketGateway',
          useValue: mockWebSocketGateway,
        },
        {
          provide: 'IAgentRepository',
          useValue: mockAgentRepository,
        },
      ],
    }).compile();

    streamingService = module.get<StreamingService>(StreamingService);
  });

  /**
   * TEST #1: Observer should await message persistence
   * This is the CRITICAL test that demonstrates the race condition fix
   */
  it('should await message persistence before observer returns', async () => {
    // Setup: Mock with simulated DB latency
    let messageSaved = false;
    mockMessageService.saveMessage.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          messageSaved = true;
          resolve({
            id: 'msg-123',
            agentId: 'agent-123',
            type: 'assistant',
            role: 'assistant',
            content: 'Test message',
            sequenceNumber: 1,
            createdAt: new Date().toISOString(),
          });
        }, 100); // Simulate 100ms DB latency
      });
    });

    // Create agent
    const agent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {},
    });

    // No need for custom observer - we test StreamingService's internal observer

    // Subscribe using the internal createObserver method
    // We need to test the actual observer created by StreamingService
    // So we'll call subscribeToAgent and trigger a message
    const mockRunner = {
      subscribe: jest.fn((_agentId: AgentId, observer: IAgentObserver) => {
        // Store the observer so we can trigger it
        (mockRunner as any).storedObserver = observer;
      }),
      unsubscribe: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
    };

    streamingService.subscribeToAgent(agent.id, 'client-123', mockRunner);

    // Get the observer that StreamingService created
    const streamingServiceObserver = (mockRunner as any).storedObserver;

    // Trigger message event
    const testMessage: AgentMessage = {
      type: 'assistant',
      role: 'assistant',
      content: 'Test message',
    };

    // Call the observer's onMessage (this should await persistence)
    await streamingServiceObserver.onMessage(testMessage);

    // Assert: Message MUST be saved by the time observer completes
    expect(messageSaved).toBe(true);
    expect(mockMessageService.saveMessage).toHaveBeenCalledTimes(1);
    expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalled();
  });

  /**
   * TEST #2: Multiple messages should be persisted sequentially
   * Verifies that messages don't race each other
   */
  it('should persist multiple messages sequentially without race conditions', async () => {
    const savedMessages: string[] = [];

    mockMessageService.saveMessage.mockImplementation((dto: any) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          savedMessages.push(dto.content);
          resolve({
            id: `msg-${savedMessages.length}`,
            agentId: dto.agentId,
            type: dto.type,
            role: dto.role,
            content: dto.content,
            sequenceNumber: savedMessages.length,
            createdAt: new Date().toISOString(),
          });
        }, 50); // 50ms DB latency per message
      });
    });

    const agent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {},
    });

    const mockRunner = {
      subscribe: jest.fn((_agentId: AgentId, observer: IAgentObserver) => {
        (mockRunner as any).storedObserver = observer;
      }),
      unsubscribe: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
    };

    streamingService.subscribeToAgent(agent.id, 'client-123', mockRunner);
    const streamingServiceObserver = (mockRunner as any).storedObserver;

    // Send 3 messages sequentially
    const messages = [
      { type: 'user', role: 'user', content: 'Message 1' },
      { type: 'assistant', role: 'assistant', content: 'Message 2' },
      { type: 'assistant', role: 'assistant', content: 'Message 3' },
    ] as AgentMessage[];

    for (const message of messages) {
      await streamingServiceObserver.onMessage(message);
    }

    // All messages should be saved in order
    expect(savedMessages).toEqual(['Message 1', 'Message 2', 'Message 3']);
    expect(mockMessageService.saveMessage).toHaveBeenCalledTimes(3);
  });

  /**
   * TEST #3: Verify error propagation doesn't block observer
   * The observer should log errors but not throw
   */
  it('should handle persistence errors gracefully without blocking observer', async () => {
    // Mock saveMessage to fail
    mockMessageService.saveMessage.mockRejectedValue(
      new Error('Database connection failed')
    );

    const agent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {},
    });

    const mockRunner = {
      subscribe: jest.fn((_agentId: AgentId, observer: IAgentObserver) => {
        (mockRunner as any).storedObserver = observer;
      }),
      unsubscribe: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
    };

    streamingService.subscribeToAgent(agent.id, 'client-123', mockRunner);
    const streamingServiceObserver = (mockRunner as any).storedObserver;

    const testMessage: AgentMessage = {
      type: 'assistant',
      role: 'assistant',
      content: 'Test message',
    };

    // Observer should NOT throw even if persistence fails
    // (It catches the error internally and emits agent:error)
    await expect(
      streamingServiceObserver.onMessage(testMessage)
    ).resolves.not.toThrow();

    // Error should be emitted to WebSocket
    expect(mockWebSocketGateway.emitToRoom).toHaveBeenCalledWith(
      `agent:${agent.id.toString()}`,
      'agent:error',
      expect.objectContaining({
        agentId: agent.id.toString(),
        error: expect.objectContaining({
          message: expect.stringContaining('Message broadcast failed'),
        }),
      })
    );
  });

  /**
   * TEST #4: Verify onComplete awaits persistence
   */
  it('should await completion persistence before observer returns', async () => {
    let completionPersisted = false;

    const mockAgent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {},
    });

    // Agent needs to be in RUNNING state to complete
    mockAgent.markAsRunning();

    // Mock the markAsCompleted method
    jest.spyOn(mockAgent, 'markAsCompleted');

    mockAgentRepository.findById.mockResolvedValue(mockAgent);
    mockAgentRepository.save.mockImplementation(() => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          completionPersisted = true;
          resolve();
        }, 100);
      });
    });

    const mockRunner = {
      subscribe: jest.fn((_agentId: AgentId, observer: IAgentObserver) => {
        (mockRunner as any).storedObserver = observer;
      }),
      unsubscribe: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
    };

    streamingService.subscribeToAgent(mockAgent.id, 'client-123', mockRunner);
    const streamingServiceObserver = (mockRunner as any).storedObserver;

    // Trigger completion
    await streamingServiceObserver.onComplete({
      status: 'success',
      duration: 1000,
      messageCount: 5,
    });

    // Completion MUST be persisted by the time observer completes
    expect(completionPersisted).toBe(true);
    expect(mockAgentRepository.save).toHaveBeenCalled();
  });

  /**
   * TEST #5: Verify onError awaits persistence
   */
  it('should await error persistence before observer returns', async () => {
    let errorPersisted = false;

    const mockAgent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'test prompt',
      configuration: {},
    });

    // Agent needs to be in RUNNING state to fail
    mockAgent.markAsRunning();

    // Mock the markAsFailed method
    jest.spyOn(mockAgent, 'markAsFailed');

    mockAgentRepository.findById.mockResolvedValue(mockAgent);
    mockAgentRepository.save.mockImplementation(() => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          errorPersisted = true;
          resolve();
        }, 100);
      });
    });

    const mockRunner = {
      subscribe: jest.fn((_agentId: AgentId, observer: IAgentObserver) => {
        (mockRunner as any).storedObserver = observer;
      }),
      unsubscribe: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn(),
    };

    streamingService.subscribeToAgent(mockAgent.id, 'client-123', mockRunner);
    const streamingServiceObserver = (mockRunner as any).storedObserver;

    // Trigger error
    await streamingServiceObserver.onError(new Error('Test agent error'));

    // Error MUST be persisted by the time observer completes
    expect(errorPersisted).toBe(true);
    expect(mockAgentRepository.save).toHaveBeenCalled();
  });
});
