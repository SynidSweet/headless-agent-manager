import Anthropic from '@anthropic-ai/sdk';
import { IAgentRunner, IAgentObserver } from '@application/ports/agent-runner.port';
import { ILogger } from '@application/ports/logger.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';

/**
 * Running Agent Info for SDK-based agents
 */
interface SDKAgentInfo {
  agent: Agent;
  observers: Set<IAgentObserver>;
  aborted: boolean;
}

/**
 * Claude SDK Adapter (ALTERNATIVE IMPLEMENTATION)
 *
 * @status PRODUCTION-READY ✅
 * @authentication Requires Anthropic API key (separate from Claude Max subscription)
 * @cost Pay-per-token (~$0.08 per request with caching)
 * @usecase When you have API credits but not Claude Max subscription
 * @alternative Use ClaudePythonProxyAdapter for Claude Max subscribers (no per-token costs)
 *
 * Uses official @anthropic-ai/sdk package for:
 * - Direct API access (no CLI involved)
 * - Real-time streaming via SDK's MessageStream
 * - Proper error handling and retry logic
 * - Production-grade reliability
 *
 * To use this adapter:
 * 1. Set ANTHROPIC_API_KEY in .env
 * 2. Set CLAUDE_ADAPTER=sdk in .env
 * 3. Restart application
 *
 * Pros: ✅ Official SDK, ✅ Reliable, ✅ Well-documented
 * Cons: ❌ Costs per token, ❌ Doesn't use Max subscription
 */
export class ClaudeSDKAdapter implements IAgentRunner {
  private client: Anthropic;
  private runningAgents = new Map<string, SDKAgentInfo>();

  constructor(apiKey: string, private readonly logger: ILogger) {
    this.client = new Anthropic({ apiKey });
    this.logger.info('ClaudeSDKAdapter initialized', { hasApiKey: !!apiKey });
  }

  /**
   * Start a Claude agent using SDK
   */
  async start(session: Session): Promise<Agent> {
    // **WORKAROUND**: Check if agent ID is provided in configuration
    const providedAgentId = (session.configuration as any).agentId;

    let agent: Agent;
    if (providedAgentId) {
      // Use provided agent ID (orchestration service already created and saved the agent)
      agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: session.prompt,
        configuration: session.configuration,
      });
      // Override the generated ID with the provided one
      (agent as any)._id = AgentId.fromString(providedAgentId);
    } else {
      // Fallback: Create new agent (old behavior)
      agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: session.prompt,
        configuration: session.configuration,
      });
    }

    // Track running agent
    this.runningAgents.set(agent.id.toString(), {
      agent,
      observers: new Set(),
      aborted: false,
    });

    this.logger.info('Claude SDK agent started', {
      agentId: agent.id.toString(),
    });

    // Mark agent as running
    agent.markAsRunning();

    // Start streaming (don't await - runs in background)
    this.processStream(agent.id, session).catch((error) => {
      this.logger.error('Fatal stream processing error', {
        agentId: agent.id.toString(),
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.notifyObservers(agent.id, 'onError', error as Error);
    });

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

    // Mark as aborted
    agentInfo.aborted = true;

    // Clean up
    this.runningAgents.delete(id);

    this.logger.info('Claude SDK agent stopped', {
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

    return agentInfo.agent.status;
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
   * Process stream from Anthropic SDK
   */
  private async processStream(agentId: AgentId, session: Session): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return;
    }

    this.logger.debug('Starting SDK stream processing', { agentId: id });

    try {
      // Build stream request
      const model = this.extractModel(session) || 'claude-sonnet-4-5-20250929';
      const maxTokens = this.extractMaxTokens(session) || 4096;

      const stream = this.client.messages.stream({
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: session.prompt,
          },
        ],
      });

      // Track content for aggregated messages
      let currentContent = '';
      const startTime = Date.now();

      // Process streaming events
      for await (const event of stream) {
        // Check if aborted
        if (agentInfo.aborted) {
          this.logger.debug('Stream aborted', { agentId: id });
          break;
        }

        this.logger.debug('SDK event received', {
          agentId: id,
          eventType: event.type,
        });

        // Handle different event types
        switch (event.type) {
          case 'message_start':
            this.notifyObservers(agentId, 'onMessage', {
              type: 'system',
              role: 'init',
              content: 'Stream started',
              metadata: { messageId: event.message.id },
            });
            break;

          case 'content_block_start':
            // Starting a new content block
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              currentContent += event.delta.text;

              // Send incremental text as message
              this.notifyObservers(agentId, 'onMessage', {
                type: 'assistant',
                content: event.delta.text,
                metadata: { index: event.index, isDelta: true },
              });
            }
            break;

          case 'content_block_stop':
            // Content block completed
            break;

          case 'message_delta':
            // Message metadata updated
            break;

          case 'message_stop':
            // Message completed
            const duration = Date.now() - startTime;

            // Get final message
            const finalMessage = await stream.finalMessage();

            // Send completion message
            this.notifyObservers(agentId, 'onMessage', {
              type: 'system',
              role: 'result',
              content: currentContent,
              metadata: {
                usage: finalMessage.usage,
                stopReason: finalMessage.stop_reason,
              },
            });

            // Notify completion
            this.notifyObservers(agentId, 'onComplete', {
              status: 'success',
              duration,
              messageCount: 1,
              stats: {
                usage: finalMessage.usage,
                model: finalMessage.model,
              },
            });

            this.logger.info('Agent completed', { agentId: id, duration });
            break;
        }
      }

      this.logger.debug('Stream processing completed', { agentId: id });
    } catch (error) {
      this.logger.error('Stream processing error', {
        agentId: id,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.notifyObservers(agentId, 'onError', error as Error);
    } finally {
      // Clean up
      this.runningAgents.delete(id);
    }
  }

  /**
   * Extract model from configuration
   */
  private extractModel(session: Session): string | undefined {
    const customArgs = session.configuration.customArgs || [];
    const modelIndex = customArgs.indexOf('--model');

    if (modelIndex >= 0 && customArgs[modelIndex + 1]) {
      return customArgs[modelIndex + 1];
    }

    return undefined;
  }

  /**
   * Extract max tokens from configuration
   */
  private extractMaxTokens(session: Session): number | undefined {
    const customArgs = session.configuration.customArgs || [];
    const maxTokensIndex = customArgs.indexOf('--max-tokens');

    if (maxTokensIndex >= 0 && customArgs[maxTokensIndex + 1]) {
      return parseInt(customArgs[maxTokensIndex + 1]!, 10);
    }

    return undefined;
  }

  /**
   * Notify all observers
   */
  private notifyObservers(agentId: AgentId, method: keyof IAgentObserver, data: any): void {
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
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    });
  }
}
