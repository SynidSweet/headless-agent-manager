import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ILogger } from '@application/ports/logger.port';

/**
 * Console Logger Service
 * Simple console-based logger implementation for MVP
 * For production, replace with Winston or Pino
 */
@Injectable()
export class ConsoleLogger implements ILogger, NestLoggerService {
  /**
   * Safely stringify context object, handling circular references
   */
  private safeStringify(context?: Record<string, unknown>): string {
    if (!context) {
      return '';
    }

    try {
      return JSON.stringify(context);
    } catch (error) {
      // Handle circular references or other serialization errors
      return '[Context serialization failed: Circular reference or invalid data]';
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG] ${timestamp} - ${message}`, this.safeStringify(context));
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] ${timestamp} - ${message}`, this.safeStringify(context));
  }

  /**
   * Log info message (alias for NestJS compatibility)
   */
  log(message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] ${timestamp} - ${message}`, context ?? '');
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.warn(`[WARN] ${timestamp} - ${message}`, this.safeStringify(context));
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] ${timestamp} - ${message}`, this.safeStringify(context));
  }

  /**
   * Log verbose message (for NestJS compatibility)
   */
  verbose(message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[VERBOSE] ${timestamp} - ${message}`, context ?? '');
  }
}
