import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentApiClient } from '../../src/api/AgentApiClient';
import type { Agent, AgentMessage, LaunchAgentRequest } from '../../src/types';

describe('AgentApiClient', () => {
  let fetchSpy: any;

  beforeEach(() => {
    // Configure API client
    AgentApiClient.configure({
      baseUrl: 'http://localhost:3000',
    });

    // Mock global fetch
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllAgents', () => {
    it('should fetch all agents from /api/agents', async () => {
      const mockAgents: Agent[] = [
        {
          id: 'agent-1',
          type: 'claude-code',
          status: 'running',
          createdAt: '2025-11-10T10:00:00Z',
        },
        {
          id: 'agent-2',
          type: 'gemini-cli',
          status: 'completed',
          createdAt: '2025-11-10T10:05:00Z',
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgents,
      });

      const agents = await AgentApiClient.getAllAgents();

      expect(agents).toEqual(mockAgents);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/agents',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('launchAgent', () => {
    it('should POST launch request to /api/agents', async () => {
      const request: LaunchAgentRequest = {
        type: 'claude-code',
        prompt: 'Test prompt',
      };

      const mockAgent: Agent = {
        id: 'new-agent-1',
        type: 'claude-code',
        status: 'initializing',
        createdAt: '2025-11-10T10:10:00Z',
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAgent,
      });

      const agent = await AgentApiClient.launchAgent(request);

      expect(agent).toEqual(mockAgent);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/agents',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(request),
        })
      );
    });
  });

  describe('getAgentMessages', () => {
    it('should fetch messages for specific agent', async () => {
      const agentId = 'agent-123';
      const mockMessages: AgentMessage[] = [
        {
          id: 'msg-1',
          agentId: 'agent-123',
          sequenceNumber: 1,
          type: 'user',
          content: 'Hello',
          createdAt: '2025-11-10T10:00:00Z',
        },
        {
          id: 'msg-2',
          agentId: 'agent-123',
          sequenceNumber: 2,
          type: 'assistant',
          content: 'Hi there!',
          createdAt: '2025-11-10T10:00:01Z',
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessages,
      });

      const messages = await AgentApiClient.getAgentMessages(agentId);

      expect(messages).toEqual(mockMessages);
      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3000/api/agents/${agentId}/messages`,
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('getAgentMessagesSince', () => {
    it('should fetch messages since specific sequence number', async () => {
      const agentId = 'agent-123';
      const sinceSequence = 5;
      const mockMessages: AgentMessage[] = [
        {
          id: 'msg-6',
          agentId: 'agent-123',
          sequenceNumber: 6,
          type: 'assistant',
          content: 'Message 6',
          createdAt: '2025-11-10T10:00:06Z',
        },
        {
          id: 'msg-7',
          agentId: 'agent-123',
          sequenceNumber: 7,
          type: 'assistant',
          content: 'Message 7',
          createdAt: '2025-11-10T10:00:07Z',
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessages,
      });

      const messages = await AgentApiClient.getAgentMessagesSince(
        agentId,
        sinceSequence
      );

      expect(messages).toEqual(mockMessages);
      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3000/api/agents/${agentId}/messages?since=${sinceSequence}`,
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('terminateAgent', () => {
    it('should DELETE agent by ID', async () => {
      const agentId = 'agent-to-terminate';

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await AgentApiClient.terminateAgent(agentId);

      expect(fetchSpy).toHaveBeenCalledWith(
        `http://localhost:3000/api/agents/${agentId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw error when fetch fails', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(AgentApiClient.getAllAgents()).rejects.toThrow(
        'Failed to fetch agents: 500 Internal Server Error'
      );
    });

    it('should throw error with custom message for launch failure', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(
        AgentApiClient.launchAgent({
          type: 'claude-code',
          prompt: 'test',
        })
      ).rejects.toThrow('Failed to launch agent: 400 Bad Request');
    });
  });

  describe('custom headers', () => {
    it('should include custom headers in requests', async () => {
      AgentApiClient.configure({
        baseUrl: 'http://localhost:3000',
        headers: {
          Authorization: 'Bearer test-token',
          'X-Custom-Header': 'custom-value',
        },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await AgentApiClient.getAllAgents();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:3000/api/agents',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
            'X-Custom-Header': 'custom-value',
          }),
        })
      );
    });
  });
});
