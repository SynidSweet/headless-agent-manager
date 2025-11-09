import { AgentId } from '@domain/value-objects/agent-id.vo';
import { DomainException } from '@domain/exceptions/domain.exception';

describe('AgentId Value Object', () => {
  describe('generate', () => {
    it('should generate a valid UUID', () => {
      const id = AgentId.generate();

      expect(id.toString()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = AgentId.generate();
      const id2 = AgentId.generate();

      expect(id1.equals(id2)).toBe(false);
      expect(id1.toString()).not.toBe(id2.toString());
    });

    it('should generate different IDs on multiple calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(AgentId.generate().toString());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('fromString', () => {
    it('should create AgentId from valid UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = AgentId.fromString(uuid);

      expect(id.toString()).toBe(uuid);
    });

    it('should create AgentId from another valid UUID', () => {
      const uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      const id = AgentId.fromString(uuid);

      expect(id.toString()).toBe(uuid);
    });

    it('should throw DomainException when string is empty', () => {
      expect(() => AgentId.fromString('')).toThrow(DomainException);
      expect(() => AgentId.fromString('')).toThrow('AgentId cannot be empty');
    });

    it('should throw DomainException when string is whitespace', () => {
      expect(() => AgentId.fromString('   ')).toThrow(DomainException);
      expect(() => AgentId.fromString('   ')).toThrow('AgentId cannot be empty');
    });

    it('should throw DomainException when string is invalid UUID format', () => {
      expect(() => AgentId.fromString('invalid-uuid')).toThrow(DomainException);
      expect(() => AgentId.fromString('invalid-uuid')).toThrow('Invalid UUID format');
    });

    it('should throw DomainException when string is not a UUID', () => {
      expect(() => AgentId.fromString('not-a-uuid-at-all')).toThrow(DomainException);
    });

    it('should throw DomainException when string has invalid UUID structure', () => {
      expect(() => AgentId.fromString('550e8400-e29b-41d4-a716')).toThrow(DomainException);
    });
  });

  describe('toString', () => {
    it('should return the UUID string', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id = AgentId.fromString(uuid);

      expect(id.toString()).toBe(uuid);
    });

    it('should return same value for generated ID', () => {
      const id = AgentId.generate();
      const str1 = id.toString();
      const str2 = id.toString();

      expect(str1).toBe(str2);
    });
  });

  describe('equals', () => {
    it('should return true for same UUID value', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const id1 = AgentId.fromString(uuid);
      const id2 = AgentId.fromString(uuid);

      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different UUID values', () => {
      const id1 = AgentId.fromString('550e8400-e29b-41d4-a716-446655440000');
      const id2 = AgentId.fromString('6ba7b810-9dad-11d1-80b4-00c04fd430c8');

      expect(id1.equals(id2)).toBe(false);
    });

    it('should return true when comparing same instance', () => {
      const id = AgentId.generate();

      expect(id.equals(id)).toBe(true);
    });

    it('should handle case-insensitive comparison', () => {
      const id1 = AgentId.fromString('550e8400-e29b-41d4-a716-446655440000');
      const id2 = AgentId.fromString('550E8400-E29B-41D4-A716-446655440000');

      expect(id1.equals(id2)).toBe(true);
    });
  });

  describe('value object immutability', () => {
    it('should maintain same value across multiple toString calls', () => {
      const id = AgentId.generate();
      const originalValue = id.toString();

      // Value should remain constant
      expect(id.toString()).toBe(originalValue);
      expect(id.toString()).toBe(originalValue);
      expect(id.toString()).toBe(originalValue);
    });

    it('should create new instance instead of modifying existing', () => {
      const uuid1 = '550e8400-e29b-41d4-a716-446655440000';
      const uuid2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      const id1 = AgentId.fromString(uuid1);
      const id2 = AgentId.fromString(uuid2);

      // Each instance is independent
      expect(id1.toString()).toBe(uuid1);
      expect(id2.toString()).toBe(uuid2);
      expect(id1.equals(id2)).toBe(false);
    });
  });
});
