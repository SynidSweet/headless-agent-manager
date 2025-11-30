/**
 * Process Utils
 *
 * Utility service for process-related system operations
 *
 * Features:
 * - Check if a process is running by PID
 * - Get current process memory usage
 * - Get current process uptime
 * - Cross-platform support (Unix, Windows)
 *
 * Implementation Notes:
 * - Uses process.kill(pid, 0) to check if process exists without killing it
 * - Signal 0 is a special signal that checks existence without affecting the process
 * - ESRCH error code means "No such process"
 */

import { Injectable } from '@nestjs/common';

/**
 * Memory usage statistics
 */
export interface MemoryUsage {
  heapUsed: number; // Heap memory currently used (bytes)
  heapTotal: number; // Total heap memory allocated (bytes)
  external: number; // Memory used by C++ objects bound to JavaScript (bytes)
  rss: number; // Resident Set Size - total memory allocated (bytes)
}

@Injectable()
export class ProcessUtils {
  /**
   * Check if a process with the given PID is running
   *
   * Uses process.kill(pid, 0) which sends signal 0 (test signal).
   * Signal 0 doesn't actually kill the process, it just checks if it exists.
   *
   * @param pid - Process ID to check
   * @returns true if process is running, false otherwise
   */
  isProcessRunning(pid: number): boolean {
    // Validate PID range first
    // PIDs must be positive integers
    // PID 0 has special meaning in Unix (current process group), treat as invalid
    if (pid <= 0 || !Number.isInteger(pid)) {
      return false;
    }

    try {
      // Signal 0 is a special signal that checks if the process exists
      // without actually sending a signal to it
      process.kill(pid, 0);
      return true;
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        // ESRCH = "No such process" - process doesn't exist
        return false;
      }
      if (error.code === 'EPERM') {
        // EPERM = "Operation not permitted" - process exists but we don't have permission
        // This means the process IS running, we just can't kill it
        return true;
      }
      // For other errors, treat as "not running"
      return false;
    }
  }

  /**
   * Get current process memory usage statistics
   *
   * @returns Memory usage information
   */
  getCurrentMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    };
  }

  /**
   * Get current process uptime in seconds
   *
   * @returns Process uptime in seconds (with decimal precision)
   */
  getUptime(): number {
    return process.uptime();
  }
}
