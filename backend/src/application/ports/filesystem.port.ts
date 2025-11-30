/**
 * FileSystem Port
 * Interface for file system operations
 *
 * This port abstracts file system operations to enable:
 * - Easy testing with mocks
 * - Potential future implementations (S3, cloud storage, etc.)
 * - Clean separation between application logic and infrastructure
 */
export interface IFileSystem {
  /**
   * Check if a file or directory exists
   * @param path - The path to check
   * @returns True if the path exists, false otherwise
   */
  exists(path: string): Promise<boolean>;

  /**
   * Read a file's contents as a string
   * @param path - The path to the file
   * @returns The file contents
   * @throws Error if file doesn't exist or cannot be read
   */
  readFile(path: string): Promise<string>;

  /**
   * Write content to a file
   * Creates parent directories recursively if they don't exist
   * @param path - The path to the file
   * @param content - The content to write
   * @throws Error if file cannot be written
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Delete a file
   * Idempotent - does not throw if file doesn't exist
   * @param path - The path to the file
   * @throws Error if file exists but cannot be deleted (e.g., permission denied)
   */
  deleteFile(path: string): Promise<void>;
}
