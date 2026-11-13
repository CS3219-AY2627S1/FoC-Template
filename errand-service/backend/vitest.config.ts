// AI Assistance Disclosure:
// Tool: Codex (ChatGPT-5.6 Sol)
// Date: 2026-10-26
// Scope: Generated and corrected Errand test-runner configuration.
// Author review: Reviewed the output and adjusted configuration to fit project
// requirements.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false,
  },
})
