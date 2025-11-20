import { useState, useEffect, useRef } from 'react';
import { ApiService } from '@/services/api.service';
import type { AgentMessage, AgentMessageEvent } from '@/types/agent.types';

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
 * useAgentMessages Hook
 * Manages message state with deduplication and gap detection
 *
 * Architecture:
 * - Database is source of truth (loads historical messages)
 * - WebSocket is notification (appends new messages)
 * - Deduplicates by message ID (UUID)
 * - Detects gaps by sequence number and fills them
 */
export function useAgentMessages(agentId: string | null): UseAgentMessagesResult {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track message IDs for deduplication
  const messageIdsRef = useRef<Set<string>>(new Set());

  // Track last sequence number for gap detection
  const lastSequenceRef = useRef<number>(0);

  /**
   * Load historical messages when agent selected
   */
  useEffect(() => {
    if (!agentId) {
      // No agent selected - clear everything
      setMessages([]);
      setLoading(false);
      setError(null);
      messageIdsRef.current.clear();
      lastSequenceRef.current = 0;
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      setMessages([]);
      messageIdsRef.current.clear();

      try {
        const history = await ApiService.getAgentMessages(agentId);

        setMessages(history);

        // Track IDs for deduplication
        history.forEach((msg: AgentMessage) => messageIdsRef.current.add(msg.id));

        // Track last sequence number
        if (history.length > 0) {
          lastSequenceRef.current = history[history.length - 1]!.sequenceNumber;
        } else {
          lastSequenceRef.current = 0;
        }
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [agentId]);

  /**
   * Handle real-time messages from WebSocket
   */
  useEffect(() => {
    if (!agentId) {
      return;
    }

    const handleMessage = (event: Event) => {
      const customEvent = event as CustomEvent<AgentMessageEvent>;
      const { agentId: eventAgentId, message } = customEvent.detail;

      // Ignore messages for different agents
      if (eventAgentId !== agentId) {
        return;
      }

      // Deduplication by ID
      if (messageIdsRef.current.has(message.id)) {
        console.log('[useAgentMessages] Duplicate message ignored:', message.id);
        return;
      }

      // Gap detection
      if (message.sequenceNumber > lastSequenceRef.current + 1) {
        console.warn(
          '[useAgentMessages] Gap detected in message sequence. Expected:',
          lastSequenceRef.current + 1,
          'Received:',
          message.sequenceNumber
        );

        // Fill the gap by fetching missing messages
        fillGap(agentId, lastSequenceRef.current);
        return;
      }

      // Append new message
      setMessages((prev) => [...prev, message]);
      messageIdsRef.current.add(message.id);

      // Only update sequence tracking for persisted messages (sequenceNumber > 0)
      // Temporary messages (sequenceNumber = -1) don't affect sequence tracking
      if (message.sequenceNumber > 0) {
        lastSequenceRef.current = message.sequenceNumber;
      }
    };

    // Listen for WebSocket messages
    window.addEventListener('agent:message', handleMessage);

    return () => {
      window.removeEventListener('agent:message', handleMessage);
    };
  }, [agentId]);

  /**
   * Fill gap in message sequence
   */
  const fillGap = async (currentAgentId: string, since: number) => {
    try {
      const missingMessages = await ApiService.getAgentMessagesSince(currentAgentId, since);

      setMessages((prev) => {
        const merged = [...prev];

        // Add missing messages (deduplicate by ID)
        missingMessages.forEach((msg: AgentMessage) => {
          if (!messageIdsRef.current.has(msg.id)) {
            merged.push(msg);
            messageIdsRef.current.add(msg.id);
          }
        });

        // Sort by sequence number to ensure correct order
        merged.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        return merged;
      });

      // Update last sequence number
      if (missingMessages.length > 0) {
        lastSequenceRef.current =
          missingMessages[missingMessages.length - 1]!.sequenceNumber;
      }
    } catch (err) {
      console.error('[useAgentMessages] Failed to fill gap:', err);
    }
  };

  /**
   * Manually refetch messages
   */
  const refetch = () => {
    if (!agentId) {
      return;
    }

    setLoading(true);
    setError(null);

    ApiService.getAgentMessages(agentId)
      .then((history: AgentMessage[]) => {
        setMessages(history);
        messageIdsRef.current.clear();
        history.forEach((msg: AgentMessage) => messageIdsRef.current.add(msg.id));

        if (history.length > 0) {
          lastSequenceRef.current = history[history.length - 1]!.sequenceNumber;
        }
      })
      .catch((err: unknown) => {
        setError(err as Error);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  return {
    messages,
    loading,
    error,
    refetch,
  };
}
