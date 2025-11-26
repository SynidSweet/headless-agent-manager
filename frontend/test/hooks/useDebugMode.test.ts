import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebugMode } from '@/hooks/useDebugMode';

/**
 * useDebugMode Hook Tests
 * Tests for debug mode state management
 */
describe('useDebugMode', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initial state', () => {
    it('should default to DEV mode in development', () => {
      const { result } = renderHook(() => useDebugMode());

      // In test environment, import.meta.env.DEV should be true
      expect(result.current.isDebugMode).toBe(true);
    });

    it('should use localStorage value if present', () => {
      localStorage.setItem('debugMode', 'false');

      const { result } = renderHook(() => useDebugMode());

      expect(result.current.isDebugMode).toBe(false);
    });
  });

  describe('Toggle functionality', () => {
    it('should toggle debug mode on/off', () => {
      const { result } = renderHook(() => useDebugMode());

      const initialState = result.current.isDebugMode;

      act(() => {
        result.current.toggleDebugMode();
      });

      expect(result.current.isDebugMode).toBe(!initialState);

      act(() => {
        result.current.toggleDebugMode();
      });

      expect(result.current.isDebugMode).toBe(initialState);
    });

    it('should persist state to localStorage', () => {
      const { result } = renderHook(() => useDebugMode());

      act(() => {
        result.current.enableDebugMode();
      });

      expect(localStorage.getItem('debugMode')).toBe('true');

      act(() => {
        result.current.disableDebugMode();
      });

      expect(localStorage.getItem('debugMode')).toBe('false');
    });
  });

  describe('Enable/Disable functions', () => {
    it('should enable debug mode', () => {
      localStorage.setItem('debugMode', 'false');

      const { result } = renderHook(() => useDebugMode());

      act(() => {
        result.current.enableDebugMode();
      });

      expect(result.current.isDebugMode).toBe(true);
    });

    it('should disable debug mode', () => {
      localStorage.setItem('debugMode', 'true');

      const { result } = renderHook(() => useDebugMode());

      act(() => {
        result.current.disableDebugMode();
      });

      expect(result.current.isDebugMode).toBe(false);
    });
  });
});
