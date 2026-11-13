import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/

export default defineConfig(() => {
  return {
    plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })],
    // Mirror the production Nginx routes while developing. Keeping the host's
    // remote URLs relative means the same federation configuration works in
    // Docker, locally, and through a Codespaces forwarded port.
    server: {
      proxy: {
        // Keep browser requests same-origin during local development. The
        // backend services use separate host ports because both default to
        // port 3000 inside their Docker containers.
        '/api/auth': {
          target: 'http://localhost:3004',
          changeOrigin: false,
        },
        '/api/user': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/api/supplier': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/api/errands': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        },
        '/api/credit': {
          target: 'http://localhost:3003',
          changeOrigin: true,
        },
        '/api/notifications/stream': {
          target: 'http://localhost:3010',
          changeOrigin: true,
          ws: true,
        },
        '/remotes/supplier': {
          target: 'http://localhost:5001',
          changeOrigin: true,
          ws: true,
        },
        '/remotes/user': {
          target: 'http://localhost:5002',
          changeOrigin: true,
          ws: true,
        },
        '/remotes/errand': {
          target: 'http://localhost:5003',
          changeOrigin: true,
          ws: true,
        },
        '/remotes/credit': {
          target: 'http://localhost:5004',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: { target: 'esnext' },
  }
})
