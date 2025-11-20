import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDesignTokens } from '@/hooks/useDesignTokens';

/**
 * useDesignTokens Hook Tests
 * Tests for design token system with WCAG AA contrast compliance
 */
describe('useDesignTokens', () => {
  describe('Color tokens', () => {
    it('should return all required color tokens', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.colors).toBeDefined();
      expect(result.current.colors.background).toBeDefined();
      expect(result.current.colors.text).toBeDefined();
      expect(result.current.colors.primary).toBeDefined();
      expect(result.current.colors.success).toBeDefined();
      expect(result.current.colors.danger).toBeDefined();
    });

    it('should have high contrast text on background', () => {
      const { result } = renderHook(() => useDesignTokens());

      // Background should be light
      expect(result.current.colors.background).toBe('#ffffff');

      // Text should be dark for contrast
      expect(result.current.colors.text).toBe('#212529');
    });

    it('should have semantic agent status colors', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.colors.agentRunning).toBeDefined();
      expect(result.current.colors.agentCompleted).toBeDefined();
      expect(result.current.colors.agentFailed).toBeDefined();
      expect(result.current.colors.agentTerminated).toBeDefined();
    });

    it('should have border colors', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.colors.border).toBeDefined();
      expect(result.current.colors.borderActive).toBeDefined();
    });
  });

  describe('Spacing tokens', () => {
    it('should return all spacing tokens', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.spacing).toBeDefined();
      expect(result.current.spacing.xs).toBe('4px');
      expect(result.current.spacing.sm).toBe('8px');
      expect(result.current.spacing.md).toBe('16px');
      expect(result.current.spacing.lg).toBe('24px');
      expect(result.current.spacing.xl).toBe('32px');
    });
  });

  describe('Border radius tokens', () => {
    it('should return border radius tokens', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.borderRadius).toBeDefined();
      expect(result.current.borderRadius.sm).toBe('4px');
      expect(result.current.borderRadius.md).toBe('8px');
      expect(result.current.borderRadius.lg).toBe('12px');
    });
  });

  describe('Shadow tokens', () => {
    it('should return shadow tokens', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.shadows).toBeDefined();
      expect(result.current.shadows.sm).toContain('rgba(0,0,0,0.05)');
      expect(result.current.shadows.md).toContain('rgba(0,0,0,0.1)');
      expect(result.current.shadows.lg).toContain('rgba(0,0,0,0.15)');
    });
  });

  describe('Typography tokens', () => {
    it('should return font family tokens', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.typography).toBeDefined();
      expect(result.current.typography.fontFamily).toContain('system-ui');
      expect(result.current.typography.fontFamilyMono).toContain('monospace');
    });

    it('should return font size tokens', () => {
      const { result } = renderHook(() => useDesignTokens());

      expect(result.current.typography.fontSize).toBeDefined();
      expect(result.current.typography.fontSize.sm).toBe('13px');
      expect(result.current.typography.fontSize.md).toBe('14px');
      expect(result.current.typography.fontSize.lg).toBe('16px');
    });
  });

  describe('Consistency', () => {
    it('should return same object reference on multiple calls', () => {
      const { result, rerender } = renderHook(() => useDesignTokens());

      const firstCall = result.current;
      rerender();
      const secondCall = result.current;

      expect(firstCall).toBe(secondCall);
    });
  });
});
