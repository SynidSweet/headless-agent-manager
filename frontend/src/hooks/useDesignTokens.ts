import { useMemo } from 'react';

/**
 * Design Tokens Interface
 * Defines the structure of all design tokens
 */
export interface DesignTokens {
  colors: {
    // Background colors
    background: string;
    backgroundSecondary: string;
    backgroundTertiary: string;

    // Text colors (WCAG AA compliant)
    text: string;
    textSecondary: string;
    textInverse: string;

    // Semantic colors
    primary: string;
    success: string;
    warning: string;
    danger: string;

    // Agent status colors
    agentRunning: string;
    agentCompleted: string;
    agentFailed: string;
    agentTerminated: string;

    // Borders
    border: string;
    borderActive: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
  typography: {
    fontFamily: string;
    fontFamilyMono: string;
    fontSize: {
      xs: string;
      sm: string;
      md: string;
      lg: string;
      xl: string;
      xxl: string;
    };
  };
}

/**
 * useDesignTokens Hook
 * Provides semantic design tokens with proper contrast ratios
 *
 * Design Principles:
 * - WCAG AA compliant contrast ratios (minimum 4.5:1 for text)
 * - Semantic naming (background, text, primary, etc.)
 * - Consistent spacing scale
 * - No light-on-light or dark-on-dark issues
 */
export function useDesignTokens(): DesignTokens {
  return useMemo(
    () => ({
      colors: {
        // Background colors
        background: '#ffffff',
        backgroundSecondary: '#f8f9fa',
        backgroundTertiary: '#e9ecef',

        // Text colors (high contrast - WCAG AA compliant)
        text: '#212529', // Contrast ratio with #ffffff: 16.1:1 ✓
        textSecondary: '#6c757d', // Contrast ratio with #ffffff: 4.6:1 ✓
        textInverse: '#ffffff',

        // Semantic colors
        primary: '#0d6efd', // Blue
        success: '#198754', // Green
        warning: '#ffc107', // Yellow
        danger: '#dc3545', // Red

        // Agent status colors
        agentRunning: '#0d6efd', // Blue (running)
        agentCompleted: '#198754', // Green (success)
        agentFailed: '#dc3545', // Red (error)
        agentTerminated: '#6c757d', // Gray (stopped)

        // Borders
        border: '#dee2e6',
        borderActive: '#0d6efd',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      shadows: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 2px 4px rgba(0,0,0,0.1)',
        lg: '0 4px 8px rgba(0,0,0,0.15)',
      },
      typography: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontFamilyMono: 'ui-monospace, monospace',
        fontSize: {
          xs: '11px',
          sm: '13px',
          md: '14px',
          lg: '16px',
          xl: '20px',
          xxl: '24px',
        },
      },
    }),
    []
  );
}
