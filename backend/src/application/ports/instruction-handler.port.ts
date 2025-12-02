/**
 * Claude File Backup
 * Data structure for backing up CLAUDE.md files before replacement
 */
export interface ClaudeFileBackup {
  userClaudeContent?: string;
  projectClaudeContent?: string;
  userClaudePath: string;
  projectClaudePath: string;
  timestamp: Date;
}

/**
 * Instruction Handler Port
 *
 * Defines the contract for handling custom instructions.
 * Responsible for backing up and restoring CLAUDE.md files
 * to temporarily inject custom instructions.
 *
 * Flow:
 * 1. prepareEnvironment() - Backup files, write instructions
 * 2. Agent starts (reads custom instructions)
 * 3. restoreEnvironment() - Restore original files
 *
 * Implementation: ClaudeInstructionHandler (for Claude Code agents)
 * Future: GeminiInstructionHandler (for Gemini CLI agents)
 */
export interface IInstructionHandler {
  /**
   * Prepares the environment for custom instructions.
   * Backs up existing CLAUDE.md files and replaces them.
   * Returns backup data for restoration.
   *
   * @param instructions - Custom instructions to inject
   * @returns Backup data, or null if no instructions
   * @throws Error if file operations fail
   */
  prepareEnvironment(instructions: string | undefined): Promise<ClaudeFileBackup | null>;

  /**
   * Restores CLAUDE.md files from backup.
   *
   * @param backup - Backup data from prepareEnvironment
   * @throws Error if file operations fail
   */
  restoreEnvironment(backup: ClaudeFileBackup | null): Promise<void>;
}
