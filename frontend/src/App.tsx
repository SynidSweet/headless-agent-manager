import { useEffect } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { Sidebar } from './components/Sidebar';
import { AgentOutput } from './components/AgentOutput';
import { actions, selectors } from './store/store';
import type { AppDispatch, RootState } from './store/store';

function App() {
  const dispatch = useDispatch<AppDispatch>();

  const agents = useSelector(selectors.selectAllAgents, shallowEqual) || [];
  const selectedAgentId = useSelector((state: RootState) => state.agents.selectedAgentId);

  // DEBUG: Log when agents change
  console.log('[App.tsx] 🎨 Component render - Agent count:', agents.length, agents.map(a => a.id));

  useEffect(() => {
    dispatch(actions.fetchAgents());
  }, [dispatch]);

  const handleTerminateAgent = async (agentId: string) => {
    try {
      await dispatch(actions.terminateAgent(agentId)).unwrap();
    } catch (err) {
      console.error('Failed to terminate agent:', err);
    }
  };

  const handleSelectAgent = (agentId: string | null) => {
    dispatch(actions.agentSelected(agentId));
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-gray-800 dark:text-gray-200">
      <div className="relative flex h-screen min-h-screen w-full flex-col overflow-hidden">
        <div className="flex h-full w-full">
          <Sidebar
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={handleSelectAgent}
          />

          <main className="flex flex-1 flex-col bg-background-light dark:bg-[#0c0e1a]">
            {selectedAgentId && selectedAgent ? (
              <>
                {/* Main Content Header */}
                <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-black dark:text-white truncate max-w-md">
                      {selectedAgent.session?.prompt?.substring(0, 50) || 'Agent'}
                      {(selectedAgent.session?.prompt?.length || 0) > 50 ? '...' : ''}
                    </h2>
                    <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                      selectedAgent.status === 'running'
                        ? 'bg-green-500/10 text-green-400'
                        : selectedAgent.status === 'completed'
                        ? 'bg-blue-500/10 text-blue-400'
                        : selectedAgent.status === 'failed'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-gray-500/10 text-gray-400'
                    }`}>
                      {selectedAgent.status === 'running' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                      )}
                      {selectedAgent.status.charAt(0).toUpperCase() + selectedAgent.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedAgent.status === 'running' && (
                      <button
                        onClick={() => handleTerminateAgent(selectedAgentId)}
                        className="flex h-9 items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
                      >
                        <span className="material-symbols-outlined !text-lg">stop_circle</span>
                        Stop Agent
                      </button>
                    )}
                  </div>
                </header>

                <AgentOutput agentId={selectedAgentId} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <span className="material-symbols-outlined !text-6xl text-gray-400 dark:text-[#3b3f54] mb-4 block">
                    terminal
                  </span>
                  <p className="text-gray-500 dark:text-[#545a78]">
                    Select an agent or start a new one
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
