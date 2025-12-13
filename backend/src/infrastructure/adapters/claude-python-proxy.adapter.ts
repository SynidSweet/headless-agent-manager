import { IAgentRunner, IAgentObserver } from '@application/ports/agent-runner.port';
import { ILogger } from '@application/ports/logger.port';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { Session } from '@domain/value-objects/session.vo';
import { ClaudeMessageParser } from '@infrastructure/parsers/claude-message.parser';

/**
 * Running Agent Info for Python Proxy agents
 */
interface ProxyAgentInfo {
  agent: Agent;
  observers: Set<IAgentObserver>;
  pythonAgentId?: string; // ID from Python service
  abortController?: AbortController; // To cancel ongoing stream
}

/**
 * Claude Python Proxy Adapter (PRIMARY IMPLEMENTATION - RECOMMENDED) ⭐
 *
 * @status PRODUCTION-READY ✅ TESTED AND VALIDATED
 * @authentication Uses Claude Max subscription (no API key needed)
 * @cost $0 per request (uses Max quota: 200-800 prompts/5hrs for Max 20x)
 * @usecase Claude Max subscribers who want to avoid per-token API costs
 * @requires Python proxy service running on port 8000 (see claude-proxy-service/)
 *
 * Architecture:
 * - Node.js → HTTP/SSE → Python FastAPI → subprocess.Popen → Claude CLI
 * - Python can successfully spawn Claude (Node.js cannot due to upstream bug)
 * - Real-time streaming via Server-Sent Events (SSE)
 *
 * To use this adapter:
 * 1. Start Python service: cd claude-proxy-service && source venv/bin/activate && uvicorn app.main:app
 * 2. Set CLAUDE_PROXY_URL=http://localhost:8000 in .env (optional, default)
 * 3. Set CLAUDE_ADAPTER=python-proxy in .env (or omit, it's default)
 * 4. Ensure you're logged into Claude CLI (Max subscription)
 *
 * Pros: ✅ Uses Max subscription, ✅ No token costs, ✅ Real streaming, ✅ Proven to work
 * Cons: ⚠️ Requires Python service, ⚠️ HTTP latency (~20-50ms), ⚠️ Extra deployment complexity
 *
 * Validation: Successfully streamed from Claude CLI via Python proxy (2025-11-09)
 * See: PYTHON_PROXY_SOLUTION.md for complete guide
 */
export class ClaudePythonProxyAdapter implements IAgentRunner {
  private runningAgents = new Map<string, ProxyAgentInfo>();
  private readonly parser = new ClaudeMessageParser();

  constructor(
    private readonly proxyUrl: string,
    private readonly logger: ILogger
  ) {
    this.logger.info('ClaudePythonProxyAdapter initialized', {
      proxyUrl: this.proxyUrl,
    });
  }

  /**
   * Start a Claude agent via Python proxy
   */
  async start(session: Session): Promise<Agent> {
    // **WORKAROUND**: Check if agent ID is provided in configuration
    // If provided, use it instead of creating a new agent
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

    // Create abort controller for this agent's stream
    const abortController = new AbortController();

    // CRITICAL FIX: Preserve observers from pending entry (if subscribe() was called before start())
    const id = agent.id.toString();
    const existingInfo = this.runningAgents.get(id);
    const existingObservers = existingInfo?.observers || new Set();

    console.log(`[ClaudeProxyAdapter] 🚀 Starting agent`, {
      agentId: id,
      existingObservers: existingObservers.size,
      isPendingEntry: existingInfo !== undefined && existingInfo.agent === null,
    });

    // Track running agent (preserve existing observers)
    this.runningAgents.set(id, {
      agent,
      observers: existingObservers, // Preserve observers added before start()
      abortController,
    });

    this.logger.info('Starting Claude agent via Python proxy', {
      agentId: agent.id.toString(),
      proxyUrl: this.proxyUrl,
    });

    // Mark agent as running
    agent.markAsRunning();

    // Start streaming from Python service (don't await - runs in background)
    this.streamFromProxy(agent.id, session).catch(async (error) => {
      this.logger.error('Fatal proxy stream error', {
        agentId: agent.id.toString(),
        error: error instanceof Error ? error.message : 'Unknown',
      });
      await this.notifyObservers(agent.id, 'onError', error as Error);
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

    // Cancel the ongoing stream to prevent "Cannot log after tests are done" warnings
    if (agentInfo.abortController) {
      agentInfo.abortController.abort();
      this.logger.debug('Aborted stream for agent', { agentId: id });
    }

    // Call Python proxy stop endpoint and WAIT for process termination
    if (agentInfo.pythonAgentId) {
      try {
        this.logger.debug('Stopping agent on Python proxy', {
          agentId: id,
          pythonAgentId: agentInfo.pythonAgentId,
        });

        const response = await fetch(`${this.proxyUrl}/agent/stop/${agentInfo.pythonAgentId}`, {
          method: 'POST',
        });

        if (!response.ok) {
          this.logger.warn('Failed to stop agent on proxy', {
            agentId: id,
            status: response.status,
          });
        } else {
          this.logger.debug('Python proxy confirmed agent stopped', {
            agentId: id,
          });
        }

        // CRITICAL: Wait for process to fully terminate
        // Python proxy's stop_agent() waits up to 5 seconds for graceful termination
        // Add a small buffer to ensure the process has exited
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error('Error calling proxy stop endpoint', {
          agentId: id,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    // Clean up
    this.runningAgents.delete(id);

    this.logger.info('Claude agent stopped', { agentId: id });
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
    let agentInfo = this.runningAgents.get(id);

    // CRITICAL FIX: Allow subscription BEFORE start()
    // OrchestrationService calls subscribe() before start(), so we need to create
    // a pending entry that will be populated when start() is called
    if (!agentInfo) {
      console.log(`[ClaudeProxyAdapter] 📝 Creating pending entry for agent ${id} (subscribed before start)`);
      agentInfo = {
        agent: null as any, // Will be set by start()
        observers: new Set(),
        abortController: null as any, // Will be set by start()
      };
      this.runningAgents.set(id, agentInfo);
    }

    agentInfo.observers.add(observer);
    console.log(`[ClaudeProxyAdapter] ➕ Observer subscribed to agent`, {
      agentId: id,
      totalObservers: agentInfo.observers.size,
      isPending: agentInfo.agent === null,
    });
    this.logger.debug('Observer subscribed to agent', { agentId: id });
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
   * Stream from Python proxy service
   */
  private async streamFromProxy(agentId: AgentId, session: Session): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      return;
    }

    this.logger.debug('Starting proxy stream', { agentId: id });

    try {
      // Build request body
      const requestBody: Record<string, any> = {
        prompt: session.prompt,
      };

      if (session.configuration.sessionId) {
        requestBody.session_id = session.configuration.sessionId;
      }

      if (session.configuration.workingDirectory) {
        requestBody.working_directory = session.configuration.workingDirectory;
      }

      if (session.configuration.model) {
        requestBody.model = session.configuration.model;
      }

      if (session.configuration.mcp) {
        // Convert MCP configuration to JSON string for Python proxy
        requestBody.mcp_config = session.configuration.mcp.toClaudeConfigJSON();

        if (session.configuration.mcp.strict) {
          requestBody.mcp_strict = true;
        }
      }

      // Add tool filtering if configured
      if (session.configuration.allowedTools) {
        requestBody.allowed_tools = session.configuration.allowedTools;
      }

      if (session.configuration.disallowedTools) {
        requestBody.disallowed_tools = session.configuration.disallowedTools;
      }

      // Get abort signal from agent info
      const currentAgentInfo = this.runningAgents.get(id);
      const signal = currentAgentInfo?.abortController?.signal;

      // Call Python proxy stream endpoint
      const response = await fetch(`${this.proxyUrl}/agent/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal, // Pass abort signal to fetch
      });

      if (!response.ok) {
        throw new Error(`Python proxy error: ${response.status} ${response.statusText}`);
      }

      // Extract Python agent ID from X-Agent-Id header if provided
      const pythonAgentId = response.headers.get('X-Agent-Id');
      if (pythonAgentId) {
        const currentInfo = this.runningAgents.get(id);
        if (currentInfo) {
          currentInfo.pythonAgentId = pythonAgentId;
        }
      }

      if (!response.body) {
        throw new Error('No response body from proxy');
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const startTime = Date.now();
      let messageCount = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.logger.debug('Stream ended', { agentId: id });
          break;
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue;

          // Parse SSE event
          const lines = event.split('\n');
          let eventType = 'message';
          let data = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
              data = line.substring(6).trim();
            }
          }

          // Handle event
          if (eventType === 'complete') {
            const duration = Date.now() - startTime;
            await this.notifyObservers(agentId, 'onComplete', {
              status: 'success',
              duration,
              messageCount,
            });
            break;
          } else if (eventType === 'error') {
            const errorData = JSON.parse(data || '{}');
            await this.notifyObservers(agentId, 'onError', new Error(errorData.error || 'Unknown error'));
          } else if (data) {
            // Regular message - parse from Claude CLI format to AgentMessage format
            try {
              const message = this.parser.parse(data);

              // Parser returns null for skippable events (message_start, etc.)
              if (message === null) {
                // Silently skip - these are streaming metadata events with no content
                continue;
              }

              messageCount++;

              this.logger.debug('Proxy message received', {
                agentId: id,
                type: message.type,
              });

              console.log(`[ClaudeProxyAdapter] 📥 Raw message from proxy`, {
                agentId: id,
                type: message.type,
                role: message.role,
                hasContent: !!message.content,
                contentPreview: typeof message.content === 'string' ? message.content.substring(0, 50) : 'object',
              });

              await this.notifyObservers(agentId, 'onMessage', message);
            } catch (error) {
              this.logger.error('Failed to parse message', {
                agentId: id,
                data,
                error: error instanceof Error ? error.message : 'Unknown',
              });
            }
          }
        }
      }

      this.logger.debug('Proxy stream processing completed', { agentId: id, messageCount });
    } catch (error) {
      // Don't log errors if the stream was aborted (expected during cleanup)
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.debug('Proxy stream aborted', { agentId: id });
        return;
      }

      this.logger.error('Proxy stream error', {
        agentId: id,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      await this.notifyObservers(agentId, 'onError', error as Error);
    } finally {
      // Clean up
      this.runningAgents.delete(id);
    }
  }

  /**
   * Notify all observers
   */
  private async notifyObservers(agentId: AgentId, method: keyof IAgentObserver, data: any): Promise<void> {
    const id = agentId.toString();
    const agentInfo = this.runningAgents.get(id);

    if (!agentInfo) {
      console.warn(`[ClaudeProxyAdapter] ⚠️ No agentInfo found for ${id} - cannot notify observers`);
      return;
    }

    const observerCount = agentInfo.observers.size;
    console.log(`[ClaudeProxyAdapter] 🔔 Notifying ${observerCount} observers`, {
      agentId: id,
      method,
      observerCount,
      dataType: method === 'onMessage' ? (data as any)?.type : typeof data,
    });

    if (observerCount === 0) {
      console.warn(`[ClaudeProxyAdapter] ⚠️ WARNING: No observers registered for agent ${id}!`);
      console.warn(`   Method: ${method}, data will be lost`);
    }

    for (const observer of agentInfo.observers) {
      try {
        const fn = observer[method] as (arg: any) => Promise<void>;
        if (fn) {
          console.log(`[ClaudeProxyAdapter] 📞 Calling observer.${method}...`);
          await fn.call(observer, data);
          console.log(`[ClaudeProxyAdapter] ✅ Observer.${method} completed`);
        }
      } catch (error) {
        console.error(`[ClaudeProxyAdapter] ❌ Observer notification error`, {
          agentId: id,
          method,
          error: error instanceof Error ? error.message : 'Unknown',
        });

        this.logger.error('Observer notification error', {
          agentId: id,
          method,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }
  }

  /**
   * Stop all running agents (useful for cleanup during tests)
   */
  async stopAll(): Promise<void> {
    const agentIds = Array.from(this.runningAgents.keys());
    this.logger.debug('Stopping all agents', { count: agentIds.length });

    for (const id of agentIds) {
      try {
        await this.stop(AgentId.fromString(id));
      } catch (error) {
        // Ignore errors during bulk cleanup
        this.logger.debug('Error stopping agent during cleanup', { agentId: id });
      }
    }
  }
}
