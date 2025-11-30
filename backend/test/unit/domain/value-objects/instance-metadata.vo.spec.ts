import { InstanceMetadata } from '@domain/value-objects/instance-metadata.vo';
import { ProcessState } from '@domain/entities/process-state.entity';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';

describe('InstanceMetadata Value Object', () => {
  const createTestState = (): ProcessState => {
    const lock = ProcessLock.create({
      pid: process.pid,
      startedAt: new Date('2025-11-27T20:00:00.000Z'),
      port: 3000,
      nodeVersion: process.version,
      instanceId: '550e8400-e29b-41d4-a716-446655440000',
    });
    return ProcessState.create(lock);
  };

  describe('fromProcess', () => {
    it('should create metadata from ProcessState', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      expect(metadata).toBeDefined();
      expect(metadata.getPid()).toBe(process.pid);
      expect(metadata.getPort()).toBe(3000);
      expect(metadata.getNodeVersion()).toBe(process.version);
      expect(metadata.getInstanceId()).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should include PID from lock', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      expect(metadata.getPid()).toBe(process.pid);
    });

    it('should include uptime', () => {
      const state = createTestState();
      const uptime = 3600; // 1 hour
      const metadata = InstanceMetadata.fromProcess(state, uptime, 'connected');

      expect(metadata.getUptime()).toBe(3600);
    });

    it('should include memory usage', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      const memoryUsage = metadata.getMemoryUsage();
      expect(memoryUsage).toBeDefined();
      expect(memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(memoryUsage.rss).toBeGreaterThan(0);
      expect(memoryUsage.external).toBeGreaterThanOrEqual(0);
    });

    it('should include active agents count', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected', 5);

      expect(metadata.getActiveAgents()).toBe(5);
    });

    it('should default active agents to 0', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      expect(metadata.getActiveAgents()).toBe(0);
    });

    it('should include database status', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      expect(metadata.getDatabaseStatus()).toBe('connected');
    });

    it('should handle disconnected database status', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'disconnected');

      expect(metadata.getDatabaseStatus()).toBe('disconnected');
    });

    it('should include startedAt timestamp', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      expect(metadata.getStartedAt()).toEqual(new Date('2025-11-27T20:00:00.000Z'));
    });

    it('should include all required fields', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 3600, 'connected', 3);

      // Verify all fields are present
      expect(metadata.getPid()).toBe(process.pid);
      expect(metadata.getUptime()).toBe(3600);
      expect(metadata.getMemoryUsage()).toBeDefined();
      expect(metadata.getActiveAgents()).toBe(3);
      expect(metadata.getDatabaseStatus()).toBe('connected');
      expect(metadata.getStartedAt()).toEqual(new Date('2025-11-27T20:00:00.000Z'));
      expect(metadata.getPort()).toBe(3000);
      expect(metadata.getNodeVersion()).toBe(process.version);
      expect(metadata.getInstanceId()).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('value object immutability', () => {
    it('should maintain same values across multiple getter calls', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 3600, 'connected', 5);

      const pid1 = metadata.getPid();
      const pid2 = metadata.getPid();
      const uptime1 = metadata.getUptime();
      const uptime2 = metadata.getUptime();
      const activeAgents1 = metadata.getActiveAgents();
      const activeAgents2 = metadata.getActiveAgents();

      expect(pid1).toBe(pid2);
      expect(uptime1).toBe(uptime2);
      expect(activeAgents1).toBe(activeAgents2);
    });

    it('should return same memory usage object reference', () => {
      const state = createTestState();
      const metadata = InstanceMetadata.fromProcess(state, 0, 'connected');

      const memoryUsage1 = metadata.getMemoryUsage();
      const memoryUsage2 = metadata.getMemoryUsage();

      expect(memoryUsage1).toBe(memoryUsage2);
    });
  });
});
