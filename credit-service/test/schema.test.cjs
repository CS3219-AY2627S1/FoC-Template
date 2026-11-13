// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-26 (Asia/Singapore).
// Scope: Generated PostgreSQL integration tests for the human-specified schema and contract-alignment migrations. Relocated the human-selected migration runner and updated references while making scripts/docs local-only. Checked current idempotency columns, operation/key uniqueness and remaining required values.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–024, 034, 045.
// Entry 048: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
// Scope: Used tracked --to checkpoints and a fresh schema for latest idempotency checks.
// Changes await human review; prompts/key responses: ../ai/usage-log.md, entry 048.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

const execute = promisify(execFile);
const migration = '001_initial.sql';
const alignment = '002_align_credit_contract.sql';
const uppercaseStatus = '003_uppercase_reservation_status.sql';
const runner = join(__dirname, '../migrations/run-migrations.cjs');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('SQL migrations implement the supplied schema', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables to run schema checks.',
}, async (t) => {
  const schema = 'schema_check_' + randomUUID().replaceAll('-', '');
  const retrySchema = 'retry_schema_check_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  let connected = false;
  const bad = (sql, values, code) => assert.rejects(client.query(sql, values), (error) => {
    assert.equal(error.code, code);
    return true;
  });

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await execute('npm', ['run', 'db:migrate', '--workspace', '@foc/credit-grpc', '--', '--to', migration], {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, PGOPTIONS: '-c search_path=' + schema },
    });
    await client.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, $2)', ['upgrade-requester', 10]);
    const legacy = [];
    for (const status of ['reserved', 'released', 'transferred']) {
      const { rows: [row] } = await client.query(
        'INSERT INTO reservations (order_id, requestor_id, credit_amount, version, status) VALUES ($1, $2, $3, $4, $5) RETURNING reservation_id, status',
        [randomUUID(), 'upgrade-requester', 2, 7, status],
      );
      legacy.push(row);
    }
    await execute(process.execPath, [runner, '--to', alignment], {
      env: { ...process.env, PGOPTIONS: '-c search_path=' + schema },
    });
    await execute(process.execPath, [runner, '--to', uppercaseStatus], {
      env: { ...process.env, PGOPTIONS: '-c search_path=' + schema },
    });

    await t.test('alignment preserves existing reservations and migrates the terminal status', async () => {
      for (const previous of legacy) {
        const { rows: [row] } = await client.query('SELECT * FROM reservations WHERE reservation_id = $1', [previous.reservation_id]);
        assert.equal(row.requester_id, 'upgrade-requester');
        assert.equal(Object.hasOwn(row, 'requestor_id'), false);
        assert.equal(row.status, previous.status === 'transferred' ? 'SETTLED' : previous.status.toUpperCase());
        assert.equal(row.credit_amount, 2);
        assert.equal(row.version, 7);
      }
      await bad('UPDATE reservations SET status = $1 WHERE reservation_id = $2', ['transferred', legacy[0].reservation_id], '23514');
      await bad('UPDATE reservations SET status = $1 WHERE reservation_id = $2', ['reserved', legacy[0].reservation_id], '23514');
      await bad('UPDATE reservations SET status = $1 WHERE reservation_id = $2', ['released', legacy[0].reservation_id], '23514');
    });

    await t.test('creates four application tables and a migration ledger with the specified column types', async () => {
      const tables = await client.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name', [schema],
      );
      assert.deepEqual(tables.rows.map((row) => row.table_name), [
        'credit_accounts', 'credit_history', 'credit_migrations', 'idempotency_records', 'reservations',
      ]);
      const columns = (await client.query(
        'SELECT table_name, column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = $1', [schema],
      )).rows;
      assert.equal(columns.some((column) => column.column_name === 'available_credits'), false);
      assert.deepEqual(columns.filter((column) => column.table_name === 'credit_history')
        .map((column) => column.column_name).sort(), [
        'created_at', 'id', 'order_id', 'reservation_id', 'total_amount_change', 'total_reserved_change', 'type', 'user_id',
      ]);
      for (const column of columns) {
        if (column.column_name.endsWith('_at')) assert.equal(column.udt_name, 'timestamptz');
        const nullable = (column.table_name === 'reservations' && column.column_name === 'courier_id')
          || (column.table_name === 'credit_history' && ['order_id', 'reservation_id'].includes(column.column_name));
        assert.equal(column.is_nullable, nullable ? 'YES' : 'NO', column.table_name + '.' + column.column_name);
      }
    });

    await t.test('account defaults and balance checks preserve the supplied invariants', async () => {
      const { rows: [account] } = await client.query(
        'INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, $2) RETURNING *', ['alice', 10],
      );
      assert.equal(account.reserved_credits, 0);
      assert.equal(account.total_credits, 10);
      assert.ok(account.created_at instanceof Date);
      assert.equal(account.created_at.getTime(), account.updated_at.getTime());
      await client.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, $2)', ['bob', 10]);
      await bad('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, $2)', ['alice', 10], '23505');
      await bad('INSERT INTO credit_accounts (user_id) VALUES ($1)', ['missing-total'], '23502');
      await bad('UPDATE credit_accounts SET total_credits = $1 WHERE user_id = $2', [-1, 'alice'], '23514');
      await bad('UPDATE credit_accounts SET reserved_credits = $1 WHERE user_id = $2', [-1, 'alice'], '23514');
      await bad('UPDATE credit_accounts SET reserved_credits = $1 WHERE user_id = $2', [11, 'alice'], '23514');
      await client.query('UPDATE credit_accounts SET reserved_credits = $1 WHERE user_id = $2', [10, 'alice']);
    });

    const orderId = randomUUID();
    let reservationId;
    await t.test('reservations generate IDs, default status/courier, and enforce FKs and allowed statuses', async () => {
      const { rows: [reservation] } = await client.query(
        'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, $4) RETURNING *',
        [orderId, 'alice', 3, 0],
      );
      reservationId = reservation.reservation_id;
      assert.match(reservationId, uuid);
      assert.equal(reservation.status, 'RESERVED');
      assert.equal(reservation.courier_id, null);
      assert.equal(reservation.created_at.getTime(), reservation.updated_at.getTime());
      await bad('UPDATE reservations SET requester_id = $1 WHERE reservation_id = $2', ['unknown', reservationId], '23503');
      await bad('UPDATE reservations SET courier_id = $1 WHERE reservation_id = $2', ['unknown', reservationId], '23503');
      await bad('UPDATE reservations SET status = $1 WHERE reservation_id = $2', ['invalid', reservationId], '23514');
      await bad('INSERT INTO reservations (order_id, requester_id, credit_amount) VALUES ($1, $2, $3)', [randomUUID(), 'alice', 3], '23502');
      for (const status of ['RESERVED', 'RELEASED', 'SETTLED']) {
        await client.query('UPDATE reservations SET status = $1, courier_id = $2 WHERE reservation_id = $3', [status, 'bob', reservationId]);
      }
    });

    await t.test('history accepts signed deltas and unlinked initial allocation entries', async () => {
      const { rows: [initial] } = await client.query(
        'INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ($1, $2, $3, $4) RETURNING *',
        ['alice', 'init_credits', 10, 0],
      );
      assert.match(initial.id, uuid);
      assert.equal(initial.order_id, null);
      assert.equal(initial.reservation_id, null);
      assert.ok(initial.created_at instanceof Date);
      for (const type of ['reserve', 'update', 'release', 'transfer']) {
        const { rows: [entry] } = await client.query(
          'INSERT INTO credit_history (user_id, order_id, reservation_id, type, total_amount_change, total_reserved_change) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          ['alice', orderId, reservationId, type, -3, -3],
        );
        assert.equal(entry.total_amount_change, -3);
        assert.equal(entry.total_reserved_change, -3);
      }
      await bad('UPDATE credit_history SET user_id = $1 WHERE id = $2', ['unknown', initial.id], '23503');
      await bad('UPDATE credit_history SET reservation_id = $1 WHERE id = $2', [randomUUID(), initial.id], '23503');
      await bad('UPDATE credit_history SET type = $1 WHERE id = $2', ['archive', initial.id], '23514');
      await bad('UPDATE credit_history SET total_amount_change = NULL WHERE id = $1', [initial.id], '23502');
    });

    // Historical fixtures above intentionally violate later migrations; latest
    // idempotency checks use a fresh schema and the complete tracked prefix.
    await client.query(`CREATE SCHEMA "${retrySchema}"`);
    await client.query(`SET search_path TO "${retrySchema}"`);
    await execute(process.execPath, [runner, '--to', '010_remove_idempotency_metadata.sql'], {
      env: { ...process.env, PGOPTIONS: '-c search_path=' + retrySchema },
    });
    await t.test('idempotency keys are unique per operation without user or timestamp metadata', async () => {
      const insert = 'INSERT INTO idempotency_records (operation_type, idempotency_key, request_hash, result) VALUES ($1, $2, $3, $4) RETURNING *';
      for (const type of ['init_credits', 'reserve', 'update', 'release', 'transfer']) {
        const { rows: [record] } = await client.query(insert, [type, 'same-key', 'hash', { ok: true }]);
        assert.deepEqual(record.result, { ok: true });
        assert.deepEqual(Object.keys(record).sort(), ['idempotency_key', 'operation_type', 'request_hash', 'result']);
      }
      await bad(insert, ['reserve', 'same-key', 'hash', {}], '23505');
      await bad(insert, ['restore', 'new-key', 'hash', {}], '23514');
      await bad(insert, ['reserve', 'new-key', 'hash', null], '23502');
      await bad(insert, ['reserve', 'new-key', null, {}], '23502');
    });
  } finally {
    try {
      if (connected) {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await client.query(`DROP SCHEMA IF EXISTS "${retrySchema}" CASCADE`);
      }
    } finally {
      await client.end();
    }
  }
});
