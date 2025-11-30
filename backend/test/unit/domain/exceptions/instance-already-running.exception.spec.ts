import { InstanceAlreadyRunningError } from '@domain/exceptions/instance-already-running.exception';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';

describe('InstanceAlreadyRunningError Exception', () => {
  const createTestLock = (): ProcessLock => {
    return ProcessLock.create({
      pid: 12345,
      startedAt: new Date('2025-11-27T20:00:00.000Z'),
      port: 3000,
      nodeVersion: 'v18.17.0',
      instanceId: '550e8400-e29b-41d4-a716-446655440000',
    });
  };

  describe('constructor', () => {
    it('should create error with ProcessLock', () => {
      const lock = createTestLock();
      const error = new InstanceAlreadyRunningError(lock);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(InstanceAlreadyRunningError);
    });

    it('should store the ProcessLock', () => {
      const lock = createTestLock();
      const error = new InstanceAlreadyRunningError(lock);

      expect(error.lock).toBe(lock);
    });

    it('should set error name', () => {
      const lock = createTestLock();
      const error = new InstanceAlreadyRunningError(lock);

      expect(error.name).toBe('InstanceAlreadyRunningError');
    });

    it('should set error message with PID', () => {
      const lock = createTestLock();
      const error = new InstanceAlreadyRunningError(lock);

      expect(error.message).toBe('Backend instance already running (PID: 12345)');
    });

    it('should include correct PID in message', () => {
      const lock = ProcessLock.create({
        pid: 99999,
        startedAt: new Date(),
        port: 3000,
        nodeVersion: 'v18.17.0',
        instanceId: '550e8400-e29b-41d4-a716-446655440000',
      });

      const error = new InstanceAlreadyRunningError(lock);

      expect(error.message).toContain('99999');
    });

    it('should be throwable', () => {
      const lock = createTestLock();

      expect(() => {
        throw new InstanceAlreadyRunningError(lock);
      }).toThrow(InstanceAlreadyRunningError);
    });

    it('should be catchable as Error', () => {
      const lock = createTestLock();

      expect(() => {
        throw new InstanceAlreadyRunningError(lock);
      }).toThrow(Error);
    });

    it('should preserve stack trace', () => {
      const lock = createTestLock();
      const error = new InstanceAlreadyRunningError(lock);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('InstanceAlreadyRunningError');
    });
  });

  describe('error handling', () => {
    it('should be catchable with type check', () => {
      const lock = createTestLock();

      try {
        throw new InstanceAlreadyRunningError(lock);
      } catch (error) {
        expect(error).toBeInstanceOf(InstanceAlreadyRunningError);
        if (error instanceof InstanceAlreadyRunningError) {
          expect(error.lock.getPid()).toBe(12345);
        }
      }
    });

    it('should allow accessing lock data in catch block', () => {
      const lock = createTestLock();
      let caughtPid: number | undefined;

      try {
        throw new InstanceAlreadyRunningError(lock);
      } catch (error) {
        if (error instanceof InstanceAlreadyRunningError) {
          caughtPid = error.lock.getPid();
        }
      }

      expect(caughtPid).toBe(12345);
    });
  });
});
