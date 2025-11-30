import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectors } from '@/store/store';
import type { RootState } from '@/store/store';
import type { AgentMessage } from '@headless-agent-manager/client';

interface AgentOutputProps {
  agentId: string | null;
}

export function AgentOutput({ agentId }: AgentOutputProps) {
  const outputRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showRawOnHover, setShowRawOnHover] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  const messages = useSelector((state: RootState) =>
    agentId ? selectors.selectMessagesForAgent(state, agentId) : []
  );

  const loading = useSelector((state: RootState) =>
    agentId ? state.messages.byAgentId[agentId]?.loading ?? false : false
  );

  const error = useSelector((state: RootState) =>
    agentId ? state.messages.byAgentId[agentId]?.error ?? null : null
  );

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (outputRef.current && autoScroll) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Detect if user scrolled up
  const handleScroll = () => {
    if (outputRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const formatTimestamp = (date: string | Date): string => {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    const secs = d.getSeconds().toString().padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
  };

  const getMessageColor = (type: string): string => {
    switch (type) {
      case 'assistant':
        return 'text-gray-700 dark:text-gray-300';
      case 'user':
        return 'text-blue-400';
      case 'system':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      case 'tool':
        return 'text-purple-400';
      case 'response':
        return 'text-green-400';
      default:
        return 'text-gray-700 dark:text-gray-300';
    }
  };

  const getTypeTagColor = (type: string): string => {
    switch (type) {
      case 'assistant':
        return 'text-blue-500 dark:text-blue-400';
      case 'user':
        return 'text-cyan-500 dark:text-cyan-400';
      case 'system':
        return 'text-yellow-500 dark:text-yellow-400';
      case 'error':
        return 'text-red-500 dark:text-red-400';
      case 'tool':
        return 'text-purple-500 dark:text-purple-400';
      case 'response':
        return 'text-green-500 dark:text-green-400';
      default:
        return 'text-gray-500 dark:text-gray-400';
    }
  };

  const renderContent = (content: string | object): string => {
    if (typeof content === 'string') {
      return content;
    }
    return JSON.stringify(content, null, 2);
  };

  if (!agentId) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 dark:text-[#545a78]">
        Select an agent to view output
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500 dark:text-[#545a78]">
        Loading messages...
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-red-500 dark:text-red-400">
        Error loading messages: {error}
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Toggle for raw JSON on hover */}
      <div className="absolute top-4 right-4 z-10">
        <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#1e1e2e] px-3 py-2 rounded-lg shadow-md border border-gray-200 dark:border-[#313244]">
          <input
            type="checkbox"
            checked={showRawOnHover}
            onChange={(e) => setShowRawOnHover(e.target.checked)}
            className="w-4 h-4 text-primary bg-gray-100 dark:bg-[#313244] border-gray-300 dark:border-[#45475a] rounded focus:ring-primary focus:ring-2"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Show Raw JSON</span>
        </label>
      </div>

      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto p-6 pt-16"
        data-testid="agent-output"
      >
        <div className="font-mono text-sm text-gray-500 dark:text-gray-400">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500 dark:text-[#545a78]">
              Waiting for agent output...
            </div>
          ) : (
            messages.map((message: AgentMessage) => {
              const hasRaw = !!message.metadata?.raw;
              return (
                <div
                  key={message.id}
                  className="relative mt-2 group"
                  onMouseEnter={() => {
                    if (showRawOnHover) {
                      console.log('Hovering message:', message.id, 'Has raw:', hasRaw);
                      setHoveredMessageId(message.id);
                    }
                  }}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  <pre className={`whitespace-pre-wrap break-words ${getMessageColor(message.type)}`} data-message data-message-id={message.id}>
                    <span className="text-gray-500 dark:text-gray-500">{formatTimestamp(message.createdAt)}</span>{' '}
                    <span className={`font-semibold ${getTypeTagColor(message.type)}`}>[{message.type}]</span>{' '}
                    {hasRaw && showRawOnHover && (
                      <span className="text-xs text-green-500" title="Has raw JSON">📋</span>
                    )}{' '}
                    {renderContent(message.content)}
                  </pre>

                  {/* Raw JSON tooltip */}
                  {showRawOnHover && hoveredMessageId === message.id && hasRaw && (
                    <div className="fixed left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-4xl">
                      <div className="bg-gray-900 dark:bg-[#11111b] text-gray-100 dark:text-[#cdd6f4] p-6 rounded-lg shadow-2xl border-2 border-gray-700 dark:border-[#45475a] max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-sm font-semibold text-gray-400 dark:text-[#a6adc8]">
                            Raw JSON (Message {message.sequenceNumber})
                          </div>
                          <button
                            onClick={() => setHoveredMessageId(null)}
                            className="text-gray-400 hover:text-gray-200 text-2xl leading-none"
                          >
                            ×
                          </button>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                          {JSON.stringify(JSON.parse(message.metadata?.raw as string), null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && messages.length > 0 && (
        <div className="absolute bottom-6 right-6">
          <button
            onClick={scrollToBottom}
            className="flex size-10 items-center justify-center rounded-full bg-primary/80 text-white backdrop-blur-sm transition-all hover:bg-primary"
          >
            <span className="material-symbols-outlined">south</span>
          </button>
        </div>
      )}
    </div>
  );
}
