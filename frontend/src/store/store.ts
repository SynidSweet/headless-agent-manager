/**
 * Redux Store Configuration
 * Uses the @headless-agent-manager/client module
 */

import { createAgentClient } from '@headless-agent-manager/client';

/**
 * Determine API and WebSocket URLs at runtime
 * This allows the same build to work in development and production
 */
const getUrls = () => {
  // Check if explicitly set via environment variables (build time)
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_WS_URL) {
    return {
      apiUrl: import.meta.env.VITE_API_URL,
      wsUrl: import.meta.env.VITE_WS_URL,
    };
  }

  // Runtime detection based on hostname
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    // Production: use same origin
    const origin = window.location.origin; // e.g., https://agents.petter.ai
    return {
      apiUrl: origin,
      wsUrl: origin,
    };
  }

  // Development: use localhost
  return {
    apiUrl: 'http://localhost:3000',
    wsUrl: 'http://localhost:3000',
  };
};

const { apiUrl, wsUrl } = getUrls();

console.log('[Store] Configured URLs:', { apiUrl, wsUrl });

// Create configured client
const client = createAgentClient({
  apiUrl,
  websocketUrl: wsUrl,
  debug: import.meta.env.DEV,
});

// Export store for React Provider
export const store = client.store;

// Export actions and selectors for components
export const { actions, selectors } = client;

// Export socket for advanced use
export const socket = client.socket;

// Expose store and socket to window for E2E testing (PHASE 3)
if (typeof window !== 'undefined') {
  (window as any).store = store;
  (window as any).socket = client.socket;
  (window as any).actions = actions;
  (window as any).selectors = selectors;
}

// Export types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
