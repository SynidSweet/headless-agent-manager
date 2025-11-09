/**
 * WebSocket Client Info
 */
export interface WebSocketClient {
  id: string;
  connectedAt: Date;
}

/**
 * WebSocket Gateway Port
 * Interface for real-time communication with frontend clients
 */
export interface IWebSocketGateway {
  /**
   * Emit an event to a specific client
   * @param clientId - The client ID
   * @param event - The event name
   * @param data - The event data
   */
  emitToClient(clientId: string, event: string, data: unknown): void;

  /**
   * Emit an event to all connected clients
   * @param event - The event name
   * @param data - The event data
   */
  emitToAll(event: string, data: unknown): void;

  /**
   * Emit an event to clients subscribed to a specific room
   * @param room - The room name (e.g., agent ID)
   * @param event - The event name
   * @param data - The event data
   */
  emitToRoom(room: string, event: string, data: unknown): void;

  /**
   * Add a client to a room
   * @param clientId - The client ID
   * @param room - The room name
   */
  joinRoom(clientId: string, room: string): void;

  /**
   * Remove a client from a room
   * @param clientId - The client ID
   * @param room - The room name
   */
  leaveRoom(clientId: string, room: string): void;

  /**
   * Get all connected clients
   */
  getConnectedClients(): WebSocketClient[];

  /**
   * Check if a client is connected
   * @param clientId - The client ID
   */
  isClientConnected(clientId: string): boolean;
}
