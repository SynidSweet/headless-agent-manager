/**
 * PidFileProcessManager Tests
 *
 * TDD - Phase 2: Infrastructure Layer
 * Tests written FIRST following RED → GREEN → REFACTOR cycle
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PidFileProcessManager } from '@infrastructure/process/pid-file-process-manager.adapter';
import { IFileSystem } from '@application/ports/filesystem.port';
import { ProcessUtils } from '@infrastructure/process/process.utils';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

describe('PidFileProcessManager', () => {
  let manager: PidFileProcessManager;
  let mockFileSystem: jest.Mocked<IFileSystem>;
  let mockProcessUtils: jest.Mocked<ProcessUtils>;
  let mockLogger: jest.Mocked<Logger>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const testPidPath = '/test/backend.pid';
  const currentPid = process.pid;
  const currentPort = 3000;

  // Helper to create a mock ProcessLock
  const createMockLock = (pid: number = currentPid) => ({
    pid,
    startedAt: new Date('2025-11-27T20:00:00.000Z'),
    port: currentPort,
    nodeVersion: 'v18.17.0',
    instanceId: `instance-${pid}-${Date.now()}`,
  });

  // Helper to create mock file content
  const createLockFileContent = (pid: number = currentPid) => {
    return JSON.stringify({
      pid,
      startedAt: new Date('2025-11-27T20:00:00.000Z').toISOString(),
      port: currentPort,
      nodeVersion: 'v18.17.0',
      instanceId: `instance-${pid}-1234567890`,
    });
  };

  beforeEach(async () => {
    // Create mocks
    mockFileSystem = {
      exists: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      deleteFile: jest.fn(),
    };

    mockProcessUtils = {
      isProcessRunning: jest.fn(),
      getCurrentMemoryUsage: jest.fn(),
      getUptime: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn().mockReturnValue('3000'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PidFileProcessManager,
        {
          provide: 'PID_FILE_PATH',
          useValue: testPidPath,
        },
        {
          provide: 'IFileSystem',
          useValue: mockFileSystem,
        },
        {
          provide: ProcessUtils,
          useValue: mockProcessUtils,
        },
        {
          provide: 'ILogger',
          useValue: mockLogger,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    manager = module.get<PidFileProcessManager>(PidFileProcessManager);
  });

  describe('hasRunningInstance', () => {
    it('should return false if PID file does not exist', async () => {
      // Arrange
      mockFileSystem.exists.mockResolvedValue(false);

      // Act
      const result = await manager.hasRunningInstance();

      // Assert
      expect(result).toBe(false);
      expect(mockFileSystem.exists).toHaveBeenCalledWith(testPidPath);
    });

    it('should return false if PID file exists but process is dead', async () => {
      // Arrange
      const deadPid = 99999;
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(createLockFileContent(deadPid));
      mockProcessUtils.isProcessRunning.mockReturnValue(false);

      // Act
      const result = await manager.hasRunningInstance();

      // Assert
      expect(result).toBe(false);
      expect(mockProcessUtils.isProcessRunning).toHaveBeenCalledWith(deadPid);
    });

    it('should return true if PID file exists and process is alive', async () => {
      // Arrange
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(createLockFileContent(currentPid));
      mockProcessUtils.isProcessRunning.mockReturnValue(true);

      // Act
      const result = await manager.hasRunningInstance();

      // Assert
      expect(result).toBe(true);
      expect(mockProcessUtils.isProcessRunning).toHaveBeenCalledWith(currentPid);
    });

    it('should return false if PID file exists but is invalid JSON', async () => {
      // Arrange
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue('invalid json');

      // Act
      const result = await manager.hasRunningInstance();

      // Assert
      expect(result).toBe(false);
    });

    it('should return false if PID file cannot be read', async () => {
      // Arrange
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockRejectedValue(new Error('Permission denied'));

      // Act
      const result = await manager.hasRunningInstance();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getCurrentLock', () => {
    it('should return null if PID file does not exist', async () => {
      // Arrange
      mockFileSystem.readFile.mockRejectedValue(new Error('ENOENT'));

      // Act
      const result = await manager.getCurrentLock();

      // Assert
      expect(result).toBeNull();
    });

    it('should parse and return lock information', async () => {
      // Arrange
      const expectedLock = createMockLock(12345);
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify(expectedLock));

      // Act
      const result = await manager.getCurrentLock();

      // Assert
      expect(result).toEqual({
        ...expectedLock,
        startedAt: new Date(expectedLock.startedAt),
      });
    });

    it('should return null if file content is invalid JSON', async () => {
      // Arrange
      mockFileSystem.readFile.mockResolvedValue('not valid json');

      // Act
      const result = await manager.getCurrentLock();

      // Assert
      expect(result).toBeNull();
    });

    it('should return null if file content is missing required fields', async () => {
      // Arrange
      mockFileSystem.readFile.mockResolvedValue(JSON.stringify({ pid: 123 }));

      // Act
      const result = await manager.getCurrentLock();

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('acquireLock', () => {
    it('should create PID file with current process information', async () => {
      // Arrange
      mockFileSystem.writeFile.mockResolvedValue();

      // Act
      const lock = await manager.acquireLock();

      // Assert
      expect(lock.getPid()).toBe(currentPid);
      expect(lock.getPort()).toBe(currentPort);
      expect(lock.getNodeVersion()).toBe(process.version);
      expect(lock.getStartedAt()).toBeInstanceOf(Date);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        testPidPath,
        expect.stringMatching(new RegExp(`"pid":\\s*${currentPid}`))
      );
    });

    it('should include timestamp in lock', async () => {
      // Arrange
      const beforeTime = new Date();
      mockFileSystem.writeFile.mockResolvedValue();

      // Act
      const lock = await manager.acquireLock();
      const afterTime = new Date();

      // Assert
      expect(lock.getStartedAt().getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(lock.getStartedAt().getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should write valid JSON to file', async () => {
      // Arrange
      mockFileSystem.writeFile.mockResolvedValue();

      // Act
      await manager.acquireLock();

      // Assert
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(testPidPath, expect.any(String));

      // Verify JSON is valid
      const writtenContent = (mockFileSystem.writeFile as jest.Mock).mock.calls[0][1];
      expect(() => JSON.parse(writtenContent)).not.toThrow();
    });

    it('should propagate file system errors', async () => {
      // Arrange
      mockFileSystem.writeFile.mockRejectedValue(new Error('Permission denied'));

      // Act & Assert
      await expect(manager.acquireLock()).rejects.toThrow('Permission denied');
    });
  });

  describe('releaseLock', () => {
    it('should delete PID file', async () => {
      // Arrange
      mockFileSystem.deleteFile.mockResolvedValue();

      // Act
      await manager.releaseLock();

      // Assert
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith(testPidPath);
    });

    it('should be idempotent - not throw if file does not exist', async () => {
      // Arrange
      mockFileSystem.deleteFile.mockResolvedValue(); // deleteFile is already idempotent

      // Act & Assert
      await expect(manager.releaseLock()).resolves.not.toThrow();
    });

    it('should be idempotent - can be called multiple times', async () => {
      // Arrange
      mockFileSystem.deleteFile.mockResolvedValue();

      // Act & Assert
      await manager.releaseLock();
      await expect(manager.releaseLock()).resolves.not.toThrow();
      expect(mockFileSystem.deleteFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanupStaleLock', () => {
    it('should remove PID file if process is dead', async () => {
      // Arrange
      const deadPid = 99999;
      mockFileSystem.readFile.mockResolvedValue(createLockFileContent(deadPid));
      mockProcessUtils.isProcessRunning.mockReturnValue(false);
      mockFileSystem.deleteFile.mockResolvedValue();

      // Act
      const result = await manager.cleanupStaleLock();

      // Assert
      expect(result).toBe(true);
      expect(mockFileSystem.deleteFile).toHaveBeenCalledWith(testPidPath);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should not remove PID file if process is alive', async () => {
      // Arrange
      mockFileSystem.readFile.mockResolvedValue(createLockFileContent(currentPid));
      mockProcessUtils.isProcessRunning.mockReturnValue(true);

      // Act
      const result = await manager.cleanupStaleLock();

      // Assert
      expect(result).toBe(false);
      expect(mockFileSystem.deleteFile).not.toHaveBeenCalled();
    });

    it('should return false if no lock exists', async () => {
      // Arrange
      mockFileSystem.readFile.mockRejectedValue(new Error('ENOENT'));

      // Act
      const result = await manager.cleanupStaleLock();

      // Assert
      expect(result).toBe(false);
      expect(mockFileSystem.deleteFile).not.toHaveBeenCalled();
    });

    it('should return false if lock file is invalid', async () => {
      // Arrange
      mockFileSystem.readFile.mockResolvedValue('invalid json');

      // Act
      const result = await manager.cleanupStaleLock();

      // Assert
      expect(result).toBe(false);
      expect(mockFileSystem.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('terminateProcess', () => {
    it('should send SIGTERM by default', async () => {
      // Arrange
      const targetPid = 12345;
      const killSpy = jest.spyOn(process, 'kill').mockImplementation();

      // Act
      await manager.terminateProcess(targetPid);

      // Assert
      expect(killSpy).toHaveBeenCalledWith(targetPid, 'SIGTERM');

      // Cleanup
      killSpy.mockRestore();
    });

    it('should send custom signal if provided', async () => {
      // Arrange
      const targetPid = 12345;
      const killSpy = jest.spyOn(process, 'kill').mockImplementation();

      // Act
      await manager.terminateProcess(targetPid, 'SIGKILL');

      // Assert
      expect(killSpy).toHaveBeenCalledWith(targetPid, 'SIGKILL');

      // Cleanup
      killSpy.mockRestore();
    });

    it('should throw error if process does not exist', async () => {
      // Arrange
      const targetPid = 99999;
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        const error: any = new Error('No such process');
        error.code = 'ESRCH';
        throw error;
      });

      // Act & Assert
      await expect(manager.terminateProcess(targetPid)).rejects.toThrow('No such process');

      // Cleanup
      killSpy.mockRestore();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete lock lifecycle', async () => {
      // Setup
      mockFileSystem.exists.mockResolvedValue(false);
      mockFileSystem.writeFile.mockResolvedValue();
      mockFileSystem.readFile.mockImplementation(async () => {
        // Return the content that was written
        const writeCall = (mockFileSystem.writeFile as jest.Mock).mock.calls[0];
        return writeCall ? writeCall[1] : '';
      });
      mockFileSystem.deleteFile.mockResolvedValue();
      mockProcessUtils.isProcessRunning.mockReturnValue(true);

      // 1. No instance running
      expect(await manager.hasRunningInstance()).toBe(false);

      // 2. Acquire lock
      const lock = await manager.acquireLock();
      expect(lock.getPid()).toBe(currentPid);

      // 3. Instance is now running
      mockFileSystem.exists.mockResolvedValue(true);
      expect(await manager.hasRunningInstance()).toBe(true);

      // 4. Get current lock
      const currentLock = await manager.getCurrentLock();
      expect(currentLock?.getPid()).toBe(currentPid);

      // 5. Release lock
      await manager.releaseLock();
      expect(mockFileSystem.deleteFile).toHaveBeenCalled();
    });

    it('should handle stale lock cleanup scenario', async () => {
      // Setup - stale lock exists
      const stalePid = 99999;
      mockFileSystem.readFile.mockResolvedValue(createLockFileContent(stalePid));
      mockProcessUtils.isProcessRunning.mockReturnValue(false);
      mockFileSystem.deleteFile.mockResolvedValue();

      // 1. Detect and clean stale lock
      const cleaned = await manager.cleanupStaleLock();
      expect(cleaned).toBe(true);
      expect(mockFileSystem.deleteFile).toHaveBeenCalled();

      // 2. Now can acquire new lock
      mockFileSystem.writeFile.mockResolvedValue();
      const newLock = await manager.acquireLock();
      expect(newLock.getPid()).toBe(currentPid);
    });
  });
});
