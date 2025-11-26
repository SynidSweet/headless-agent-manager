/**
 * Agent Type Value Object
 * Represents the type of CLI agent being orchestrated.
 * MVP supports Claude Code and Gemini CLI.
 * Testing infrastructure supports Synthetic agents.
 */
export enum AgentType {
  CLAUDE_CODE = 'claude-code',
  GEMINI_CLI = 'gemini-cli',
  SYNTHETIC = 'synthetic', // For testing - controllable, scripted agents
}
