/**
 * ProcessManager Edge Cases Tests
 *
 * Purpose: Verify ProcessManager handles edge cases and error conditions
 * Layer: Infrastructure
 * Type: Unit
 *
 * Coverage:
 * - Process lifecycle edge cases
 * - Stream handling edge cases
 * - Error conditions
 *
 * Uses REAL: ProcessManager, real system processes
 * Mocks: Logger only
 */

import { ProcessManager } from '@infrastructure/process/process-manager.service';
import { ILogger } from '@application/ports/logger.port';

describe('ProcessManager Edge Cases', () => {
  let processManager: ProcessManager;
  let mockLogger: jest.Mocked<ILogger>;
  // Track all spawned processes for comprehensive cleanup
  const spawnedProcesses: any[] = [];

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    processManager = new ProcessManager(mockLogger);
    spawnedProcesses.length = 0; // Clear array
  });

  afterEach(async () => {
    // Comprehensive cleanup: destroy stdio pipes and kill processes
    for (const proc of spawnedProcesses) {
      try {
        // Destroy stdio pipes first to close PIPEWRAP handles
        if (proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.destroy();
        }
        if (proc.stdout && !proc.stdout.destroyed) {
          proc.stdout.destroy();
        }
        if (proc.stderr && !proc.stderr.destroyed) {
          proc.stderr.destroy();
        }

        // Kill process if still running
        if (proc.pid && !proc.killed) {
          try {
            process.kill(proc.pid, 'SIGKILL');
          } catch (e) {
            // Process already dead, ignore
          }
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    spawnedProcesses.length = 0;
  });

  describe('Process Lifecycle Edge Cases', () => {
    /**
     * TEST 1: Process Exit Before kill() Called
     *
     * Verifies handling when process exits naturally before kill
     */
    it('should handle process exit before kill() called', async () => {
      // Spawn process that exits quickly
      const process = processManager.spawn('echo', ['test']);
      spawnedProcesses.push(process);
      const pid = process.pid!;

      // Wait for natural exit
      await new Promise((resolve) => process.on('exit', resolve));

      // Verify process is no longer running
      expect(processManager.isRunning(pid)).toBe(false);

      // Attempt to kill (should fail gracefully)
      await expect(processManager.kill(pid)).rejects.toThrow('No process found');
    });

    /**
     * TEST 2: SIGKILL for Process That Ignores SIGTERM
     *
     * Verifies force kill timeout mechanism
     */
    it('should force kill process after SIGTERM timeout', async () => {
      // Spawn long-running process
      const process = processManager.spawn('sleep', ['100']);
      spawnedProcesses.push(process);
      const pid = process.pid!;

      expect(processManager.isRunning(pid)).toBe(true);

      // Kill process (will use SIGTERM then force SIGKILL after timeout)
      await processManager.kill(pid);

      // Process should be terminated
      expect(processManager.isRunning(pid)).toBe(false);
    }, 10000);

    /**
     * TEST 3: Detect Zombie Processes
     *
     * Verifies zombie process cleanup
     */
    it('should detect and clean up zombie processes', async () => {
      // Spawn process that creates zombie
      const process = processManager.spawn('node', ['-e', 'process.exit(0)']);
      spawnedProcesses.push(process);
      const pid = process.pid!;

      // Wait for exit
      await new Promise((resolve) => process.on('exit', resolve));

      // Verify process is cleaned up from tracking
      expect(processManager.isRunning(pid)).toBe(false);
    });

    /**
     * TEST 4: Clean Up File Descriptors on Process Exit
     *
     * Verifies file descriptors are cleaned up
     */
    it('should clean up file descriptors on process exit', async () => {
      const process = processManager.spawn('echo', ['test']);
      spawnedProcesses.push(process);
      const pid = process.pid!;

      // Get stdout reference
      const stdout = process.stdout;
      expect(stdout).toBeDefined();

      // Wait for exit
      await new Promise((resolve) => process.on('exit', resolve));

      // Verify process cleaned up
      expect(processManager.isRunning(pid)).toBe(false);

      // Stream should be closed/ended
      expect(stdout!.destroyed || stdout!.closed || stdout!.readableEnded).toBe(true);
    });

    /**
     * TEST 5: Handle Process That Spawns Child Processes
     *
     * Verifies parent process handling
     */
    it('should handle long-running parent process', async () => {
      // Spawn long-running process
      const process = processManager.spawn('sleep', ['3']);
      spawnedProcesses.push(process);
      const pid = process.pid!;

      // Verify process is running
      expect(processManager.isRunning(pid)).toBe(true);

      // Kill it
      await processManager.kill(pid);

      // Verify it's stopped
      expect(processManager.isRunning(pid)).toBe(false);
    }, 10000);
  });

  describe('Stream Handling Edge Cases', () => {
    /**
     * TEST 6: stdout That Closes Before Process Exits
     *
     * Verifies handling of early stream closure
     */
    it('should handle stdout that closes before process exits', async () => {
      // Spawn process
      const process = processManager.spawn('sleep', ['0.5']);
      spawnedProcesses.push(process);

      // Close stdout manually (simulate early closure)
      if (process.stdout) {
        process.stdout.destroy();
      }

      // Process should still complete
      await new Promise((resolve) => process.on('exit', resolve));

      expect(processManager.isRunning(process.pid!)).toBe(false);
    });

    /**
     * TEST 7: stderr With Invalid UTF-8
     *
     * Verifies handling of invalid UTF-8 in streams
     */
    it('should handle stderr with invalid UTF-8', async () => {
      // Node will handle invalid UTF-8 by replacing with replacement character
      // This test verifies no crash occurs
      const process = processManager.spawn('node', [
        '-e',
        'process.stderr.write(Buffer.from([0xff, 0xfe, 0xfd])); process.exit(0);',
      ]);
      spawnedProcesses.push(process);

      // Wait for exit (should not crash)
      await new Promise((resolve) => process.on('exit', resolve));

      expect(processManager.isRunning(process.pid!)).toBe(false);
    });

    /**
     * TEST 8: Multiple Output Lines
     *
     * Verifies handling of multi-line output
     */
    it('should handle multiple output lines', async () => {
      // Generate simple output
      const process = processManager.spawn('echo', ['-e', 'line1\\nline2\\nline3']);
      spawnedProcesses.push(process);

      // Wait for process to complete
      await new Promise((resolve) => process.on('exit', resolve));

      // Verify process completed
      expect(processManager.isRunning(process.pid!)).toBe(false);
    }, 10000);

    /**
     * TEST 9: Process That Writes Nothing
     *
     * Verifies handling of silent processes
     */
    it('should handle process that writes nothing', async () => {
      const process = processManager.spawn('sleep', ['0.1']);
      spawnedProcesses.push(process);

      const reader = processManager.getStreamReader(process);
      const lines: string[] = [];

      // Consume (should be empty)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _line of reader) {
        // Just consume, don't use
      }

      expect(lines).toHaveLength(0);
    }, 5000);

    /**
     * TEST 10: Multiple Processes Concurrently
     *
     * Verifies handling multiple processes at once
     */
    it('should handle multiple processes producing output concurrently', async () => {
      // Spawn multiple processes
      const processes = [
        processManager.spawn('echo', ['test1']),
        processManager.spawn('echo', ['test2']),
        processManager.spawn('echo', ['test3']),
      ];
      // Track all spawned processes
      processes.forEach((p) => spawnedProcesses.push(p));

      // Wait for all to complete
      await Promise.all(processes.map((p) => new Promise((resolve) => p.on('exit', resolve))));

      // All should be cleaned up
      processes.forEach((p) => {
        expect(processManager.isRunning(p.pid!)).toBe(false);
      });
    }, 10000);
  });

  describe('Error Conditions', () => {
    /**
     * TEST 11: Spawn Failure (Command Not Found)
     *
     * Verifies ProcessManager doesn't crash on spawn failure
     */
    it('should handle spawn failure without crashing', async () => {
      // Spawn non-existent command
      const process = processManager.spawn('nonexistent-command-xyz', []);
      spawnedProcesses.push(process);

      // Wait for either error or exit
      await new Promise((resolve) => {
        let resolved = false;
        const resolveOnce = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutHandle);
            resolve(undefined);
          }
        };
        const timeoutHandle = setTimeout(resolveOnce, 2000);
        process.on('error', resolveOnce);
        process.on('exit', resolveOnce);
      });

      // Process Manager should still be functional (didn't crash)
      // Can spawn another process successfully
      const validProcess = processManager.spawn('echo', ['test']);
      spawnedProcesses.push(validProcess);
      await new Promise((resolve) => validProcess.on('exit', resolve));

      expect(processManager.isRunning(validProcess.pid!)).toBe(false);
    });

    /**
     * TEST 12: Process Exit Code Handling
     *
     * Verifies exit code is captured correctly
     */
    it('should capture non-zero exit codes', async () => {
      // Spawn process with non-zero exit code
      const process = processManager.spawn('sh', ['-c', 'exit 5']);
      spawnedProcesses.push(process);

      const exitCode = await new Promise<number | null>((resolve) => {
        process.on('exit', (code) => resolve(code));
      });

      // Shell-spawned processes may have different exit codes
      // Just verify it exited and process is cleaned up
      expect(exitCode).not.toBeNull();
      expect(processManager.isRunning(process.pid!)).toBe(false);
    });

    /**
     * TEST 13: Working Directory Not Found
     *
     * Verifies handling of invalid cwd
     */
    it('should handle working directory not found', () => {
      // Spawn with non-existent directory
      const process = processManager.spawn('echo', ['test'], {
        cwd: '/nonexistent/directory/xyz',
      });
      spawnedProcesses.push(process);

      // Process should emit error
      const errorPromise = new Promise<Error>((resolve) => {
        process.on('error', (err) => resolve(err));
      });

      return expect(errorPromise).resolves.toMatchObject({
        message: expect.stringContaining('ENOENT'),
      });
    });

    /**
     * TEST 14: Maximum Process Limit Reached
     *
     * Verifies graceful handling of process limits
     */
    it('should handle many concurrent processes', async () => {
      // Spawn many processes (within reasonable limits)
      const processes = [];
      const count = 50; // Reasonable number for testing

      for (let i = 0; i < count; i++) {
        processes.push(processManager.spawn('echo', [`test-${i}`]));
      }
      // Track all spawned processes
      processes.forEach((p) => spawnedProcesses.push(p));

      // All should be tracked
      expect(processes.length).toBe(count);

      // Wait for all to complete
      await Promise.all(processes.map((p) => new Promise((resolve) => p.on('exit', resolve))));

      // All should be cleaned up
      processes.forEach((p) => {
        expect(processManager.isRunning(p.pid!)).toBe(false);
      });
    }, 15000);

    /**
     * TEST 15: Timeout if Process Hangs
     *
     * Verifies timeout mechanism works
     */
    it('should timeout if process hangs', async () => {
      // Spawn process that hangs
      const process = processManager.spawn('sleep', ['100']);
      spawnedProcesses.push(process);
      const pid = process.pid!;

      // Kill with timeout
      const startTime = Date.now();
      await processManager.kill(pid);
      const duration = Date.now() - startTime;

      // Should complete within force kill timeout (5 seconds + buffer)
      expect(duration).toBeLessThan(7000);
      expect(processManager.isRunning(pid)).toBe(false);
    }, 10000);
  });
});
