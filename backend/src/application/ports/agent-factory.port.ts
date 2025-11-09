import { AgentType } from '@domain/value-objects/agent-type.vo';
import { IAgentRunner } from './agent-runner.port';

/**
 * Agent Factory Port
 * Factory for creating agent runners based on type
 */
export interface IAgentFactory {
  /**
   * Create an agent runner for the specified type
   * @param type - The type of agent (Claude Code, Gemini CLI, etc.)
   * @returns Agent runner implementation for that type
   */
  create(type: AgentType): IAgentRunner;
}
