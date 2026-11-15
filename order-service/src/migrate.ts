/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Copied from credit-service/src/migrate.ts (branch_credit) and adapted: lock ID 3219102
 *        (distinct from User 3219001-3219003 and Credit 3219101), order-migrate service.
 * Author review: Reviewed and approved by @mattis.
 */
import { Client } from "pg";
import { loadDatabaseConfig } from "./config";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";
import { migrate } from "./migrations";

// Run with: node dist/migrate.js (the order-migrate Compose service does this).
// Connects as the migration role; the running service never runs this.

// Own database, but kept distinct from the User (3219001 to 3219003) and Credit (3219101) lock IDs
const MIGRATION_LOCK_ID = 3219102;

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
