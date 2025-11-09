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
   * Log debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[DEBUG] ${timestamp} - ${message}`, context ? JSON.stringify(context) : '');
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.log(`[INFO] ${timestamp} - ${message}`, context ? JSON.stringify(context) : '');
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
    console.warn(`[WARN] ${timestamp} - ${message}`, context ? JSON.stringify(context) : '');
  }

  /**
   * Log error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] ${timestamp} - ${message}`, context ? JSON.stringify(context) : '');
  }

  /**
   * Log verbose message (for NestJS compatibility)
   */
  verbose(message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[VERBOSE] ${timestamp} - ${message}`, context ?? '');
  }
}
