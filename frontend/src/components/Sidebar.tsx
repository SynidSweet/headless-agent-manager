import type { Agent } from '@headless-agent-manager/client';
import { AgentLaunchForm } from './AgentLaunchForm';

interface SidebarProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

export function Sidebar({ agents, selectedAgentId, onSelectAgent }: SidebarProps) {
  // Sort agents by createdAt DESC (newest first) before filtering
  // This ensures correct order even when status updates come via WebSocket
  const sortedAgents = [...agents].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const activeAgents = sortedAgents.filter(a => a.status === 'running');
  const historicAgents = sortedAgents.filter(a => a.status !== 'running');

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-white/10 bg-background-light dark:bg-background-dark/50">
      <div className="flex h-full flex-col p-4">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white font-bold text-lg">
            CS
          </div>
          <div className="flex flex-col">
            <h1 className="text-base font-medium leading-normal text-black dark:text-white">CodeStream</h1>
            <p className="text-sm font-normal leading-normal text-gray-600 dark:text-[#9ca1ba]">AI Agent Console</p>
          </div>
        </div>

        {/* Launch Form */}
        <div className="mb-6">
          <AgentLaunchForm />
        </div>

        {/* Active Agents List */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-3 pb-2 pt-4">
            Active Agents ({activeAgents.length})
          </h3>
          {activeAgents.length === 0 ? (
            <p className="px-3 text-sm text-gray-500 dark:text-[#545a78]">No active agents</p>
          ) : (
            activeAgents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${
                  selectedAgentId === agent.id
                    ? 'bg-primary/10 dark:bg-[#282b39]'
                    : 'hover:bg-primary/10 dark:hover:bg-[#282b39]'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <p className={`flex-1 truncate text-sm font-medium ${
                  selectedAgentId === agent.id
                    ? 'text-black dark:text-white'
                    : 'text-gray-600 dark:text-[#9ca1ba]'
                }`}>
                  {agent.session?.prompt?.substring(0, 30) || 'Agent'}{(agent.session?.prompt?.length || 0) > 30 ? '...' : ''}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Historic Agents List */}
        <div className="mt-4 flex flex-col gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-3 pb-2 pt-4">
            Historic Agents ({historicAgents.length})
          </h3>
          {historicAgents.length === 0 ? (
            <p className="px-3 text-sm text-gray-500 dark:text-[#545a78]">No history yet</p>
          ) : (
            historicAgents.slice(0, 10).map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors text-left ${
                  selectedAgentId === agent.id
                    ? 'bg-primary/10 dark:bg-[#282b39]'
                    : 'hover:bg-primary/10 dark:hover:bg-[#282b39]'
                }`}
              >
                <span className="relative flex h-2 w-2">
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    agent.status === 'completed' ? 'bg-blue-500' :
                    agent.status === 'failed' ? 'bg-red-500' : 'bg-gray-500'
                  }`}></span>
                </span>
                <p className={`flex-1 truncate text-sm font-medium ${
                  selectedAgentId === agent.id
                    ? 'text-black dark:text-white'
                    : 'text-gray-600 dark:text-[#9ca1ba]'
                }`}>
                  {agent.session?.prompt?.substring(0, 30) || 'Agent'}{(agent.session?.prompt?.length || 0) > 30 ? '...' : ''}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Spacer */}
        <div className="flex-grow"></div>
      </div>
    </aside>
  );
}
