/**
 * Agent Type Value Object
 * Represents the type of CLI agent being orchestrated.
 * MVP supports Claude Code and Gemini CLI.
 */
export enum AgentType {
  CLAUDE_CODE = 'claude-code',
  GEMINI_CLI = 'gemini-cli',
}
