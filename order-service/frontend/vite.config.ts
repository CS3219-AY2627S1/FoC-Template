import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/order-assets/' : '/',
  plugins: [react()],
  build: { outDir: 'dist/order-assets' },
  server: {
    port: 5176,
    // Mirrors the gateway: each API prefix goes to the service that owns it.
    proxy: {
      '/api/admin': 'http://localhost:8088',
      '/admin': 'http://localhost:8088',
      '/api/orders': 'http://localhost:8082',
      '/api/suppliers': 'http://localhost:8080',
      '/api/credits': 'http://localhost:8083',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}))
