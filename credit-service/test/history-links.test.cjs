// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
// Scope: Tested human-specified history-link CHECK, partial uniqueness and transactional migration rollback.
// Author review: I reviewed that the test specification is correct.
// Prompts/key responses: ../ai/usage-log.md, entry 039.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const latest = '008_history_links_and_uniqueness.sql';
const index = 'credit_history_reservation_type_once_unique';
const check = 'credit_history_links_check';

test('history links and once-per-reservation event migration', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for history constraint checks.',
}, async (t) => {
  const schema = 'history_links_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  let connected = false;
  const apply = async (name) => {
    await client.query('BEGIN');
    try { await client.query(await readFile(join(__dirname, '../migrations', name), 'utf8')); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  };
  const reservation = async () => (await client.query(
    "INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, 'requester', 2, 1) RETURNING *", [randomUUID()],
  )).rows[0];
  const insert = (type, total, reserved, orderId, reservationId, userId = 'requester') => client.query(
    'INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change, order_id, reservation_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [userId, type, total, reserved, orderId, reservationId],
  );
  const noPartialMigration = async () => {
    assert.equal((await client.query("SELECT conname FROM pg_constraint WHERE conrelid = 'credit_history'::regclass AND conname = $1", [check])).rowCount, 0);
    assert.equal((await client.query('SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2', [schema, index])).rowCount, 0);
  };
  try {
    await client.connect(); connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const file of (await readdir(join(__dirname, '../migrations'))).filter(name => /^\d+_.+\.sql$/.test(name) && name < latest).sort()) await apply(file);
    await client.query("INSERT INTO credit_accounts (user_id, total_credits) VALUES ('requester',10),('courier',10)");

    await t.test('bad legacy links reject the migration without partial changes or row loss', async () => {
      const r = await reservation();
      for (const [type, total, reserved, orderId, reservationId] of [
        ['RESERVED', 0, 2, null, null], ['RESERVED', 0, 2, r.order_id, null],
        ['RESERVED', 0, 2, null, r.reservation_id],
        ['INITIAL_GRANT', 10, 0, r.order_id, null], ['INITIAL_GRANT', 10, 0, null, r.reservation_id],
        ['INITIAL_GRANT', 10, 0, r.order_id, r.reservation_id],
      ]) {
        const { rows: [row] } = await insert(type, total, reserved, orderId, reservationId);
        await assert.rejects(apply(latest), error => error.code === '23514' && error.constraint === check);
        await noPartialMigration();
        assert.equal((await client.query('SELECT id FROM credit_history WHERE id = $1', [row.id])).rowCount, 1);
        await client.query('DELETE FROM credit_history WHERE id = $1', [row.id]);
      }
    });

    await t.test('duplicate legacy reservation events reject the index and roll back the added CHECK', async () => {
      const r = await reservation();
      for (let i = 0; i < 2; i += 1) await insert('RESERVED', 0, 2, r.order_id, r.reservation_id);
      await assert.rejects(apply(latest), error => error.code === '23505' && error.constraint === index);
      await noPartialMigration();
      assert.equal((await client.query('SELECT id FROM credit_history WHERE reservation_id = $1', [r.reservation_id])).rowCount, 2);
      await client.query('DELETE FROM credit_history WHERE reservation_id = $1', [r.reservation_id]);
    });

    await apply(latest);
    await t.test('INITIAL_GRANT forbids both links and every other type requires both on insert and update', async () => {
      for (const [type, total, reserved] of [
        ['INITIAL_GRANT', 10, 0], ['RESERVED', 0, 2], ['RESERVATION_UPDATED', 0, 1],
        ['RELEASED', 0, -2], ['TRANSFER_OUT', -2, -2], ['TRANSFER_IN', 2, 0],
      ]) {
        const r = await reservation();
        for (const orderLinked of [false, true]) for (const reservationLinked of [false, true]) {
          const args = [type, total, reserved, orderLinked ? r.order_id : null, reservationLinked ? r.reservation_id : null];
          const valid = type === 'INITIAL_GRANT' ? !orderLinked && !reservationLinked : orderLinked && reservationLinked;
          if (valid) {
            const { rows: [entry] } = await insert(...args);
            const column = type === 'INITIAL_GRANT' ? 'order_id' : 'reservation_id';
            await assert.rejects(client.query(`UPDATE credit_history SET ${column} = $1 WHERE id = $2`, [type === 'INITIAL_GRANT' ? r.order_id : null, entry.id]), error => error.code === '23514' && error.constraint === check);
          } else await assert.rejects(insert(...args), error => error.code === '23514' && error.constraint === check);
        }
      }
    });

    await t.test('four event types are unique per reservation/type across users, while updates can repeat', async () => {
      const r = await reservation();
      for (const [type, total, reserved] of [['RESERVED', 0, 2], ['RELEASED', 0, -2], ['TRANSFER_OUT', -2, -2], ['TRANSFER_IN', 2, 0]]) {
        await insert(type, total, reserved, r.order_id, r.reservation_id);
        await assert.rejects(insert(type, total, reserved, r.order_id, r.reservation_id, 'courier'), error => error.code === '23505' && error.constraint === index);
        const other = await reservation();
        await insert(type, total, reserved, other.order_id, other.reservation_id);
      }
      const { rows: [entry] } = await insert('RESERVATION_UPDATED', 0, 1, r.order_id, r.reservation_id);
      await insert('RESERVATION_UPDATED', 0, -1, r.order_id, r.reservation_id);
      await assert.rejects(client.query("UPDATE credit_history SET type = 'RESERVED' WHERE id = $1", [entry.id]), error => error.code === '23505' && error.constraint === index);
    });
  } finally {
    try { if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.end(); }
  }
});
