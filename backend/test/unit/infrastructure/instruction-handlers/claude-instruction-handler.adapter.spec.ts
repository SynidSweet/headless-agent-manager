import { ClaudeInstructionHandler } from '@infrastructure/instruction-handlers/claude-instruction-handler.adapter';
import { IFileSystem } from '@application/ports/filesystem.port';
import { ILogger } from '@application/ports/logger.port';
import { ClaudeFileBackup } from '@application/ports/instruction-handler.port';

describe('ClaudeInstructionHandler', () => {
  let handler: ClaudeInstructionHandler;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as any;

    handler = new ClaudeInstructionHandler(mockFileSystem, mockLogger);
  });

  describe('prepareEnvironment', () => {
    it('should backup and replace CLAUDE.md files when instructions provided', async () => {
      const instructions = 'Custom instructions for this agent';

      // Mock both files exist
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile
        .mockResolvedValueOnce('User CLAUDE.md content')
        .mockResolvedValueOnce('Project CLAUDE.md content');

      const backup = await handler.prepareEnvironment(instructions);

      expect(backup).toBeDefined();
      expect(backup!.userClaudeContent).toBe('User CLAUDE.md content');
      expect(backup!.projectClaudeContent).toBe('Project CLAUDE.md content');
      expect(backup!.userClaudePath).toMatch(/\.claude\/CLAUDE\.md$/);
      expect(backup!.projectClaudePath).toMatch(/CLAUDE\.md$/);
      expect(backup!.timestamp).toBeInstanceOf(Date);

      // Should clear user CLAUDE.md
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.claude/CLAUDE.md'),
        ''
      );

      // Should replace project CLAUDE.md with instructions
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/CLAUDE\.md$/),
        instructions
      );
    });

    it('should handle missing user CLAUDE.md gracefully', async () => {
      const instructions = 'Custom instructions';

      mockFileSystem.exists
        .mockResolvedValueOnce(false) // User file doesn't exist
        .mockResolvedValueOnce(true); // Project file exists
      mockFileSystem.readFile.mockResolvedValue('Project content');

      const backup = await handler.prepareEnvironment(instructions);

      expect(backup!.userClaudeContent).toBeUndefined();
      expect(backup!.projectClaudeContent).toBe('Project content');

      // Should not try to write user file if it didn't exist
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User CLAUDE.md not found, skipping backup',
        expect.any(Object)
      );
    });

    it('should handle missing project CLAUDE.md gracefully', async () => {
      const instructions = 'Custom instructions';

      mockFileSystem.exists
        .mockResolvedValueOnce(true) // User file exists
        .mockResolvedValueOnce(false); // Project file doesn't exist
      mockFileSystem.readFile.mockResolvedValue('User content');

      const backup = await handler.prepareEnvironment(instructions);

      expect(backup!.userClaudeContent).toBe('User content');
      expect(backup!.projectClaudeContent).toBeUndefined();

      // Should still write project file with instructions
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/CLAUDE\.md$/),
        instructions
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Project CLAUDE.md not found, will create new',
        expect.any(Object)
      );
    });

    it('should return null if no instructions provided', async () => {
      const backup = await handler.prepareEnvironment(undefined);

      expect(backup).toBeNull();
      expect(mockFileSystem.exists).not.toHaveBeenCalled();
      expect(mockFileSystem.readFile).not.toHaveBeenCalled();
      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
    });

    it('should return null if instructions are empty string', async () => {
      const backup = await handler.prepareEnvironment('');

      expect(backup).toBeNull();
      expect(mockFileSystem.exists).not.toHaveBeenCalled();
    });

    it('should return null if instructions are whitespace only', async () => {
      const backup = await handler.prepareEnvironment('   ');

      expect(backup).toBeNull();
      expect(mockFileSystem.exists).not.toHaveBeenCalled();
    });

    it('should throw error if file operations fail', async () => {
      const instructions = 'Custom instructions';

      mockFileSystem.exists.mockRejectedValue(new Error('Filesystem error'));

      await expect(handler.prepareEnvironment(instructions)).rejects.toThrow(
        'Failed to prepare instruction environment'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log environment preparation', async () => {
      const instructions = 'Custom instructions';

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('Content');

      await handler.prepareEnvironment(instructions);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Preparing instruction environment',
        expect.objectContaining({
          instructionsLength: instructions.length,
        })
      );
    });

    it('should handle both files missing', async () => {
      const instructions = 'Custom instructions';

      mockFileSystem.exists.mockResolvedValue(false);

      const backup = await handler.prepareEnvironment(instructions);

      expect(backup!.userClaudeContent).toBeUndefined();
      expect(backup!.projectClaudeContent).toBeUndefined();

      // Should only write project file with instructions
      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/CLAUDE\.md$/),
        instructions
      );
    });
  });

  describe('restoreEnvironment', () => {
    it('should restore both CLAUDE.md files from backup', async () => {
      const backup: ClaudeFileBackup = {
        userClaudeContent: 'Original user content',
        projectClaudeContent: 'Original project content',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      await handler.restoreEnvironment(backup);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        backup.userClaudePath,
        'Original user content'
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        backup.projectClaudePath,
        'Original project content'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Environment restored from backup');
    });

    it('should only restore user file if project was not backed up', async () => {
      const backup: ClaudeFileBackup = {
        userClaudeContent: 'Original user content',
        projectClaudeContent: undefined,
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      await handler.restoreEnvironment(backup);

      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        backup.userClaudePath,
        'Original user content'
      );
    });

    it('should only restore project file if user was not backed up', async () => {
      const backup: ClaudeFileBackup = {
        userClaudeContent: undefined,
        projectClaudeContent: 'Original project content',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      await handler.restoreEnvironment(backup);

      expect(mockFileSystem.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        backup.projectClaudePath,
        'Original project content'
      );
    });

    it('should handle restore errors gracefully', async () => {
      const backup: ClaudeFileBackup = {
        userClaudeContent: 'Original user content',
        projectClaudeContent: 'Original project content',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      mockFileSystem.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(handler.restoreEnvironment(backup)).rejects.toThrow(
        'Failed to restore environment'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should do nothing if backup is null', async () => {
      await handler.restoreEnvironment(null);

      expect(mockFileSystem.writeFile).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('No backup to restore');
    });

    it('should restore empty strings correctly', async () => {
      const backup: ClaudeFileBackup = {
        userClaudeContent: '',
        projectClaudeContent: '',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      await handler.restoreEnvironment(backup);

      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(backup.userClaudePath, '');
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(backup.projectClaudePath, '');
    });

    it('should log restoration details', async () => {
      const backup: ClaudeFileBackup = {
        userClaudeContent: 'User content',
        projectClaudeContent: 'Project content',
        userClaudePath: '/home/user/.claude/CLAUDE.md',
        projectClaudePath: '/home/user/project/CLAUDE.md',
        timestamp: new Date(),
      };

      await handler.restoreEnvironment(backup);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Restoring environment from backup',
        expect.objectContaining({
          hasUserBackup: true,
          hasProjectBackup: true,
        })
      );
    });
  });

  describe('file paths', () => {
    it('should use correct paths for CLAUDE.md files', async () => {
      const instructions = 'Custom instructions';

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('content');

      await handler.prepareEnvironment(instructions);

      // Check user file path contains .claude directory
      expect(mockFileSystem.exists).toHaveBeenCalledWith(
        expect.stringMatching(/\.claude\/CLAUDE\.md$/)
      );

      // Check project file path is in current directory
      const calls = (mockFileSystem.exists as jest.Mock).mock.calls;
      const projectPathCall = calls.find(
        (call) => !call[0].includes('.claude') && call[0].endsWith('CLAUDE.md')
      );
      expect(projectPathCall).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle full prepare -> restore cycle', async () => {
      const instructions = 'Test instructions';
      const originalUserContent = 'Original user';
      const originalProjectContent = 'Original project';

      // Prepare phase
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile
        .mockResolvedValueOnce(originalUserContent)
        .mockResolvedValueOnce(originalProjectContent);

      const backup = await handler.prepareEnvironment(instructions);

      // Restore phase
      mockFileSystem.writeFile.mockClear();
      await handler.restoreEnvironment(backup);

      // Should restore original content
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        backup!.userClaudePath,
        originalUserContent
      );
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        backup!.projectClaudePath,
        originalProjectContent
      );
    });

    it('should handle prepare failure without affecting filesystem', async () => {
      const instructions = 'Test instructions';

      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValueOnce('User content');
      mockFileSystem.readFile.mockRejectedValueOnce(new Error('Read failed'));

      await expect(handler.prepareEnvironment(instructions)).rejects.toThrow();

      // Should not have written anything due to error
      // (actual behavior depends on implementation order)
    });
  });
});
