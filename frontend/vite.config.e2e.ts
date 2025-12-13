import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Vite configuration for E2E tests
 * Disables HMR for stability - E2E tests don't need hot reload
 * Uses localhost for all connections (no domain routing)
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // ✅ CRITICAL: Force E2E environment variables to override runtime detection
  // DEV environment uses port 3001 (production uses 3000)
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://localhost:3001'),
    'import.meta.env.VITE_WS_URL': JSON.stringify('http://localhost:3001'),
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces
    port: 5174, // Fixed port for E2E tests
    strictPort: true, // Fail if port is taken (instead of auto-incrementing)
    hmr: false, // ✅ CRITICAL: Disable HMR for E2E test stability
    proxy: {
      '/api': {
        target: 'http://localhost:3001', // DEV: Backend runs on port 3001 (prod uses 3000)
        changeOrigin: true,
      },
    },
  },
  // Optimize for test environment
  optimizeDeps: {
    // Pre-bundle dependencies to avoid HMR-related issues
    include: ['react', 'react-dom', 'react-redux', '@reduxjs/toolkit'],
  },
})
