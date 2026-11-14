// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - loads .env before src/config.ts validates it.
//    Uses Node's built-in process.loadEnvFile rather than adding dotenv, keeping the
//    dependency list to the stack in credit-service-context.md §4.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean
//  2026-10-16: Week 7/8 catch-up - prefer .env.test so the suite never points at the
//    development database. Exported so globalSetup can reuse it.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads .env.test if present, falling back to .env.
 *
 * .env.test is committed and points at credit_db_test; the fallback exists only so a
 * checkout without it fails on a missing variable rather than silently doing nothing.
 */
export function loadTestEnv(): void {
  for (const name of ['.env.test', '.env']) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
  }
}

// Runs before the test module is imported, so config.ts sees the variables.
loadTestEnv();
