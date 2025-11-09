/**
 * Agent Status Value Object
 * Represents the current state of an agent in its lifecycle.
 */
export enum AgentStatus {
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
}
