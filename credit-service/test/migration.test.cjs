// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Generated CLI validation and PostgreSQL integration checks for migration commit and rollback behavior. Relocated the human-selected migration runner and updated references while making scripts/docs local-only.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–024, 034.
// Entry 048: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
// Scope: Tested tracked migration prefixes, resume/skip/failure behavior and concurrent-run locking.
// Changes await human review; prompts/key responses: ../ai/usage-log.md, entry 048.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { mkdtemp, writeFile, copyFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, delimiter } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const execute = promisify(execFile);
const script = join(__dirname, '../migrations/run-migrations.cjs');
const fixtureHeader = [
  '-- AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).',
  '-- Scope: Temporary migration fixture; human review pending.',
  '-- Prompts/key responses: credit-service/ai/usage-log.md, entry 048.',
  '-- AI-generated; human review pending.', '',
].join('\n');
const skip = !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for migration checks.';

test('CLI rejects malformed arguments before connecting', async () => {
  for (const args of [['--to'], ['--to', ''], ['001_initial.sql'], ['--unknown', '001_initial.sql'], ['--to', '001_initial.sql', 'extra']]) {
    await assert.rejects(execute(process.execPath, [script, ...args]), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Usage:/);
      return true;
    });
  }
});

test('CLI requires an explicit target database with or without a stop point', async () => {
  const env = { ...process.env };
  delete env.PGDATABASE;
  for (const args of [[], ['--to', '001_initial.sql']]) {
    await assert.rejects(execute(process.execPath, [script, ...args], { env }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Set PGDATABASE explicitly/);
      return true;
    });
  }
});

test('unknown or path-based stop points fail before any database connection', async () => {
  for (const target of ['does-not-exist.sql', '../001_initial.sql', 'migrations/001_initial.sql']) {
    await assert.rejects(execute(process.execPath, [script, '--to', target], {
      env: { ...process.env, PGDATABASE: 'unused', PGHOST: '127.0.0.1', PGPORT: '1' },
    }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Unknown migration target:/);
      assert.ok(!error.stderr.includes('ECONNREFUSED'));
      return true;
    });
  }
});

async function fixtures(body) {
  const schema = 'migration_check_' + randomUUID().replaceAll('-', '');
  const folder = await mkdtemp(join(tmpdir(), 'credit-migration-check-'));
  const runner = join(folder, 'run-migrations.cjs');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const env = {
    ...process.env,
    PGOPTIONS: '-c search_path=' + schema,
    NODE_PATH: [join(__dirname, '../../node_modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter),
  };
  let connected = false;
  try {
    await copyFile(script, runner);
    await client.connect(); connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const write = (name, sql) => writeFile(join(folder, name), fixtureHeader + sql);
    const run = (args = [], overrides = {}) => execute(process.execPath, [runner, ...args], { env: { ...env, ...overrides } });
    await body({ client, write, run, schema });
  } finally {
    try { if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.end(); await rm(folder, { recursive: true, force: true }); }
  }
}

test('inclusive stop points, tracked skipping, atomic failure and repaired-file resume', { skip }, async () => fixtures(async ({ client, write, run }) => {
  const names = ['001_first.sql', '002_second.sql', '003_failure.sql', '004_later.sql'];
  await write(names[0], 'CREATE TABLE values_applied (value integer NOT NULL); INSERT INTO values_applied VALUES (42);');
  await write(names[1], 'INSERT INTO values_applied VALUES (43);');
  await write(names[2], 'CREATE TABLE rolled_back_row (value integer); INSERT INTO values_applied VALUES (99); SELECT 1 / 0;');
  await write(names[3], 'INSERT INTO values_applied VALUES (45);');
  const rows = async () => (await client.query('SELECT value FROM values_applied ORDER BY value')).rows;
  const records = async () => (await client.query('SELECT filename, applied_at, success FROM credit_migrations ORDER BY filename')).rows;

  const first = await run(['--to', names[0]]);
  assert.match(first.stdout, /Applied migration: 001_first.sql/);
  assert.deepEqual(await rows(), [{ value: 42 }]);
  assert.deepEqual((await records()).map(row => [row.filename, row.success]), [[names[0], true]]);
  await run(['--to', names[1]]);
  assert.deepEqual(await rows(), [{ value: 42 }, { value: 43 }]);
  const beforeNoop = await records();
  assert.ok(!(await run(['--to', names[0]])).stdout.includes('Applied migration:'));
  assert.deepEqual(await records(), beforeNoop);

  await assert.rejects(run(), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /003_failure.sql: division by zero/);
    return true;
  });
  assert.equal((await client.query("SELECT to_regclass('rolled_back_row') AS name")).rows[0].name, null);
  assert.deepEqual(await rows(), [{ value: 42 }, { value: 43 }]);
  const failed = await records();
  assert.deepEqual(failed.map(row => [row.filename, row.success]), [[names[0], true], [names[1], true], [names[2], false]]);
  assert.ok(failed.every(row => row.applied_at instanceof Date));
  await run(['--to', names[1]]);
  assert.deepEqual(await records(), failed, 'A failed migration after the stop point must not be retried');

  await write(names[2], 'INSERT INTO values_applied VALUES (44);');
  await run(['--to', names[2]]);
  const repaired = await records();
  assert.equal(repaired.length, 3);
  assert.equal(repaired[2].success, true);
  assert.ok(repaired[2].applied_at > failed[2].applied_at);
  assert.deepEqual(await rows(), [{ value: 42 }, { value: 43 }, { value: 44 }]);
  await run();
  assert.deepEqual(await rows(), [42, 43, 44, 45].map(value => ({ value })));
  const completed = await records();
  assert.equal(completed.length, 4);
  assert.ok(completed.every(row => row.success));
  assert.ok(!(await run()).stdout.includes('Applied migration:'));
  assert.deepEqual(await records(), completed);
}));

test('concurrent migration runs wait for the advisory lock and apply each file once', { skip }, async () => fixtures(async ({ client, write, run }) => {
  await write('001_once.sql', 'CREATE TABLE once_only (value integer); INSERT INTO once_only VALUES (1);');
  const application = 'migration_lock_' + randomUUID().replaceAll('-', '');
  await client.query("SELECT pg_advisory_lock(hashtext('credit_migrations'))");
  const pending = Promise.allSettled([
    run(['--to', '001_once.sql'], { PGAPPNAME: application }),
    run(['--to', '001_once.sql'], { PGAPPNAME: application }),
  ]);
  let results;
  try {
    const end = Date.now() + 5000;
    let waiting = 0;
    while (Date.now() < end) {
      waiting = (await client.query("SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1 AND wait_event_type = 'Lock'", [application])).rows[0].count;
      if (waiting === 2) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(waiting, 2, 'Both runners must wait for the same migration lock');
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('credit_migrations'))");
    results = await pending;
  }
  assert.ok(results.every(result => result.status === 'fulfilled'));
  assert.deepEqual((await client.query('SELECT value FROM once_only')).rows, [{ value: 1 }]);
  assert.deepEqual((await client.query('SELECT filename, success FROM credit_migrations')).rows, [{ filename: '001_once.sql', success: true }]);
  assert.equal(results.filter(result => result.value.stdout.includes('Applied migration:')).length, 1);
}));
