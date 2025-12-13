/**
 * Redux Store Configuration
 * Uses the @headless-agent-manager/client module
 */

import { createAgentClient } from '@headless-agent-manager/client';

/**
 * Determine API and WebSocket URLs at runtime
 * This allows the same build to work in development and production
 *
 * Priority:
 * 1. Runtime hostname detection (if accessed via public domain)
 * 2. Environment variables (for E2E tests)
 * 3. Localhost defaults (for local development)
 */
const getUrls = () => {
  // PRIORITY 1: Runtime detection based on hostname
  // If accessed via public domain (not localhost), use same origin
  // This allows dev server to work when accessed through agents.dev.petter.ai
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    const origin = window.location.origin; // e.g., https://agents.dev.petter.ai
    console.log('[Store] Using same-origin URLs (public domain access):', { hostname: window.location.hostname, origin });
    return {
      apiUrl: origin,
      wsUrl: origin,
    };
  }

  // PRIORITY 2: Environment variables (for E2E tests or explicit override)
  // Only use these when accessed via localhost
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_WS_URL) {
    console.log('[Store] Using environment variable URLs (localhost access)');
    return {
      apiUrl: import.meta.env.VITE_API_URL,
      wsUrl: import.meta.env.VITE_WS_URL,
    };
  }

  // PRIORITY 3: Default localhost URLs
  console.log('[Store] Using default localhost URLs');
  return {
    apiUrl: 'http://localhost:3001',
    wsUrl: 'http://localhost:3001',
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
