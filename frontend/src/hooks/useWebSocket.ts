import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  AgentMessageEvent,
  AgentStatusEvent,
  AgentErrorEvent,
  AgentCompleteEvent,
} from '../types/agent.types';

// WebSocket URL determined at runtime, not module load time

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  subscribeToAgent: (agentId: string) => void;
  unsubscribeFromAgent: (agentId: string) => void;
  onAgentMessage: (callback: (event: AgentMessageEvent) => void) => void;
  onAgentStatus: (callback: (event: AgentStatusEvent) => void) => void;
  onAgentError: (callback: (event: AgentErrorEvent) => void) => void;
  onAgentComplete: (callback: (event: AgentCompleteEvent) => void) => void;
}

/**
 * WebSocket Hook
 * Manages WebSocket connection and agent event subscriptions
 */
export function useWebSocket(): UseWebSocketReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const messageCallbackRef = useRef<((event: AgentMessageEvent) => void) | null>(null);
  const statusCallbackRef = useRef<((event: AgentStatusEvent) => void) | null>(null);
  const errorCallbackRef = useRef<((event: AgentErrorEvent) => void) | null>(null);
  const completeCallbackRef = useRef<((event: AgentCompleteEvent) => void) | null>(null);

  // Initialize socket connection
  useEffect(() => {
    // Determine WebSocket URL at runtime
    let wsUrl: string;

    if (import.meta.env.VITE_WS_URL) {
      wsUrl = import.meta.env.VITE_WS_URL;
    } else if (window.location.hostname !== 'localhost') {
      // Production: use same origin (https://agents.petter.ai)
      wsUrl = window.location.origin;
    } else {
      // Development: use localhost
      wsUrl = 'http://localhost:3000';
    }

    console.log('Connecting WebSocket to:', wsUrl);

    const newSocket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    newSocket.on('connected', (data) => {
      console.log('Connection confirmed:', data);
    });

    // Setup event listeners with callbacks
    newSocket.on('agent:message', (event: AgentMessageEvent) => {
      console.log('Agent message received:', event);
      if (messageCallbackRef.current) {
        messageCallbackRef.current(event);
      }
    });

    newSocket.on('agent:status', (event: AgentStatusEvent) => {
      console.log('Agent status changed:', event);
      if (statusCallbackRef.current) {
        statusCallbackRef.current(event);
      }
    });

    newSocket.on('agent:error', (event: AgentErrorEvent) => {
      console.error('Agent error:', event);
      if (errorCallbackRef.current) {
        errorCallbackRef.current(event);
      }
    });

    newSocket.on('agent:complete', (event: AgentCompleteEvent) => {
      console.log('Agent completed:', event);
      if (completeCallbackRef.current) {
        completeCallbackRef.current(event);
      }
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      newSocket.close();
    };
  }, []);

  const subscribeToAgent = useCallback(
    (agentId: string) => {
      if (socket && isConnected) {
        console.log('Subscribing to agent:', agentId);
        socket.emit('subscribe', { agentId });

        socket.once('subscribed', (data) => {
          console.log('Subscription confirmed:', data);
        });
      } else {
        console.warn('Cannot subscribe: socket not connected');
      }
    },
    [socket, isConnected]
  );

  const unsubscribeFromAgent = useCallback(
    (agentId: string) => {
      if (socket) {
        console.log('Unsubscribing from agent:', agentId);
        socket.emit('unsubscribe', { agentId });

        socket.once('unsubscribed', (data) => {
          console.log('Unsubscription confirmed:', data);
        });
      }
    },
    [socket]
  );

  const onAgentMessage = useCallback((callback: (event: AgentMessageEvent) => void) => {
    messageCallbackRef.current = callback;
  }, []);

  const onAgentStatus = useCallback((callback: (event: AgentStatusEvent) => void) => {
    statusCallbackRef.current = callback;
  }, []);

  const onAgentError = useCallback((callback: (event: AgentErrorEvent) => void) => {
    errorCallbackRef.current = callback;
  }, []);

  const onAgentComplete = useCallback((callback: (event: AgentCompleteEvent) => void) => {
    completeCallbackRef.current = callback;
  }, []);

  return {
    socket,
    isConnected,
    subscribeToAgent,
    unsubscribeFromAgent,
    onAgentMessage,
    onAgentStatus,
    onAgentError,
    onAgentComplete,
  };
}
