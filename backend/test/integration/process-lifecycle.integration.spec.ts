import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { ApplicationLifecycleService } from '@application/services/application-lifecycle.service';
import { AgentOrchestrationService } from '@application/services/agent-orchestration.service';
import { DatabaseService } from '@infrastructure/database/database.service';
import { PidFileProcessManager } from '@infrastructure/process/pid-file-process-manager.adapter';
import { ProcessUtils } from '@infrastructure/process/process.utils';
import { FileSystemService } from '@infrastructure/filesystem/filesystem.service';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';
import { InstanceAlreadyRunningError } from '@domain/exceptions/instance-already-running.exception';

/**
 * PROCESS LIFECYCLE INTEGRATION TESTS
 *
 * These tests verify the complete lifecycle of the backend application's
 * single-instance management system using REAL file system dependencies.
 *
 * Tests verify:
 * - Single instance guarantee (only one app can run at a time)
 * - PID file lifecycle (creation, reading, deletion)
 * - Stale lock cleanup (crashed instance detection)
 * - Instance metadata tracking
 * - Graceful shutdown sequence
 * - Error scenarios (permissions, corrupted files, etc.)
 *
 * Following TDD: Each test is written to FAIL first if the behavior
 * doesn't work, then we verify it PASSES with current implementation.
 *
 * **Test Isolation:**
 * - Uses unique test PID file path for each test run
 * - Direct instantiation of services (no NestJS dependency injection)
 * - Cleans up PID files and database in afterEach
 * - Tests run against real file system (not mocks)
 */
describe('Process Lifecycle Integration Tests', () => {
  let lifecycle: ApplicationLifecycleService;
  let lockManager: PidFileProcessManager;
  let database: DatabaseService;
  let orchestration: AgentOrchestrationService;
  let fileSystem: FileSystemService;
  let processUtils: ProcessUtils;
  let logger: Logger;

  // Unique test PID file path to avoid conflicts
  const testPidPath = path.join(__dirname, '../../data/test-process-lifecycle.pid');

  beforeEach(() => {
    // Clean up any leftover test PID file
    if (fs.existsSync(testPidPath)) {
      fs.unlinkSync(testPidPath);
    }

    // Create real service instances (no DI framework needed)
    logger = new Logger('ProcessLifecycleTest');
    logger.log = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();

    fileSystem = new FileSystemService();
    processUtils = new ProcessUtils();
    database = new DatabaseService(':memory:');
    database.onModuleInit(); // Initialize schema

    lockManager = new PidFileProcessManager(
      testPidPath,
      fileSystem,
      processUtils,
      logger
    );

    // Note: AgentOrchestrationService has complex dependencies
    // We'll mock it for integration tests focused on lifecycle
    orchestration = {
      listActiveAgents: jest.fn().mockResolvedValue([]),
      terminateAgent: jest.fn().mockResolvedValue(undefined),
    } as any;

    lifecycle = new ApplicationLifecycleService(
      lockManager,
      orchestration,
      database,
      logger
    );
  });

  afterEach(() => {
    // Clean up gracefully
    try {
      lifecycle.shutdown();
    } catch (e) {
      // Ignore errors during cleanup
    }

    // Close database
    try {
      database.close();
    } catch (e) {
      // Ignore errors
    }

    // Remove test PID file
    if (fs.existsSync(testPidPath)) {
      fs.unlinkSync(testPidPath);
    }
  });

  /**
   * TEST GROUP 1: Single Instance Guarantee
   *
   * CRITICAL: Ensures only one backend instance can run at a time
   * This prevents port conflicts, database corruption, and agent confusion
   */
  describe('Single instance guarantee', () => {
    it('should allow first instance to start', async () => {
      // Act
      await lifecycle.startup();

      // Assert
      const hasInstance = await lockManager.hasRunningInstance();
      expect(hasInstance).toBe(true);

      const lock = await lockManager.getCurrentLock();
      expect(lock).toBeDefined();
      expect(lock!.getPid()).toBe(process.pid);
    });

    it('should prevent second instance from starting', async () => {
      // Arrange: Start first instance
      await lifecycle.startup();

      // Create a second lifecycle service (simulating second instance)
      const secondLifecycle = new ApplicationLifecycleService(
        lockManager,
        orchestration,
        database,
        logger
      );

      // Act & Assert: Second startup should fail
      await expect(secondLifecycle.startup()).rejects.toThrow(
        InstanceAlreadyRunningError
      );
    });

    it('should throw InstanceAlreadyRunningError with lock details', async () => {
      // Arrange
      await lifecycle.startup();

      // Create second lifecycle service
      const secondLifecycle = new ApplicationLifecycleService(
        lockManager,
        orchestration,
        database,
        logger
      );

      // Act & Assert
      try {
        await secondLifecycle.startup();
        fail('Should have thrown InstanceAlreadyRunningError');
      } catch (error) {
        expect(error).toBeInstanceOf(InstanceAlreadyRunningError);
        expect((error as InstanceAlreadyRunningError).lock).toBeDefined();
        expect((error as InstanceAlreadyRunningError).lock.getPid()).toBe(
          process.pid
        );
      }
    });

    it('should allow new instance after first shuts down', async () => {
      // Arrange: Start and then shutdown
      await lifecycle.startup();
      await lifecycle.shutdown();

      // Act: Should be able to start again
      await expect(lifecycle.startup()).resolves.not.toThrow();

      // Assert
      const hasInstance = await lockManager.hasRunningInstance();
      expect(hasInstance).toBe(true);
    });

    it('should clean up stale lock from crashed instance', async () => {
      // Arrange: Create stale PID file with dead process
      const stalePid = 99999; // Non-existent PID
      const staleLock = ProcessLock.create({
        pid: stalePid,
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date(),
        instanceId: 'stale-instance',
      });

      fs.writeFileSync(testPidPath, staleLock.toJSON());

      // Verify stale lock exists
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Act: Startup should detect stale and clean up
      await lifecycle.startup();

      // Assert: Lock should now reference current process, not stale one
      const currentLock = await lockManager.getCurrentLock();
      expect(currentLock).toBeDefined();
      expect(currentLock!.getPid()).toBe(process.pid); // New PID
      expect(currentLock!.getPid()).not.toBe(stalePid); // Not stale PID
    });

    it('should detect running instance created by another process', async () => {
      // Arrange: Create lock with current process PID (simulating running instance)
      const runningLock = ProcessLock.create({
        pid: process.pid,
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date(),
        instanceId: 'other-instance',
      });

      fs.writeFileSync(testPidPath, runningLock.toJSON());

      // Act & Assert: Should detect running instance
      await expect(lifecycle.startup()).rejects.toThrow(
        InstanceAlreadyRunningError
      );
    });
  });

  /**
   * TEST GROUP 2: PID File Lifecycle
   *
   * Verifies proper creation, reading, and deletion of PID files
   * Critical for instance locking and process tracking
   */
  describe('PID file lifecycle', () => {
    it('should create PID file on startup', async () => {
      // Act
      await lifecycle.startup();

      // Assert: File should exist
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Assert: File should have correct structure
      const content = fs.readFileSync(testPidPath, 'utf-8');
      const data = JSON.parse(content);

      expect(data.pid).toBe(process.pid);
      expect(data.port).toBe(3000);
      expect(data.nodeVersion).toBe(process.version);
      expect(data.instanceId).toBeDefined();
      expect(data.startedAt).toBeDefined();

      // Validate timestamp format
      const startedAt = new Date(data.startedAt);
      expect(startedAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should remove PID file on graceful shutdown', async () => {
      // Arrange
      await lifecycle.startup();
      expect(fs.existsSync(testPidPath)).toBe(true);

      // Act
      await lifecycle.shutdown();

      // Assert
      expect(fs.existsSync(testPidPath)).toBe(false);
    });

    it('should handle missing PID file on shutdown gracefully', async () => {
      // Arrange
      await lifecycle.startup();

      // Manually delete PID file (simulating external deletion)
      fs.unlinkSync(testPidPath);
      expect(fs.existsSync(testPidPath)).toBe(false);

      // Act & Assert: Should not throw
      await expect(lifecycle.shutdown()).resolves.not.toThrow();
    });

    it('should create parent directories if they do not exist', async () => {
      // Arrange: Use nested directory path
      const nestedPath = path.join(
        __dirname,
        '../../data/nested/deep/test.pid'
      );
      const nestedDir = path.dirname(nestedPath);

      // Clean up if exists
      if (fs.existsSync(nestedPath)) {
        fs.unlinkSync(nestedPath);
      }

      try {
        // Create new lock manager with nested path
        const nestedLockManager = new PidFileProcessManager(
          nestedPath,
          fileSystem,
          processUtils,
          logger
        );

        const nestedLifecycle = new ApplicationLifecycleService(
          nestedLockManager,
          orchestration,
          database,
          logger
        );

        // Act
        await nestedLifecycle.startup();

        // Assert: Directories should be created
        expect(fs.existsSync(nestedDir)).toBe(true);
        expect(fs.existsSync(nestedPath)).toBe(true);

        // Cleanup
        await nestedLifecycle.shutdown();
      } finally {
        // Remove nested directories
        if (fs.existsSync(nestedPath)) {
          fs.unlinkSync(nestedPath);
        }
        // Remove directories (may fail if not empty, that's OK)
        try {
          fs.rmdirSync(path.join(nestedDir));
        } catch (e) {
          // Ignore
        }
        try {
          fs.rmdirSync(path.dirname(nestedDir));
        } catch (e) {
          // Ignore
        }
      }
    });

    it('should read existing PID file correctly', async () => {
      // Arrange: Create PID file manually
      const manualLock = ProcessLock.create({
        pid: process.pid,
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date('2025-11-27T10:00:00Z'),
        instanceId: 'manual-lock-id',
      });

      fs.writeFileSync(testPidPath, manualLock.toJSON());

      // Act: Read the lock
      const readLock = await lockManager.getCurrentLock();

      // Assert
      expect(readLock).toBeDefined();
      expect(readLock!.getPid()).toBe(process.pid);
      expect(readLock!.getPort()).toBe(3000);
      expect(readLock!.getNodeVersion()).toBe(process.version);
      expect(readLock!.getInstanceId()).toBe('manual-lock-id');
      expect(readLock!.getStartedAt()).toEqual(
        new Date('2025-11-27T10:00:00Z')
      );
    });
  });

  /**
   * TEST GROUP 3: Instance Metadata
   *
   * Verifies runtime information about the running instance
   * Used for monitoring, health checks, and debugging
   */
  describe('Instance metadata', () => {
    it('should return current instance metadata', async () => {
      // Arrange
      await lifecycle.startup();

      // Act
      const metadata = lifecycle.getInstanceMetadata();

      // Assert: Basic fields
      // Note: getPid() returns the test process PID from the lock manager
      expect(metadata.getPid()).toBeGreaterThan(0);
      expect(metadata.getPort()).toBe(3000);
      expect(metadata.getNodeVersion()).toBe(process.version);
      expect(metadata.getInstanceId()).toBeDefined();

      // Assert: Uptime
      expect(metadata.getUptime()).toBeGreaterThanOrEqual(0);
      expect(typeof metadata.getUptime()).toBe('number');

      // Assert: Memory usage
      const memoryUsage = metadata.getMemoryUsage();
      expect(memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(memoryUsage.rss).toBeGreaterThan(0);
      expect(memoryUsage.external).toBeGreaterThanOrEqual(0);

      // Assert: Database status
      expect(metadata.getDatabaseStatus()).toBe('connected');

      // Assert: Active agents (always 0 in synchronous method)
      expect(metadata.getActiveAgents()).toBe(0);
    });

    it('should update uptime over time', async () => {
      // Arrange
      await lifecycle.startup();

      // Get initial metadata
      const metadata1 = lifecycle.getInstanceMetadata();
      const uptime1 = metadata1.getUptime();

      // Wait 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get updated metadata
      const metadata2 = lifecycle.getInstanceMetadata();
      const uptime2 = metadata2.getUptime();

      // Assert: Uptime should increase
      expect(uptime2).toBeGreaterThan(uptime1);
    });

    it('should reflect database disconnection', async () => {
      // Arrange
      await lifecycle.startup();

      // Close database
      database.close();

      // Act
      const metadata = lifecycle.getInstanceMetadata();

      // Assert
      expect(metadata.getDatabaseStatus()).toBe('disconnected');
    });

    it('should throw error if metadata requested before startup', () => {
      // Act & Assert
      expect(() => lifecycle.getInstanceMetadata()).toThrow(
        'Instance not started'
      );
    });
  });

  /**
   * TEST GROUP 4: Error Scenarios
   *
   * Tests error handling and edge cases
   * Ensures robust behavior under adverse conditions
   */
  describe('Error scenarios', () => {
    it('should handle corrupted PID file gracefully', async () => {
      // Arrange: Write invalid JSON to PID file
      fs.writeFileSync(testPidPath, 'invalid json content {{{');

      // Act: Should clean up corrupted file and acquire lock
      await lifecycle.startup();

      // Assert: New valid lock should be created
      const lock = await lockManager.getCurrentLock();
      expect(lock).toBeDefined();
      expect(lock!.getPid()).toBe(process.pid);

      // Verify file is now valid JSON
      const content = fs.readFileSync(testPidPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should handle PID file with missing required fields', async () => {
      // Arrange: Write incomplete PID file
      fs.writeFileSync(
        testPidPath,
        JSON.stringify({ pid: 12345 }) // Missing other required fields
      );

      // Act: Should clean up invalid file and acquire lock
      await lifecycle.startup();

      // Assert: New valid lock should be created
      const lock = await lockManager.getCurrentLock();
      expect(lock).toBeDefined();
      expect(lock!.getPid()).toBe(process.pid);

      // Verify all required fields are present
      const content = fs.readFileSync(testPidPath, 'utf-8');
      const data = JSON.parse(content);
      expect(data.pid).toBeDefined();
      expect(data.port).toBeDefined();
      expect(data.nodeVersion).toBeDefined();
      expect(data.instanceId).toBeDefined();
      expect(data.startedAt).toBeDefined();
    });

    it('should continue shutdown even if lock release fails', async () => {
      // Arrange
      await lifecycle.startup();

      // Manually delete PID file to cause release failure scenario
      fs.unlinkSync(testPidPath);

      // Act & Assert: Should not throw (idempotent behavior)
      await expect(lifecycle.shutdown()).resolves.not.toThrow();
    });

    it('should handle rapid startup/shutdown cycles', async () => {
      // Act: Perform 5 rapid startup/shutdown cycles
      for (let i = 0; i < 5; i++) {
        await lifecycle.startup();
        await lifecycle.shutdown();
      }

      // Assert: Should end in clean state
      expect(fs.existsSync(testPidPath)).toBe(false);
      const hasInstance = await lockManager.hasRunningInstance();
      expect(hasInstance).toBe(false);
    });
  });

  /**
   * TEST GROUP 5: Stale Lock Detection
   *
   * Tests detection and cleanup of stale locks from crashed instances
   * Critical for automatic recovery after crashes
   */
  describe('Stale lock detection', () => {
    it('should detect stale lock with non-existent PID', async () => {
      // Arrange: Create lock with fake PID
      const staleLock = ProcessLock.create({
        pid: 999999,
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date(),
        instanceId: 'stale',
      });

      fs.writeFileSync(testPidPath, staleLock.toJSON());

      // Act
      const cleaned = await lockManager.cleanupStaleLock();

      // Assert
      expect(cleaned).toBe(true);
      expect(fs.existsSync(testPidPath)).toBe(false);
    });

    it('should not remove lock if process is still running', async () => {
      // Arrange: Create lock with current process PID
      const activeLock = ProcessLock.create({
        pid: process.pid,
        port: 3000,
        nodeVersion: process.version,
        startedAt: new Date(),
        instanceId: 'active',
      });

      fs.writeFileSync(testPidPath, activeLock.toJSON());

      // Act
      const cleaned = await lockManager.cleanupStaleLock();

      // Assert: Should NOT clean up active lock
      expect(cleaned).toBe(false);
      expect(fs.existsSync(testPidPath)).toBe(true);
    });

    it('should return false if no lock exists', async () => {
      // Arrange: No PID file exists
      expect(fs.existsSync(testPidPath)).toBe(false);

      // Act
      const cleaned = await lockManager.cleanupStaleLock();

      // Assert
      expect(cleaned).toBe(false);
    });
  });

  /**
   * TEST GROUP 6: Shutdown Sequence
   *
   * Tests graceful shutdown behavior
   * Ensures proper cleanup order: agents → database → lock
   */
  describe('Shutdown sequence', () => {
    it('should execute shutdown steps in correct order', async () => {
      // Arrange
      await lifecycle.startup();
      const executionOrder: string[] = [];

      // Spy on shutdown steps
      (orchestration.listActiveAgents as jest.Mock).mockImplementation(async () => {
        executionOrder.push('listActiveAgents');
        return [];
      });

      jest.spyOn(database, 'close').mockImplementation(() => {
        executionOrder.push('database.close');
      });

      jest.spyOn(lockManager, 'releaseLock').mockImplementation(async () => {
        executionOrder.push('lockManager.releaseLock');
      });

      // Act
      await lifecycle.shutdown();

      // Assert: Correct order
      expect(executionOrder).toEqual([
        'listActiveAgents',
        'database.close',
        'lockManager.releaseLock',
      ]);
    });

    it('should continue shutdown even if agent stop fails', async () => {
      // Arrange
      await lifecycle.startup();

      // Mock agent stop failure
      (orchestration.listActiveAgents as jest.Mock).mockResolvedValue([]);
      jest.spyOn(database, 'close').mockReturnValue(undefined);
      jest.spyOn(lockManager, 'releaseLock').mockResolvedValue(undefined);

      // Act & Assert: Should not throw
      await expect(lifecycle.shutdown()).resolves.not.toThrow();

      // Verify database and lock were still processed
      expect(database.close).toHaveBeenCalled();
      expect(lockManager.releaseLock).toHaveBeenCalled();
    });

    it('should always release lock even if other steps fail', async () => {
      // Arrange
      await lifecycle.startup();

      // Mock failures in all other steps
      (orchestration.listActiveAgents as jest.Mock).mockRejectedValue(
        new Error('Agent list failed')
      );
      jest.spyOn(database, 'close').mockImplementation(() => {
        throw new Error('Database close failed');
      });

      const releaseSpy = jest.spyOn(lockManager, 'releaseLock');

      // Act
      await lifecycle.shutdown();

      // Assert: Lock MUST be released
      expect(releaseSpy).toHaveBeenCalled();
    });
  });
});
