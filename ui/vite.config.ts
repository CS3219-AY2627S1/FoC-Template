import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// /backend/* calls are forwarded to the backend services (avoids CORS in dev)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // refresh cookie is set on Path=/users, so remap it or the browser never sends it back
      '/backend/users':     { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/backend/, ''), cookiePathRewrite: { '/users': '/backend/users' } },
      '/backend/suppliers': { target: 'http://localhost:3002', rewrite: (p) => p.replace(/^\/backend/, '') },
      '/backend/supplier':  { target: 'http://localhost:3002', rewrite: (p) => p.replace(/^\/backend/, '') },
      // start order-service with ORDER_HTTP_PORT=3003, its default clashes with supplier-service
      '/backend/orders':    { target: 'http://localhost:3003', rewrite: (p) => p.replace(/^\/backend/, '') },
      '/backend/credits':   { target: 'http://localhost:3004', rewrite: (p) => p.replace(/^\/backend/, '') },
    },
  },
})