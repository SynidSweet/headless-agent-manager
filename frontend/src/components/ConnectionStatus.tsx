import { useSelector } from 'react-redux';
import { selectors } from '@/store/store';
import type { RootState } from '@/store/store';
import { useDesignTokens } from '@/hooks/useDesignTokens';

interface ConnectionStatusProps {
  compact?: boolean;
  collapsed?: boolean;
}

export function ConnectionStatus({ compact = false, collapsed = false }: ConnectionStatusProps) {
  const tokens = useDesignTokens();
  const isConnected = useSelector(selectors.selectIsConnected);
  const connectionId = useSelector((state: RootState) => state.connection.connectionId);
  const reconnectAttempts = useSelector((state: RootState) => state.connection.reconnectAttempts);

  // Determine connection state
  const isReconnecting = !isConnected && reconnectAttempts > 0;

  // Determine status text
  const getStatusText = (): string => {
    if (isReconnecting) {
      return `Reconnecting... (Attempt ${reconnectAttempts})`;
    }
    return isConnected ? 'Connected' : 'Disconnected';
  };

  // Determine indicator color
  const getIndicatorColor = (): string => {
    if (isReconnecting) {
      return tokens.colors.warning; // Orange
    }
    return isConnected ? tokens.colors.success : tokens.colors.danger;
  };

  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing.sm,
          fontSize: tokens.typography.fontSize.md,
        }}
      >
        <span
          data-testid="connection-indicator"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: getIndicatorColor(),
          }}
        />
        <span>{getStatusText()}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: tokens.spacing.xs,
      }}
    >
      {/* Status indicator and text */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing.sm,
          fontSize: tokens.typography.fontSize.md,
        }}
      >
        <span
          data-testid="connection-indicator"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: getIndicatorColor(),
          }}
        />
        <span style={{ fontWeight: 'bold' }}>{getStatusText()}</span>
      </div>

      {/* Connection details (when not collapsed) */}
      {!collapsed && (
        <div
          style={{
            fontSize: tokens.typography.fontSize.sm,
            color: tokens.colors.textSecondary,
            paddingLeft: `calc(10px + ${tokens.spacing.sm})`, // Align with text above
          }}
        >
          {isConnected && connectionId && (
            <div>Connection ID: {connectionId.substring(0, 8)}</div>
          )}
          {isReconnecting && (
            <div style={{ color: tokens.colors.warning }}>
              Attempting to reconnect...
            </div>
          )}
          {!isConnected && !isReconnecting && (
            <div style={{ color: tokens.colors.danger }}>
              WebSocket disconnected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
