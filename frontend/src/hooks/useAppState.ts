/**
 * App State Hooks
 * Convenience hooks that wrap Redux selectors for cleaner component code
 *
 * These hooks provide a clean abstraction over Redux state,
 * making components easier to test and maintain.
 */

import { useSelector, useDispatch } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import {
  selectAllAgents,
  selectSelectedAgent,
  selectAgentById,
  selectRunningAgents,
  selectCompletedAgents,
  selectFailedAgents,
  selectIsConnected,
  selectConnectionId,
  selectConnectionError,
  selectReconnectAttempts,
  agentSelected,
} from '@headless-agent-manager/client';
import type { RootState, AppDispatch } from '@/store/store';

/**
 * Typed versions of useSelector and useDispatch
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppDispatch = (): AppDispatch => useDispatch<AppDispatch>();

/**
 * Agent Hooks
 */

/**
 * Hook to get all agents
 * @returns Array of all agents
 */
export function useAgents() {
  return useAppSelector(selectAllAgents);
}

/**
 * Hook to get currently selected agent
 * @returns Selected agent or undefined
 */
export function useSelectedAgent() {
  return useAppSelector(selectSelectedAgent);
}

/**
 * Hook to get a specific agent by ID
 * @param id - Agent ID
 * @returns Agent or undefined
 */
export function useAgentById(id: string | null) {
  return useAppSelector((state) =>
    id ? selectAgentById(state, id) : undefined
  );
}

/**
 * Hook to get all running agents
 * @returns Array of running agents
 */
export function useRunningAgents() {
  return useAppSelector(selectRunningAgents);
}

/**
 * Hook to get all completed agents
 * @returns Array of completed agents
 */
export function useCompletedAgents() {
  return useAppSelector(selectCompletedAgents);
}

/**
 * Hook to get all failed agents
 * @returns Array of failed agents
 */
export function useFailedAgents() {
  return useAppSelector(selectFailedAgents);
}

/**
 * Hook to select an agent
 * @returns Function to select an agent by ID
 */
export function useSelectAgent() {
  const dispatch = useAppDispatch();

  return (agentId: string) => {
    dispatch(agentSelected(agentId));
  };
}

/**
 * Connection Hooks
 */

/**
 * Hook to get WebSocket connection status
 * @returns True if connected, false otherwise
 */
export function useConnectionStatus() {
  return useAppSelector(selectIsConnected);
}

/**
 * Hook to get connection ID
 * @returns Connection ID or null
 */
export function useConnectionId() {
  return useAppSelector(selectConnectionId);
}

/**
 * Hook to get connection error
 * @returns Error message or null
 */
export function useConnectionError() {
  return useAppSelector(selectConnectionError);
}

/**
 * Hook to get reconnection attempts count
 * @returns Number of reconnection attempts
 */
export function useReconnectAttempts() {
  return useAppSelector(selectReconnectAttempts);
}

/**
 * Composite Hook - Connection State
 * @returns Object with all connection-related state
 */
export function useConnection() {
  const isConnected = useConnectionStatus();
  const connectionId = useConnectionId();
  const error = useConnectionError();
  const reconnectAttempts = useReconnectAttempts();

  return {
    isConnected,
    connectionId,
    error,
    reconnectAttempts,
  };
}
