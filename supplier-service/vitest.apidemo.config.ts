/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
 * Scope: Vitest config for the no-UI API suite (`npm run test:api-demo`). It runs only test/api-demo against an
 *        already-running Supplier Service (API_BASE_URL, default http://localhost:3002) whose USER_SERVICE_URL
 *        points at the stub started by test/api-demo/globalSetup.ts. No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review: Congchen
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/api-demo/**/*.apidemo.test.ts'],
    globalSetup: ['test/api-demo/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
