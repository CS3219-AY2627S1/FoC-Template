// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-26 (Asia/Singapore).
// Scope: Generated PostgreSQL tests for atomic initial grants, concurrent event duplicates, saved replay, inconsistent accounts, rollback/retry, and transaction advisory-lock release. Updated event-level permanent-error assertions for the human-edited handler. Removed the account timestamp write from the allocation-replay fixture. Refactored retry fixtures, counts and failure injection for metadata-free idempotency records.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–025, 037, 040, 045.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { Client, Pool } = require('pg');
require('tsx/cjs');
const { ValidationError } = require('../src/services/validation.ts');
const { CreditService } = require('../src/services/CreditService.ts');
const { SqlCreditRepository } = require('../src/repos/SqlCreditRepository.ts');
const { createUserCreatedHandler } = require('../src/events/userCreated.ts');

test('initialization rejects invalid user IDs before obtaining a database connection', async () => {
  let connections = 0;
  const service = new CreditService({
    async connect() { connections += 1; throw new Error('Must not connect'); },
  });
  for (const userId of ['', ' space', 'space ', 'control\ncharacter', 'x'.repeat(129)]) {
    await assert.rejects(service.initCredits({ userId }), ValidationError);
  }
  assert.equal(connections, 0);
});

test('initial grant transaction implements the human-specified event allocation rules', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables to run grant integration checks.',
}, async (t) => {
  t.mock.method(console, 'info', () => {});
  const schema = 'initial_grant_check_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: 8, connectionTimeoutMillis: 5000, options: '-c search_path=' + schema });
  const service = new CreditService(pool);
  const handler = createUserCreatedHandler(service);
  const deliver = (userId) => handler({
    payload: { type: 'user.created', eventId: randomUUID(), occurredAt: new Date().toISOString(), userId },
  });
  const counts = async (userId) => ({
    accounts: (await client.query('SELECT count(*) FROM credit_accounts WHERE user_id = $1', [userId])).rows[0].count,
    history: (await client.query('SELECT count(*) FROM credit_history WHERE user_id = $1', [userId])).rows[0].count,
    retries: (await client.query("SELECT count(*) FROM idempotency_records WHERE operation_type = 'init_credits' AND idempotency_key = $1", [userId])).rows[0].count,
  });
  let connected = false;

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of ['001_initial.sql','002_align_credit_contract.sql','003_uppercase_reservation_status.sql','004_reservation_invariants.sql']) {
      await client.query(await readFile(join(__dirname, '../migrations', name), 'utf8'));
    }
    await client.query("INSERT INTO credit_accounts (user_id, total_credits) VALUES ('legacy-grant', 10)");
    await client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ('legacy-grant', 'init_credits', 10, 0)");
    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(__dirname, '../migrations/005_initial_grant_history_type.sql'), 'utf8'));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    await client.query(await readFile(join(__dirname, '../migrations/006_history_types_and_paging.sql'), 'utf8'));

    for (const name of (await readdir(join(__dirname, '../migrations')))
      .filter(name => /^\d+_.+\.sql$/.test(name) && name > '006_history_types_and_paging.sql').sort()) {
      await client.query(await readFile(join(__dirname, '../migrations', name), 'utf8'));
    }

    await t.test('migration preserves legacy grant data with the confirmed history label', async () => {
      assert.equal((await client.query("SELECT type FROM credit_history WHERE user_id = 'legacy-grant'")).rows[0].type, 'INITIAL_GRANT');
      await assert.rejects(client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ('legacy-grant', 'init_credits', 10, 0)"), (error) => error.code === '23514');
    });

    await t.test('a new event creates one account, INITIAL_GRANT, and saved result', async () => {
      await deliver('new-user');
      assert.deepEqual(await counts('new-user'), { accounts: '1', history: '1', retries: '1' });
      const account = (await client.query("SELECT * FROM credit_accounts WHERE user_id = 'new-user'")).rows[0];
      assert.equal(account.total_credits, 10);
      assert.equal(account.reserved_credits, 0);
      const history = (await client.query("SELECT * FROM credit_history WHERE user_id = 'new-user'")).rows[0];
      assert.equal(history.type, 'INITIAL_GRANT');
      assert.equal(history.total_amount_change, 10);
      assert.equal(history.total_reserved_change, 0);
      assert.equal(history.order_id, null);
      assert.equal(history.reservation_id, null);
      const record = (await client.query("SELECT * FROM idempotency_records WHERE operation_type = 'init_credits' AND idempotency_key = 'new-user'")).rows[0];
      assert.equal(record.operation_type, 'init_credits');
      assert.equal(record.idempotency_key, 'new-user');
      assert.equal(record.request_hash, createHash('sha256').update(JSON.stringify(['INIT', 'new-user']), 'utf8').digest('hex'));
      assert.deepEqual(record.result, { totalCredits: 10, reservedCredits: 0, availableCredits: 10 });
    });

    await t.test('parallel different events for one user allocate exactly once', async () => {
      await Promise.all(Array.from({ length: 24 }, () => deliver('concurrent-user')));
      assert.deepEqual(await counts('concurrent-user'), { accounts: '1', history: '1', retries: '1' });
      assert.equal((await client.query("SELECT total_credits FROM credit_accounts WHERE user_id = 'concurrent-user'")).rows[0].total_credits, 10);
    });

    await t.test('saved success is replayed after later balance changes, with no new writes', async () => {
      await client.query("UPDATE credit_accounts SET total_credits = 8, reserved_credits = 2 WHERE user_id = 'new-user'");
      const before = (await client.query("SELECT * FROM credit_accounts WHERE user_id = 'new-user'")).rows[0];
      assert.deepEqual(await service.initCredits({ userId: 'new-user' }), {
        totalCredits: 10, reservedCredits: 0, availableCredits: 10,
      });
      assert.deepEqual((await client.query("SELECT * FROM credit_accounts WHERE user_id = 'new-user'")).rows[0], before);
      assert.deepEqual(await counts('new-user'), { accounts: '1', history: '1', retries: '1' });
    });

    await t.test('confirmed history without a retry record succeeds with no writes', async () => {
      const before = (await client.query("SELECT * FROM credit_accounts WHERE user_id = 'legacy-grant'")).rows[0];
      await deliver('legacy-grant');
      assert.deepEqual((await client.query("SELECT * FROM credit_accounts WHERE user_id = 'legacy-grant'")).rows[0], before);
      assert.deepEqual(await counts('legacy-grant'), { accounts: '1', history: '1', retries: '0' });
    });

    await t.test('an existing unconfirmed account rejects without a grant, history, or retry record', async () => {
      await client.query("INSERT INTO credit_accounts (user_id, total_credits) VALUES ('inconsistent-user', 4)");
      const before = (await client.query("SELECT * FROM credit_accounts WHERE user_id = 'inconsistent-user'")).rows[0];
      await assert.rejects(deliver('inconsistent-user'), (error) => error.cause?.code === 'ALREADY_EXISTS');
      assert.deepEqual((await client.query("SELECT * FROM credit_accounts WHERE user_id = 'inconsistent-user'")).rows[0], before);
      assert.deepEqual(await counts('inconsistent-user'), { accounts: '1', history: '0', retries: '0' });
    });

    await t.test('a changed hash under the same operation/key is rejected with no writes', async () => {
      await client.query(
        'INSERT INTO idempotency_records (operation_type, idempotency_key, request_hash, result) VALUES ($1, $2, $3, $4)',
        ['init_credits', 'mismatch-user', 'different-request', { totalCredits: 10, reservedCredits: 0, availableCredits: 10 }],
      );
      await assert.rejects(deliver('mismatch-user'), (error) => error.cause?.code === 'FAILED_PRECONDITION');
      assert.deepEqual(await counts('mismatch-user'), { accounts: '0', history: '0', retries: '1' });
      assert.equal((await client.query("SELECT request_hash FROM idempotency_records WHERE operation_type = 'init_credits' AND idempotency_key = 'mismatch-user'")).rows[0].request_hash, 'different-request');
    });

    await t.test('failure at history or saved-result insertion rolls back all writes and allows retry', async () => {
      for (const [table, userId] of [['credit_history', 'fail-history'], ['idempotency_records', 'fail-result']]) {
        await client.query(`
          CREATE FUNCTION fail_initial_write() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.${table === 'idempotency_records' ? 'idempotency_key' : 'user_id'} = '${userId}' THEN RAISE EXCEPTION 'injected allocation failure'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER fail_initial_write BEFORE INSERT ON ${table}
          FOR EACH ROW EXECUTE FUNCTION fail_initial_write();
        `);
        try {
          await assert.rejects(deliver(userId), (error) => error.code === 'P0001');
          assert.deepEqual(await counts(userId), { accounts: '0', history: '0', retries: '0' });
        } finally {
          await client.query(`DROP TRIGGER fail_initial_write ON ${table}; DROP FUNCTION fail_initial_write()`);
        }
        await deliver(userId);
        assert.deepEqual(await counts(userId), { accounts: '1', history: '1', retries: '1' });
      }
    });

    await t.test('an advisory-lock timeout makes no writes and a later delivery succeeds', async () => {
      const holding = await pool.connect();
      const impatientPool = new Pool({
        max: 1, connectionTimeoutMillis: 5000,
        options: '-c search_path=' + schema + ' -c lock_timeout=50ms',
      });
      const impatient = new CreditService(impatientPool);
      try {
        await holding.query('BEGIN');
        await new SqlCreditRepository(holding).lockKey('init_credits', 'locked-user');
        await assert.rejects(impatient.initCredits({ userId: 'locked-user' }), (error) => error.code === '55P03');
        assert.deepEqual(await counts('locked-user'), { accounts: '0', history: '0', retries: '0' });
      } finally {
        await holding.query('ROLLBACK');
        holding.release();
        await impatientPool.end();
      }
      await deliver('locked-user');
      assert.deepEqual(await counts('locked-user'), { accounts: '1', history: '1', retries: '1' });
    });

    await t.test('repository locks exact signed bigint vectors and releases on commit and rollback', async () => {
      assert.equal((await client.query("SELECT to_regprocedure('pg_advisory_xact_lock(bigint)') IS NOT NULL AS present")).rows[0].present, true);
      const first = await pool.connect();
      const second = await pool.connect();
      try {
        // Independent Python hashlib/struct vectors verify SQL parameter precision.
        for (const [namespace, key, lock, finish] of [
          ['init_credits', 'user-1', '-6861169219867473191', 'COMMIT'],
          ['namespace', 'key', '4125542390088161614', 'ROLLBACK'],
        ]) {
          await first.query('BEGIN');
          await new SqlCreditRepository(first).lockKey(namespace, key);
          await second.query('BEGIN');
          assert.equal((await second.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired', [lock])).rows[0].acquired, false);
          await first.query(finish);
          assert.equal((await second.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired', [lock])).rows[0].acquired, true);
          await second.query('ROLLBACK');
        }
      } finally {
        await first.query('ROLLBACK');
        await second.query('ROLLBACK');
        first.release();
        second.release();
      }
    });
  } finally {
    try {
      await pool.end();
      if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  }
});
