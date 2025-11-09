import { ProcessManager } from '@infrastructure/process/process-manager.service';
import { ILogger } from '@application/ports/logger.port';

describe('ProcessManager Service', () => {
  let processManager: ProcessManager;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    processManager = new ProcessManager(mockLogger);
  });

  describe('spawn', () => {
    it('should spawn a process with command and args', () => {
      const process = processManager.spawn('echo', ['hello']);

      expect(process).toBeDefined();
      expect(process.pid).toBeDefined();
    });

    it('should spawn process with default stdio as pipe', () => {
      const process = processManager.spawn('echo', ['test']);

      expect(process.stdout).toBeDefined();
      expect(process.stderr).toBeDefined();
      expect(process.stdin).toBeDefined();
    });

    it('should spawn process with custom options', () => {
      const process = processManager.spawn('echo', ['test'], {
        cwd: '/tmp',
        env: { TEST: 'value' },
      });

      expect(process).toBeDefined();
    });

    it('should log when process is spawned', () => {
      processManager.spawn('echo', ['test']);

      expect(mockLogger.debug).toHaveBeenCalledWith('Process spawned', {
        command: 'echo',
        args: ['test'],
        pid: expect.any(Number),
      });
    });

    it('should track spawned processes', () => {
      const process1 = processManager.spawn('echo', ['test1']);
      const process2 = processManager.spawn('echo', ['test2']);

      expect(processManager.isRunning(process1.pid!)).toBe(true);
      expect(processManager.isRunning(process2.pid!)).toBe(true);
    });
  });

  describe('kill', () => {
    it('should kill a running process', async () => {
      const process = processManager.spawn('sleep', ['10']);
      const pid = process.pid!;

      await processManager.kill(pid);

      // Process should no longer be tracked
      expect(processManager.isRunning(pid)).toBe(false);
    });

    it('should use SIGTERM by default', async () => {
      const process = processManager.spawn('sleep', ['10']);
      const killSpy = jest.spyOn(process, 'kill');

      await processManager.kill(process.pid!);

      expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    });

    it('should accept custom signal', async () => {
      const process = processManager.spawn('sleep', ['10']);
      const killSpy = jest.spyOn(process, 'kill');

      await processManager.kill(process.pid!, 'SIGKILL');

      expect(killSpy).toHaveBeenCalledWith('SIGKILL');
    });

    it('should throw error when process not found', async () => {
      await expect(processManager.kill(99999)).rejects.toThrow(
        'No process found with PID: 99999'
      );
    });

    it('should handle process kill errors gracefully', async () => {
      const process = processManager.spawn('echo', ['test']);
      const pid = process.pid!;

      // Wait for process to complete naturally first
      await new Promise((resolve) => process.on('exit', resolve));

      // Now trying to kill it should fail gracefully
      await expect(processManager.kill(pid)).rejects.toThrow('No process found');
    });

    it('should log when process is killed', async () => {
      const process = processManager.spawn('echo', ['test']);
      const pid = process.pid!;

      await processManager.kill(pid);

      expect(mockLogger.debug).toHaveBeenCalledWith('Process killed', {
        pid,
        signal: 'SIGTERM',
      });
    });
  });

  describe('getStreamReader', () => {
    it('should return async iterable for stdout', async () => {
      const process = processManager.spawn('echo', ['line1\nline2\nline3']);
      const reader = processManager.getStreamReader(process);

      const lines: string[] = [];
      for await (const line of reader) {
        lines.push(line);
      }

      expect(lines.length).toBeGreaterThan(0);
    });

    it(
      'should yield lines as they are received',
      async () => {
        const process = processManager.spawn('echo', ['-e', 'hello\\nworld']);
        const reader = processManager.getStreamReader(process);

        const lines: string[] = [];

        // Collect lines with timeout
        const timeout = setTimeout(() => {
          // Force break after 2 seconds
        }, 2000);

        try {
          for await (const line of reader) {
            lines.push(line);
            if (lines.length >= 2) break;
          }
        } finally {
          clearTimeout(timeout);
        }

        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines.some((l) => l.includes('hello') || l.includes('world'))).toBe(true);
      },
      5000
    );
  });

  describe('isRunning', () => {
    it('should return true for running process', () => {
      const process = processManager.spawn('sleep', ['5']);

      expect(processManager.isRunning(process.pid!)).toBe(true);
    });

    it('should return false for non-existent process', () => {
      expect(processManager.isRunning(99999)).toBe(false);
    });

    it('should return false after process exits', async () => {
      const process = processManager.spawn('echo', ['test']);
      const pid = process.pid!;

      // Wait for process to exit
      await new Promise((resolve) => process.on('exit', resolve));

      expect(processManager.isRunning(pid)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove process from tracking when it exits', async () => {
      const process = processManager.spawn('echo', ['test']);
      const pid = process.pid!;

      expect(processManager.isRunning(pid)).toBe(true);

      // Wait for process to exit
      await new Promise((resolve) => process.on('exit', resolve));

      // Should be removed from tracking
      expect(processManager.isRunning(pid)).toBe(false);
    });

    it('should log when process exits', async () => {
      const process = processManager.spawn('echo', ['test']);
      const pid = process.pid!;

      await new Promise((resolve) => process.on('exit', resolve));

      expect(mockLogger.debug).toHaveBeenCalledWith('Process exited', {
        pid,
        code: expect.any(Number),
      });
    });
  });
});
