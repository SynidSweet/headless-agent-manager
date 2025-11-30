import { LaunchRequest } from '@domain/value-objects/launch-request.vo';
import { Agent } from '@domain/entities/agent.entity';

/**
 * Agent Launch Queue Port
 *
 * Defines the contract for queuing and serializing agent launches.
 * Ensures only ONE agent launches at a time to prevent file conflicts
 * when manipulating CLAUDE.md files for custom instructions.
 *
 * Implementation: InMemoryAgentLaunchQueue
 * Future: Could be Redis-based for distributed systems
 */
export interface IAgentLaunchQueue {
  /**
   * Adds a launch request to the queue.
   * Returns a promise that resolves when the agent is launched.
   * Launches are serialized (one at a time) to prevent file conflicts.
   *
   * @param request - The launch request to queue
   * @returns Promise that resolves to the launched Agent
   * @throws Error if launch fails
   */
  enqueue(request: LaunchRequest): Promise<Agent>;

  /**
   * Returns the number of pending requests in the queue.
   * Does not include the currently processing request.
   *
   * @returns Number of pending requests
   */
  getQueueLength(): number;

  /**
   * Cancels a pending request in the queue.
   * Has no effect if the request is already processing or completed.
   *
   * @param requestId - The UUID of the request to cancel
   */
  cancelRequest(requestId: string): void;
}
