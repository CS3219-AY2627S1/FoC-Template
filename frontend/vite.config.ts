/* Additional AI assistance: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Credit history (#58) and current-balance (#65) gateways. Author review: Reviewed and approved by @phuc. */
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-09-26
 * Scope: Added Tailwind and the development reverse-proxy rules that implement the
 *        author's gateway decisions (data-named /api/v1 paths, rewrites to service routes,
 *        /auth/verify not exposed). Mirrors frontend/nginx.conf used in Docker.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Dev-proxy rules for the User Service suspend/restore and admin audit endpoints.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Dev-proxy rules for the Order Service errand endpoints.
 * Author review of additional changes: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Sonnet 5.5), date: 2026-11-08
 * Scope: Dev-proxy rule for the admin login-events endpoint (N2H1a).
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-11-10
 * Scope: Dev-proxy rule for the admin accounts list and lookup.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Where the services run during local development (`npm run dev`).
// Defaults match the published ports in compose.yaml.
const USER_SERVICE_URL = process.env.USER_SERVICE_URL ?? 'http://localhost:3001'
const SUPPLIER_SERVICE_URL = process.env.SUPPLIER_SERVICE_URL ?? 'http://localhost:3000'
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL ?? 'http://localhost:3002'
const CREDIT_SERVICE_URL = process.env.CREDIT_SERVICE_URL ?? 'http://localhost:3003'

// "/api/v1/whoami" -> "/whoami", "/api/v1/auth/login" -> "/auth/login"
const stripApiPrefix = (path: string) => path.replace(/^\/api\/v1/, '')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev gateway; keep in sync with nginx.conf. Keys starting with "^" are regexes.
    proxy: {
      '^/api/v1/me/credit(\\?|$)': { target: CREDIT_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/me/credit/transactions(\\?|$)': { target: CREDIT_SERVICE_URL, rewrite: stripApiPrefix },
      // user-service: public paths are rewritten to the service's own routes
      '^/api/v1/auth/(login|register)$': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/whoami$': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/users/[^/]+/role$': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/users/[^/]+/(suspend|restore)$': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      // (matched against the URL including its query string, e.g. ?limit=50)
      '^/api/v1/admin/audit(/verify)?(\\?|$)': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/admin/login-events(\\?|$)': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/admin/accounts(/[^/?]+)?(\\?|$)': { target: USER_SERVICE_URL, rewrite: stripApiPrefix },
      // (user-service's /auth/verify is intentionally NOT listed: it is for services only)

      // order-service: public paths are rewritten to the service's own routes
      '^/api/v1/errands': { target: ORDER_SERVICE_URL, rewrite: stripApiPrefix },
      '^/api/v1/admin/errands': { target: ORDER_SERVICE_URL, rewrite: stripApiPrefix },

      // supplier-service: its routes already match the public paths, so no rewrite
      '/api/v1/suppliers': { target: SUPPLIER_SERVICE_URL },
      '/assets/suppliers': { target: SUPPLIER_SERVICE_URL },
    },
  },
})
