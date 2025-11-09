import { InMemoryAgentRepository } from '@infrastructure/repositories/in-memory-agent.repository';
import { Agent } from '@domain/entities/agent.entity';
import { AgentId } from '@domain/value-objects/agent-id.vo';
import { AgentType } from '@domain/value-objects/agent-type.vo';
import { AgentStatus } from '@domain/value-objects/agent-status.vo';

describe('InMemoryAgentRepository', () => {
  let repository: InMemoryAgentRepository;

  beforeEach(() => {
    repository = new InMemoryAgentRepository();
  });

  describe('save', () => {
    it('should save a new agent', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      const found = await repository.findById(agent.id);
      expect(found).toBe(agent);
    });

    it('should update existing agent', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      // Update agent status
      agent.markAsRunning();
      await repository.save(agent);

      const found = await repository.findById(agent.id);
      expect(found?.status).toBe(AgentStatus.RUNNING);
    });

    it('should store multiple agents', async () => {
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test1',
        configuration: {},
      });

      const agent2 = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'test2',
        configuration: {},
      });

      await repository.save(agent1);
      await repository.save(agent2);

      const agents = await repository.findAll();
      expect(agents).toHaveLength(2);
    });
  });

  describe('findById', () => {
    it('should find agent by ID', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      const found = await repository.findById(agent.id);
      expect(found).toBe(agent);
      expect(found?.id.equals(agent.id)).toBe(true);
    });

    it('should return null when agent not found', async () => {
      const agentId = AgentId.generate();

      const found = await repository.findById(agentId);
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all agents', async () => {
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test1',
        configuration: {},
      });

      const agent2 = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'test2',
        configuration: {},
      });

      const agent3 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test3',
        configuration: {},
      });

      await repository.save(agent1);
      await repository.save(agent2);
      await repository.save(agent3);

      const agents = await repository.findAll();

      expect(agents).toHaveLength(3);
      expect(agents).toContain(agent1);
      expect(agents).toContain(agent2);
      expect(agents).toContain(agent3);
    });

    it('should return empty array when no agents', async () => {
      const agents = await repository.findAll();

      expect(agents).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should find agents by status', async () => {
      const agent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test1',
        configuration: {},
      });
      agent1.markAsRunning();

      const agent2 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test2',
        configuration: {},
      });

      const agent3 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test3',
        configuration: {},
      });
      agent3.markAsRunning();

      await repository.save(agent1);
      await repository.save(agent2);
      await repository.save(agent3);

      const runningAgents = await repository.findByStatus(AgentStatus.RUNNING);

      expect(runningAgents).toHaveLength(2);
      expect(runningAgents).toContain(agent1);
      expect(runningAgents).toContain(agent3);
    });

    it('should return empty array when no agents with status', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      const completed = await repository.findByStatus(AgentStatus.COMPLETED);

      expect(completed).toEqual([]);
    });
  });

  describe('findByType', () => {
    it('should find agents by type', async () => {
      const claudeAgent1 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test1',
        configuration: {},
      });

      const geminiAgent = Agent.create({
        type: AgentType.GEMINI_CLI,
        prompt: 'test2',
        configuration: {},
      });

      const claudeAgent2 = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test3',
        configuration: {},
      });

      await repository.save(claudeAgent1);
      await repository.save(geminiAgent);
      await repository.save(claudeAgent2);

      const claudeAgents = await repository.findByType(AgentType.CLAUDE_CODE);

      expect(claudeAgents).toHaveLength(2);
      expect(claudeAgents).toContain(claudeAgent1);
      expect(claudeAgents).toContain(claudeAgent2);
    });

    it('should return empty array when no agents of type', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      const geminiAgents = await repository.findByType(AgentType.GEMINI_CLI);

      expect(geminiAgents).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete an agent', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      await repository.delete(agent.id);

      const found = await repository.findById(agent.id);
      expect(found).toBeNull();
    });

    it('should not throw when deleting non-existent agent', async () => {
      const agentId = AgentId.generate();

      await expect(repository.delete(agentId)).resolves.not.toThrow();
    });

    it('should remove agent from all queries', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);
      await repository.delete(agent.id);

      const all = await repository.findAll();
      const byType = await repository.findByType(AgentType.CLAUDE_CODE);
      const byStatus = await repository.findByStatus(AgentStatus.INITIALIZING);

      expect(all).toHaveLength(0);
      expect(byType).toHaveLength(0);
      expect(byStatus).toHaveLength(0);
    });
  });

  describe('exists', () => {
    it('should return true when agent exists', async () => {
      const agent = Agent.create({
        type: AgentType.CLAUDE_CODE,
        prompt: 'test',
        configuration: {},
      });

      await repository.save(agent);

      const exists = await repository.exists(agent.id);
      expect(exists).toBe(true);
    });

    it('should return false when agent does not exist', async () => {
      const agentId = AgentId.generate();

      const exists = await repository.exists(agentId);
      expect(exists).toBe(false);
    });
  });
});
