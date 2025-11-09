/**
 * Base exception for domain layer errors.
 * Thrown when domain rules or invariants are violated.
 */
export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainException);
    }
  }
}
