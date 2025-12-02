/**
 * FileSystemService Tests
 *
 * TDD - Phase 2: Infrastructure Layer
 * Tests written FIRST following RED → GREEN → REFACTOR cycle
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FileSystemService } from '@infrastructure/filesystem/filesystem.service';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('FileSystemService', () => {
  let service: FileSystemService;
  const testDir = path.join(__dirname, '../../../temp/filesystem-test');
  const testFile = path.join(testDir, 'test.txt');
  const nestedFile = path.join(testDir, 'nested/deep/file.txt');

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileSystemService],
    }).compile();

    service = module.get<FileSystemService>(FileSystemService);

    // Ensure test directory exists
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  afterEach(async () => {
    // Clean up files after each test
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.rm(path.join(testDir, file), { recursive: true, force: true });
      }
    } catch {
      // Ignore errors
    }
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      // Arrange
      await fs.writeFile(testFile, 'test content');

      // Act
      const result = await service.exists(testFile);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      // Act
      const result = await service.exists(path.join(testDir, 'non-existent.txt'));

      // Assert
      expect(result).toBe(false);
    });

    it('should return true for existing directory', async () => {
      // Arrange
      const dirPath = path.join(testDir, 'subdir');
      await fs.mkdir(dirPath, { recursive: true });

      // Act
      const result = await service.exists(dirPath);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-existent directory', async () => {
      // Act
      const result = await service.exists(path.join(testDir, 'non-existent-dir'));

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('readFile', () => {
    it('should read file content successfully', async () => {
      // Arrange
      const expectedContent = 'Hello, World!';
      await fs.writeFile(testFile, expectedContent);

      // Act
      const content = await service.readFile(testFile);

      // Assert
      expect(content).toBe(expectedContent);
    });

    it('should read empty file successfully', async () => {
      // Arrange
      await fs.writeFile(testFile, '');

      // Act
      const content = await service.readFile(testFile);

      // Assert
      expect(content).toBe('');
    });

    it('should throw error when file does not exist', async () => {
      // Act & Assert
      await expect(service.readFile(path.join(testDir, 'non-existent.txt'))).rejects.toThrow();
    });

    it('should handle UTF-8 content correctly', async () => {
      // Arrange
      const utf8Content = '{ "emoji": "🚀", "text": "Hello" }';
      await fs.writeFile(testFile, utf8Content);

      // Act
      const content = await service.readFile(testFile);

      // Assert
      expect(content).toBe(utf8Content);
      expect(JSON.parse(content).emoji).toBe('🚀');
    });
  });

  describe('writeFile', () => {
    it('should write content to file', async () => {
      // Arrange
      const content = 'Test content';

      // Act
      await service.writeFile(testFile, content);

      // Assert
      const actual = await fs.readFile(testFile, 'utf-8');
      expect(actual).toBe(content);
    });

    it('should create parent directories recursively', async () => {
      // Arrange
      const content = 'Nested content';

      // Act
      await service.writeFile(nestedFile, content);

      // Assert
      const actual = await fs.readFile(nestedFile, 'utf-8');
      expect(actual).toBe(content);

      // Verify directories were created
      const dirExists = await service.exists(path.dirname(nestedFile));
      expect(dirExists).toBe(true);
    });

    it('should overwrite existing file', async () => {
      // Arrange
      await fs.writeFile(testFile, 'Old content');

      // Act
      await service.writeFile(testFile, 'New content');

      // Assert
      const actual = await fs.readFile(testFile, 'utf-8');
      expect(actual).toBe('New content');
    });

    it('should write empty content', async () => {
      // Act
      await service.writeFile(testFile, '');

      // Assert
      const actual = await fs.readFile(testFile, 'utf-8');
      expect(actual).toBe('');
    });

    it('should handle UTF-8 content correctly', async () => {
      // Arrange
      const utf8Content = '{ "emoji": "🚀", "text": "Hello" }';

      // Act
      await service.writeFile(testFile, utf8Content);

      // Assert
      const actual = await fs.readFile(testFile, 'utf-8');
      expect(actual).toBe(utf8Content);
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      // Arrange
      await fs.writeFile(testFile, 'content');
      const existsBefore = await service.exists(testFile);
      expect(existsBefore).toBe(true);

      // Act
      await service.deleteFile(testFile);

      // Assert
      const existsAfter = await service.exists(testFile);
      expect(existsAfter).toBe(false);
    });

    it('should be idempotent - not throw when file does not exist', async () => {
      // Act & Assert
      await expect(
        service.deleteFile(path.join(testDir, 'non-existent.txt'))
      ).resolves.not.toThrow();
    });

    it('should be idempotent - can delete same file twice', async () => {
      // Arrange
      await fs.writeFile(testFile, 'content');

      // Act & Assert
      await service.deleteFile(testFile);
      await expect(service.deleteFile(testFile)).resolves.not.toThrow();
    });

    it('should throw error on permission denied', async () => {
      // This test is platform-specific and may not work in all environments
      // Skip on Windows where file permissions work differently
      if (process.platform === 'win32') {
        return;
      }

      // Arrange
      const readOnlyDir = path.join(testDir, 'readonly');
      const readOnlyFile = path.join(readOnlyDir, 'file.txt');

      await fs.mkdir(readOnlyDir, { recursive: true });
      await fs.writeFile(readOnlyFile, 'content');

      // Make directory read-only (prevents file deletion)
      await fs.chmod(readOnlyDir, 0o444);

      try {
        // Act & Assert
        await expect(service.deleteFile(readOnlyFile)).rejects.toThrow();
      } finally {
        // Cleanup: restore permissions
        await fs.chmod(readOnlyDir, 0o755);
        await fs.unlink(readOnlyFile);
        await fs.rmdir(readOnlyDir);
      }
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete file lifecycle', async () => {
      // 1. File should not exist initially
      expect(await service.exists(testFile)).toBe(false);

      // 2. Write file
      await service.writeFile(testFile, 'Initial content');
      expect(await service.exists(testFile)).toBe(true);

      // 3. Read file
      const content1 = await service.readFile(testFile);
      expect(content1).toBe('Initial content');

      // 4. Update file
      await service.writeFile(testFile, 'Updated content');
      const content2 = await service.readFile(testFile);
      expect(content2).toBe('Updated content');

      // 5. Delete file
      await service.deleteFile(testFile);
      expect(await service.exists(testFile)).toBe(false);

      // 6. Delete again (idempotent)
      await service.deleteFile(testFile);
      expect(await service.exists(testFile)).toBe(false);
    });

    it('should handle nested directory creation and cleanup', async () => {
      // Write to deeply nested path
      await service.writeFile(nestedFile, 'Deep content');

      // Verify file exists
      expect(await service.exists(nestedFile)).toBe(true);

      // Verify content
      const content = await service.readFile(nestedFile);
      expect(content).toBe('Deep content');

      // Delete file
      await service.deleteFile(nestedFile);
      expect(await service.exists(nestedFile)).toBe(false);
    });
  });
});
