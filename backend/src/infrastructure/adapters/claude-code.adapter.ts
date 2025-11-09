import { ChildProcess } from 'child_process';
import { IAgentRunner, IAgentObserver, AgentMessage } from '@application/ports/agent-runner.port';
import { IProcessManager } from '@application/ports/process-manager.port';
import { ILogger } from '@application/ports/logger.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';
import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';

/**
 * Running Agent Info
 * Tracks information about a running agent
 */
interface RunningAgentInfo {
  agent: Agent;
  process: ChildProcess;
  observers: Set<IAgentObserver>;
}

/**
 * Claude Code CLI Adapter (REFERENCE IMPLEMENTATION)
 *
 * @status BLOCKED - Known upstream bug prevents CLI spawning from Node.js
 * @issue GitHub #6775, #771 - Claude CLI produces no stdout when spawned from Node.js
 * @alternative Use ClaudePythonProxyAdapter (Max subscription) or ClaudeSDKAdapter (API key)
 * @purpose Educational reference showing the attempted approach
 *
 * DOES NOT WORK in production due to Node.js child_process limitation.
 * Kept for:
 * - Documentation of problem-solving process
 * - Reference implementation of CLI integration pattern
 * - Potential future use if upstream bug is fixed
 *
 * See: CRITICAL_DISCOVERY_CLAUDE_CLI.md for full details
 */
export class ClaudeCodeAdapter implements IAgentRunner {
  private runningAgents = new Map<string, RunningAgentInfo>();

  constructor(
    private readonly processManager: IProcessManager,
    private readonly messageParser: ClaudeMessageParser,
    private readonly logger: ILogger
  ) {}

  /**
   * Start a Claude Code agent
   */
  async start(session: Session): Promise<Agent> {
    // Build command arguments
    const args = this.buildCommandArgs(session);

    // Create agent entity
    const agent = Agent.create({
      type: AgentType.CLAUDE_CODE,
      prompt: session.prompt,
      configuration: session.configuration,
    });

    // Spawn process
    const process = this.processManager.spawn('claude', args);

    if (!process.pid) {
      throw new Error('Failed to spawn Claude Code process');
    }

    // Track running agent
    this.runningAgents.set(agent.id.toString(), {
      agent,
      process,
      observers: new Set(),
    });

    this.logger.info('Claude Code agent started', {
      agentId: agent.id.toString(),
      pid: process.pid,
    });

    // Mark agent as running
    agent.markAsRunning();

    // Start processing output stream (async, not awaited - runs in background)
    this.processOutputStream(agent.id, process).catch((error) => {
      this.logger.error('Fatal stream processing error', {
        agentId: agent.id.toString(),
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.notifyObservers(agent.id, 'onError', error as Error);
    });

    // Handle process events
    this.setupProcessEventHandlers(agent.id, process);

    return agent;
  }

  /**
   * Stop a running agent
   */
  async stop(agentId: AgentId): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      throw new Error(`No running agent found: ${id}`);
    }

    const { process } = agentInfo;

    if (process.pid) {
      await this.processManager.kill(process.pid, 'SIGTERM');
    }

    // Clean up
    this.runningAgents.delete(id);

    this.logger.info('Claude Code agent stopped', {
      agentId: id,
    });
  }

  /**
   * Get agent status
   */
  async getStatus(agentId: AgentId): Promise<AgentStatus> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      throw new Error(`No running agent found: ${id}`);
    }

    const { agent, process } = agentInfo;

    // Check if process is still running
    if (process.pid && this.processManager.isRunning(process.pid)) {
      return AgentStatus.RUNNING;
    }

    return agent.status;
  }

  /**
   * Subscribe to agent events
   */
  subscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (agentInfo) {
      agentInfo.observers.add(observer);
      this.logger.debug('Observer subscribed to agent', { agentId: id });
    }
  }

  /**
   * Unsubscribe from agent events
   */
  unsubscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (agentInfo) {
      agentInfo.observers.delete(observer);
      this.logger.debug('Observer unsubscribed from agent', { agentId: id });
    }
  }

  /**
   * Build command arguments for Claude CLI
   */
  private buildCommandArgs(session: Session): string[] {
    const args: string[] = ['-p', session.prompt];

    // Output format (default to stream-json)
    const outputFormat = session.configuration.outputFormat ?? 'stream-json';
    args.push('--output-format', outputFormat);

    // stream-json requires --verbose flag
    if (outputFormat === 'stream-json') {
      args.push('--verbose');
    }

    // Session ID for resume
    if (session.configuration.sessionId) {
      args.push('--session-id', session.configuration.sessionId);
    }

    // Custom arguments
    if (session.configuration.customArgs) {
      args.push(...session.configuration.customArgs);
    }

    return args;
  }

  /**
   * Process output stream from CLI
   */
  private async processOutputStream(agentId: AgentId, process: ChildProcess): Promise<void> {
    const id = agentId.toString();

    this.logger.debug('Starting stream processing', { agentId: id });

    try {
      const reader = this.processManager.getStreamReader(process);

      this.logger.debug('Stream reader obtained', { agentId: id });

      for await (const line of reader) {
        this.logger.debug('Line received from stream', { agentId: id, lineLength: line.length });

        try {
          // Parse message
          const message = this.messageParser.parse(line);

          this.logger.debug('Agent message parsed and notifying observers', {
            agentId: id,
            type: message.type,
            observerCount: this.runningAgents.get(id)?.observers.size ?? 0,
          });

          // Notify observers
          this.notifyObservers(agentId, 'onMessage', message);

          // Check if complete
          if (this.messageParser.isComplete(message)) {
            this.logger.debug('Completion message detected', { agentId: id });
            this.handleCompletion(agentId, message);
            break;
          }
        } catch (error) {
          this.logger.error('Failed to parse message', {
            agentId: id,
            line,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.debug('Stream processing completed', { agentId: id });
    } catch (error) {
      this.logger.error('Stream processing error', {
        agentId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.notifyObservers(agentId, 'onError', error as Error);
    }
  }

  /**
   * Setup event handlers for process
   */
  private setupProcessEventHandlers(agentId: AgentId, process: ChildProcess): void {
    const id = agentId.toString();

    process.on('error', (error) => {
      this.logger.error('Process error', {
        agentId: id,
        error: error.message,
      });
      this.notifyObservers(agentId, 'onError', error);
    });

    process.on('exit', (code, signal) => {
      this.logger.debug('Process exited', {
        agentId: id,
        code,
        signal,
      });

      // Clean up if not already cleaned up
      if (this.runningAgents.has(id)) {
        this.runningAgents.delete(id);
      }
    });
  }

  /**
   * Handle agent completion
   */
  private handleCompletion(agentId: AgentId, message: AgentMessage): void {
    const stats = message.metadata?.stats as Record<string, unknown> | undefined;

    this.notifyObservers(agentId, 'onComplete', {
      status: 'success',
      duration: (stats?.duration as number) ?? 0,
      messageCount: 0, // Could track this
      stats,
    });

    this.logger.info('Agent completed', {
      agentId: agentId.toString(),
    });
  }

  /**
   * Notify all observers
   */
  private notifyObservers(
    agentId: AgentId,
    method: keyof IAgentObserver,
    data: any
  ): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return;
    }

    agentInfo.observers.forEach((observer) => {
      try {
        const fn = observer[method] as Function;
        fn.call(observer, data);
      } catch (error) {
        this.logger.error('Observer notification error', {
          agentId: id,
          method,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }
}
