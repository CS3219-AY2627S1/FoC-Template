// Additional AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status publishing and verification. Author review: Reviewed and approved by @phuc.
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Implemented the author's migration runner design: hand-written numbered .sql files,
 *        forward-only, one run at a time (advisory lock), each file in its own transaction,
 *        checksums of applied files, refuse to continue on any failure.
 * Author review: Reviewed and approved by @t-leongchuan
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-09
 * Scope: Retry the connection (not the migrations) while the database is unreachable, using
 *        the shared helper and timings.
 * Author review of additional changes: Reviewed and approved by @t-leongchuan
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client, DatabaseError } from "pg";
import { loadDatabaseConfig } from "./config";
import { retryWhileDatabaseUnavailable } from "./dbAvailability";

// Run with: node dist/migrate.js (the user-migrate Compose service does this).
// Connects as the migration role; the running service never runs this.

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;
// Distinct from the bootstrap (3219001) and role-change (3219002) locks
const MIGRATION_LOCK_ID = 3219003;
const RESET_HINT = "Run user-service/scripts/reset-db.sh from the repository root to reset your local User Service database.";

class MigrationError extends Error {}

interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

function readMigrationFiles(): MigrationFile[] {
  const names = readdirSync(MIGRATIONS_DIR).sort();
  const seen = new Set<string>();
  return names.map((name) => {
    const match = FILE_RE.exec(name);
    if (!match) {
      throw new MigrationError(`Unexpected file in migrations/: ${name} (expected e.g. 0002_add_audit_log.sql)`);
    }
    if (seen.has(match[1])) {
      throw new MigrationError(`Two migrations share the number ${match[1]}`);
    }
    seen.add(match[1]);
    const sql = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
    // Line endings are normalised so a Windows checkout (CRLF) gives the same checksum
    const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
    return { name, sql, checksum };
  });
}

export async function migrate(client: Client): Promise<void> {
  const files = readMigrationFiles();

  const tables = await client.query(
    "SELECT to_regclass('schema_migrations') AS tracking, to_regclass('users') AS users",
  );
  if (!tables.rows[0].tracking && tables.rows[0].users) {
    throw new MigrationError(`This database was created before migrations were introduced. ${RESET_HINT}`);
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Map<string, string>();
  for (const row of (await client.query("SELECT name, checksum FROM schema_migrations")).rows) {
    applied.set(row.name, row.checksum);
  }

  // Forward-only: applied migrations must still exist, unchanged
  const fileNames = new Set(files.map((f) => f.name));
  for (const name of applied.keys()) {
    if (!fileNames.has(name)) {
      throw new MigrationError(`Applied migration ${name} is missing from migrations/`);
    }
  }
  for (const file of files) {
    const checksum = applied.get(file.name);
    if (checksum && checksum !== file.checksum) {
      throw new MigrationError(
        `Applied migration ${file.name} has been edited. Never edit a merged migration; add a new one instead.`,
      );
    }
  }

  const pending = files.filter((f) => !applied.has(f.name));
  if (pending.length === 0) {
    console.log("Migrations: database is up to date");
    return;
  }

  for (const file of pending) {
    try {
      await client.query("BEGIN");
      await client.query(file.sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [file.name, file.checksum]);
      await client.query("COMMIT");
      console.log(`Migrations: applied ${file.name}`);
    } catch (err) {
      await client.query("ROLLBACK");
      const reason = err instanceof Error ? err.message : String(err);
      throw new MigrationError(`${file.name} failed and was rolled back: ${reason}`);
    }
  }
}

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
  let client: Client;
  try {
    // Only the connection is retried: a failed migration is never re-run automatically
    client = await retryWhileDatabaseUnavailable("Migrations", connect);
  } catch (err) {
    // A database from before migrations has no migration role, so login fails
    if (err instanceof DatabaseError && (err.code === "28P01" || err.code === "28000")) {
      throw new MigrationError(`Could not log in as the migration role (${err.message}). ${RESET_HINT}`);
    }
    throw err;
  }

  try {
    // Released automatically when the connection closes
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(client);
  } finally {
    await client.end();
  }
}

if (require.main === module) main().catch((err) => {
  console.error("Migrations failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
