import { useState, useEffect } from 'react';

/**
 * Debug Mode Hook
 * Provides debug mode state and utilities for development
 * Automatically enabled in development, disabled in production
 */
export function useDebugMode() {
  const [isDebugMode, setIsDebugMode] = useState(() => {
    // Check if explicitly set in localStorage
    const stored = localStorage.getItem('debugMode');
    if (stored !== null) {
      return stored === 'true';
    }
    // Default: enabled in development, disabled in production
    return import.meta.env.DEV;
  });

  // Sync to localStorage when changed
  useEffect(() => {
    localStorage.setItem('debugMode', String(isDebugMode));
  }, [isDebugMode]);

  const toggleDebugMode = () => {
    setIsDebugMode((prev) => !prev);
  };

  return {
    isDebugMode,
    toggleDebugMode,
    enableDebugMode: () => setIsDebugMode(true),
    disableDebugMode: () => setIsDebugMode(false),
  };
}
