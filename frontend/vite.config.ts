import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0', // Listen on all interfaces
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 443, // For HTTPS proxy
      protocol: 'wss',
      host: 'agents.petter.ai',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
