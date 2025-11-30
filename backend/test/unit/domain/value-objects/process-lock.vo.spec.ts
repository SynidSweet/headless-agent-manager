import { ProcessLock } from '@domain/value-objects/process-lock.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('ProcessLock Value Object', () => {
  describe('create', () => {
    it('should create valid process lock with all fields', () => {
      const data = {
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const lock = ProcessLock.create(data);

      expect(lock.getPid()).toBe(12345);
      expect(lock.getStartedAt()).toEqual(new Date('2025-11-27T20:00:00.000Z'));
      expect(lock.getPort()).toBe(3000);
      expect(lock.getNodeVersion()).toBe('v18.17.0');
      expect(lock.getInstanceId()).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should validate PID is positive number', () => {
      const data = {
        pid: 0,
        startedAt: new Date(),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('PID must be a positive number');
    });

    it('should reject negative PID', () => {
      const data = {
        pid: -1,
        startedAt: new Date(),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('PID must be a positive number');
    });

    it('should validate port is in valid range (1-65535)', () => {
      const validData = {
        pid: 12345,
        startedAt: new Date(),
        port: 1,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(validData)).not.toThrow();

      const validData2 = {
        pid: 12345,
        startedAt: new Date(),
        port: 65535,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(validData2)).not.toThrow();
    });

    it('should reject port 0', () => {
      const data = {
        pid: 12345,
        startedAt: new Date(),
        port: 0,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('Port must be between 1 and 65535');
    });

    it('should reject port above 65535', () => {
      const data = {
        pid: 12345,
        startedAt: new Date(),
        port: 65536,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('Port must be between 1 and 65535');
    });

    it('should reject missing nodeVersion', () => {
      const data = {
        pid: 12345,
        startedAt: new Date(),
        port: 3000,
        nodeVersion: '',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('Node version is required');
    });

    it('should reject missing instanceId', () => {
      const data = {
        pid: 12345,
        startedAt: new Date(),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('Instance ID is required');
    });

    it('should reject missing startedAt', () => {
      const data = {
        pid: 12345,
        startedAt: null as any,
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      expect(() => ProcessLock.create(data)).toThrow(DomainException);
      expect(() => ProcessLock.create(data)).toThrow('Started at timestamp is required');
    });
  });

  describe('fromFile', () => {
    it('should parse valid JSON into ProcessLock', () => {
      const json = JSON.stringify({
        pid: 12345,
        startedAt: '2025-11-27T20:00:00.000Z',
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const lock = ProcessLock.fromFile(json);

      expect(lock.getPid()).toBe(12345);
      expect(lock.getStartedAt()).toEqual(new Date('2025-11-27T20:00:00.000Z'));
      expect(lock.getPort()).toBe(3000);
      expect(lock.getNodeVersion()).toBe('v18.17.0');
      expect(lock.getInstanceId()).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should throw on invalid JSON', () => {
      const invalidJson = 'not valid json {]';

      expect(() => ProcessLock.fromFile(invalidJson)).toThrow(DomainException);
      expect(() => ProcessLock.fromFile(invalidJson)).toThrow('Invalid PID file format');
    });

    it('should throw on missing required fields', () => {
      const missingPid = JSON.stringify({
        startedAt: '2025-11-27T20:00:00.000Z',
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(() => ProcessLock.fromFile(missingPid)).toThrow(DomainException);
    });

    it('should throw on missing port field', () => {
      const missingPort = JSON.stringify({
        pid: 12345,
        startedAt: '2025-11-27T20:00:00.000Z',
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(() => ProcessLock.fromFile(missingPort)).toThrow(DomainException);
    });

    it('should throw on missing instanceId field', () => {
      const missingInstanceId = JSON.stringify({
        pid: 12345,
        startedAt: '2025-11-27T20:00:00.000Z',
        port: 3000,
        nodeVersion: 'v18.17.0',
      });

      expect(() => ProcessLock.fromFile(missingInstanceId)).toThrow(DomainException);
    });

    it('should throw on missing nodeVersion field', () => {
      const missingNodeVersion = JSON.stringify({
        pid: 12345,
        startedAt: '2025-11-27T20:00:00.000Z',
        port: 3000,
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(() => ProcessLock.fromFile(missingNodeVersion)).toThrow(DomainException);
    });

    it('should throw on missing startedAt field', () => {
      const missingStartedAt = JSON.stringify({
        pid: 12345,
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(() => ProcessLock.fromFile(missingStartedAt)).toThrow(DomainException);
    });
  });

  describe('toJSON', () => {
    it('should serialize to valid JSON string', () => {
      const data = {
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const lock = ProcessLock.create(data);
      const json = lock.toJSON();

      expect(() => JSON.parse(json)).not.toThrow();

      const parsed = JSON.parse(json);
      expect(parsed.pid).toBe(12345);
      expect(parsed.startedAt).toBe('2025-11-27T20:00:00.000Z');
      expect(parsed.port).toBe(3000);
      expect(parsed.nodeVersion).toBe('v18.17.0');
      expect(parsed.instanceId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should be parseable by fromFile (round-trip)', () => {
      const original = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const json = original.toJSON();
      const restored = ProcessLock.fromFile(json);

      expect(restored.getPid()).toBe(original.getPid());
      expect(restored.getStartedAt()).toEqual(original.getStartedAt());
      expect(restored.getPort()).toBe(original.getPort());
      expect(restored.getNodeVersion()).toBe(original.getNodeVersion());
      expect(restored.getInstanceId()).toBe(original.getInstanceId());
    });
  });

  describe('isStale', () => {
    it('should return false if process is running', () => {
      const lock = ProcessLock.create({
        pid: process.pid, // Current process
        startedAt: new Date(),
        port: 3000,
        nodeVersion: process.version,
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(lock.isStale()).toBe(false);
    });

    it('should return true if process is not running', () => {
      // Use a PID that definitely doesn't exist (very high number)
      const lock = ProcessLock.create({
        pid: 999999,
        startedAt: new Date(),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(lock.isStale()).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for locks with same PID and instanceId', () => {
      const lock1 = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const lock2 = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(lock1.equals(lock2)).toBe(true);
    });

    it('should return false for different PIDs', () => {
      const lock1 = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const lock2 = ProcessLock.create({
        pid: 54321,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(lock1.equals(lock2)).toBe(false);
    });

    it('should return false for different instanceIds', () => {
      const lock1 = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const lock2 = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      });

      expect(lock1.equals(lock2)).toBe(false);
    });

    it('should return true when comparing same instance', () => {
      const lock = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(lock.equals(lock)).toBe(true);
    });
  });

  describe('value object immutability', () => {
    it('should maintain same values across multiple getter calls', () => {
      const lock = ProcessLock.create({
        pid: 12345,
        startedAt: new Date('2025-11-27T20:00:00.000Z'),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const pid1 = lock.getPid();
      const pid2 = lock.getPid();
      const port1 = lock.getPort();
      const port2 = lock.getPort();

      expect(pid1).toBe(pid2);
      expect(port1).toBe(port2);
    });
  });
});
