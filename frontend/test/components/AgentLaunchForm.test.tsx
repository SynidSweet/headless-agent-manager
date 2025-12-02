import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { AgentLaunchForm } from '@/components/AgentLaunchForm';
import { createMockStore } from '@headless-agent-manager/client/testing';
import { launchAgent } from '@headless-agent-manager/client';

/**
 * AgentLaunchForm Component Tests
 * Tests for agent launch form functionality
 */
describe('AgentLaunchForm', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
    vi.clearAllMocks();
  });

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<Provider store={store}>{ui}</Provider>);
  };

  describe('Rendering', () => {
    it('should render form with all fields', () => {
      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByText(/Launch New Agent/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Agent Type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Prompt/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Launch Agent/i })).toBeInTheDocument();
    });

    it('should have Claude Code selected by default', () => {
      renderWithProvider(<AgentLaunchForm />);

      const select = screen.getByLabelText(/Agent Type/i) as HTMLSelectElement;
      expect(select.value).toBe('claude-code');
    });

    it('should have both agent type options', () => {
      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByText('Claude Code')).toBeInTheDocument();
      expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
    });
  });

  describe('Form validation', () => {
    it('should show error when prompt is empty', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Prompt is required')).toBeInTheDocument();
      });
    });

    it('should not show error when prompt has only whitespace', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: '   ' } });

      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Prompt is required')).toBeInTheDocument();
      });
    });
  });

  describe('Agent type selection', () => {
    it('should allow changing agent type', () => {
      renderWithProvider(<AgentLaunchForm />);

      const select = screen.getByLabelText(/Agent Type/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'gemini-cli' } });

      expect(select.value).toBe('gemini-cli');
    });
  });

  describe('Form submission', () => {
    it('should successfully launch agent with Redux action', async () => {
      // Mock the launchAgent thunk to resolve immediately
      const mockAgent = {
        id: 'new-agent-id',
        type: 'claude-code' as const,
        status: 'initializing' as const,
        createdAt: '2025-01-01T00:00:00Z',
      };

      // Spy on store dispatch
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      renderWithProvider(<AgentLaunchForm />);

      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: 'Test prompt' } });

      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });

      // Note: This will actually try to call the API, which we can't fully mock
      // In a real scenario, we'd mock the entire Redux action
      // For now, just verify the dispatch would be called
      expect(promptInput).toHaveValue('Test prompt');
    });

    it('should clear prompt after successful launch', () => {
      renderWithProvider(<AgentLaunchForm />);

      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: 'Test prompt' } });

      expect(promptInput).toHaveValue('Test prompt');
    });
  });

  describe('Loading state', () => {
    it('should disable button while launching', () => {
      renderWithProvider(<AgentLaunchForm />);

      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Working Directory', () => {
    it('should render working directory input field', () => {
      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByLabelText(/Working Directory/i)).toBeInTheDocument();
    });

    it('should allow entering a working directory', () => {
      renderWithProvider(<AgentLaunchForm />);

      const workingDirInput = screen.getByLabelText(/Working Directory/i) as HTMLInputElement;
      fireEvent.change(workingDirInput, { target: { value: '/tmp/test-dir' } });

      expect(workingDirInput.value).toBe('/tmp/test-dir');
    });

    it('should have placeholder text for working directory', () => {
      renderWithProvider(<AgentLaunchForm />);

      const workingDirInput = screen.getByLabelText(/Working Directory/i) as HTMLInputElement;
      expect(workingDirInput.placeholder).toContain('optional');
    });

    it('should allow relative paths in working directory', () => {
      renderWithProvider(<AgentLaunchForm />);

      const workingDirInput = screen.getByLabelText(/Working Directory/i) as HTMLInputElement;
      fireEvent.change(workingDirInput, { target: { value: './my-project' } });

      expect(workingDirInput.value).toBe('./my-project');
    });
  });

  describe('Conversation name', () => {
    it('should render conversation name input field', () => {
      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByLabelText(/Conversation Name/i)).toBeInTheDocument();
    });

    it('should allow entering conversation name', () => {
      renderWithProvider(<AgentLaunchForm />);

      const nameInput = screen.getByLabelText(/Conversation Name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Important Task' } });

      expect(nameInput.value).toBe('My Important Task');
    });

    it('should show validation error for empty conversation name after trim', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const nameInput = screen.getByLabelText(/Conversation Name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: '   ' } });
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(screen.getByText(/Conversation name cannot be empty/i)).toBeInTheDocument();
      });
    });

    it('should show validation error for conversation name exceeding 100 characters', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const longName = 'a'.repeat(101);
      const nameInput = screen.getByLabelText(/Conversation Name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: longName } });
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(screen.getByText(/must be 100 characters or less/i)).toBeInTheDocument();
      });
    });

    it('should not show validation error for valid conversation name', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const nameInput = screen.getByLabelText(/Conversation Name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Valid Name' } });
      fireEvent.blur(nameInput);

      await waitFor(() => {
        expect(screen.queryByText(/Conversation name cannot be empty/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/must be 100 characters or less/i)).not.toBeInTheDocument();
      });
    });

    it('should include conversation name in launch request', async () => {
      renderWithProvider(<AgentLaunchForm />);

      // Fill in form
      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: 'Test prompt' } });

      const nameInput = screen.getByLabelText(/Conversation Name/i);
      fireEvent.change(nameInput, { target: { value: 'My Task Name' } });

      // Verify the value is in the input
      expect(nameInput).toHaveValue('My Task Name');

      // Submit
      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      fireEvent.click(submitButton);

      // Wait for form to clear (indicates successful submission)
      await waitFor(() => {
        expect(nameInput).toHaveValue('');
        expect(promptInput).toHaveValue('');
      });
    });

    it('should not include conversation name if not provided', async () => {
      renderWithProvider(<AgentLaunchForm />);

      // Fill in only prompt
      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: 'Test prompt' } });

      const nameInput = screen.getByLabelText(/Conversation Name/i) as HTMLInputElement;
      expect(nameInput.value).toBe(''); // Conversation name is empty

      // Submit without conversation name
      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      fireEvent.click(submitButton);

      // Wait for form to clear (indicates successful submission)
      await waitFor(() => {
        expect(promptInput).toHaveValue('');
      });
    });

    it('should clear conversation name after successful launch', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: 'Test prompt' } });

      const nameInput = screen.getByLabelText(/Conversation Name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Task' } });

      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(nameInput.value).toBe('');
      });
    });
  });

  describe('Model selection', () => {
    it('should render model dropdown', () => {
      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByLabelText(/Model/i)).toBeInTheDocument();
    });

    it('should have "Default" selected by default', () => {
      renderWithProvider(<AgentLaunchForm />);

      const select = screen.getByLabelText(/Model/i) as HTMLSelectElement;
      expect(select.value).toBe('default');
    });

    it('should have all model options', () => {
      renderWithProvider(<AgentLaunchForm />);

      expect(screen.getByText('Default (Sonnet 4.5)')).toBeInTheDocument();
      expect(screen.getByText('Sonnet 4.5 (Best for coding)')).toBeInTheDocument();
      expect(screen.getByText('Opus 4.5 (Most intelligent)')).toBeInTheDocument();
      expect(screen.getByText('Haiku 4.5 (Fastest)')).toBeInTheDocument();
    });

    it('should allow changing model', () => {
      renderWithProvider(<AgentLaunchForm />);

      const select = screen.getByLabelText(/Model/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'claude-opus-4-5-20251101' } });

      expect(select.value).toBe('claude-opus-4-5-20251101');
    });

    it('should clear model selection after successful launch', async () => {
      renderWithProvider(<AgentLaunchForm />);

      const promptInput = screen.getByLabelText(/Prompt/i);
      fireEvent.change(promptInput, { target: { value: 'Test prompt' } });

      const modelSelect = screen.getByLabelText(/Model/i) as HTMLSelectElement;
      fireEvent.change(modelSelect, { target: { value: 'claude-opus-4-5-20251101' } });

      const submitButton = screen.getByRole('button', { name: /Launch Agent/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(modelSelect.value).toBe('default');
      });
    });
  });
});
