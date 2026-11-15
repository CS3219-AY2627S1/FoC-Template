/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-6), date: 2026-09-27
 * Scope: Configured the isolated real-browser Supplier UI verification for
 * issue #31.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), date: 2026-10-18
 * Scope: Made the issue #42 CI behavior explicit by forbidding focused tests,
 * disabling retries, and bounding the complete browser run.
 * Author review: Pending project-author review.
 */
import { defineConfig } from '@playwright/test'

const baseURL = process.env.SUPPLIER_UI_BASE_URL

if (!baseURL) {
  throw new Error('SUPPLIER_UI_BASE_URL is required. Run npm run test:e2e to start the disposable stack.')
}

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  globalTimeout: 15 * 60 * 1000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
