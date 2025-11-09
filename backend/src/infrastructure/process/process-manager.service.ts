import { spawn, ChildProcess } from 'child_process';
import { IProcessManager, SpawnOptions } from '@application/ports/process-manager.port';
import { ILogger } from '@application/ports/logger.port';

/**
 * Process Manager Service
 * Manages child process lifecycle and stream reading
 */
export class ProcessManager implements IProcessManager {
  private processes = new Map<number, ChildProcess>();

  constructor(private readonly logger: ILogger) {}

  /**
   * Spawn a new child process
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess {
    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true, // CRITICAL: Claude CLI requires shell for stdio
      cwd: options?.cwd,
      env: options?.env,
    });

    if (process.pid) {
      this.processes.set(process.pid, process);

      this.logger.debug('Process spawned', {
        command,
        args,
        pid: process.pid,
      });

      // Auto-cleanup when process exits
      process.on('exit', (code) => {
        if (process.pid) {
          this.processes.delete(process.pid);
          this.logger.debug('Process exited', {
            pid: process.pid,
            code,
          });
        }
      });

      // Handle process errors
      process.on('error', (error) => {
        this.logger.error('Process error', {
          command,
          args,
          error: error.message,
        });
      });
    }

    return process;
  }

  /**
   * Kill a process by PID
   */
  async kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    const process = this.processes.get(pid);

    if (!process) {
      throw new Error(`No process found with PID: ${pid}`);
    }

    return new Promise((resolve, reject) => {
      const killTimeout = setTimeout(() => {
        // Force kill if process doesn't exit within 5 seconds
        if (this.processes.has(pid)) {
          this.logger.warn('Process did not terminate gracefully, force killing', { pid });
          process.kill('SIGKILL');
        }
      }, 5000);

      process.on('exit', () => {
        clearTimeout(killTimeout);
        this.processes.delete(pid);
        this.logger.debug('Process killed', { pid, signal });
        resolve();
      });

      process.on('error', (error) => {
        clearTimeout(killTimeout);
        reject(error);
      });

      // Send kill signal
      const killed = process.kill(signal);
      if (!killed) {
        clearTimeout(killTimeout);
        reject(new Error(`Failed to send ${signal} to process ${pid}`));
      }
    });
  }

  /**
   * Get async stream reader for process stdout
   * Uses manual line splitting instead of readline due to Claude CLI buffering issues
   */
  async *getStreamReader(process: ChildProcess): AsyncIterable<string> {
    if (!process.stdout) {
      throw new Error('Process stdout is not available');
    }

    // CRITICAL: Set encoding to utf8
    process.stdout.setEncoding('utf8');

    this.logger.debug('Setting up stream reader with data events', { pid: process.pid });

    let buffer = '';
    const lineQueue: string[] = [];
    let streamEnded = false;

    // Listen to data events and split into lines
    process.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');

      // Keep last incomplete line in buffer
      buffer = lines.pop() || '';

      // Queue complete lines
      lineQueue.push(...lines);

      this.logger.debug('Data received', {
        pid: process.pid,
        chunkSize: chunk.length,
        linesExtracted: lines.length,
        queueSize: lineQueue.length,
      });
    });

    process.stdout.on('end', () => {
      // Push any remaining buffer as final line
      if (buffer) {
        lineQueue.push(buffer);
      }
      streamEnded = true;
      this.logger.debug('Stream ended', { pid: process.pid, finalQueueSize: lineQueue.length });
    });

    // Yield lines from queue as they arrive
    while (!streamEnded || lineQueue.length > 0) {
      if (lineQueue.length > 0) {
        const line = lineQueue.shift();
        if (line) {
          this.logger.debug('Yielding line', { pid: process.pid, lineLength: line.length });
          yield line;
        }
      } else {
        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    this.logger.debug('Stream reading completed', { pid: process.pid });
  }

  /**
   * Check if a process is running
   */
  isRunning(pid: number): boolean {
    return this.processes.has(pid);
  }
}
