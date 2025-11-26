import { useEffect, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useDesignTokens } from '@/hooks/useDesignTokens';
import { useDebugMode } from '@/hooks/useDebugMode';
import { actions, selectors } from '@/store/store';
import type { RootState, AppDispatch } from '@/store/store';
import type { AgentMessage } from '@/types/agent.types';

interface AgentOutputProps {
  agentId: string | null;
}

export function AgentOutput({ agentId }: AgentOutputProps) {
  const tokens = useDesignTokens();
  const outputRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch<AppDispatch>();
  const { isDebugMode, toggleDebugMode } = useDebugMode();

  // Get messages from Redux store
  const messages = useSelector((state: RootState) =>
    agentId ? selectors.selectMessagesForAgent(state, agentId) : []
  );
  const loading = useSelector((state: RootState) =>
    agentId ? state.messages.byAgentId[agentId]?.loading ?? false : false
  );
  const error = useSelector((state: RootState) =>
    agentId ? state.messages.byAgentId[agentId]?.error ?? null : null
  );

  // Debug: Detect gaps in message sequence
  const messageGaps = useMemo(() => {
    if (!isDebugMode || messages.length === 0) return [];

    const gaps: Array<{ after: number; missing: number[] }> = [];
    const sortedMessages = [...messages].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (let i = 1; i < sortedMessages.length; i++) {
      const prev = sortedMessages[i - 1].sequenceNumber;
      const current = sortedMessages[i].sequenceNumber;

      // Skip temporary messages (sequence -1)
      if (prev === -1 || current === -1) continue;

      if (current - prev > 1) {
        const missing = [];
        for (let j = prev + 1; j < current; j++) {
          missing.push(j);
        }
        gaps.push({ after: prev, missing });
      }
    }

    return gaps;
  }, [messages, isDebugMode]);

  // Messages are populated purely from WebSocket events via Redux
  // No API fetching needed - the WebSocket middleware handles everything
  // When agent:message events arrive, they're dispatched to Redux automatically

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessageContent = (content: string | object): string => {
    if (typeof content === 'string') {
      return content;
    }
    return JSON.stringify(content, null, 2);
  };

  const getMessageStyle = (type: string) => {
    const baseStyle = {
      padding: tokens.spacing.md,
      borderRadius: tokens.borderRadius.md,
      border: `1px solid ${tokens.colors.border}`,
    };

    switch (type) {
      case 'assistant':
        return { ...baseStyle, backgroundColor: '#e3f2fd', color: tokens.colors.text };
      case 'user':
        return { ...baseStyle, backgroundColor: '#f1f8e9', color: tokens.colors.text };
      case 'system':
        return { ...baseStyle, backgroundColor: '#fff3e0', color: tokens.colors.text };
      case 'error':
        return { ...baseStyle, backgroundColor: '#ffebee', color: tokens.colors.danger };
      default:
        return baseStyle;
    }
  };

  // Don't render if no agent selected
  if (!agentId) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          backgroundColor: tokens.colors.background,
          borderRadius: tokens.borderRadius.md,
          boxShadow: tokens.shadows.md,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: tokens.spacing.xl,
            color: tokens.colors.textSecondary,
            fontStyle: 'italic',
          }}
        >
          Select an agent to view output
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: tokens.colors.background,
        borderRadius: tokens.borderRadius.md,
        boxShadow: tokens.shadows.md,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
          borderBottom: `1px solid ${tokens.colors.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: tokens.typography.fontSize.lg,
            fontWeight: 'bold',
            color: tokens.colors.text,
          }}
        >
          Output
        </h3>
        <div style={{ display: 'flex', gap: tokens.spacing.md, alignItems: 'center' }}>
          {/* Gap detection indicator (debug mode only) */}
          {isDebugMode && messageGaps.length > 0 && (
            <div
              style={{
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.warning,
                backgroundColor: '#fff3cd',
                padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
                borderRadius: tokens.borderRadius.sm,
              }}
            >
              ⚠️ {messageGaps.length} gap{messageGaps.length > 1 ? 's' : ''} detected
            </div>
          )}
          {/* Debug mode toggle */}
          <button
            onClick={toggleDebugMode}
            style={{
              padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
              fontSize: tokens.typography.fontSize.sm,
              backgroundColor: isDebugMode ? tokens.colors.primary : tokens.colors.backgroundSecondary,
              color: isDebugMode ? tokens.colors.textInverse : tokens.colors.text,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.borderRadius.sm,
              cursor: 'pointer',
            }}
            title="Toggle debug mode (shows sequence numbers and gap detection)"
          >
            🐛 Debug {isDebugMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: tokens.spacing.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.spacing.md,
        }}
        data-testid="agent-output"
      >
        {error ? (
          <div
            style={{
              textAlign: 'center',
              padding: tokens.spacing.lg,
              color: tokens.colors.danger,
              backgroundColor: '#ffebee',
              borderRadius: tokens.borderRadius.md,
              margin: tokens.spacing.lg,
            }}
          >
            Error loading messages: {error}
          </div>
        ) : loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: tokens.spacing.xl,
              color: tokens.colors.textSecondary,
              fontStyle: 'italic',
            }}
          >
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: tokens.spacing.xl,
              color: tokens.colors.textSecondary,
              fontStyle: 'italic',
            }}
          >
            No messages yet
          </div>
        ) : (
          messages.map((message: AgentMessage) => (
            <div
              key={message.id}
              data-message
              data-message-id={message.id}
              data-sequence={message.sequenceNumber}
              data-message-type={message.type}
              style={getMessageStyle(message.type)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: tokens.spacing.sm,
                  fontSize: tokens.typography.fontSize.sm,
                }}
              >
                <div style={{ display: 'flex', gap: tokens.spacing.sm, alignItems: 'center' }}>
                  <span
                    style={{
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      color: tokens.colors.text,
                    }}
                  >
                    {message.type}
                  </span>
                  {/* Debug: Show sequence number */}
                  {isDebugMode && (
                    <span
                      style={{
                        fontSize: tokens.typography.fontSize.xs,
                        color: tokens.colors.textSecondary,
                        fontFamily: tokens.typography.fontFamilyMono,
                        backgroundColor: tokens.colors.backgroundSecondary,
                        padding: `2px ${tokens.spacing.xs}`,
                        borderRadius: tokens.borderRadius.sm,
                      }}
                      title="Sequence number"
                    >
                      #{message.sequenceNumber === -1 ? 'temp' : message.sequenceNumber}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    color: tokens.colors.textSecondary,
                  }}
                >
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontFamily: tokens.typography.fontFamilyMono,
                  fontSize: tokens.typography.fontSize.sm,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: message.type === 'error' ? tokens.colors.danger : tokens.colors.text,
                }}
              >
                {renderMessageContent(message.content)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
