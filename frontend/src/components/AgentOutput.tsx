import { useEffect, useRef } from 'react';
import { AgentMessageEvent } from '../types/agent.types';

interface AgentOutputProps {
  agentId: string;
  messages: AgentMessageEvent[];
}

export function AgentOutput({ agentId, messages }: AgentOutputProps) {
  const outputRef = useRef<HTMLDivElement>(null);

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
    switch (type) {
      case 'assistant':
        return { ...styles.message, backgroundColor: '#e3f2fd' };
      case 'user':
        return { ...styles.message, backgroundColor: '#f1f8e9' };
      case 'system':
        return { ...styles.message, backgroundColor: '#fff3e0' };
      case 'error':
        return { ...styles.message, backgroundColor: '#ffebee', color: '#c62828' };
      default:
        return styles.message;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Agent Output</h3>
        <span style={styles.agentId}>ID: {agentId.substring(0, 8)}...</span>
      </div>

      <div ref={outputRef} style={styles.output}>
        {messages.length === 0 ? (
          <div style={styles.empty}>Waiting for agent output...</div>
        ) : (
          messages.map((event, index) => (
            <div key={index} style={getMessageStyle(event.message.type)}>
              <div style={styles.messageHeader}>
                <span style={styles.messageType}>{event.message.type}</span>
                <span style={styles.timestamp}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre style={styles.content}>{renderMessageContent(event.message.content)}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e0e0e0',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold',
  },
  agentId: {
    fontSize: '12px',
    color: '#666',
    fontFamily: 'monospace',
  },
  output: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#999',
    fontStyle: 'italic' as const,
  },
  message: {
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
  },
  messageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '12px',
  },
  messageType: {
    fontWeight: 'bold',
    textTransform: 'uppercase' as const,
  },
  timestamp: {
    color: '#666',
  },
  content: {
    margin: 0,
    fontFamily: 'monospace',
    fontSize: '13px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
};
