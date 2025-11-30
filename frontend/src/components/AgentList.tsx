import type { Agent } from '@headless-agent-manager/client';
import { useDesignTokens } from '@/hooks/useDesignTokens';

interface AgentListProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onTerminateAgent: (agentId: string) => void;
}

export function AgentList({
  agents,
  selectedAgentId,
  onSelectAgent,
  onTerminateAgent,
}: AgentListProps) {
  const tokens = useDesignTokens();

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running':
        return tokens.colors.agentRunning;
      case 'completed':
        return tokens.colors.agentCompleted;
      case 'failed':
        return tokens.colors.agentFailed;
      case 'terminated':
        return tokens.colors.agentTerminated;
      default:
        return tokens.colors.warning;
    }
  };

  const getStatusEmoji = (status: string): string => {
    switch (status) {
      case 'running':
        return '▶️';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'terminated':
        return '⏹️';
      default:
        return '⏳';
    }
  };

  return (
    <div
      style={{
        padding: tokens.spacing.lg,
        backgroundColor: tokens.colors.background,
        borderRadius: tokens.borderRadius.md,
        boxShadow: tokens.shadows.md,
      }}
    >
      <h2
        style={{
          margin: `0 0 ${tokens.spacing.lg} 0`,
          fontSize: tokens.typography.fontSize.xl,
          fontWeight: 'bold',
          color: tokens.colors.text,
        }}
      >
        Agents ({agents.length})
      </h2>
      {agents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: tokens.spacing.xl,
            color: tokens.colors.textSecondary,
            fontSize: tokens.typography.fontSize.md,
          }}
        >
          No agents yet
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing.md,
          }}
        >
          {agents.map((agent) => (
            <div
              key={agent.id}
              data-agent-id={agent.id}
              style={{
                padding: tokens.spacing.md,
                border: `2px solid ${
                  selectedAgentId === agent.id ? tokens.colors.borderActive : tokens.colors.border
                }`,
                borderRadius: tokens.borderRadius.md,
                backgroundColor:
                  selectedAgentId === agent.id ? '#f0f8ff' : tokens.colors.background,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onClick={() => onSelectAgent(agent.id)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: tokens.spacing.md,
                }}
              >
                <span
                  style={{
                    fontWeight: 'bold',
                    fontSize: tokens.typography.fontSize.md,
                    textTransform: 'uppercase',
                    color: tokens.colors.text,
                  }}
                >
                  {agent.type}
                </span>
                <span
                  style={{
                    padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                    borderRadius: tokens.borderRadius.lg,
                    fontSize: tokens.typography.fontSize.sm,
                    fontWeight: 'bold',
                    color: tokens.colors.textInverse,
                    backgroundColor: getStatusColor(agent.status),
                  }}
                >
                  {getStatusEmoji(agent.status)} {agent.status}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: tokens.spacing.sm,
                }}
              >
                <div
                  style={{
                    fontSize: tokens.typography.fontSize.sm,
                    color: tokens.colors.text,
                    fontFamily: tokens.typography.fontFamilyMono,
                    backgroundColor: tokens.colors.backgroundSecondary,
                    padding: tokens.spacing.sm,
                    borderRadius: tokens.borderRadius.sm,
                  }}
                >
                  {(agent.session?.prompt || '').substring(0, 100) || 'No prompt'}
                  {(agent.session?.prompt || '').length > 100 ? '...' : ''}
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: tokens.typography.fontSize.xs,
                    color: tokens.colors.textSecondary,
                  }}
                >
                  <span>ID: {(agent.id || '').substring(0, 8)}...</span>
                  <span>Created: {new Date(agent.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>

              {agent.status === 'running' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTerminateAgent(agent.id);
                  }}
                  style={{
                    marginTop: tokens.spacing.md,
                    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
                    backgroundColor: tokens.colors.danger,
                    color: tokens.colors.textInverse,
                    border: 'none',
                    borderRadius: tokens.borderRadius.sm,
                    cursor: 'pointer',
                    fontSize: tokens.typography.fontSize.sm,
                    fontWeight: 'bold',
                  }}
                >
                  Terminate
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
