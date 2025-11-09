import { DomainException } from '@domain/exceptions/domain.exception';

describe('DomainException', () => {
  describe('constructor', () => {
    it('should create exception with message', () => {
      const exception = new DomainException('Test error message');

      expect(exception.message).toBe('Test error message');
      expect(exception.name).toBe('DomainException');
    });

    it('should be instance of Error', () => {
      const exception = new DomainException('Test error');

      expect(exception).toBeInstanceOf(Error);
      expect(exception).toBeInstanceOf(DomainException);
    });

    it('should capture stack trace', () => {
      const exception = new DomainException('Test error');

      expect(exception.stack).toBeDefined();
      expect(exception.stack).toContain('DomainException');
    });
  });

  describe('error handling', () => {
    it('should be catchable as Error', () => {
      try {
        throw new DomainException('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(DomainException);
        if (error instanceof DomainException) {
          expect(error.message).toBe('Test error');
        }
      }
    });

    it('should preserve message when caught', () => {
      const errorMessage = 'Domain rule violated';

      try {
        throw new DomainException(errorMessage);
      } catch (error) {
        if (error instanceof DomainException) {
          expect(error.message).toBe(errorMessage);
        }
      }
    });
  });
});
