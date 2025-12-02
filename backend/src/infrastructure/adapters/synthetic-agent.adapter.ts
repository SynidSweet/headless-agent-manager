/**
 * Synthetic Agent Adapter
 *
 * PHASE 4: Testing Infrastructure
 *
 * This adapter allows tests to create agents with scripted, controllable timing.
 * Instead of waiting 5-60 seconds for real Claude CLI responses, synthetic agents
 * emit events on a precise schedule.
 *
 * Benefits:
 * - Deterministic timing (tests know exactly when events arrive)
 * - Fast tests (complete in seconds, not minutes)
 * - Edge case testing (gaps, delays, errors)
 * - Long-running scenario testing (simulate hours in seconds)
 *
 * @example
 * ```typescript
 * const adapter = new SyntheticAgentAdapter();
 * const runner = adapter.createRunner({
 *   schedule: [
 *     { delay: 1000, type: 'message', data: { content: 'First' } },
 *     { delay: 2000, type: 'message', data: { content: 'Second' } },
 *     { delay: 3000, type: 'complete' }
 *   ]
 * });
 *
 * await runner.start(session);
 * // Messages arrive at exactly 1s, 2s, then completion at 3s
 * ```
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  IAgentRunner,
  IAgentObserver,
  AgentMessage,
  AgentResult,
} from '@application/ports/agent-runner.port';
import { Session } from '@domain/value-objects/session.vo';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * Scheduled event for synthetic agent
 */
export interface SyntheticEvent {
  delay: number; // Milliseconds from start
  type: 'message' | 'status' | 'error' | 'complete';
  data: any;
}

/**
 * Configuration for synthetic agent
 */
export interface SyntheticAgentConfig {
  schedule: SyntheticEvent[];
  agentId?: string; // Optional - for testing specific IDs
}

/**
 * Synthetic Agent Runner
 * Emits scripted events on a precise schedule for testing
 */
@Injectable()
export class SyntheticAgentAdapter implements IAgentRunner {
  private readonly logger = new Logger(SyntheticAgentAdapter.name);
  private observers: Map<string, IAgentObserver[]> = new Map();
  private timers: Map<string, NodeJS.Timeout[]> = new Map();
  private configs: Map<string, SyntheticAgentConfig> = new Map();
  private startTime: Map<string, number> = new Map();

  /**
   * Configure a synthetic agent with a schedule
   */
  configure(agentId: AgentId, config: SyntheticAgentConfig): void {
    this.configs.set(agentId.toString(), config);
    this.logger.log(
      `Configured synthetic agent ${agentId.toString()} with ${config.schedule.length} events`
    );
  }

  /**
   * Start synthetic agent
   * Executes scheduled events with precise timing
   */
  async start(session: Session): Promise<Agent> {
    // **WORKAROUND**: Check if agent ID is provided in configuration (like Python proxy adapter)
    // For synthetic agents, can also come from session.id
    const providedAgentId = (session.configuration as any).agentId || session.id;
    const agentId = providedAgentId ? AgentId.fromString(providedAgentId) : AgentId.generate();
    const agentKey = agentId.toString();

    const config = this.configs.get(agentKey);
    if (!config) {
      throw new Error(`Synthetic agent ${agentKey} not configured. Call configure() first.`);
    }

    // Create agent entity (matching IAgentRunner interface)
    // Use the pre-configured agentId to maintain referential integrity
    const agent = Agent.createWithId(agentId, {
      type: AgentType.SYNTHETIC,
      prompt: session.prompt,
      configuration: session.configuration,
    });

    this.logger.log(`Starting synthetic agent ${agentKey}`);

    // Mark agent as running
    agent.markAsRunning();

    const timers: NodeJS.Timeout[] = [];
    const startTime = Date.now();

    // Store start time for duration calculation
    this.startTime.set(agentKey, startTime);

    // Schedule each event
    config.schedule.forEach((event) => {
      const timer = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        this.logger.debug(`[T+${elapsed}ms] Synthetic agent ${agentKey} emitting: ${event.type}`);

        this.emitEvent(agentId, event);
      }, event.delay);

      timers.push(timer);
    });

    this.timers.set(agentKey, timers);

    this.logger.log(
      `Synthetic agent ${agentKey} started - ${config.schedule.length} events scheduled`
    );

    return agent;
  }

  /**
   * Stop synthetic agent
   * Cancels all scheduled events
   */
  async stop(agentId: AgentId): Promise<void> {
    const agentKey = agentId.toString();
    const timers = this.timers.get(agentKey);

    if (timers) {
      timers.forEach((timer) => clearTimeout(timer));
      this.timers.delete(agentKey);
      this.logger.log(`Stopped synthetic agent ${agentKey}`);
    }

    this.observers.delete(agentKey);
    this.configs.delete(agentKey);
    this.startTime.delete(agentKey);
  }

  /**
   * Subscribe to synthetic agent events
   * **FIX**: Deduplicate observers - don't subscribe same observer twice
   */
  subscribe(agentId: AgentId, observer: IAgentObserver): void {
    const agentKey = agentId.toString();

    if (!this.observers.has(agentKey)) {
      this.observers.set(agentKey, []);
    }

    const observers = this.observers.get(agentKey)!;

    // **BUG FIX**: Check if observer already subscribed (prevent duplicates)
    if (observers.includes(observer)) {
      this.logger.debug(
        `Observer already subscribed to synthetic agent ${agentKey} - skipping duplicate`
      );
      return;
    }

    observers.push(observer);
    this.logger.debug(`Observer subscribed to synthetic agent ${agentKey}`);
  }

  /**
   * Get status of synthetic agent
   * Returns 'running' if timers active, 'completed' otherwise
   */
  async getStatus(agentId: AgentId): Promise<AgentStatus> {
    const agentKey = agentId.toString();
    const hasActiveTimers = this.timers.has(agentKey);

    return hasActiveTimers ? AgentStatus.RUNNING : AgentStatus.COMPLETED;
  }

  /**
   * Unsubscribe from synthetic agent events
   */
  unsubscribe(agentId: AgentId, observer: IAgentObserver): void {
    const agentKey = agentId.toString();
    const observers = this.observers.get(agentKey);

    if (observers) {
      const index = observers.indexOf(observer);
      if (index > -1) {
        observers.splice(index, 1);
        this.logger.debug(`Observer unsubscribed from synthetic agent ${agentKey}`);
      }
    }
  }

  /**
   * Emit event to all observers
   */
  private emitEvent(agentId: AgentId, event: SyntheticEvent): void {
    const agentKey = agentId.toString();
    const observers = this.observers.get(agentKey) || [];

    observers.forEach((observer) => {
      try {
        switch (event.type) {
          case 'message':
            const message: AgentMessage = {
              type: event.data.type || 'assistant',
              role: event.data.role || 'assistant',
              content: event.data.content || '',
              metadata: event.data.metadata || {},
            };
            observer.onMessage(message);
            break;

          case 'status':
            // Map string status to enum value
            const statusMap: Record<string, AgentStatus> = {
              initializing: AgentStatus.INITIALIZING,
              running: AgentStatus.RUNNING,
              paused: AgentStatus.PAUSED,
              completed: AgentStatus.COMPLETED,
              failed: AgentStatus.FAILED,
              terminated: AgentStatus.TERMINATED,
            };
            const status = statusMap[event.data.status] || AgentStatus.RUNNING;
            observer.onStatusChange(status);
            break;

          case 'error':
            const error = new Error(event.data.message || 'Synthetic error');
            observer.onError(error);
            break;

          case 'complete':
            const result: AgentResult = {
              status: event.data.success !== false ? 'success' : 'failed',
              duration: Date.now() - this.startTime.get(agentKey)!,
              messageCount: event.data.messageCount || 0,
              stats: event.data.stats || {},
            };
            observer.onComplete(result);
            break;

          default:
            this.logger.warn(`Unknown synthetic event type: ${event.type}`);
        }
      } catch (error) {
        this.logger.error(`Error emitting synthetic event:`, error);
      }
    });
  }
}
