import { useState } from 'react';
import { useDispatch } from 'react-redux';
import type { Agent, AgentType, LaunchAgentRequest } from '@headless-agent-manager/client';
import { actions } from '@/store/store';
import type { AppDispatch } from '@/store/store';

interface SidebarProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}

export function Sidebar({ agents, selectedAgentId, onSelectAgent }: SidebarProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [prompt, setPrompt] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  const activeAgents = agents.filter(a => a.status === 'running');
  const historicAgents = agents.filter(a => a.status !== 'running');

  const handleLaunch = async () => {
    if (!prompt.trim() || isLaunching) return;

    setIsLaunching(true);
    try {
      const request: LaunchAgentRequest = {
        type: 'claude-code' as AgentType,
        prompt,
        configuration: { outputFormat: 'stream-json' },
      };
      await dispatch(actions.launchAgent(request)).unwrap();
      setPrompt('');
    } catch (err) {
      console.error('Failed to launch agent:', err);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleLaunch();
    }
  };

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

        {/* Composer */}
        <div className="mb-6">
          <div className="flex items-start gap-2">
            <label className="flex flex-col min-w-40 h-full flex-1">
              <div className="flex w-full flex-1 flex-col items-stretch rounded-lg h-full border border-gray-200 dark:border-[#3b3f54] bg-white dark:bg-[#1b1d27]">
                <textarea
                  className="flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-t-lg bg-transparent text-black dark:text-white focus:outline-none focus:ring-0 h-24 placeholder:text-gray-500 dark:placeholder:text-[#545a78] text-sm font-normal leading-normal p-3 font-display"
                  placeholder="Enter your prompt to start a new agent..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLaunching}
                />
                <div className="flex justify-end border-t border-gray-200 dark:border-[#3b3f54] p-2">
                  <button
                    onClick={handleLaunch}
                    disabled={isLaunching || !prompt.trim()}
                    className="flex min-w-[84px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md h-8 px-3 bg-primary text-white text-sm font-medium leading-normal hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined !text-[18px]">auto_awesome</span>
                    <span className="truncate">{isLaunching ? 'Starting...' : 'Start Agent'}</span>
                  </button>
                </div>
              </div>
            </label>
          </div>
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
