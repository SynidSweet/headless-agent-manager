import { Agent } from '../types/agent.types';

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
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'running':
        return '#28a745';
      case 'completed':
        return '#007bff';
      case 'failed':
        return '#dc3545';
      case 'terminated':
        return '#6c757d';
      default:
        return '#ffc107';
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
    <div style={styles.container}>
      <h2 style={styles.title}>Agents ({agents.length})</h2>
      {agents.length === 0 ? (
        <div style={styles.empty}>No agents yet. Launch one to get started!</div>
      ) : (
        <div style={styles.list}>
          {agents.map((agent) => (
            <div
              key={agent.id}
              style={{
                ...styles.agentCard,
                ...(selectedAgentId === agent.id ? styles.selectedCard : {}),
              }}
              onClick={() => onSelectAgent(agent.id)}
            >
              <div style={styles.cardHeader}>
                <span style={styles.agentType}>{agent.type}</span>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(agent.status),
                  }}
                >
                  {getStatusEmoji(agent.status)} {agent.status}
                </span>
              </div>

              <div style={styles.cardBody}>
                <div style={styles.prompt}>
                  {agent.session?.prompt.substring(0, 100)}
                  {agent.session?.prompt && agent.session.prompt.length > 100 ? '...' : ''}
                </div>
                <div style={styles.metadata}>
                  <span>ID: {agent.id.substring(0, 8)}...</span>
                  <span>Created: {new Date(agent.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>

              {agent.status === 'running' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTerminateAgent(agent.id);
                  }}
                  style={styles.terminateButton}
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

const styles = {
  container: {
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#666',
    fontSize: '14px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  agentCard: {
    padding: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  selectedCard: {
    borderColor: '#007bff',
    backgroundColor: '#f0f8ff',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  agentType: {
    fontWeight: 'bold',
    fontSize: '14px',
    textTransform: 'uppercase' as const,
  },
  statusBadge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'white',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  prompt: {
    fontSize: '13px',
    color: '#333',
    fontFamily: 'monospace',
    backgroundColor: '#f9f9f9',
    padding: '8px',
    borderRadius: '4px',
  },
  metadata: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#666',
  },
  terminateButton: {
    marginTop: '12px',
    padding: '6px 12px',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
  },
};
