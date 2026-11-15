/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Migration entry point, following user-service/src/migrate.ts: retry the connection
 *        (not the migrations) while the database is unreachable, one run at a time.
 * Author review: Reviewed and approved by @phuc
 */
import { Client } from "pg";
import { loadDatabaseConfig } from "./config";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";
import { migrate } from "./migrations";

// Run with: node dist/migrate.js (the credit-migrate Compose service does this).
// Connects as the migration role; the running service never runs this.

// Own database, but kept distinct from the User Service lock IDs (3219001 to 3219003)
const MIGRATION_LOCK_ID = 3219101;

async function connect(): Promise<Client> {
  // A Client cannot reconnect after a failed connect(), so each attempt uses a new one
  const client = new Client({ connectionString: loadDatabaseConfig().databaseUrl });
  try {
    await client.connect();
    return client;
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
}

async function main(): Promise<void> {
  // Only the connection is retried: a failed migration is never re-run automatically
  const client = await retryWhileDatabaseUnavailable("Migrations", connect);
  try {
    // Released automatically when the connection closes
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(client);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migrations failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
