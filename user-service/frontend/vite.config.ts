import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// IMPORTANT: Add this config to REMOTE_REGISTRY in the host service to register it
// configure Module Federation to expose component
export default defineConfig({
  base: '/remotes/user/',
  plugins: [
    react(),
    federation({
      name: 'userFrontend',
      filename: 'remoteEntry.js',
      exposes: { './App': './src/app/App.tsx' },
      shared: {
        react: { singleton: true, requiredVersion: '^19.2.8' },
        'react-dom': { singleton: true, requiredVersion: '^19.2.8' },
        'react-dom/client': { singleton: true, requiredVersion: '^19.2.8' },
      },
      dev: { disableDynamicRemoteTypeHints: true },
    }),
  ],
  server: { port: 5002, strictPort: true },
  build: { target: 'esnext' },
})
