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
import { Session } from '@domain/entities/session.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';

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

  /**
   * Configure a synthetic agent with a schedule
   */
  configure(agentId: AgentId, config: SyntheticAgentConfig): void {
    this.configs.set(agentId.toString(), config);
    this.logger.log(`Configured synthetic agent ${agentId.toString()} with ${config.schedule.length} events`);
  }

  /**
   * Start synthetic agent
   * Executes scheduled events with precise timing
   */
  async start(session: Session, agentId?: AgentId): Promise<void> {
    // AgentId must be passed or derived from session.id
    const actualAgentId = agentId || AgentId.fromString(session.id || '');
    const agentKey = actualAgentId.toString();

    const config = this.configs.get(agentKey);
    if (!config) {
      throw new Error(`Synthetic agent ${agentKey} not configured`);
    }

    this.logger.log(`Starting synthetic agent ${agentKey}`);

    const timers: NodeJS.Timeout[] = [];
    const startTime = Date.now();

    // Schedule each event
    config.schedule.forEach((event, index) => {
      const timer = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        this.logger.debug(
          `[T+${elapsed}ms] Synthetic agent ${agentKey} emitting: ${event.type}`
        );

        this.emitEvent(actualAgentId, event);
      }, event.delay);

      timers.push(timer);
    });

    this.timers.set(agentKey, timers);

    this.logger.log(
      `Synthetic agent ${agentKey} started - ${config.schedule.length} events scheduled`
    );
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
  }

  /**
   * Subscribe to synthetic agent events
   */
  subscribe(agentId: AgentId, observer: IAgentObserver): void {
    const agentKey = agentId.toString();

    if (!this.observers.has(agentKey)) {
      this.observers.set(agentKey, []);
    }

    this.observers.get(agentKey)!.push(observer);
    this.logger.debug(`Observer subscribed to synthetic agent ${agentKey}`);
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
            const status = AgentStatus.fromString(event.data.status);
            observer.onStatusChange(status);
            break;

          case 'error':
            const error = new Error(event.data.message || 'Synthetic error');
            observer.onError(error);
            break;

          case 'complete':
            const result: AgentResult = {
              success: event.data.success !== false,
              output: event.data.output || '',
              error: event.data.error,
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
