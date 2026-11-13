import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// IMPORTANT: Add this config to REMOTE_REGISTRY in the host service to register it
// configure Module Federation to expose component
export default defineConfig({
  base: '/remotes/errand/',
  plugins: [
    react(),
    federation({
      name: 'errandFrontend',
      filename: 'remoteEntry.js',
      exposes: { './App': './src/App.tsx' },
      shared: {
        react: { singleton: true, requiredVersion: '^19.2.8' },
        'react-dom': { singleton: true, requiredVersion: '^19.2.8' },
        'react-dom/client': { singleton: true, requiredVersion: '^19.2.8' },
      },
      dev: { disableDynamicRemoteTypeHints: true },
    }),
  ],
  server: { port: 5003, strictPort: true },
  build: { target: 'esnext' },
  server: {
    port: 5003,
    strictPort: true,
    proxy: {
      '/api/notifications/stream': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        secure: false,
        ws: true, // WebSocket/SSE support
      },
      '/api/errands': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/api/credit': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
