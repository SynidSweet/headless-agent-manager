import { useState } from 'react';
import { useDispatch } from 'react-redux';
import type { AgentType, LaunchAgentRequest } from '@headless-agent-manager/client';
import { actions } from '@/store/store';
import type { AppDispatch } from '@/store/store';
import { useDesignTokens } from '@/hooks/useDesignTokens';

export function AgentLaunchForm() {
  const tokens = useDesignTokens();
  const dispatch = useDispatch<AppDispatch>();
  const [type, setType] = useState<AgentType>('claude-code');
  const [prompt, setPrompt] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
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
          ...(workingDirectory.trim() && { workingDirectory: workingDirectory.trim() }),
        },
      };

      await dispatch(actions.launchAgent(request)).unwrap();
      setPrompt('');
      setWorkingDirectory('');
      // Agent automatically added to Redux via launchAgent.fulfilled action
      // WebSocket subscription automatically started via middleware
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch agent');
    } finally {
      setIsLaunching(false);
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
        Launch New Agent (v2.0)
      </h2>
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.spacing.md,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing.sm,
          }}
        >
          <label
            htmlFor="agent-type"
            style={{
              fontWeight: '600',
              fontSize: tokens.typography.fontSize.md,
              color: tokens.colors.text,
            }}
          >
            Agent Type:
          </label>
          <select
            id="agent-type"
            value={type}
            onChange={(e) => setType(e.target.value as AgentType)}
            style={{
              padding: tokens.spacing.sm,
              fontSize: tokens.typography.fontSize.md,
              borderRadius: tokens.borderRadius.sm,
              border: `1px solid ${tokens.colors.border}`,
              backgroundColor: tokens.colors.background,
              color: tokens.colors.text,
            }}
          >
            <option value="claude-code">Claude Code</option>
            <option value="gemini-cli">Gemini CLI</option>
          </select>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing.sm,
          }}
        >
          <label
            htmlFor="agent-prompt"
            style={{
              fontWeight: '600',
              fontSize: tokens.typography.fontSize.md,
              color: tokens.colors.text,
            }}
          >
            Prompt:
          </label>
          <textarea
            id="agent-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt for the agent..."
            rows={4}
            style={{
              padding: tokens.spacing.sm,
              fontSize: tokens.typography.fontSize.md,
              borderRadius: tokens.borderRadius.sm,
              border: `1px solid ${tokens.colors.border}`,
              fontFamily: tokens.typography.fontFamilyMono,
              resize: 'vertical',
              backgroundColor: tokens.colors.background,
              color: tokens.colors.text,
            }}
            disabled={isLaunching}
          />
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing.sm,
          }}
        >
          <label
            htmlFor="working-directory"
            style={{
              fontWeight: '600',
              fontSize: tokens.typography.fontSize.md,
              color: tokens.colors.text,
            }}
          >
            Working Directory:
          </label>
          <input
            id="working-directory"
            type="text"
            value={workingDirectory}
            onChange={(e) => setWorkingDirectory(e.target.value)}
            placeholder="/path/to/project (optional)"
            style={{
              padding: tokens.spacing.sm,
              fontSize: tokens.typography.fontSize.md,
              borderRadius: tokens.borderRadius.sm,
              border: `1px solid ${tokens.colors.border}`,
              fontFamily: tokens.typography.fontFamilyMono,
              backgroundColor: tokens.colors.background,
              color: tokens.colors.text,
            }}
            disabled={isLaunching}
          />
        </div>

        {error && (
          <div
            style={{
              padding: tokens.spacing.md,
              backgroundColor: '#ffebee',
              color: tokens.colors.danger,
              borderRadius: tokens.borderRadius.sm,
              fontSize: tokens.typography.fontSize.md,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLaunching}
          style={{
            padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
            fontSize: tokens.typography.fontSize.lg,
            fontWeight: 'bold',
            backgroundColor: isLaunching ? tokens.colors.textSecondary : tokens.colors.primary,
            color: tokens.colors.textInverse,
            border: 'none',
            borderRadius: tokens.borderRadius.sm,
            cursor: isLaunching ? 'not-allowed' : 'pointer',
          }}
        >
          {isLaunching ? 'Launching...' : 'Launch Agent'}
        </button>
      </form>
    </div>
  );
}
