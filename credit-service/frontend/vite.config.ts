import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// IMPORTANT: Add this config to REMOTE_REGISTRY in the host service to register it
// configure Module Federation to expose component
export default defineConfig({
  base: '/remotes/credit/',
  plugins: [
    react(),
    federation({
      name: 'creditFrontend',
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
  server: { port: 5004, strictPort: true },
  build: { target: 'esnext' },
})
