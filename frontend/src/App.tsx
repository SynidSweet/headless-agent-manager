import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useDesignTokens } from './hooks/useDesignTokens';
import { AgentLaunchForm } from './components/AgentLaunchForm';
import { AgentList } from './components/AgentList';
import { AgentOutput } from './components/AgentOutput';
import { actions, selectors } from './store/store';
import type { AppDispatch, RootState } from './store/store';
import './App.css';

function App() {
  const tokens = useDesignTokens();
  const dispatch = useDispatch<AppDispatch>();

  // Redux selectors
  const agents = useSelector(selectors.selectAllAgents) || [];
  const selectedAgentId = useSelector((state: RootState) => state.agents.selectedAgentId);
  const loading = useSelector((state: RootState) => state.agents.loading);
  const error = useSelector((state: RootState) => state.agents.error);
  const isConnected = useSelector(selectors.selectIsConnected);

  // Load agents on mount (initial state only)
  // All subsequent updates come via WebSocket events (event-driven!)
  useEffect(() => {
    dispatch(actions.fetchAgents());

    // PHASE 2: No more polling! WebSocket events handle all updates
    // - agent:created → adds agent to Redux
    // - agent:updated → updates agent status
    // - agent:deleted → removes agent from Redux

  }, [dispatch]);

  const handleAgentLaunched = () => {
    // No need to fetch - launchAgent.fulfilled already adds agent to Redux
    // Fetching here causes race condition where new agent gets cleared
  };

  const handleTerminateAgent = async (agentId: string) => {
    try {
      await dispatch(actions.terminateAgent(agentId)).unwrap();
      await dispatch(actions.fetchAgents());
    } catch (err) {
      console.error('Failed to terminate agent:', err);
    }
  };

  const handleSelectAgent = (agentId: string | null) => {
    dispatch(actions.agentSelected(agentId));
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: tokens.colors.backgroundSecondary,
      }}
    >
      <header
        style={{
          padding: tokens.spacing.lg,
          backgroundColor: '#1a1a2e',
          color: tokens.colors.textInverse,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: tokens.shadows.md,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: tokens.typography.fontSize.xxl,
          }}
        >
          🤖 Headless AI Agent Manager
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing.sm,
            fontSize: tokens.typography.fontSize.md,
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: isConnected ? tokens.colors.success : tokens.colors.danger,
            }}
          />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: tokens.spacing.md,
            backgroundColor: '#ffebee',
            color: tokens.colors.danger,
            borderLeft: `4px solid ${tokens.colors.danger}`,
            margin: tokens.spacing.lg,
            fontSize: tokens.typography.fontSize.md,
          }}
        >
          ⚠️ Error loading agents: {error}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: tokens.spacing.lg,
          padding: tokens.spacing.lg,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing.lg,
            overflow: 'auto',
          }}
        >
          <AgentLaunchForm onAgentLaunched={handleAgentLaunched} />
          {loading && agents.length === 0 ? (
            <div
              style={{
                padding: tokens.spacing.xl,
                textAlign: 'center',
                color: tokens.colors.textSecondary,
              }}
            >
              Loading agents...
            </div>
          ) : (
            <AgentList
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleSelectAgent}
              onTerminateAgent={handleTerminateAgent}
            />
          )}
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          <AgentOutput agentId={selectedAgentId} />
        </div>
      </div>
    </div>
  );
}

export default App;
