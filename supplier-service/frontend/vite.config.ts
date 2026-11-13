import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/supplier-assets/' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist/supplier-assets',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8088',
      '/actuator': 'http://localhost:8088',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}))
