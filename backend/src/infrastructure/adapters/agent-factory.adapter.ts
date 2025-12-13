import { IAgentFactory } from '@application/ports/agent-factory.port';
import { IAgentRunner } from '@application/ports/agent-runner.port';
import { AgentType } from '@domain/value-objects/agent-type.vo';

/**
 * Agent Factory Adapter
 * Creates agent runners based on agent type.
 * Configured via dependency injection to use the selected Claude adapter.
 */
export class AgentFactoryAdapter implements IAgentFactory {
  constructor(
    private readonly claudeAdapter: IAgentRunner,
    private readonly geminiCliAdapter: IAgentRunner
  ) {}

  /**
   * Create an agent runner for the specified type
   */
  create(type: AgentType): IAgentRunner {
    switch (type) {
      case AgentType.CLAUDE_CODE:
        return this.claudeAdapter;

      case AgentType.GEMINI_CLI:
        return this.geminiCliAdapter;

      default:
        throw new Error(`Agent type not supported: ${type}`);
    }
  }
}
