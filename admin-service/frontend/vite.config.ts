import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const userUrl = process.env.VITE_USER_URL ?? 'http://127.0.0.1:8081'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/admin-assets/' : '/',
  plugins: [react()],
  build: { outDir: 'dist/admin-assets' },
  server: {
    host: '127.0.0.1',
    port: 5177,
    proxy: {
      '/api/admin/suppliers': 'http://127.0.0.1:8088',
      '/api/suppliers': 'http://127.0.0.1:8088',
      '/api/credits': 'http://127.0.0.1:8088',
      '/api/orders': 'http://127.0.0.1:8088',
      '/api/chat': 'http://127.0.0.1:8088',
      '/api/admin': 'http://127.0.0.1:8084',
      '/api/users': userUrl,
      '/admin/suppliers': 'http://127.0.0.1:8088',
      '/suppliers': 'http://127.0.0.1:8088',
      '/supplier-assets': 'http://127.0.0.1:8088',
      '/credits': 'http://127.0.0.1:8088',
      '/credit-assets': 'http://127.0.0.1:8088',
      '/errands': 'http://127.0.0.1:8088',
      '/order-assets': 'http://127.0.0.1:8088',
      '/user-assets': userUrl,
      '^/(?:\\?.*)?$': userUrl,
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: true },
}))
