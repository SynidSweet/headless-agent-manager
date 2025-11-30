/**
 * Health Check DTO
 * Response format for health check endpoint
 */
export class HealthCheckDto {
  /**
   * Overall health status
   */
  status!: string; // 'ok' | 'degraded' | 'error'

  /**
   * Process ID
   */
  pid!: number;

  /**
   * Uptime in seconds
   */
  uptime!: number;

  /**
   * Memory usage statistics
   */
  memoryUsage!: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };

  /**
   * Number of currently running agents
   */
  activeAgents!: number;

  /**
   * Total number of agents (all statuses)
   */
  totalAgents!: number;

  /**
   * Database connection status
   */
  databaseStatus!: 'connected' | 'disconnected';

  /**
   * Application startup timestamp
   */
  startedAt!: Date;

  /**
   * Current timestamp
   */
  timestamp!: Date;

  /**
   * Port number
   */
  port!: number;

  /**
   * Node.js version
   */
  nodeVersion!: string;

  /**
   * Unique instance identifier
   */
  instanceId!: string;
}
