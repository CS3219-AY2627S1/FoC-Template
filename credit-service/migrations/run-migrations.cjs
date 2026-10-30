// AI Assistance Disclosure: Claude Code (Opus 5.5), 2026-10-23 (Asia/Singapore).
// Mode/scope: Implemented the human-specified migration runner design.
// Review: Human reviewed: specified the design, read through the code line by line,
// and ran manual tests.
// Exact prompts, key responses and checks: ai/usage-log.md, entry 046.

// Applies every migrations/*.sql in filename order. Each file runs in its own
// transaction; on failure that file is rolled back and the run stops. The
// credit_migrations table keeps one row per file with its latest attempt time and
// outcome; files already recorded as successful are skipped. An advisory lock stops
// two runs from applying migrations at the same time. Connects via the PG* env vars.
const { readdir, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Client } = require('pg');

const RECORD = `INSERT INTO credit_migrations (filename, applied_at, success)
  VALUES ($1, now(), $2)
  ON CONFLICT (filename) DO UPDATE SET applied_at = now(), success = EXCLUDED.success`;

async function main() {
  if (!process.env.PGDATABASE) {
    throw new Error('Set PGDATABASE explicitly before applying migrations.');
  }
  const files = (await readdir(__dirname)).filter((f) => f.endsWith('.sql')).sort();
  const client = new Client({ connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('credit_migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS credit_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL,
      success    boolean NOT NULL
    )`);
    const { rows } = await client.query('SELECT filename FROM credit_migrations WHERE success');
    const done = new Set(rows.map((row) => row.filename));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(__dirname, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(RECORD, [file, true]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        // Recorded after the rollback, so the failure itself is kept.
        await client.query(RECORD, [file, false]);
        throw new Error(file + ': ' + error.message);
      }
      console.log('Applied migration: ' + file);
    }
    console.log('Migrations up to date.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
