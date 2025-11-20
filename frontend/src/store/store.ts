/**
 * Redux Store Configuration
 * Uses the @headless-agent-manager/client module
 */

import { createAgentClient } from '@headless-agent-manager/client';

// Get URLs from environment or use defaults
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

// Create configured client
const client = createAgentClient({
  apiUrl: API_URL,
  websocketUrl: WS_URL,
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
