/**
 * useAgentMessages Hook - Redux Version
 * Wraps Redux state management for agent messages
 *
 * Architecture:
 * - Uses Redux as single source of truth
 * - WebSocket middleware handles real-time updates automatically
 * - Aggregation happens in selector (typing effect)
 * - No local state needed
 */

import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  selectMessagesForAgent,
  fetchMessages,
  type AgentMessage,
} from '@headless-agent-manager/client';
import type { RootState } from '@/store/store';
import { useAppDispatch } from './useAppState';

/**
 * Hook return type
 */
export interface UseAgentMessagesResult {
  messages: AgentMessage[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook for accessing agent messages with automatic loading and real-time updates
 *
 * Features:
 * - Automatically fetches historical messages when agent selected
 * - Real-time updates via WebSocket (handled by Redux middleware)
 * - Message aggregation for typing effect (handled by selector)
 * - Deduplication and gap detection (handled by Redux slice)
 *
 * @param agentId - The agent ID to fetch messages for (null = no agent selected)
 * @returns Messages, loading state, error state, and refetch function
 *
 * @example
 * ```tsx
 * const { messages, loading, error, refetch } = useAgentMessages(agentId);
 *
 * if (loading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 *
 * return messages.map(msg => <Message key={msg.id} {...msg} />);
 * ```
 */
export function useAgentMessages(agentId: string | null): UseAgentMessagesResult {
  const dispatch = useAppDispatch();

  // Select messages from Redux state (already aggregated by selector)
  const messages = useSelector((state: RootState) => {
    if (!agentId) return [];
    return selectMessagesForAgent(state, agentId);
  });

  // Select loading and error states
  const loading = useSelector((state: RootState) =>
    agentId ? state.messages.byAgentId[agentId]?.loading ?? false : false
  );

  const error = useSelector((state: RootState) =>
    agentId ? state.messages.byAgentId[agentId]?.error ?? null : null
  );

  /**
   * Fetch historical messages when agent selected
   */
  useEffect(() => {
    if (!agentId) {
      return;
    }

    // Dispatch fetch action (async thunk)
    // Redux will handle loading state automatically
    dispatch(fetchMessages(agentId));
  }, [agentId, dispatch]);

  /**
   * Manual refetch function
   */
  const refetch = () => {
    if (!agentId) {
      return;
    }

    dispatch(fetchMessages(agentId));
  };

  return {
    messages,
    loading,
    error: error ? new Error(error) : null,
    refetch,
  };
}

/**
 * Re-export aggregation utility for direct use if needed
 * (e.g., for testing or custom message processing)
 */
export { aggregateStreamingTokens } from '@headless-agent-manager/client';
