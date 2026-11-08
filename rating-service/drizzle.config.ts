// AI Assistance Disclosure
// Tool: Claude Code (Claude Opus 5.5)
// Scope: Generated the drizzle-kit configuration.
// Reviewed by Ngooi Jun Sen.

import { defineConfig } from 'drizzle-kit';
import { sslRequired } from './src/config.js';

// drizzle-kit doesn't auto-load .env — load it so db:* commands see DATABASE_URL.
try {
  process.loadEnvFile();
} catch {
  // no .env — use process.env / default below
}

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://rating:rating@localhost:5433/rating_db';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL, ssl: sslRequired(DATABASE_URL) },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
