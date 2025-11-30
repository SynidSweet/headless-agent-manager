import { ProcessState } from '@domain/entities/process-state.entity';
import { ProcessLock } from '@domain/value-objects/process-lock.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('ProcessState Entity', () => {
  const createTestLock = (): ProcessLock => {
    return ProcessLock.create({
      pid: process.pid,
      startedAt: new Date(),
      port: 3000,
      nodeVersion: process.version,
      instanceId: '550e8400-e29b-41d4-a716-446655440000',
    });
  };

  describe('create', () => {
    it('should create with unique instance ID', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getInstanceId()).toBeDefined();
      expect(state.getInstanceId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate different instance IDs', () => {
      const lock = createTestLock();
      const state1 = ProcessState.create(lock);
      const state2 = ProcessState.create(lock);

      expect(state1.getInstanceId()).not.toBe(state2.getInstanceId());
    });

    it('should initialize in "starting" status', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getStatus()).toBe('starting');
    });

    it('should store the process lock', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getLock()).toBe(lock);
    });
  });

  describe('state transitions', () => {
    it('should transition starting → running', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getStatus()).toBe('starting');

      state.markAsRunning();

      expect(state.getStatus()).toBe('running');
    });

    it('should transition running → stopping', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();
      expect(state.getStatus()).toBe('running');

      state.markAsStopping();

      expect(state.getStatus()).toBe('stopping');
    });

    it('should transition stopping → stopped', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();
      state.markAsStopping();
      expect(state.getStatus()).toBe('stopping');

      state.markAsStopped();

      expect(state.getStatus()).toBe('stopped');
    });

    it('should complete full lifecycle: starting → running → stopping → stopped', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getStatus()).toBe('starting');

      state.markAsRunning();
      expect(state.getStatus()).toBe('running');

      state.markAsStopping();
      expect(state.getStatus()).toBe('stopping');

      state.markAsStopped();
      expect(state.getStatus()).toBe('stopped');
    });
  });

  describe('invalid state transitions', () => {
    it('should not allow running → running', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();

      expect(() => state.markAsRunning()).toThrow(DomainException);
      expect(() => state.markAsRunning()).toThrow('Invalid state transition');
    });

    it('should not allow starting → stopping', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getStatus()).toBe('starting');

      expect(() => state.markAsStopping()).toThrow(DomainException);
      expect(() => state.markAsStopping()).toThrow('Invalid state transition');
    });

    it('should not allow starting → stopped', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      expect(state.getStatus()).toBe('starting');

      expect(() => state.markAsStopped()).toThrow(DomainException);
      expect(() => state.markAsStopped()).toThrow('Invalid state transition');
    });

    it('should not allow stopping → running', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();
      state.markAsStopping();

      expect(() => state.markAsRunning()).toThrow(DomainException);
      expect(() => state.markAsRunning()).toThrow('Invalid state transition');
    });

    it('should not allow stopped → running', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();
      state.markAsStopping();
      state.markAsStopped();

      expect(() => state.markAsRunning()).toThrow(DomainException);
      expect(() => state.markAsRunning()).toThrow('Invalid state transition');
    });

    it('should not allow stopped → stopping', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();
      state.markAsStopping();
      state.markAsStopped();

      expect(() => state.markAsStopping()).toThrow(DomainException);
      expect(() => state.markAsStopping()).toThrow('Invalid state transition');
    });

    it('should not allow stopped → stopped', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      state.markAsRunning();
      state.markAsStopping();
      state.markAsStopped();

      expect(() => state.markAsStopped()).toThrow(DomainException);
      expect(() => state.markAsStopped()).toThrow('Invalid state transition');
    });
  });

  describe('getters', () => {
    it('should return immutable lock reference', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      const retrievedLock1 = state.getLock();
      const retrievedLock2 = state.getLock();

      expect(retrievedLock1).toBe(retrievedLock2);
      expect(retrievedLock1).toBe(lock);
    });

    it('should return consistent instance ID', () => {
      const lock = createTestLock();
      const state = ProcessState.create(lock);

      const id1 = state.getInstanceId();
      const id2 = state.getInstanceId();

      expect(id1).toBe(id2);
    });
  });
});
