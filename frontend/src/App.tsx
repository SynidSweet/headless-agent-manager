import { useState, useEffect } from 'react';
import { Agent, AgentMessageEvent } from './types/agent.types';
import { ApiService } from './services/api.service';
import { useWebSocket } from './hooks/useWebSocket';
import { AgentLaunchForm } from './components/AgentLaunchForm';
import { AgentList } from './components/AgentList';
import { AgentOutput } from './components/AgentOutput';
import './App.css';

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<Record<string, AgentMessageEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    isConnected,
    subscribeToAgent,
    unsubscribeFromAgent,
    onAgentMessage,
    onAgentStatus,
    onAgentComplete,
  } = useWebSocket();

  // Load agents on mount
  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Setup WebSocket event listeners
  useEffect(() => {
    onAgentMessage((event) => {
      setAgentMessages((prev) => ({
        ...prev,
        [event.agentId]: [...(prev[event.agentId] || []), event],
      }));
    });

    onAgentStatus((event) => {
      // Update agent status in list
      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === event.agentId ? { ...agent, status: event.status as any } : agent
        )
      );
    });

    onAgentComplete((event) => {
      console.log('Agent completed:', event);
      // Refresh agents list
      loadAgents();
    });
  }, [onAgentMessage, onAgentStatus, onAgentComplete]);

  // Subscribe to selected agent
  useEffect(() => {
    if (selectedAgentId && isConnected) {
      subscribeToAgent(selectedAgentId);

      return () => {
        unsubscribeFromAgent(selectedAgentId);
      };
    }
  }, [selectedAgentId, isConnected, subscribeToAgent, unsubscribeFromAgent]);

  const loadAgents = async () => {
    try {
      const data = await ApiService.getAllAgents();
      setAgents(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      setLoading(false);
    }
  };

  const handleAgentLaunched = () => {
    loadAgents();
  };

  const handleTerminateAgent = async (agentId: string) => {
    try {
      await ApiService.terminateAgent(agentId);
      await loadAgents();
    } catch (err) {
      console.error('Failed to terminate agent:', err);
    }
  };

  if (loading) {
    return <div style={styles.loading}>Loading...</div>;
  }

  if (error) {
    return <div style={styles.error}>Error: {error}</div>;
  }

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.appTitle}>🤖 Headless AI Agent Manager</h1>
        <div style={styles.connectionStatus}>
          <span
            style={{
              ...styles.statusDot,
              backgroundColor: isConnected ? '#28a745' : '#dc3545',
            }}
          />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <div style={styles.content}>
        <div style={styles.sidebar}>
          <AgentLaunchForm onAgentLaunched={handleAgentLaunched} />
          <AgentList
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            onTerminateAgent={handleTerminateAgent}
          />
        </div>

        <div style={styles.main}>
          {selectedAgent ? (
            <AgentOutput
              agentId={selectedAgent.id}
              messages={agentMessages[selectedAgent.id] || []}
            />
          ) : (
            <div style={styles.emptyState}>
              <h2>Select an agent to view output</h2>
              <p>Choose an agent from the list or launch a new one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    backgroundColor: '#f0f2f5',
  },
  header: {
    padding: '20px',
    backgroundColor: '#1a1a2e',
    color: 'white',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  },
  appTitle: {
    margin: 0,
    fontSize: '24px',
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  content: {
    flex: 1,
    display: 'flex',
    gap: '20px',
    padding: '20px',
    overflow: 'hidden',
  },
  sidebar: {
    width: '400px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    overflow: 'auto',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: '#666',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '24px',
    color: '#666',
  },
  error: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#dc3545',
  },
};

export default App;
