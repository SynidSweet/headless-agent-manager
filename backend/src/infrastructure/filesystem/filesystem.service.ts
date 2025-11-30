/**
 * FileSystem Service
 *
 * Implementation of IFileSystem port using Node.js fs.promises API
 *
 * Features:
 * - Async/await for all operations
 * - Automatic parent directory creation
 * - Idempotent delete operations
 * - UTF-8 encoding by default
 * - Proper error propagation
 */

import { Injectable } from '@nestjs/common';
import { IFileSystem } from '@application/ports/filesystem.port';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class FileSystemService implements IFileSystem {
  /**
   * Check if a file or directory exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a file's contents as a UTF-8 string
   * @throws Error if file doesn't exist or cannot be read
   */
  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Write content to a file
   * Creates parent directories recursively if they don't exist
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    // Create parent directories if they don't exist
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });

    // Write file with UTF-8 encoding
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * Delete a file
   * Idempotent - does not throw if file doesn't exist
   * @throws Error if file exists but cannot be deleted (e.g., permission denied)
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      // Idempotent behavior: don't throw if file doesn't exist
      if (error.code === 'ENOENT') {
        return;
      }
      // Propagate other errors (permission denied, etc.)
      throw error;
    }
  }
}
