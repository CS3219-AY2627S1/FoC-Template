// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
// Scope: Tested human-requested database constraints and transactional migration failure on invalid legacy rows. Implemented/documented the human-defined history constraints and scoped SQL/seeded concurrency checks.
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entry 031, 039.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

test('database amount/version and history delta constraints', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for constraint checks.',
}, async (t) => {
  const schema = 'constraint_check_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const directory = join(__dirname, '../migrations');
  const latest = '007_credit_delta_constraints.sql';
  let connected = false;
  const apply = async (name) => {
    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(directory, name), 'utf8'));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  };
  const insertReservation = (amount, version) => client.query(
    'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, $4) RETURNING reservation_id',
    [randomUUID(), 'requester', amount, version],
  );
  try {
    await client.connect(); connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const migration of (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name) && name < latest).sort()) await apply(migration);
    await client.query("INSERT INTO credit_accounts (user_id, total_credits) VALUES ('requester', 10)");

    await t.test('invalid legacy reservations reject the migration without partial constraints or data loss', async () => {
      for (const [amount, version, constraint] of [
        [0, 1, 'reservations_credit_amount_positive'],
        [1, 0, 'reservations_version_positive'],
      ]) {
        const { rows: [row] } = await insertReservation(amount, version);
        await assert.rejects(apply(latest), (error) => error.code === '23514' && error.constraint === constraint);
        assert.equal((await client.query('SELECT credit_amount FROM reservations WHERE reservation_id = $1', [row.reservation_id])).rowCount, 1);
        const { rows } = await client.query("SELECT conname FROM pg_constraint WHERE conrelid = 'reservations'::regclass AND conname IN ('reservations_credit_amount_positive', 'reservations_version_positive')");
        assert.equal(rows.length, 0);
        await client.query('DELETE FROM reservations WHERE reservation_id = $1', [row.reservation_id]);
      }
    });

    await t.test('an invalid legacy history delta rejects the whole migration without rewriting rows', async () => {
      const { rows: [entry] } = await client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ('requester', 'RESERVED', 0, 0) RETURNING id");
      await assert.rejects(apply(latest), (error) => error.code === '23514' && error.constraint === 'credit_history_delta_check');
      assert.equal((await client.query('SELECT total_reserved_change FROM credit_history WHERE id = $1', [entry.id])).rows[0].total_reserved_change, 0);
      assert.equal((await client.query("SELECT conname FROM pg_constraint WHERE connamespace = current_schema()::regnamespace AND conname IN ('reservations_credit_amount_positive', 'reservations_version_positive', 'credit_history_delta_check')")).rowCount, 0);
      await client.query('DELETE FROM credit_history WHERE id = $1', [entry.id]);
    });

    await apply(latest);
    await apply('008_history_links_and_uniqueness.sql');
    await t.test('positive reservation values are accepted while zero/negative inserts and updates fail in PostgreSQL', async () => {
      const { rows: [row] } = await insertReservation(1, 1);
      for (const value of [0, -1, -2147483648]) {
        await assert.rejects(insertReservation(value, 1), (error) => error.code === '23514' && error.constraint === 'reservations_credit_amount_positive');
        await assert.rejects(insertReservation(1, value), (error) => error.code === '23514' && error.constraint === 'reservations_version_positive');
        for (const column of ['credit_amount', 'version']) {
          await assert.rejects(client.query(`UPDATE reservations SET ${column} = $1 WHERE reservation_id = $2`, [value, row.reservation_id]), (error) => error.code === '23514');
        }
      }
      await client.query('UPDATE reservations SET credit_amount = 2147483647, version = 2147483647 WHERE reservation_id = $1', [row.reservation_id]);
    });

    await t.test('history accepts only the confirmed per-operation signs, exact grant and equal transfer-out deltas', async () => {
      const rules = [
        ['INITIAL_GRANT', (total, reserved) => total === 10 && reserved === 0],
        ['RESERVED', (total, reserved) => total === 0 && reserved > 0],
        ['RESERVATION_UPDATED', (total, reserved) => total === 0 && reserved !== 0],
        ['RELEASED', (total, reserved) => total === 0 && reserved < 0],
        ['TRANSFER_OUT', (total, reserved) => total < 0 && reserved === total],
        ['TRANSFER_IN', (total, reserved) => total > 0 && reserved === 0],
      ];
      const values = [-2147483648, -3, -1, 0, 1, 3, 9, 10, 11, 2147483647];
      // A fresh user per accepted grant avoids masking CHECK failures with the unique-grant index.
      for (const [type, valid] of rules) {
        for (const total of values) for (const reserved of values) {
          const userId = randomUUID();
          await client.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, 10)', [userId]);
          const r = type === 'INITIAL_GRANT' ? undefined : (await client.query(
            'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1,$2,1,1) RETURNING *', [randomUUID(), userId],
          )).rows[0];
          const insert = () => client.query('INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change, order_id, reservation_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [userId, type, total, reserved, r?.order_id ?? null, r?.reservation_id ?? null]);
          if (valid(total, reserved)) {
            const { rows: [entry] } = await insert();
            // Direct SQL updates must obey the same rule, including a disallowed zero pair.
            await assert.rejects(client.query('UPDATE credit_history SET total_amount_change = 0, total_reserved_change = 0 WHERE id = $1', [entry.id]), (error) => error.code === '23514' && error.constraint === 'credit_history_delta_check');
          } else {
            await assert.rejects(insert(), (error) => error.code === '23514' && error.constraint === 'credit_history_delta_check', `${type} (${total}, ${reserved})`);
          }
        }
      }
    });
  } finally {
    try { if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.end(); }
  }
});
