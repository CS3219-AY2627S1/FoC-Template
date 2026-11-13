import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/credit-assets/' : '/',
  plugins: [react()],
  build: { outDir: 'dist/credit-assets' },
  server: {
    port: 5175,
    proxy: { '/api': 'http://localhost:8083' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
}))
