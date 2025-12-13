import { Injectable } from '@nestjs/common';
import { IAgentRunner, IAgentObserver, AgentResult } from '@application/ports/agent-runner.port';
import { IProcessManager } from '@application/ports/process-manager.port';
import { ILogger } from '@application/ports/logger.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';
import { GeminiMessageParser } from '@infrastructure/parsers/gemini-message.parser';
import { ChildProcess } from 'child_process';

/**
 * Running Agent Info for Gemini CLI agents
 */
interface GeminiAgentInfo {
  agent: Agent;
  observers: Set<IAgentObserver>;
  process: ChildProcess;
  startTime: number;
  messageCount: number;
  lineBuffer: string;
  stdoutEnded: boolean; // Track if stdout has finished
  exitCode: number | null; // Store exit code until ready to cleanup
}

/**
 * Gemini CLI Adapter
 *
 * @status DEFERRED TO POST-MVP ⏸️
 * @authentication Requires GEMINI_API_KEY environment variable
 * @usecase Developers using Gemini CLI for agent tasks
 * @requires Gemini CLI installed and authenticated
 *
 * Architecture:
 * - Spawns gemini CLI process with --output-format stream-json
 * - Parses JSONL output with GeminiMessageParser
 * - Notifies observers via IAgentObserver interface
 * - Manages process lifecycle (start, stop, cleanup)
 *
 * To use this adapter:
 * 1. Install Gemini CLI: npm install -g @google/generative-ai-cli
 * 2. Authenticate: gemini auth login
 * 3. Set GEMINI_API_KEY in .env
 * 4. Set AGENT_TYPE=gemini-cli when launching agents
 *
 * Note: Currently deferred to post-MVP. Claude adapters are prioritized.
 */
@Injectable()
export class GeminiCLIAdapter implements IAgentRunner {
  private runningAgents = new Map<string, GeminiAgentInfo>();
  private pendingObservers = new Map<string, Set<IAgentObserver>>();

  constructor(
    private readonly processManager: IProcessManager,
    private readonly logger: ILogger,
    private readonly parser: GeminiMessageParser
  ) {
    this.logger.info('GeminiCLIAdapter initialized', {});
  }

  /**
   * Start a Gemini agent
   */
  start(session: Session): Promise<Agent> {
    // Validate API key
    if (!process.env.GEMINI_API_KEY) {
      return Promise.reject(new Error('GEMINI_API_KEY environment variable is required'));
    }

    // Check if agent ID is provided in configuration (workaround pattern from Claude adapters)
    const providedAgentId = (session.configuration as any).agentId;

    let agent: Agent;
    if (providedAgentId) {
      // Use provided agent ID (orchestration service already created and saved the agent)
      agent = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: session.prompt,
        configuration: session.configuration,
      });
      // Override the generated ID with the provided one
      (agent as any)._id = AgentId.fromString(providedAgentId);
    } else {
      // Fallback: Create new agent (old behavior)
      agent = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: session.prompt,
        configuration: session.configuration,
      });
    }

    const agentId = agent.id.toString();

    this.logger.info('Starting Gemini agent', { agentId });

    // Mark agent as running
    agent.markAsRunning();

    // Build command
    const args = this.buildCommandArgs(session);
    const env = this.buildEnvironment();
    const cwd = session.configuration.workingDirectory;

    // Spawn process
    // IMPORTANT: shell: false for Gemini to prevent quote escaping issues
    const childProcess = this.processManager.spawn('gemini', args, {
      cwd,
      env,
      stdio: 'pipe',
      shell: false, // Gemini CLI doesn't need shell and it causes quote issues
    });

    // Create agent info with empty observers
    const agentInfo: GeminiAgentInfo = {
      agent,
      observers: new Set(),
      process: childProcess,
      startTime: Date.now(),
      messageCount: 0,
      lineBuffer: '',
      stdoutEnded: false,
      exitCode: null,
    };

    // Attach pending observers if any
    const pending = this.pendingObservers.get(agentId);
    if (pending) {
      pending.forEach(observer => agentInfo.observers.add(observer));
      this.pendingObservers.delete(agentId);
      this.logger.debug('Attached pending observers', {
        agentId,
        observerCount: agentInfo.observers.size,
      });
    }

    // Track running agent
    this.runningAgents.set(agentId, agentInfo);

    // Set up process event handlers
    this.setupProcessHandlers(agent.id, childProcess);

    return Promise.resolve(agent);
  }

  /**
   * Stop a running agent
   */
  stop(agentId: AgentId): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return Promise.reject(new Error(`No running agent found: ${id}`));
    }

    // Kill process
    agentInfo.process.kill('SIGTERM');

    // Clean up
    this.runningAgents.delete(id);
    this.pendingObservers.delete(id); // Also clean up any pending observers

    this.logger.info('Gemini agent stopped', { agentId: id });

    return Promise.resolve();
  }

  /**
   * Get agent status
   */
  getStatus(agentId: AgentId): Promise<AgentStatus> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return Promise.reject(new Error(`No running agent found: ${id}`));
    }

    return Promise.resolve(agentInfo.agent.status);
  }

  /**
   * Subscribe to agent events
   */
  subscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      // Agent not started yet - buffer the observer
      if (!this.pendingObservers.has(id)) {
        this.pendingObservers.set(id, new Set());
      }
      this.pendingObservers.get(id)!.add(observer);
      this.logger.debug('Observer buffered (agent not started)', { agentId: id });
      return;
    }

    // Agent already running - add directly
    agentInfo.observers.add(observer);
    this.logger.debug('Observer subscribed', { agentId: id });
  }

  /**
   * Unsubscribe from agent events
   */
  unsubscribe(agentId: AgentId, observer: IAgentObserver): void {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (agentInfo) {
      agentInfo.observers.delete(observer);
      this.logger.debug('Observer unsubscribed', { agentId: id });
    }
  }

  /**
   * Build command arguments
   */
  private buildCommandArgs(session: Session): string[] {
    // Use -p flag for prompt to ensure proper shell escaping
    // This prevents issues with quotes and special characters
    const args: string[] = ['-p', session.prompt, '--output-format', 'stream-json'];

    return args;
  }

  /**
   * Build environment variables
   */
  private buildEnvironment(): NodeJS.ProcessEnv {
    // Create clean environment without GOOGLE_API_KEY
    const env: NodeJS.ProcessEnv = {};

    // Copy all environment variables EXCEPT GOOGLE_API_KEY
    for (const key in process.env) {
      if (key !== 'GOOGLE_API_KEY') {
        env[key] = process.env[key];
      }
    }

    // Explicitly set GEMINI_API_KEY (ensures it's from .env file)
    env.GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    return env;
  }

  /**
   * Set up process event handlers
   * CRITICAL FIX: Properly coordinate stdout end and process close to prevent data loss
   */
  private setupProcessHandlers(agentId: AgentId, childProcess: ChildProcess): void {
    const id = agentId.toString();

    // Handle stdout
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        this.handleStdout(agentId, data);
      });

      // Log when stdout ends for debugging
      childProcess.stdout.on('end', () => {
        this.logger.debug('stdout stream ended', { agentId: id });
      });
    }

    // Handle stderr
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        this.handleStderr(agentId, data);
      });
    }

    // Handle process close
    // CRITICAL FIX: Delay handleExit to allow all stdout data to be processed
    // Gemini CLI in one-shot mode can have stdout data arrive AFTER close event
    childProcess.on('close', (code: number | null) => {
      // Use small delay to ensure all stdout data handlers have completed
      // This prevents race condition where stdout data arrives after agent cleanup
      // Use shorter delay in test environment to avoid test timeouts
      const delay = process.env.NODE_ENV === 'test' ? 10 : 100;
      setTimeout(() => {
        this.handleExit(agentId, code);
      }, delay);
    });
  }

  /**
   * Handle stdout data
   * CRITICAL FIX: Now async to await line processing
   */
  private async handleStdout(agentId: AgentId, data: Buffer): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      // Agent was already terminated/cleanup - this can happen with one-shot processes
      // where stdout data arrives after agent cleanup. Silently ignore.
      return;
    }

    // Log raw data received
    const rawData = data.toString();
    this.logger.debug('[RAW STDOUT]', {
      agentId: id,
      dataLength: rawData.length,
      preview: rawData.substring(0, 200),
    });

    // Append to buffer
    agentInfo.lineBuffer += rawData;

    // Process complete lines
    const lines = agentInfo.lineBuffer.split('\n');
    agentInfo.lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    this.logger.debug('[STDOUT PROCESSING]', {
      agentId: id,
      completeLines: lines.length,
      remainingBuffer: agentInfo.lineBuffer.length,
    });

    // Process lines sequentially to maintain order
    for (const line of lines) {
      if (line.trim()) {
        await this.processLine(agentId, line);
      }
    }
  }

  /**
   * Process a single line of output
   * CRITICAL FIX: Now async to await observer notifications
   */
  private async processLine(agentId: AgentId, line: string): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return;
    }

    try {
      // Parse line
      const message = this.parser.parse(line);

      this.logger.debug(`[TRACE] Parser result for line`, {
        agentId: id,
        linePreview: line.substring(0, 100),
        parseResult: message ? 'AgentMessage' : 'null',
        messageType: message?.type
      });

      // Skip null results (init, result events, etc.)
      if (message === null) {
        return;
      }

      // Increment message count
      agentInfo.messageCount++;

      this.logger.debug('Gemini message received', {
        agentId: id,
        type: message.type,
      });

      this.logger.debug(`[TRACE] About to notify observers`, {
        agentId: id,
        messageType: message.type,
        contentPreview: typeof message.content === 'string' ? message.content.substring(0, 50) : 'object'
      });

      // Notify observers (AWAIT to ensure message persistence)
      await this.notifyObservers(agentId, 'onMessage', message);

      this.logger.debug(`[TRACE] Observers notified`, {
        agentId: id,
        messageType: message.type
      });
    } catch (error) {
      this.logger.error('Failed to parse Gemini output', {
        agentId: id,
        line,
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Handle stderr data
   */
  private handleStderr(agentId: AgentId, data: Buffer): void {
    const id = agentId.toString();
    const message = data.toString().trim();

    if (message) {
      this.logger.warn('Gemini stderr', {
        agentId: id,
        message,
      });
    }
  }

  /**
   * Handle process exit
   * CRITICAL FIX: Now async to await observer notifications
   * CRITICAL FIX: Process remaining lineBuffer to prevent data loss
   */
  private async handleExit(agentId: AgentId, code: number | null): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return;
    }

    // CRITICAL: Process any remaining data in lineBuffer before cleanup
    // This prevents race condition where stdout data arrives after process closes
    if (agentInfo.lineBuffer.trim()) {
      this.logger.debug('Processing remaining lineBuffer on exit', {
        agentId: id,
        bufferLength: agentInfo.lineBuffer.length,
      });
      await this.processLine(agentId, agentInfo.lineBuffer);
      agentInfo.lineBuffer = '';
    }

    const duration = Date.now() - agentInfo.startTime;

    if (code === 0) {
      // Success
      const result: AgentResult = {
        status: 'success',
        duration,
        messageCount: agentInfo.messageCount,
      };

      await this.notifyObservers(agentId, 'onComplete', result);

      this.logger.info('Gemini agent completed successfully', {
        agentId: id,
        duration,
        messageCount: agentInfo.messageCount,
      });
    } else {
      // Error
      const error = new Error(`Gemini process exited with code ${code}`);
      await this.notifyObservers(agentId, 'onError', error);

      this.logger.error('Gemini agent failed', {
        agentId: id,
        code,
      });
    }

    // Clean up
    this.runningAgents.delete(id);
    this.pendingObservers.delete(id); // Also clean up any pending observers
  }

  /**
   * Notify all observers
   * CRITICAL FIX: Now awaits observer callbacks to ensure proper sequencing
   * This fixes race condition where messages were queried before persistence completed
   */
  private async notifyObservers(
    agentId: AgentId,
    method: keyof IAgentObserver,
    data: Parameters<IAgentObserver[typeof method]>[0]
  ): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return;
    }

    this.logger.debug(`[TRACE] notifyObservers - observer count`, {
      agentId: id,
      method,
      observerCount: agentInfo.observers.size
    });

    // Process observers sequentially to maintain message order
    for (const observer of agentInfo.observers) {
      try {
        this.logger.debug(`[TRACE] Calling observer.${method}`, { agentId: id });
        // Type-safe observer method invocation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (observer[method] as (arg: any) => Promise<void>)(data);
        this.logger.debug(`[TRACE] Observer.${method} completed`, { agentId: id });
      } catch (error) {
        this.logger.error('Observer notification error', {
          agentId: id,
          method,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }
  }
}
