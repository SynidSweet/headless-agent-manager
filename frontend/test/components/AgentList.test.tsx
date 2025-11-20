import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentList } from '@/components/AgentList';
import type { Agent } from '@/types/agent.types';

/**
 * AgentList Component Tests
 * Tests for agent list display and interactions
 */
describe('AgentList', () => {
  const mockAgents: Agent[] = [
    {
      id: 'agent-1',
      type: 'claude-code',
      status: 'running',
      session: {
        id: 'session-1',
        prompt: 'Test prompt for agent 1',
        messageCount: 5,
      },
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'agent-2',
      type: 'gemini-cli',
      status: 'completed',
      session: {
        id: 'session-2',
        prompt: 'Test prompt for agent 2',
        messageCount: 3,
      },
      createdAt: '2025-01-01T00:00:01Z',
    },
    {
      id: 'agent-3',
      type: 'claude-code',
      status: 'failed',
      session: {
        id: 'session-3',
        prompt: 'Test prompt for agent 3',
        messageCount: 2,
      },
      createdAt: '2025-01-01T00:00:02Z',
    },
  ];

  let mockOnSelectAgent: ReturnType<typeof vi.fn>;
  let mockOnTerminateAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnSelectAgent = vi.fn();
    mockOnTerminateAgent = vi.fn();
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render title with agent count', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      expect(screen.getByText('Agents (3)')).toBeInTheDocument();
    });

    it('should render all agents', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      expect(screen.getAllByText(/claude-code/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/gemini-cli/i)).toBeInTheDocument();
    });

    it('should show empty state when no agents', () => {
      render(
        <AgentList
          agents={[]}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      expect(screen.getByText('No agents yet')).toBeInTheDocument();
    });

    it('should render agent status with emoji', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      expect(screen.getByText(/▶️.*running/i)).toBeInTheDocument();
      expect(screen.getByText(/✅.*completed/i)).toBeInTheDocument();
      expect(screen.getByText(/❌.*failed/i)).toBeInTheDocument();
    });

    it('should render agent prompts', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      expect(screen.getByText(/Test prompt for agent 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Test prompt for agent 2/i)).toBeInTheDocument();
    });

    it('should truncate long prompts', () => {
      const agentWithLongPrompt: Agent = {
        id: 'agent-long',
        type: 'claude-code',
        status: 'running',
        session: {
          id: 'session-long',
          prompt: 'A'.repeat(150), // 150 characters
          messageCount: 0,
        },
        createdAt: '2025-01-01T00:00:00Z',
      };

      render(
        <AgentList
          agents={[agentWithLongPrompt]}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const promptText = screen.getByText(/A+\.\.\./);
      expect(promptText).toBeInTheDocument();
    });
  });

  describe('Agent selection', () => {
    it('should call onSelectAgent when clicking an agent', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const agentCard = screen.getByText(/Test prompt for agent 1/i).closest('div');
      fireEvent.click(agentCard!);

      expect(mockOnSelectAgent).toHaveBeenCalledWith('agent-1');
    });

    it('should highlight selected agent', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId="agent-2"
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const selectedAgent = screen.getByText(/Test prompt for agent 2/i).closest('div');
      expect(selectedAgent).toHaveStyle({ borderColor: expect.stringMatching(/#0d6efd/i) });
    });

    it('should show data-agent-id attribute', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const agentElement = document.querySelector('[data-agent-id="agent-1"]');
      expect(agentElement).toBeInTheDocument();
    });
  });

  describe('Agent termination', () => {
    it('should show terminate button only for running agents', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const terminateButtons = screen.getAllByText('Terminate');
      expect(terminateButtons).toHaveLength(1); // Only for running agent
    });

    it('should not show terminate button for completed agents', () => {
      const completedAgent: Agent = {
        id: 'agent-completed',
        type: 'claude-code',
        status: 'completed',
        session: {
          id: 'session-1',
          prompt: 'Completed task',
          messageCount: 10,
        },
        createdAt: '2025-01-01T00:00:00Z',
      };

      render(
        <AgentList
          agents={[completedAgent]}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      expect(screen.queryByText('Terminate')).not.toBeInTheDocument();
    });

    it('should call onTerminateAgent when clicking terminate button', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const terminateButton = screen.getByText('Terminate');
      fireEvent.click(terminateButton);

      expect(mockOnTerminateAgent).toHaveBeenCalledWith('agent-1');
    });

    it('should not trigger agent selection when clicking terminate', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const terminateButton = screen.getByText('Terminate');
      fireEvent.click(terminateButton);

      expect(mockOnSelectAgent).not.toHaveBeenCalled();
      expect(mockOnTerminateAgent).toHaveBeenCalledTimes(1);
    });
  });

  describe('Status display', () => {
    it('should display correct status colors', () => {
      render(
        <AgentList
          agents={mockAgents}
          selectedAgentId={null}
          onSelectAgent={mockOnSelectAgent}
          onTerminateAgent={mockOnTerminateAgent}
        />
      );

      const runningStatus = screen.getByText(/▶️.*running/i);
      const completedStatus = screen.getByText(/✅.*completed/i);
      const failedStatus = screen.getByText(/❌.*failed/i);

      expect(runningStatus).toBeInTheDocument();
      expect(completedStatus).toBeInTheDocument();
      expect(failedStatus).toBeInTheDocument();
    });
  });
});
