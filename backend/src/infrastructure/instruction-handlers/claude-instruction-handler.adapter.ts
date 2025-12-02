import { Injectable, Inject } from '@nestjs/common';
import { join } from 'path';
import { homedir } from 'os';
import { IInstructionHandler, ClaudeFileBackup } from '@application/ports/instruction-handler.port';
import { IFileSystem } from '@application/ports/filesystem.port';
import { ILogger } from '@application/ports/logger.port';

/**
 * Claude Instruction Handler
 *
 * Handles temporary replacement of CLAUDE.md files for custom instructions.
 * Backs up original files and restores them after agent startup.
 *
 * Files managed:
 * - User-level: ~/.claude/CLAUDE.md (cleared during custom instructions)
 * - Project-level: ./CLAUDE.md (replaced with custom instructions)
 *
 * Thread-safe for single-process deployments.
 */
@Injectable()
export class ClaudeInstructionHandler implements IInstructionHandler {
  private readonly userClaudePath: string;
  private readonly projectClaudePath: string;

  constructor(
    @Inject('IFileSystem') private readonly fileSystem: IFileSystem,
    @Inject('ILogger') private readonly logger: ILogger
  ) {
    this.userClaudePath = join(homedir(), '.claude', 'CLAUDE.md');
    this.projectClaudePath = join(process.cwd(), 'CLAUDE.md');
  }

  /**
   * Prepares the environment for custom instructions.
   * Backs up existing CLAUDE.md files and replaces them.
   */
  async prepareEnvironment(instructions: string | undefined): Promise<ClaudeFileBackup | null> {
    // Skip if no instructions provided
    if (!instructions || instructions.trim().length === 0) {
      this.logger.debug('No instructions provided, skipping environment preparation');
      return null;
    }

    this.logger.info('Preparing instruction environment', {
      instructionsLength: instructions.length,
      userPath: this.userClaudePath,
      projectPath: this.projectClaudePath,
    });

    try {
      const backup: ClaudeFileBackup = {
        userClaudePath: this.userClaudePath,
        projectClaudePath: this.projectClaudePath,
        timestamp: new Date(),
      };

      // Backup user CLAUDE.md (if exists)
      if (await this.fileSystem.exists(this.userClaudePath)) {
        backup.userClaudeContent = await this.fileSystem.readFile(this.userClaudePath);
        this.logger.debug('Backed up user CLAUDE.md', {
          length: backup.userClaudeContent.length,
        });

        // Clear user CLAUDE.md
        await this.fileSystem.writeFile(this.userClaudePath, '');
        this.logger.info('Cleared user CLAUDE.md');
      } else {
        this.logger.info('User CLAUDE.md not found, skipping backup', {
          path: this.userClaudePath,
        });
      }

      // Backup project CLAUDE.md (if exists)
      if (await this.fileSystem.exists(this.projectClaudePath)) {
        backup.projectClaudeContent = await this.fileSystem.readFile(this.projectClaudePath);
        this.logger.debug('Backed up project CLAUDE.md', {
          length: backup.projectClaudeContent.length,
        });
      } else {
        this.logger.info('Project CLAUDE.md not found, will create new', {
          path: this.projectClaudePath,
        });
      }

      // Write custom instructions to project CLAUDE.md
      await this.fileSystem.writeFile(this.projectClaudePath, instructions);
      this.logger.info('Wrote custom instructions to project CLAUDE.md', {
        instructionsLength: instructions.length,
      });

      return backup;
    } catch (error) {
      this.logger.error('Failed to prepare instruction environment', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to prepare instruction environment');
    }
  }

  /**
   * Restores CLAUDE.md files from backup.
   */
  async restoreEnvironment(backup: ClaudeFileBackup | null): Promise<void> {
    if (!backup) {
      this.logger.debug('No backup to restore');
      return;
    }

    this.logger.info('Restoring environment from backup', {
      timestamp: backup.timestamp,
      hasUserBackup: backup.userClaudeContent !== undefined,
      hasProjectBackup: backup.projectClaudeContent !== undefined,
    });

    try {
      // Restore user CLAUDE.md
      if (backup.userClaudeContent !== undefined) {
        await this.fileSystem.writeFile(backup.userClaudePath, backup.userClaudeContent);
        this.logger.debug('Restored user CLAUDE.md');
      }

      // Restore project CLAUDE.md
      if (backup.projectClaudeContent !== undefined) {
        await this.fileSystem.writeFile(backup.projectClaudePath, backup.projectClaudeContent);
        this.logger.debug('Restored project CLAUDE.md');
      }

      this.logger.info('Environment restored from backup');
    } catch (error) {
      this.logger.error('Failed to restore environment', {
        error: error instanceof Error ? error.message : String(error),
        backup,
      });
      throw new Error('Failed to restore environment');
    }
  }
}
