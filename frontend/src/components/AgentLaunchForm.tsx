import { useState, useEffect } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import type { AgentType, LaunchAgentRequest } from '@headless-agent-manager/client';
import { actions, selectors } from '@/store/store';
import type { AppDispatch, RootState } from '@/store/store';
import { useDesignTokens } from '@/hooks/useDesignTokens';

export function AgentLaunchForm() {
  const tokens = useDesignTokens();
  const dispatch = useDispatch<AppDispatch>();

  // Fetch providers from backend
  const providers = useSelector(selectors.selectAllProviders, shallowEqual);
  const providersLoading = useSelector(selectors.selectProvidersLoading);
  const providersError = useSelector(selectors.selectProvidersError);

  const [type, setType] = useState<AgentType>('claude-code');
  const [prompt, setPrompt] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [conversationName, setConversationName] = useState('');
  const [model, setModel] = useState('default');
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Get models for selected provider (use shallowEqual to prevent rerenders)
  const models = useSelector(
    (state: RootState) => selectors.selectModelsForProvider(state, type),
    shallowEqual
  );

  const defaultModel = useSelector(
    (state: RootState) => selectors.selectDefaultModel(state, type)
  );

  // Fetch providers on mount
  useEffect(() => {
    dispatch(actions.fetchProviders());
  }, [dispatch]);

  // Reset model to default when provider type changes
  useEffect(() => {
    if (defaultModel) {
      setModel('default');
    }
  }, [type, defaultModel]);

  const validateConversationName = (value: string): boolean => {
    if (value && value.trim().length === 0) {
      setNameError('Conversation name cannot be empty');
      return false;
    }
    if (value && value.length > 100) {
      setNameError('Conversation name must be 100 characters or less');
      return false;
    }
    setNameError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    // Validate conversation name if provided
    if (conversationName && !validateConversationName(conversationName)) {
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
          ...(conversationName.trim() && { conversationName: conversationName.trim() }),
          ...(model !== 'default' && { model }),
        },
      };

      await dispatch(actions.launchAgent(request)).unwrap();
      setPrompt('');
      setWorkingDirectory('');
      setConversationName('');
      setModel('default');
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
            disabled={isLaunching || providersLoading}
            style={{
              padding: tokens.spacing.sm,
              fontSize: tokens.typography.fontSize.md,
              borderRadius: tokens.borderRadius.sm,
              border: `1px solid ${tokens.colors.border}`,
              backgroundColor: tokens.colors.background,
              color: tokens.colors.text,
            }}
          >
            {providersLoading ? (
              <option>Loading providers...</option>
            ) : providers.length === 0 ? (
              <option>No providers available</option>
            ) : (
              providers.map((provider) => (
                <option key={provider.type} value={provider.type}>
                  {provider.name} {!provider.isAvailable && '(Unavailable)'}
                </option>
              ))
            )}
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
            htmlFor="model"
            style={{
              fontWeight: '600',
              fontSize: tokens.typography.fontSize.md,
              color: tokens.colors.text,
            }}
          >
            Model:
          </label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isLaunching || providersLoading || models.length === 0}
            style={{
              padding: tokens.spacing.sm,
              fontSize: tokens.typography.fontSize.md,
              borderRadius: tokens.borderRadius.sm,
              border: `1px solid ${tokens.colors.border}`,
              backgroundColor: tokens.colors.background,
              color: tokens.colors.text,
            }}
          >
            {providersLoading ? (
              <option>Loading models...</option>
            ) : models.length === 0 ? (
              <option>No models available</option>
            ) : (
              <>
                {defaultModel && (
                  <option value="default">
                    Default ({defaultModel.name})
                  </option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} - {m.description}
                    {m.costTier && ` (${m.costTier})`}
                    {!m.isAvailable && ' (Unavailable)'}
                  </option>
                ))}
              </>
            )}
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

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: tokens.spacing.sm,
          }}
        >
          <label
            htmlFor="conversation-name"
            style={{
              fontWeight: '600',
              fontSize: tokens.typography.fontSize.md,
              color: tokens.colors.text,
            }}
          >
            Conversation Name (Optional):
          </label>
          <input
            id="conversation-name"
            type="text"
            value={conversationName}
            onChange={(e) => setConversationName(e.target.value)}
            onBlur={(e) => validateConversationName(e.target.value)}
            placeholder="e.g., Fix login bug, Add dark mode"
            maxLength={100}
            style={{
              padding: tokens.spacing.sm,
              fontSize: tokens.typography.fontSize.md,
              borderRadius: tokens.borderRadius.sm,
              border: `1px solid ${nameError ? tokens.colors.danger : tokens.colors.border}`,
              backgroundColor: tokens.colors.background,
              color: tokens.colors.text,
            }}
            disabled={isLaunching}
          />
          {nameError && (
            <div
              style={{
                fontSize: tokens.typography.fontSize.sm,
                color: tokens.colors.danger,
              }}
            >
              {nameError}
            </div>
          )}
          <small
            style={{
              fontSize: tokens.typography.fontSize.sm,
              color: tokens.colors.textSecondary,
            }}
          >
            Max 100 characters. Helps organize your agent history.
          </small>
        </div>

        {providersError && (
          <div
            style={{
              padding: tokens.spacing.md,
              backgroundColor: '#ffebee',
              color: tokens.colors.danger,
              borderRadius: tokens.borderRadius.sm,
              fontSize: tokens.typography.fontSize.md,
            }}
          >
            Failed to load providers: {providersError}
          </div>
        )}

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
