// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Generated CLI validation and PostgreSQL integration checks for migration commit and rollback behavior. Relocated the human-selected migration runner and updated references while making scripts/docs local-only.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–024, 034.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const execute = promisify(execFile);
const script = join(__dirname, '../migrations/apply-migration.cjs');
const fixtureHeader = [
  '-- AI Assistance Disclosure:',
  '-- Tool: OpenAI Codex (GPT-6), date: 2026-10-20 (Asia/Singapore).',
  '-- Scope: Temporary migration-test fixture; human review pending.',
  '-- Prompts and key responses: credit-service/ai/usage-log.md, entry 005.',
  '-- AI-generated; human review pending.',
  '',
].join('\n');

test('CLI rejects missing migration argument', async () => {
  await assert.rejects(execute(process.execPath, [script]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Usage:/);
    return true;
  });
});

test('CLI requires an explicit target database', async () => {
  const env = { ...process.env };
  delete env.PGDATABASE;
  await assert.rejects(execute(process.execPath, [script, 'example.sql'], { env }), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Set PGDATABASE explicitly/);
    return true;
  });
});

test('SQL migration commits success and rolls back failures', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables to run integration checks.',
}, async () => {
  // This randomly named schema contains only temporary test objects.
  const schema = 'migration_check_' + randomUUID().replaceAll('-', '');
  const folder = await mkdtemp(join(tmpdir(), 'credit-migration-check-'));
  const client = new Client({ connectionTimeoutMillis: 5000 });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    const success = join(folder, 'success.sql');
    await writeFile(success, fixtureHeader + `
      CREATE TABLE "${schema}".committed_row (value integer NOT NULL);
      INSERT INTO "${schema}".committed_row (value) VALUES (42);
    `);
    const applied = await execute(process.execPath, [script, success]);
    assert.match(applied.stdout, /Applied migration: success.sql/);
    assert.deepEqual((await client.query(`SELECT value FROM "${schema}".committed_row`)).rows, [{ value: 42 }]);

    // Reapplying fails visibly and preserves the existing committed data.
    await assert.rejects(execute(process.execPath, [script, success]), (error) => error.code === 1);
    assert.equal((await client.query(`SELECT count(*) FROM "${schema}".committed_row`)).rows[0].count, '1');

    const failure = join(folder, 'failure.sql');
    await writeFile(failure, fixtureHeader + `
      CREATE TABLE "${schema}".rolled_back_row (value integer);
      INSERT INTO "${schema}".committed_row (value) VALUES (99);
      SELECT 1 / 0;
    `);
    await assert.rejects(execute(process.execPath, [script, failure]), (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /division by zero/);
      return true;
    });
    const tables = await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
      [schema],
    );
    assert.deepEqual(tables.rows, [{ table_name: 'committed_row' }]);
    assert.deepEqual((await client.query(`SELECT value FROM "${schema}".committed_row`)).rows, [{ value: 42 }]);
  } finally {
    try {
      if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
      await rm(folder, { recursive: true, force: true });
    }
  }
});
