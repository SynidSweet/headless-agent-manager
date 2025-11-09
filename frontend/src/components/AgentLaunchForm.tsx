import { useState } from 'react';
import { AgentType, LaunchAgentRequest } from '../types/agent.types';
import { ApiService } from '../services/api.service';

interface AgentLaunchFormProps {
  onAgentLaunched: () => void;
}

export function AgentLaunchForm({ onAgentLaunched }: AgentLaunchFormProps) {
  const [type, setType] = useState<AgentType>('claude-code');
  const [prompt, setPrompt] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    setIsLaunching(true);

    try {
      const request: LaunchAgentRequest = {
        type,
        prompt,
        configuration: {
          outputFormat: 'stream-json',
        },
      };

      await ApiService.launchAgent(request);
      setPrompt('');
      onAgentLaunched();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch agent');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Launch New Agent</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Agent Type:</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AgentType)}
            style={styles.select}
          >
            <option value="claude-code">Claude Code</option>
            <option value="gemini-cli">Gemini CLI</option>
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Prompt:</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt for the agent..."
            rows={4}
            style={styles.textarea}
            disabled={isLaunching}
          />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" disabled={isLaunching} style={styles.button}>
          {isLaunching ? 'Launching...' : 'Launch Agent'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '15px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontWeight: '600',
    fontSize: '14px',
  },
  select: {
    padding: '8px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  textarea: {
    padding: '8px',
    fontSize: '14px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontFamily: 'monospace',
    resize: 'vertical' as const,
  },
  button: {
    padding: '10px 20px',
    fontSize: '16px',
    fontWeight: 'bold',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  error: {
    padding: '10px',
    backgroundColor: '#fee',
    color: '#c00',
    borderRadius: '4px',
    fontSize: '14px',
  },
};
