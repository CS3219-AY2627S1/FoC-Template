/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-01
 * Scope: Credit Service tests, drafted and edited with Claude Code.
 * Reviewed by Don Lee
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { ADMIN_DATABASE_URL, TEST_DATABASE_URL } from './constants';

// Runs once before the whole suite: create credit_test (if absent) and apply
// the generated migrations to it. Re-running is safe — CREATE is skipped when
// the DB exists and migrate skips already-applied migrations.
export default async function setup(): Promise<void> {
  const admin = postgres(ADMIN_DATABASE_URL, { max: 1 });
  try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = 'credit_test'`;
    if (existing.length === 0) {
      await admin.unsafe('CREATE DATABASE credit_test');
    }
  } finally {
    await admin.end();
  }

  const client = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' });
  } finally {
    await client.end();
  }
}
