import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { IAgentLaunchQueue } from '@application/ports/agent-launch-queue.port';
import { LaunchRequest } from '@domain/value-objects/launch-request.vo';
import { Agent } from '@domain/entities/agent.entity';
import { ILogger } from '@application/ports/logger.port';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';

/**
 * Queued Request
 * Internal data structure for tracking queued launch requests
 */
interface QueuedRequest {
  request: LaunchRequest;
  resolve: (agent: Agent) => void;
  reject: (error: Error) => void;
}

/**
 * In-Memory Agent Launch Queue
 *
 * Serializes agent launches to prevent file conflicts when manipulating
 * CLAUDE.md files for custom instructions.
 *
 * Features:
 * - FIFO queue processing
 * - One launch at a time (concurrency = 1)
 * - Request cancellation support
 * - Error handling and recovery
 *
 * Thread-safe for single-process deployments.
 * For distributed systems, use Redis-based queue implementation.
 */
@Injectable()
export class InMemoryAgentLaunchQueue implements IAgentLaunchQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;

  constructor(
    @Inject(forwardRef(() => AgentOrchestrationService))
    private readonly orchestrationService: AgentOrchestrationService,
    @Inject('ILogger') private readonly logger: ILogger,
  ) {}

  /**
   * Adds a launch request to the queue.
   * Returns a promise that resolves when the agent is launched.
   * Launches are serialized (one at a time).
   */
  async enqueue(request: LaunchRequest): Promise<Agent> {
    this.logger.info('Launch request added to queue', {
      requestId: request.id,
      agentType: request.agentType,
      hasInstructions: request.hasInstructions(),
      queueLength: this.queue.length,
    });

    return new Promise<Agent>((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Returns the number of pending requests in the queue.
   * Does not include the currently processing request.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Cancels a pending request in the queue.
   * Has no effect if the request is already processing or completed.
   */
  cancelRequest(requestId: string): void {
    const index = this.queue.findIndex(item => item.request.id === requestId);

    if (index === -1) {
      this.logger.warn('Cannot cancel request - not in queue', { requestId });
      return;
    }

    const [cancelled] = this.queue.splice(index, 1);
    if (cancelled) {
      cancelled.reject(new Error('Launch request cancelled'));
    }

    this.logger.info('Launch request cancelled', {
      requestId,
      remainingQueueLength: this.queue.length,
    });
  }

  /**
   * Processes the queue sequentially.
   * Only one request is processed at a time.
   */
  private async processQueue(): Promise<void> {
    // Already processing - new requests will be handled when queue continues
    if (this.processing) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      this.logger.info('Processing launch request', {
        requestId: item.request.id,
        remainingInQueue: this.queue.length,
      });

      try {
        // Call orchestration service to perform the actual launch
        // This method will be added to AgentOrchestrationService in Phase 4
        const agent = await this.orchestrationService.launchAgentDirect(
          item.request
        );

        this.logger.info('Launch request completed', {
          requestId: item.request.id,
          agentId: agent.id.toString(),
        });

        item.resolve(agent);
      } catch (error) {
        this.logger.error('Launch request failed', {
          requestId: item.request.id,
          error: error instanceof Error ? error.message : String(error),
        });

        item.reject(error as Error);
      }
    }

    this.processing = false;
  }
}
