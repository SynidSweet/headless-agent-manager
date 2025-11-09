import { AgentStatus } from '@domain/value-objects/agent-status.vo';

describe('AgentStatus Value Object', () => {
  describe('enum values', () => {
    it('should have INITIALIZING status', () => {
      expect(AgentStatus.INITIALIZING).toBe('initializing');
    });

    it('should have RUNNING status', () => {
      expect(AgentStatus.RUNNING).toBe('running');
    });

    it('should have PAUSED status', () => {
      expect(AgentStatus.PAUSED).toBe('paused');
    });

    it('should have COMPLETED status', () => {
      expect(AgentStatus.COMPLETED).toBe('completed');
    });

    it('should have FAILED status', () => {
      expect(AgentStatus.FAILED).toBe('failed');
    });

    it('should have TERMINATED status', () => {
      expect(AgentStatus.TERMINATED).toBe('terminated');
    });
  });

  describe('enum completeness', () => {
    it('should have exactly 6 status values', () => {
      const statuses = Object.values(AgentStatus);
      expect(statuses).toHaveLength(6);
    });

    it('should contain all expected status values', () => {
      const statuses = Object.values(AgentStatus);
      expect(statuses).toEqual([
        'initializing',
        'running',
        'paused',
        'completed',
        'failed',
        'terminated',
      ]);
    });
  });

  describe('type safety', () => {
    it('should be usable in type annotations', () => {
      const status: AgentStatus = AgentStatus.RUNNING;
      expect(status).toBe('running');
    });

    it('should support all status types', () => {
      const statuses: AgentStatus[] = [
        AgentStatus.INITIALIZING,
        AgentStatus.RUNNING,
        AgentStatus.PAUSED,
        AgentStatus.COMPLETED,
        AgentStatus.FAILED,
        AgentStatus.TERMINATED,
      ];

      expect(statuses).toHaveLength(6);
    });
  });
});
