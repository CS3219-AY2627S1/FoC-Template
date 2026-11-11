/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the test database settings.
 * Reviewed by Ngooi Jun Sen.
 */

// Test database connection strings. No app imports here so this module is safe
// to load from vitest.config.ts.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://rating:rating@localhost:5433/rating_test';

// Maintenance DB used only to CREATE the test database.
export const ADMIN_DATABASE_URL =
  process.env.ADMIN_DATABASE_URL ?? 'postgres://rating:rating@localhost:5433/postgres';
