// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5), date: 2026-09-26
// 26/09/2026: Stage 7 - recreate the test database from init.sql before each run
// Author review:
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Drops and recreates the test database, then applies the real init.sql, so the test schema
// cannot drift from the real one. Connects to the maintenance database for the drop/create.
export default async function setup(): Promise<void> {
  dotenv.config({ path: resolve(root, '.env.test') });
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_NAME || !DB_NAME.endsWith('_test')) {
    throw new Error(`Refusing to reset database '${DB_NAME}': test DB name must end with _test`);
  }

  const connection = {
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
  };

  const admin = new pg.Client({ ...connection, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  } finally {
    await admin.end();
  }

  const testDb = new pg.Client({ ...connection, database: DB_NAME });
  await testDb.connect();
  try {
    await testDb.query(readFileSync(resolve(root, 'src/db/init.sql'), 'utf8'));
  } finally {
    await testDb.end();
  }
}
