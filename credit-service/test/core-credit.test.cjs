// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Generated PostgreSQL behaviour/concurrency tests for the human-specified core credit operations. Generated regression tests for settled-reservation retries without saved results.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–026 and 028.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client, Pool } = require('pg');
require('tsx/cjs');
const { ValidationError } = require('../src/services/validation.ts');
const { CreditService } = require('../src/services/CreditService.ts');

test('invalid update and read inputs fail before obtaining a connection', async () => {
  let connections = 0;
  const service = new CreditService({
    async connect() { connections += 1; throw new Error('Unexpected connection'); },
  });
  for (const value of [undefined, 0, -1, 1.5, NaN, Infinity, 2147483648, '2']) {
    await assert.rejects(service.updateReservation({ orderId: randomUUID(), amount: value, expectedVersion: 1 }), ValidationError);
    await assert.rejects(service.updateReservation({ orderId: randomUUID(), amount: 2, expectedVersion: value }), ValidationError);
  }
  for (const value of ['', ' leading', 'trailing ', 'control\ncharacter', 'x'.repeat(129)]) {
    await assert.rejects(service.getBalance({ userId: value }), ValidationError);
    await assert.rejects(service.getReservation({ orderId: value }), ValidationError);
  }
  assert.equal(connections, 0);
});

test('core credit operations implement the supplied state and transaction rules', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for core credit checks.',
}, async (t) => {
  t.mock.method(console, 'info', () => {});
  const schema = 'core_credit_check_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: 12, connectionTimeoutMillis: 5000, options: '-c search_path=' + schema });
  const service = new CreditService(pool);
  let connected = false;
  const newAccount = async () => {
    const userId = randomUUID();
    await service.initCredits({ userId });
    return userId;
  };
  const seedHold = async (amount = 2) => {
    const requesterId = await newAccount();
    const orderId = randomUUID();
    await client.query('UPDATE credit_accounts SET reserved_credits = $2 WHERE user_id = $1', [requesterId, amount]);
    await client.query(
      'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, $3, 1)',
      [orderId, requesterId, amount],
    );
    return { orderId, requesterId };
  };
  const state = async () => {
    const tables = ['credit_accounts', 'reservations', 'credit_history', 'idempotency_records'];
    const result = {};
    for (const table of tables) {
      result[table] = (await client.query(`SELECT row_to_json(row) AS data FROM ${table} AS row ORDER BY row_to_json(row)::text`)).rows;
    }
    return result;
  };
  const rejectsWithoutWrites = async (invoke, code, reason) => {
    const before = await state();
    await assert.rejects(invoke(), (error) => {
      assert.equal(error.code, code);
      if (reason) assert.equal(error.reason, reason);
      return true;
    });
    assert.deepEqual(await state(), before);
  };

  try {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    const directory = join(__dirname, '../migrations');
    for (const file of (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
      await client.query('BEGIN');
      try {
        await client.query(await readFile(join(directory, file), 'utf8'));
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    await t.test('balance reads compute available credits and never initialize missing accounts', async () => {
      const { requesterId } = await seedHold(3);
      const before = await state();
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 3, availableCredits: 7,
      });
      assert.deepEqual(await state(), before);
      await rejectsWithoutWrites(() => service.getBalance({ userId: 'not-initialized' }), 'NOT_FOUND');
    });

    await t.test('reservation reads return current state without writes and report missing orders', async () => {
      const { orderId, requesterId } = await seedHold(2);
      const before = await state();
      const reservation = await service.getReservation({ orderId });
      assert.equal(reservation.orderId, orderId);
      assert.equal(reservation.requesterId, requesterId);
      assert.equal(reservation.status, 'RESERVED');
      assert.equal(reservation.amount, 2);
      assert.equal(reservation.version, 1);
      assert.equal(Object.hasOwn(reservation, 'courierId'), false);
      assert.deepEqual(await state(), before);
      await rejectsWithoutWrites(() => service.getReservation({ orderId: randomUUID() }), 'NOT_FOUND');
    });

    await t.test('updates apply only the difference and record signed history', async () => {
      const { orderId, requesterId } = await seedHold(2);
      const increased = await service.updateReservation({ orderId, amount: 6, expectedVersion: 1 });
      assert.equal(increased.amount, 6);
      assert.equal(increased.version, 2);
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 6, availableCredits: 4,
      });
      const decreased = await service.updateReservation({ orderId, amount: 1, expectedVersion: 2 });
      assert.equal(decreased.amount, 1);
      assert.equal(decreased.version, 3);
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 1, availableCredits: 9,
      });
      const history = (await client.query(
        'SELECT total_amount_change, total_reserved_change FROM credit_history WHERE order_id = $1 ORDER BY sequence_id', [orderId],
      )).rows;
      assert.deepEqual(history, [
        { total_amount_change: 0, total_reserved_change: 4 },
        { total_amount_change: 0, total_reserved_change: -5 },
      ]);
    });

    await t.test('an increase can consume the remaining available credits and a decrease needs none', async () => {
      const { orderId, requesterId } = await seedHold(8);
      await service.updateReservation({ orderId, amount: 10, expectedVersion: 1 });
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 10, availableCredits: 0,
      });
      await service.updateReservation({ orderId, amount: 1, expectedVersion: 2 });
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 1, availableCredits: 9,
      });
    });

    await t.test('stale, unchanged, insufficient, missing, and inactive updates do not change state', async () => {
      const { orderId } = await seedHold(3);
      await rejectsWithoutWrites(
        () => service.updateReservation({ orderId, amount: 4, expectedVersion: 2 }),
        'FAILED_PRECONDITION', 'VERSION_CONFLICT',
      );
      await rejectsWithoutWrites(
        () => service.updateReservation({ orderId, amount: 3, expectedVersion: 1 }), 'FAILED_PRECONDITION',
      );
      await rejectsWithoutWrites(
        () => service.updateReservation({ orderId, amount: 11, expectedVersion: 1 }), 'FAILED_PRECONDITION',
      );
      await rejectsWithoutWrites(
        () => service.updateReservation({ orderId: randomUUID(), amount: 4, expectedVersion: 1 }), 'NOT_FOUND',
      );
      await client.query("UPDATE reservations SET status = 'RELEASED' WHERE order_id = $1", [orderId]);
      await rejectsWithoutWrites(
        () => service.updateReservation({ orderId, amount: 4, expectedVersion: 1 }), 'FAILED_PRECONDITION',
      );
    });

    await t.test('update replay precedes later version checks; key reuse with another amount fails', async () => {
      const { orderId } = await seedHold(2);
      const first = await service.updateReservation({ orderId, amount: 4, expectedVersion: 1 });
      await service.updateReservation({ orderId, amount: 5, expectedVersion: 2 });
      const before = await state();
      assert.deepEqual(await service.updateReservation({ orderId, amount: 4, expectedVersion: 1 }), first);
      assert.equal((await service.getReservation({ orderId })).amount, 5);
      assert.deepEqual(await state(), before);
      await rejectsWithoutWrites(
        () => service.updateReservation({ orderId, amount: 6, expectedVersion: 1 }), 'FAILED_PRECONDITION',
      );
    });

    await t.test('reserve retries replay their original snapshot after update/release; lookup returns current state', async () => {
      const requesterId = await newAccount();
      const orderId = randomUUID();
      const original = await service.reserveCredits({ orderId, requesterId, amount: 2 });
      const updated = await service.updateReservation({ orderId, amount: 4, expectedVersion: 1 });
      let before = await state();
      assert.deepEqual(await service.reserveCredits({ orderId, requesterId, amount: 2 }), original);
      assert.deepEqual(await service.getReservation({ orderId }), updated);
      assert.equal(original.amount, 2);
      assert.equal(original.version, 1);
      assert.equal(updated.amount, 4);
      assert.equal(updated.version, 2);
      assert.deepEqual(await state(), before);
      const released = await service.releaseCredits({ orderId });
      before = await state();
      assert.deepEqual(await service.reserveCredits({ orderId, requesterId, amount: 2 }), original);
      assert.deepEqual(await service.getReservation({ orderId }), released);
      assert.equal(released.status, 'RELEASED');
      assert.deepEqual(await state(), before);
    });

    await t.test('concurrent updates sharing an expected version commit one change', async () => {
      const { orderId } = await seedHold(2);
      const attempts = await Promise.allSettled([
        service.updateReservation({ orderId, amount: 4, expectedVersion: 1 }),
        service.updateReservation({ orderId, amount: 5, expectedVersion: 1 }),
      ]);
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = attempts.find((result) => result.status === 'rejected');
      assert.equal(rejected.reason.code, 'FAILED_PRECONDITION');
      const current = await service.getReservation({ orderId });
      assert.equal(current.version, 2);
      assert.ok([4, 5].includes(current.amount));
      assert.equal((await client.query('SELECT count(*) FROM credit_history WHERE order_id = $1', [orderId])).rows[0].count, '1');
    });

    await t.test('different orders sharing an account cannot lose updates or overspend', async () => {
      const requesterId = await newAccount();
      const orderIds = [randomUUID(), randomUUID()];
      await client.query('UPDATE credit_accounts SET reserved_credits = 4 WHERE user_id = $1', [requesterId]);
      for (const orderId of orderIds) {
        await client.query(
          'INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1, $2, 2, 1)',
          [orderId, requesterId],
        );
      }
      const results = await Promise.allSettled(orderIds.map((orderId) =>
        service.updateReservation({ orderId, amount: 6, expectedVersion: 1 })));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'FAILED_PRECONDITION');
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 8, availableCredits: 2,
      });
      assert.deepEqual((await client.query(
        'SELECT credit_amount, version FROM reservations WHERE requester_id = $1 ORDER BY credit_amount', [requesterId],
      )).rows, [{ credit_amount: 2, version: 1 }, { credit_amount: 6, version: 2 }]);
    });

    await t.test('history/result failure rolls back account, reservation, history and retry changes', async () => {
      for (const table of ['credit_history', 'idempotency_records']) {
        const { orderId } = await seedHold(2);
        await client.query(`
          CREATE FUNCTION fail_core_write() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'injected core write failure'; END $$;
          CREATE TRIGGER fail_core_write BEFORE INSERT ON ${table}
          FOR EACH ROW EXECUTE FUNCTION fail_core_write();
        `);
        try {
          await rejectsWithoutWrites(
            () => service.updateReservation({ orderId, amount: 4, expectedVersion: 1 }), 'P0001',
          );
        } finally {
          await client.query(`DROP TRIGGER fail_core_write ON ${table}; DROP FUNCTION fail_core_write()`);
        }
        const retried = await service.updateReservation({ orderId, amount: 4, expectedVersion: 1 });
        assert.equal(retried.version, 2);
        assert.equal(retried.amount, 4);
      }
    });
    await t.test('parallel reserves share the account lock and cannot overspend', async () => {
      const requesterId = await newAccount();
      const results = await Promise.allSettled(Array.from({ length: 8 }, () =>
        service.reserveCredits({ orderId: randomUUID(), requesterId, amount: 3 })));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
      for (const rejected of results.filter((result) => result.status === 'rejected')) {
        assert.equal(rejected.reason.reason, 'INSUFFICIENT_CREDITS');
      }
      assert.deepEqual(await service.getBalance({ userId: requesterId }), {
        userId: requesterId, totalCredits: 10, reservedCredits: 9, availableCredits: 1,
      });
      assert.equal((await client.query('SELECT count(*) FROM reservations WHERE requester_id = $1', [requesterId])).rows[0].count, '3');
    });

    await t.test('duplicate reservations replay once; missing retry records return current state without writes', async () => {
      const requesterId = await newAccount();
      const orderId = randomUUID();
      const copies = await Promise.all(Array.from({ length: 12 }, () =>
        service.reserveCredits({ orderId, requesterId, amount: 2 })));
      for (const reservation of copies) assert.deepEqual(reservation, copies[0]);
      assert.equal((await client.query('SELECT count(*) FROM credit_history WHERE order_id = $1', [orderId])).rows[0].count, '1');
      await client.query("DELETE FROM idempotency_records WHERE operation_type = 'reserve' AND idempotency_key = $1", [orderId]);
      let before = await state();
      assert.deepEqual(await service.reserveCredits({ orderId, requesterId, amount: 2 }), copies[0]);
      assert.deepEqual(await state(), before);
      await rejectsWithoutWrites(() => service.reserveCredits({ orderId, requesterId: 'different', amount: 2 }), 'FAILED_PRECONDITION', 'REQUEST_CONFLICT');
      await service.updateReservation({ orderId, amount: 3, expectedVersion: 1 });
      await rejectsWithoutWrites(() => service.reserveCredits({ orderId, requesterId, amount: 2 }), 'FAILED_PRECONDITION', 'REQUEST_CONFLICT');
      const released = await service.releaseCredits({ orderId });
      before = await state();
      assert.deepEqual(await service.reserveCredits({ orderId, requesterId, amount: 3 }), released);
      assert.deepEqual(await state(), before);
      assert.equal((await service.getBalance({ userId: requesterId })).reservedCredits, 0);
    });

    await t.test('release changes only reserved credits, increments once, and tolerates a lost retry record', async () => {
      const requesterId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      const released = await service.releaseCredits({ orderId });
      assert.equal(released.status, 'RELEASED');
      assert.equal(released.version, 2);
      assert.deepEqual(await service.getBalance({ userId: requesterId }), { userId: requesterId, totalCredits: 10, reservedCredits: 0, availableCredits: 10 });
      assert.deepEqual(await service.releaseCredits({ orderId }), released);
      await client.query("DELETE FROM idempotency_records WHERE operation_type = 'release' AND idempotency_key = $1", [orderId]);
      const before = await state();
      assert.deepEqual(await service.releaseCredits({ orderId }), released);
      assert.deepEqual(await state(), before);
      await rejectsWithoutWrites(() => service.settleCredits({ orderId, courierId: 'courier' }), 'FAILED_PRECONDITION', 'INVALID_STATE');
      await rejectsWithoutWrites(() => service.releaseCredits({ orderId: randomUUID() }), 'NOT_FOUND', 'RESERVATION_NOT_FOUND');
    });

    await t.test('settlement transfers both sides once and records signed OUT/IN history', async () => {
      const requesterId = await newAccount();
      const courierId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      const settled = await service.settleCredits({ orderId, courierId });
      assert.equal(settled.status, 'SETTLED');
      assert.equal(settled.version, 2);
      assert.equal(settled.courierId, courierId);
      assert.deepEqual(await service.getBalance({ userId: requesterId }), { userId: requesterId, totalCredits: 6, reservedCredits: 0, availableCredits: 6 });
      assert.deepEqual(await service.getBalance({ userId: courierId }), { userId: courierId, totalCredits: 14, reservedCredits: 0, availableCredits: 14 });
      const before = await state();
      assert.deepEqual(await service.settleCredits({ orderId, courierId }), settled);
      assert.deepEqual(await state(), before);
      await rejectsWithoutWrites(() => service.settleCredits({ orderId, courierId: 'other' }), 'FAILED_PRECONDITION', 'REQUEST_CONFLICT');
      await rejectsWithoutWrites(() => service.releaseCredits({ orderId }), 'FAILED_PRECONDITION', 'INVALID_STATE');
      assert.deepEqual((await client.query(
        "SELECT type, total_amount_change, total_reserved_change FROM credit_history WHERE order_id = $1 AND type LIKE 'TRANSFER_%' ORDER BY sequence_id", [orderId],
      )).rows, [
        { type: 'TRANSFER_OUT', total_amount_change: -4, total_reserved_change: -4 },
        { type: 'TRANSFER_IN', total_amount_change: 4, total_reserved_change: 0 },
      ]);
      await client.query("DELETE FROM idempotency_records WHERE operation_type = 'reserve' AND idempotency_key = $1", [orderId]);
      const afterDelete = await state();
      assert.deepEqual(await service.reserveCredits({ orderId, requesterId, amount: 4 }), settled);
      assert.deepEqual(await state(), afterDelete);
    });

    await t.test('settled same-courier retries without a saved result return current reservation without writes', async () => {
      const requesterId = await newAccount();
      const courierId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      await service.settleCredits({ orderId, courierId });
      await client.query("DELETE FROM idempotency_records WHERE operation_type = 'transfer' AND idempotency_key = $1", [orderId]);
      const current = await service.getReservation({ orderId });
      const before = await state();

      const retries = await Promise.all(Array.from({ length: 6 }, () =>
        service.settleCredits({ orderId, courierId })));
      for (const result of retries) assert.deepEqual(result, current);
      assert.equal(current.status, 'SETTLED');
      assert.equal(current.version, 2);
      assert.equal(current.courierId, courierId);
      assert.deepEqual(await state(), before);
      assert.equal((await client.query(
        "SELECT count(*) FROM idempotency_records WHERE operation_type = 'transfer' AND idempotency_key = $1", [orderId],
      )).rows[0].count, '0');
    });

    await t.test('settled different-courier retries without a saved result fail with REQUEST_CONFLICT and no writes', async () => {
      const requesterId = await newAccount();
      const courierId = await newAccount();
      const otherCourierId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      await service.settleCredits({ orderId, courierId });
      await client.query("DELETE FROM idempotency_records WHERE operation_type = 'transfer' AND idempotency_key = $1", [orderId]);

      for (const differentCourierId of [otherCourierId, 'missing-courier', requesterId]) {
        await rejectsWithoutWrites(
          () => service.settleCredits({ orderId, courierId: differentCourierId }),
          'FAILED_PRECONDITION', 'REQUEST_CONFLICT',
        );
      }
    });

    await t.test('missing courier, self settlement, and missing reservation fail with no writes', async () => {
      const requesterId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      await rejectsWithoutWrites(() => service.settleCredits({ orderId, courierId: requesterId }), 'FAILED_PRECONDITION', 'INVALID_STATE');
      await rejectsWithoutWrites(() => service.settleCredits({ orderId, courierId: 'missing-courier' }), 'NOT_FOUND', 'ACCOUNT_NOT_FOUND');
      await assert.rejects(service.settleCredits({ orderId, courierId: 'missing-courier' }), /missing-courier/);
      await rejectsWithoutWrites(() => service.settleCredits({ orderId: randomUUID(), courierId: requesterId }), 'NOT_FOUND', 'RESERVATION_NOT_FOUND');
      await rejectsWithoutWrites(() => service.reserveCredits({ orderId: randomUUID(), requesterId: 'missing-requester', amount: 1 }), 'NOT_FOUND', 'ACCOUNT_NOT_FOUND');
    });

    await t.test('settle racing release transitions the active reservation exactly once', async () => {
      const requesterId = await newAccount();
      const courierId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      const results = await Promise.allSettled([
        service.settleCredits({ orderId, courierId }), service.releaseCredits({ orderId }),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.reason, 'INVALID_STATE');
      const reservation = await service.getReservation({ orderId });
      assert.equal(reservation.version, 2);
      const requester = await service.getBalance({ userId: requesterId });
      const courier = await service.getBalance({ userId: courierId });
      assert.equal(requester.totalCredits + courier.totalCredits, 20);
      assert.equal(requester.reservedCredits, 0);
      assert.equal(courier.totalCredits, reservation.status === 'SETTLED' ? 14 : 10);
    });

    await t.test('opposing settlements acquire account locks consistently without deadlock', { timeout: 10000 }, async () => {
      const a = await newAccount();
      const b = await newAccount();
      const first = randomUUID();
      const second = randomUUID();
      await service.reserveCredits({ orderId: first, requesterId: a, amount: 4 });
      await service.reserveCredits({ orderId: second, requesterId: b, amount: 4 });
      await Promise.all([
        service.settleCredits({ orderId: first, courierId: b }),
        service.settleCredits({ orderId: second, courierId: a }),
      ]);
      for (const userId of [a, b]) {
        assert.deepEqual(await service.getBalance({ userId }), { userId, totalCredits: 10, reservedCredits: 0, availableCredits: 10 });
      }
    });

    await t.test('a failure on the second transfer history row rolls back the entire payout', async () => {
      const requesterId = await newAccount();
      const courierId = await newAccount();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId, amount: 4 });
      await client.query(`
        CREATE FUNCTION fail_transfer_in() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.type = 'TRANSFER_IN' THEN RAISE EXCEPTION 'injected second history failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER fail_transfer_in BEFORE INSERT ON credit_history FOR EACH ROW EXECUTE FUNCTION fail_transfer_in();
      `);
      try {
        await rejectsWithoutWrites(() => service.settleCredits({ orderId, courierId }), 'P0001');
      } finally {
        await client.query('DROP TRIGGER fail_transfer_in ON credit_history; DROP FUNCTION fail_transfer_in()');
      }
      await service.settleCredits({ orderId, courierId });
      assert.equal((await service.getBalance({ userId: courierId })).totalCredits, 14);
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
