// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - vitest configuration.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-16: Week 7/8 catch-up - register the globalSetup that builds the test database.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/env.ts'],
    globalSetup: ['tests/setup/globalSetup.ts'],
    // Concurrency tests contend on the same balance rows on purpose; running files in
    // parallel would make their assertions depend on each other.
    fileParallelism: false,
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
});
