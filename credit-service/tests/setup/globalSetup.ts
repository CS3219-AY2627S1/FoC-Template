// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-10-16
//  2026-10-16: Week 7/8 catch-up - builds a dedicated test database, following
//    user-service/tests/setup/globalSetup.ts. Also creates the least-privilege role so
//    the suite runs under the same privileges as production (NFR8.2.3).
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Reviewed and verified by Koh Wee Jean, 2026-11-10.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadTestEnv } from './env.js';

loadTestEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set in .env.test to run the suite`);
  return value;
}

/**
 * Drops and recreates the test database, applies the schema, then creates the
 * least-privilege role and grants.
 *
 * Runs as the database owner. The suite itself connects as `credit_app`, which has no
 * DELETE anywhere — that is the point of NFR8.2.3, and it is why tests cannot tidy up
 * after themselves. A fresh database per run replaces per-test cleanup; within a run,
 * tests stay isolated by using a fresh synthetic UUID per case.
 */
export async function setup(): Promise<void> {
  const host = required('DB_HOST');
  const port = Number(required('DB_PORT'));
  const testDb = required('DB_NAME');
  const ownerUser = required('DB_OWNER_USER');
  const ownerPassword = required('DB_OWNER_PASSWORD');
  const appUser = required('DB_USER');
  const appPassword = required('DB_PASSWORD');

  if (!/_test$/.test(testDb)) {
    // Guard against pointing the suite at credit_db and dropping real data.
    throw new Error(`Refusing to drop "${testDb}": the test database name must end in _test`);
  }

  const maintenance = new pg.Client({
    host,
    port,
    database: 'postgres',
    user: ownerUser,
    password: ownerPassword,
  });
  await maintenance.connect();
  try {
    // FORCE terminates leftover connections from an interrupted run (PostgreSQL 13+).
    await maintenance.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${testDb}`);

    // Roles are cluster-wide, so the suite uses its OWN role rather than the one the
    // running service connects as. Altering a shared role's password here would break
    // a live credit-service container.
    if (appUser === 'credit_app') {
      throw new Error(
        'DB_USER in .env.test must not be credit_app: that role belongs to the running ' +
          'service. Use a test-only role such as credit_app_test.',
      );
    }
    await maintenance.query(`
      DO $$ BEGIN
        CREATE ROLE ${appUser} LOGIN PASSWORD '${appPassword}';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await maintenance.query(`ALTER ROLE ${appUser} WITH PASSWORD '${appPassword}'`);
  } finally {
    await maintenance.end();
  }

  const target = new pg.Client({
    host,
    port,
    database: testDb,
    user: ownerUser,
    password: ownerPassword,
  });
  await target.connect();
  try {
    const dbDir = resolve(process.cwd(), 'src', 'db');
    // Same two files the container bootstrap applies, so the suite and production
    // cannot drift apart.
    await target.query(readFileSync(resolve(dbDir, 'init.sql'), 'utf8'));
    // grants.sql names the production role. Retarget it at the test role so the suite
    // runs under an identical privilege set without touching the real one.
    const grants = readFileSync(resolve(dbDir, 'grants.sql'), 'utf8').replaceAll(
      'credit_app',
      appUser,
    );
    await target.query(grants);
  } finally {
    await target.end();
  }
}
