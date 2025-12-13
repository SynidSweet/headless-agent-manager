import { ChildProcess } from 'child_process';

/**
 * Spawn Options
 * Options for spawning a process
 */
export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'pipe' | 'ignore' | 'inherit';
  shell?: boolean; // Whether to run command through shell (default: false)
}

/**
 * Process Manager Port
 * Interface for managing child processes
 */
export interface IProcessManager {
  /**
   * Spawn a new child process
   * @param command - The command to execute
   * @param args - Command arguments
   * @param options - Spawn options
   * @returns The spawned child process
   */
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;

  /**
   * Kill a process by PID
   * @param pid - Process ID
   * @param signal - Signal to send (default: SIGTERM)
   */
  kill(pid: number, signal?: NodeJS.Signals): Promise<void>;

  /**
   * Get async stream reader for process stdout
   * @param process - The child process
   * @returns Async iterable of output lines
   */
  getStreamReader(process: ChildProcess): AsyncIterable<string>;

  /**
   * Check if a process is running
   * @param pid - Process ID
   * @returns True if process is running
   */
  isRunning(pid: number): boolean;
}
