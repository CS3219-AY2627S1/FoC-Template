// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22-2026-10-26 (Asia/Singapore).
// Scope: Tested timestamp-removal upgrade preservation and credit operations on the resulting schema. Extended populated-data upgrade/replay checks to removed idempotency metadata.
// Author review: I reviewed that the test specification is correct.
// Prompts/key responses: ../ai/usage-log.md, entry 040, 045.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { Client, Pool } = require('pg');
require('tsx/cjs');
const { CreditService } = require('../src/services/CreditService.ts');
const { SqlCreditRepository } = require('../src/repos/SqlCreditRepository.ts');
const { assertLedgerInvariants } = require('./helpers/ledger-invariants.cjs');

test('account/reservation timestamps and idempotency metadata removal preserve data and credit operations', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for timestamp migration checks.',
}, async (t) => {
  t.mock.method(console, 'info', () => {});
  const schema = 'timestamp_removal_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: 2, connectionTimeoutMillis: 5000, options: '-c search_path=' + schema });
  const service = new CreditService(pool);
  const migration = '009_remove_account_reservation_timestamps.sql';
  const idempotencyMigration = '010_remove_idempotency_metadata.sql';
  const directory = join(__dirname, '../migrations');
  const users = ['requester', 'courier'];
  const orders = Array.from({ length: 3 }, () => randomUUID());
  const legacyReservations = [];
  let connected = false;
  const apply = async name => {
    await client.query('BEGIN');
    try { await client.query(await readFile(join(directory, name), 'utf8')); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  };
  const snapshot = async () => {
    const result = {};
    for (const table of ['credit_accounts', 'reservations', 'credit_history', 'idempotency_records']) {
      const value = ['credit_accounts', 'reservations'].includes(table)
        ? "to_jsonb(row) - 'created_at' - 'updated_at'"
        : table === 'idempotency_records' ? "to_jsonb(row) - 'user_id' - 'created_at'" : 'to_jsonb(row)';
      result[table] = (await client.query(`SELECT ${value} AS data FROM ${table} AS row ORDER BY (${value})::text`)).rows;
    }
    return result;
  };
  const verifyLedger = async () => {
    const reservationIds = (await client.query('SELECT reservation_id FROM reservations WHERE order_id = ANY($1::uuid[])', [orders]))
      .rows.map(row => row.reservation_id);
    await assertLedgerInvariants(client, { userIds: users, reservationIds }, 'timestamp-removal upgrade');
  };

  try {
    await client.connect(); connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name) && name < migration).sort()) await apply(name);
    // Legacy upgrade fixtures must supply the old NOT NULL user column before 010.
    // Current service/repository calls below run only after the full upgrade.
    const legacyResult = async (operation, key, userId, fields, result) => client.query(
      'INSERT INTO idempotency_records (operation_type, idempotency_key, user_id, request_hash, result) VALUES ($1,$2,$3,$4,$5)',
      [operation, key, userId, createHash('sha256').update(JSON.stringify(fields), 'utf8').digest('hex'), result],
    );
    for (const userId of users) {
      await client.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1,10)', [userId]);
      await client.query("INSERT INTO credit_history (user_id,type,total_amount_change,total_reserved_change) VALUES ($1,'INITIAL_GRANT',10,0)", [userId]);
      await legacyResult('init_credits', userId, userId, ['INIT', userId], {
        totalCredits: 10, reservedCredits: 0, availableCredits: 10,
      });
    }
    for (const [i, amount] of [3, 2, 1].entries()) {
      const { rows: [row] } = await client.query(
        'INSERT INTO reservations (order_id,requester_id,credit_amount,version) VALUES ($1,$2,$3,1) RETURNING reservation_id',
        [orders[i], users[0], amount],
      );
      await client.query('UPDATE credit_accounts SET reserved_credits = reserved_credits + $2 WHERE user_id = $1', [users[0], amount]);
      await client.query("INSERT INTO credit_history (user_id,order_id,reservation_id,type,total_amount_change,total_reserved_change) VALUES ($1,$2,$3,'RESERVED',0,$4)",
        [users[0], orders[i], row.reservation_id, amount]);
      const reservation = { orderId: orders[i], requesterId: users[0], amount, status: 'RESERVED', reservationId: row.reservation_id, version: 1 };
      legacyReservations.push(reservation);
      await legacyResult('reserve', orders[i], users[0], ['RESERVE', orders[i], users[0], amount], reservation);
    }
    await verifyLedger();

    await t.test('009/010 drop only the requested columns and preserve business rows and saved results', async () => {
      for (const table of ['credit_accounts', 'reservations']) {
        const row = (await client.query(`SELECT created_at, updated_at FROM ${table} LIMIT 1`)).rows[0];
        assert.ok(row.created_at instanceof Date);
        assert.ok(row.updated_at instanceof Date);
      }
      const before = await snapshot();
      await apply(migration);
      assert.deepEqual(await snapshot(), before);
      await apply(idempotencyMigration);
      const columns = (await client.query(
        "SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = $1 AND column_name IN ('created_at','updated_at') ORDER BY table_name, column_name",
        [schema],
      )).rows;
      assert.deepEqual(columns, [
        { table_name: 'credit_history', column_name: 'created_at', udt_name: 'timestamptz' },
      ]);
      const retryColumns = (await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'idempotency_records' ORDER BY ordinal_position", [schema],
      )).rows.map(row => row.column_name);
      assert.deepEqual(retryColumns, ['operation_type', 'idempotency_key', 'request_hash', 'result']);
      assert.deepEqual(await snapshot(), before);
      const record = await new SqlCreditRepository(client).findIdempotencyRecord('reserve', orders[0]);
      assert.deepEqual(Object.keys(record).sort(), ['key', 'operationType', 'requestHash', 'result']);
      assert.deepEqual(record.result, legacyReservations[0]);
    });

    // A genuine ledger failure stops this scenario before further operations.
    await verifyLedger();
    await t.test('reads, allocation, update, release, settlement and saved replay work without timestamps', async () => {
      const account = await new SqlCreditRepository(client).findAccount(users[0]);
      assert.deepEqual(account, { userId: users[0], totalCredits: 10, reservedCredits: 6 });
      const updated = await service.updateReservation({ orderId: orders[0], amount: 4, expectedVersion: 1 });
      assert.equal(updated.version, 2);
      assert.equal((await service.releaseCredits({ orderId: orders[1] })).status, 'RELEASED');
      assert.equal((await service.settleCredits({ orderId: orders[2], courierId: users[1] })).status, 'SETTLED');
      users.push('new-after-upgrade');
      await service.initCredits({ userId: users[2] });
      orders.push(randomUUID());
      await service.reserveCredits({ orderId: orders[3], requesterId: users[2], amount: 2 });
      const beforeReplay = await snapshot();
      assert.deepEqual(await service.updateReservation({ orderId: orders[0], amount: 4, expectedVersion: 1 }), updated);
      // A success saved before migration still replays its original snapshot.
      assert.deepEqual(await service.reserveCredits({ orderId: orders[0], requesterId: users[0], amount: 3 }), legacyReservations[0]);
      assert.deepEqual(await service.initCredits({ userId: users[0] }), {
        totalCredits: 10, reservedCredits: 0, availableCredits: 10,
      });
      assert.deepEqual(await snapshot(), beforeReplay);
      assert.deepEqual(await service.getReservation({ orderId: orders[0] }), updated);
      assert.deepEqual(await service.getBalance({ userId: users[0] }), {
        userId: users[0], totalCredits: 9, reservedCredits: 4, availableCredits: 5,
      });
      const history = await service.getUserCreditHistory({ userId: users[0] });
      assert.ok(history.entries.length > 0);
      assert.ok(history.entries.every(entry => entry.createdAt instanceof Date));
    });
    await verifyLedger();
  } finally {
    await pool.end();
    try { if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.end(); }
  }
});
