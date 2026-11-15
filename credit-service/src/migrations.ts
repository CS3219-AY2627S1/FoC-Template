/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: The User Service migration runner design (user-service/src/migrate.ts), reused for the
 *        Credit Service: numbered .sql files, forward-only, each file in its own transaction,
 *        checksums of applied files, refuse to continue on any failure. Split out of
 *        migrate.ts so the tests apply migrations the same way.
 * Author review: Reviewed and approved by @phuc
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const FILE_RE = /^(\d{4})_[a-z0-9_]+\.sql$/;

export class MigrationError extends Error {}

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
      throw new MigrationError(`Unexpected file in migrations/: ${name} (expected e.g. 0002_add_index.sql)`);
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

/** Applies every pending migration. The caller holds the migration lock. */
export async function migrate(client: Client): Promise<void> {
  const files = readMigrationFiles();

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
