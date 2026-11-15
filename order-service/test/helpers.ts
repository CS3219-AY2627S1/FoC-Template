/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Test helper: a throwaway database with the real migrations applied. Adapted from
 *        credit-service/test/helpers.ts (branch_credit), createTestDatabase only.
 * Author review: Reviewed and approved by @mattis.
 */
import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { migrate } from "../src/migrations";

// TEST_DATABASE_URL must point at a disposable PostgreSQL server as a superuser (to create a
// database and the order_app role), e.g. postgres://postgres:postgres@localhost:55432/postgres
function adminUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (a superuser URL for a disposable PostgreSQL server)");
  return url;
}

export interface TestDatabase {
  pool: Pool;
  drop(): Promise<void>;
}

/** Creates a fresh database, applies migrations/*.sql, and returns a pool for it. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `order_test_${randomUUID().replace(/-/g, "")}`;
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    // The migrations grant to order_app; it is cluster-wide, so it may already exist
    await admin.query(`DO $$ BEGIN CREATE ROLE order_app NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  const migrator = new Client({ connectionString: url.toString() });
  await migrator.connect();
  const log = console.log;
  console.log = () => {}; // keep "Migrations: applied ..." out of the test output
  try {
    await migrate(migrator);
  } finally {
    console.log = log;
    await migrator.end();
  }

  const pool = new Pool({ connectionString: url.toString(), max: 20 });
  return {
    pool,
    async drop() {
      await pool.end();
      const c = new Client({ connectionString: adminUrl() });
      await c.connect();
      try {
        await c.query(`DROP DATABASE ${name} WITH (FORCE)`);
      } finally {
        await c.end();
      }
    },
  };
}
