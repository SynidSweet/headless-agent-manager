/**
 * Event Data
 * Generic event data structure
 */
export interface EventData {
  [key: string]: unknown;
}

/**
 * Event Handler
 * Function that handles events
 */
export type EventHandler = (data: EventData) => void | Promise<void>;

/**
 * Event Bus Port
 * Interface for event-driven communication
 */
export interface IEventBus {
  /**
   * Emit an event
   * @param event - The event name
   * @param data - The event data
   */
  emit(event: string, data: EventData): void;

  /**
   * Subscribe to an event
   * @param event - The event name
   * @param handler - The handler function
   */
  on(event: string, handler: EventHandler): void;

  /**
   * Unsubscribe from an event
   * @param event - The event name
   * @param handler - The handler function
   */
  off(event: string, handler: EventHandler): void;
}
