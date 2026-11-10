/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-13
Scope: Generated the initial React, Vite, and TypeScript scaffold
Author review: I reviewed correctness and edited the generated scaffold to fit the project
*/

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'serve' && !env.INTERNAL_GATEWAY_URL?.trim()) {
    throw new Error('INTERNAL_GATEWAY_URL must be set for the development proxy')
  }
  const gatewayProxy = {
    target: env.INTERNAL_GATEWAY_URL,
    changeOrigin: true,
    cookieDomainRewrite: '',
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/supplier-api': { ...gatewayProxy },
        '/user-api': { ...gatewayProxy },
        '/credit-api': { ...gatewayProxy },
        '/order-api': { ...gatewayProxy },
      },
    },
    define: {
      'import.meta.env.VITE_ORDER_API_URL': JSON.stringify(env.VITE_ORDER_API_URL || '/order-api'),
      'import.meta.env.VITE_CREDIT_API_URL': JSON.stringify(env.VITE_CREDIT_API_URL || '/credit-api'),
      'import.meta.env.VITE_USER_API_URL': JSON.stringify(env.VITE_USER_API_URL || '/user-api'),
      'import.meta.env.VITE_SUPPLIER_API_URL': JSON.stringify(env.VITE_SUPPLIER_API_URL || '/supplier-api'),
    },
  }
})
