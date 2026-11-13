// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-26 (Asia/Singapore).
// Scope: Generated PostgreSQL integration checks for human-specified reservation invariants and migration rollback. Updated rollback retry/history fixtures to the current migrated schema.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–024, 045.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const migrationNames = [
  '001_initial.sql',
  '002_align_credit_contract.sql',
  '003_uppercase_reservation_status.sql',
  '004_reservation_invariants.sql',
];

test('reservation invariants preserve lifetime identity and consistent settlement', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables to run PostgreSQL checks.',
}, async (t) => {
  const schema = 'reservation_check_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  let connected = false;
  const apply = async (name) => {
    const sql = await readFile(join(__dirname, '../migrations', name), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };
  const rejectConstraint = (sql, values, constraint, code = '23514') =>
    assert.rejects(client.query(sql, values), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.constraint, constraint);
      return true;
    });

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of migrationNames.slice(0, 3)) await apply(name);
    await client.query(
      'INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, $2), ($3, $4)',
      ['requester', 10, 'courier', 10],
    );
    const orderId = randomUUID();
    const { rows: [original] } = await client.query(
      'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, $4) RETURNING *',
      [orderId, 'requester', 3, 1],
    );

    await t.test('invalid existing rows cause a fully rolled-back migration without rewriting data', async () => {
      await client.query("UPDATE reservations SET status = 'SETTLED' WHERE order_id = $1", [orderId]);
      await assert.rejects(apply(migrationNames[3]), (error) => error.code === '23514');
      assert.equal((await client.query(
        'SELECT count(*) FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2',
        [schema + '.reservations', 'reservations_order_id_unique'],
      )).rows[0].count, '0');
      const { rows: [unchanged] } = await client.query('SELECT * FROM reservations WHERE order_id = $1', [orderId]);
      assert.equal(unchanged.status, 'SETTLED');
      assert.equal(unchanged.courier_id, null);
      assert.equal(unchanged.version, 1);
      await client.query("UPDATE reservations SET status = 'RESERVED' WHERE order_id = $1", [orderId]);
      await apply(migrationNames[3]);
      assert.deepEqual((await client.query('SELECT * FROM reservations WHERE order_id = $1', [orderId])).rows[0], original);
    });

    for (const name of (await readdir(join(__dirname, '../migrations')))
      .filter(name => /^\d+_.+\.sql$/.test(name) && name > migrationNames[3]).sort()) await apply(name);

    await t.test('an order cannot receive a second reservation, including after release or settlement', async () => {
      const insert = 'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, $4)';
      for (const [state, courier] of [['RESERVED', null], ['RELEASED', null], ['SETTLED', 'courier']]) {
        await client.query('UPDATE reservations SET status = $1, courier_id = $2 WHERE order_id = $3', [state, courier, orderId]);
        await rejectConstraint(insert, [orderId, 'requester', 3, 1], 'reservations_order_id_unique', '23505');
        assert.equal((await client.query('SELECT count(*) FROM reservations WHERE order_id = $1', [orderId])).rows[0].count, '1');
      }
    });

    await t.test('only settled reservations have couriers, with distinct participants', async () => {
      await client.query("UPDATE reservations SET status = 'RESERVED', courier_id = NULL WHERE order_id = $1", [orderId]);
      await rejectConstraint(
        "UPDATE reservations SET status = 'SETTLED' WHERE order_id = $1",
        [orderId], 'reservations_settled_courier_check',
      );
      for (const state of ['RESERVED', 'RELEASED']) {
        await rejectConstraint(
          'UPDATE reservations SET status = $1, courier_id = $2 WHERE order_id = $3',
          [state, 'courier', orderId], 'reservations_settled_courier_check',
        );
      }
      await rejectConstraint(
        "UPDATE reservations SET status = 'SETTLED', courier_id = requester_id WHERE order_id = $1",
        [orderId], 'reservations_distinct_participants_check',
      );
      await client.query(
        "UPDATE reservations SET status = 'SETTLED', courier_id = $1, version = version + 1 WHERE order_id = $2",
        ['courier', orderId],
      );
      const { rows: [settled] } = await client.query('SELECT * FROM reservations WHERE order_id = $1', [orderId]);
      assert.equal(settled.courier_id, 'courier');
      assert.equal(settled.status, 'SETTLED');
      assert.equal(settled.version, 2);
    });

    await t.test('a rejected constraint rolls back preceding balance, history, and retry writes', async () => {
      const before = (await client.query('SELECT * FROM credit_accounts WHERE user_id = $1', ['requester'])).rows[0];
      await client.query('BEGIN');
      try {
        await client.query('UPDATE credit_accounts SET reserved_credits = reserved_credits + 1 WHERE user_id = $1', ['requester']);
        await client.query(
          'INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change, order_id, reservation_id) VALUES ($1, $2, $3, $4, $5, $6)',
          ['requester', 'RESERVED', 0, 1, orderId, original.reservation_id],
        );
        await client.query(
          'INSERT INTO idempotency_records (operation_type, idempotency_key, request_hash, result) VALUES ($1, $2, $3, $4)',
          ['reserve', orderId, 'fixture-hash', {}],
        );
        await rejectConstraint(
          'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, $4)',
          [orderId, 'requester', 1, 1], 'reservations_order_id_unique', '23505',
        );
      } finally {
        await client.query('ROLLBACK');
      }
      assert.deepEqual((await client.query('SELECT * FROM credit_accounts WHERE user_id = $1', ['requester'])).rows[0], before);
      assert.equal((await client.query('SELECT count(*) FROM credit_history')).rows[0].count, '0');
      assert.equal((await client.query('SELECT count(*) FROM idempotency_records')).rows[0].count, '0');
    });
  } finally {
    try {
      if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  }
});
