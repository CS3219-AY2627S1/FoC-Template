import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/notification-assets/' : '/',
  plugins: [react()],
  build: { outDir: 'dist/notification-assets' },
  server: {
    port: 5178,
    // Mirrors the gateway: each API prefix goes to the service that owns it.
    proxy: {
      '/api/notifications': 'http://localhost:8086',
      '/api/users': 'http://localhost:8088',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}))
