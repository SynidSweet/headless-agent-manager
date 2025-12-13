import { describe, it, expect } from 'vitest';
import { helloWorld } from './hello';

describe('helloWorld', () => {
  it('should return "Hello, World!"', () => {
    const result = helloWorld();
    expect(result).toBe('Hello, World!');
  });
});
