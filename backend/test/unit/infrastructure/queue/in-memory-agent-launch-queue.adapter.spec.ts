import { InMemoryAgentLaunchQueue } from '@infrastructure/queue/in-memory-agent-launch-queue.adapter';
import { LaunchRequest } from '@domain/value-objects/launch-request.vo';
import { Agent } from '@domain/entities/agent.entity';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { ILogger } from '@application/ports/logger.port';

describe('InMemoryAgentLaunchQueue', () => {
  let queue: InMemoryAgentLaunchQueue;
  let mockOrchestrationService: any;
  let mockLogger: jest.Mocked<ILogger>;
  let mockAgent: Agent;

  beforeEach(() => {
    // Create mock orchestration service
    mockOrchestrationService = {
      launchAgentDirect: jest.fn(),
    };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Create mock agent
    mockAgent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: 'Test prompt',
      configuration: {},
    });

    queue = new InMemoryAgentLaunchQueue(mockOrchestrationService, mockLogger);
  });

  describe('enqueue', () => {
    it('should process single request immediately', async () => {
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
      });

      const result = await queue.enqueue(request);

      expect(result).toBe(mockAgent);
      expect(mockOrchestrationService.launchAgentDirect).toHaveBeenCalledWith(request);
      expect(mockOrchestrationService.launchAgentDirect).toHaveBeenCalledTimes(1);
    });

    it('should queue multiple requests and process sequentially', async () => {
      const processingTimes: number[] = [];
      const startTime = Date.now();

      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async (request: LaunchRequest) => {
          const elapsed = Date.now() - startTime;
          processingTimes.push(elapsed);
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 50));
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: request.prompt,
            configuration: {},
          });
        }
      );

      const requests = [
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Request A' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Request B' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Request C' }),
      ];

      // Enqueue all at once (should process sequentially)
      const promises = requests.map((r) => queue.enqueue(r));
      const results = await Promise.all(promises);

      // Verify all completed
      expect(results).toHaveLength(3);
      expect(results[0]!.session.prompt).toBe('Request A');
      expect(results[1]!.session.prompt).toBe('Request B');
      expect(results[2]!.session.prompt).toBe('Request C');

      // Verify sequential processing (each starts after previous finishes ~50ms)
      expect(processingTimes[1]!).toBeGreaterThan(processingTimes[0]! + 40);
      expect(processingTimes[2]!).toBeGreaterThan(processingTimes[1]! + 40);
    });

    it('should log queue operations', async () => {
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
      });

      await queue.enqueue(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Launch request added to queue',
        expect.objectContaining({
          requestId: request.id,
          agentType: AgentType.CLAUDE_CODE,
          hasInstructions: false,
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing launch request',
        expect.objectContaining({
          requestId: request.id,
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Launch request completed',
        expect.objectContaining({
          requestId: request.id,
          agentId: mockAgent.id.toString(),
        })
      );
    });

    it('should log when instructions are present', async () => {
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test prompt',
        instructions: 'Custom instructions',
      });

      await queue.enqueue(request);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Launch request added to queue',
        expect.objectContaining({
          hasInstructions: true,
        })
      );
    });
  });

  describe('getQueueLength', () => {
    it('should return 0 for empty queue', () => {
      expect(queue.getQueueLength()).toBe(0);
    });

    it('should return correct queue length for pending requests', async () => {
      mockOrchestrationService.launchAgentDirect.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return mockAgent;
      });

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'First',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Second',
      });

      queue.enqueue(request1);
      queue.enqueue(request2);

      // First is processing, second is pending
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(queue.getQueueLength()).toBe(1);
    });

    it('should decrement as requests are processed', async () => {
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const promise = queue.enqueue(request);
      // Queue starts processing immediately
      await new Promise((resolve) => setTimeout(resolve, 10));

      await promise;
      expect(queue.getQueueLength()).toBe(0);
    });
  });

  describe('cancelRequest', () => {
    it('should cancel pending request', async () => {
      mockOrchestrationService.launchAgentDirect.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return mockAgent;
      });

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Processing',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Pending',
      });

      queue.enqueue(request1);
      const promise2 = queue.enqueue(request2);

      // Give time for first to start processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      queue.cancelRequest(request2.id);

      await expect(promise2).rejects.toThrow('Launch request cancelled');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Launch request cancelled',
        expect.objectContaining({ requestId: request2.id })
      );
    });

    it('should warn when trying to cancel non-existent request', () => {
      queue.cancelRequest('non-existent-id');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot cancel request - not in queue',
        expect.objectContaining({ requestId: 'non-existent-id' })
      );
    });

    it('should not cancel currently processing request', async () => {
      mockOrchestrationService.launchAgentDirect.mockResolvedValue(mockAgent);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      const promise = queue.enqueue(request);
      // Try to cancel while processing (it's already started)
      queue.cancelRequest(request.id);

      // Should still complete successfully
      const result = await promise;
      expect(result).toBe(mockAgent);
    });
  });

  describe('error handling', () => {
    it('should propagate errors from orchestration service', async () => {
      const error = new Error('Launch failed');
      mockOrchestrationService.launchAgentDirect.mockRejectedValue(error);

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      await expect(queue.enqueue(request)).rejects.toThrow('Launch failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Launch request failed',
        expect.objectContaining({
          error: 'Launch failed',
          requestId: request.id,
        })
      );
    });

    it('should continue processing queue after error', async () => {
      const mockAgent2 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'Success',
        configuration: {},
      });

      mockOrchestrationService.launchAgentDirect
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce(mockAgent2);

      const request1 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Fail',
      });
      const request2 = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Success',
      });

      const promise1 = queue.enqueue(request1);
      const promise2 = queue.enqueue(request2);

      await expect(promise1).rejects.toThrow('First failed');
      const result2 = await promise2;
      expect(result2).toBe(mockAgent2);
      expect(result2.session.prompt).toBe('Success');
    });

    it('should handle non-Error rejections gracefully', async () => {
      mockOrchestrationService.launchAgentDirect.mockRejectedValue('String error');

      const request = LaunchRequest.create({
        agentType: AgentType.CLAUDE_CODE,
        prompt: 'Test',
      });

      await expect(queue.enqueue(request)).rejects.toBe('String error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Launch request failed',
        expect.objectContaining({
          error: 'String error',
          requestId: request.id,
        })
      );
    });
  });

  describe('concurrency safety', () => {
    it('should never process multiple requests concurrently', async () => {
      let activeCount = 0;
      let maxActiveCount = 0;

      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async (request: LaunchRequest) => {
          activeCount++;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 50));
          activeCount--;
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: request.prompt,
            configuration: {},
          });
        }
      );

      const requests = Array.from({ length: 10 }, (_, i) =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: `Request ${i}`,
        })
      );

      await Promise.all(requests.map((r) => queue.enqueue(r)));

      // Verify only 1 request was active at any time
      expect(maxActiveCount).toBe(1);
    });

    it('should process requests in FIFO order', async () => {
      const completionOrder: string[] = [];

      mockOrchestrationService.launchAgentDirect.mockImplementation(
        async (request: LaunchRequest) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          completionOrder.push(request.prompt);
          return Agent.create({
            type: AgentType.CLAUDE_CODE,
            prompt: request.prompt,
            configuration: {},
          });
        }
      );

      const requests = [
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'First' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Second' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Third' }),
      ];

      await Promise.all(requests.map((r) => queue.enqueue(r)));

      expect(completionOrder).toEqual(['First', 'Second', 'Third']);
    });
  });

  describe('queue state management', () => {
    it('should correctly track queue length during processing', async () => {
      const queueLengths: number[] = [];

      mockOrchestrationService.launchAgentDirect.mockImplementation(async () => {
        queueLengths.push(queue.getQueueLength());
        await new Promise((resolve) => setTimeout(resolve, 20));
        return mockAgent;
      });

      const requests = [
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'First' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Second' }),
        LaunchRequest.create({ agentType: AgentType.CLAUDE_CODE, prompt: 'Third' }),
      ];

      // Enqueue all
      const promises = requests.map((r) => queue.enqueue(r));

      // Give time for first to start
      await new Promise((resolve) => setTimeout(resolve, 5));

      // During first processing, 2 should be pending
      expect(queue.getQueueLength()).toBeGreaterThanOrEqual(2);

      await Promise.all(promises);

      // After all complete, queue should be empty
      expect(queue.getQueueLength()).toBe(0);

      // Queue length should have decreased as items were processed
      expect(queueLengths[0] ?? 0).toBeGreaterThanOrEqual(
        queueLengths[queueLengths.length - 1] ?? 0
      );
    });

    it('should handle rapid sequential enqueues', async () => {
      mockOrchestrationService.launchAgentDirect.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return mockAgent;
      });

      const requests = Array.from({ length: 50 }, (_, i) =>
        LaunchRequest.create({
          agentType: AgentType.CLAUDE_CODE,
          prompt: `Request ${i}`,
        })
      );

      const results = await Promise.all(requests.map((r) => queue.enqueue(r)));

      expect(results).toHaveLength(50);
      expect(queue.getQueueLength()).toBe(0);
      expect(mockOrchestrationService.launchAgentDirect).toHaveBeenCalledTimes(50);
    });
  });
});
