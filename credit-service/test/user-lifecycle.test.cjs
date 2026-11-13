// AI-Assistance Disclosure
// Tool: OpenAI Codex (GPT-6), date: 2026-11-04 (Asia/Singapore).
// Scope: PostgreSQL regression checks for the human-specified account lifecycle.
// Author review: I ensured that the conditions correctly check for all stages of a user's lifecycle
// Prompts/key responses: ../ai/usage-log.md, entry 049; ../ai/prompts/049-user-lifecycle.md.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID, generateKeyPairSync } = require('node:crypto');
const { Client, Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('tsx/cjs');
const { CreditService, RestoreError } = require('../src/services/CreditService.ts');
const { SqlCreditRepository } = require('../src/repos/SqlCreditRepository.ts');
const { ValidationError } = require('../src/services/validation.ts');
const { createRestServer } = require('../src/rest/server.ts');

test('restoration validates both IDs and rejects equal IDs before connecting', async () => {
  const service = new CreditService({ connect() { throw new Error('Unexpected connection'); } });
  for (const field of ['previousUserId', 'userId']) {
    for (const invalid of ['', ' leading', 'trailing ', 'control\ncharacter', 'x'.repeat(129)]) {
      await assert.rejects(service.restoreCredits({ previousUserId: 'old', userId: 'new', [field]: invalid }), ValidationError);
    }
  }
  await assert.rejects(service.restoreCredits({ previousUserId: 'same', userId: 'same' }), RestoreError);
});

test('user lifecycle preserves credits, repeats safely and keeps restored records unlinked', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and connection variables for lifecycle checks.',
  timeout: 30000,
}, async (t) => {
  t.mock.method(console, 'info', () => {});
  const schema = 'lifecycle_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: 12, connectionTimeoutMillis: 5000, options: '-c search_path=' + schema });
  const service = new CreditService(pool);
  let connected = false;
  const account = async (id) => (await client.query('SELECT * FROM credit_accounts WHERE user_id = $1', [id])).rows[0];
  const history = async (id) => (await client.query('SELECT * FROM credit_history WHERE user_id = $1 ORDER BY sequence_id', [id])).rows;
  const fresh = async () => {
    const id = randomUUID();
    await service.initCredits({ userId: id });
    return id;
  };
  const snapshot = async () => {
    const result = {};
    for (const table of ['credit_accounts', 'credit_history', 'reservations', 'idempotency_records']) {
      result[table] = (await client.query(`SELECT to_jsonb(r) AS data FROM ${table} r ORDER BY to_jsonb(r)::text`)).rows;
    }
    return result;
  };
  const rejectsUnchanged = async (work, predicate) => {
    const before = await snapshot();
    await assert.rejects(work, predicate);
    assert.deepEqual(await snapshot(), before);
  };
  const notFound = error => error.code === 'NOT_FOUND' && error.reason === 'ACCOUNT_NOT_FOUND';
  const retryable = error => error instanceof Error && !(error instanceof RestoreError);

  try {
    await client.connect(); connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const file of (await readdir(join(__dirname, '../migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      await client.query(await readFile(join(__dirname, '../migrations', file), 'utf8'));
    }

    await t.test('deletion preserves balances, reservations and ledger; repeats and late events preserve CLOSED', async () => {
      const id = await fresh();
      const orderId = randomUUID();
      const reserved = await service.reserveCredits({ orderId, requesterId: id, amount: 3 });
      const before = await history(id);
      await Promise.all(Array.from({ length: 4 }, () => service.markDeleted({ userId: id })));
      assert.deepEqual(await account(id), { user_id: id, total_credits: 10, reserved_credits: 3, status: 'DELETED' });
      assert.deepEqual(await history(id), before);
      assert.deepEqual(await service.getReservation({ orderId }), reserved);
      const destination = randomUUID();
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: id, userId: destination }), retryable);
      await service.releaseCredits({ orderId });
      await service.restoreCredits({ previousUserId: id, userId: destination });
      const closed = await account(id);
      await service.markDeleted({ userId: id });
      assert.deepEqual(await account(id), closed);
      assert.equal(closed.status, 'CLOSED');
      assert.equal((await service.getReservation({ orderId })).status, 'RELEASED');
    });

    await t.test('deletion before creation makes one placeholder and delayed creation grants once without activating it', async () => {
      const id = randomUUID();
      await Promise.all(Array.from({ length: 6 }, () => service.markDeleted({ userId: id })));
      assert.deepEqual(await account(id), { user_id: id, total_credits: 0, reserved_credits: 0, status: 'DELETED' });
      assert.deepEqual(await history(id), []);
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: id, userId: randomUUID() }), retryable);
      await Promise.all(Array.from({ length: 6 }, () => service.initCredits({ userId: id })));
      assert.deepEqual(await account(id), { user_id: id, total_credits: 10, reserved_credits: 0, status: 'DELETED' });
      assert.equal((await history(id)).length, 1);
      const next = randomUUID();
      await service.restoreCredits({ previousUserId: id, userId: next });
      await service.initCredits({ userId: id });
      assert.equal((await account(id)).total_credits, 0);
      assert.equal((await account(next)).total_credits, 10);
    });

    await t.test('simultaneous registration and deletion grant once and finish DELETED', async () => {
      for (let i = 0; i < 6; i += 1) {
        const id = randomUUID();
        await Promise.all([service.initCredits({ userId: id }), service.markDeleted({ userId: id })]);
        assert.deepEqual(await account(id), { user_id: id, total_credits: 10, reserved_credits: 0, status: 'DELETED' });
        assert.equal((await history(id)).length, 1);
      }
    });

    await t.test('a delayed grant adds 10 without losing courier credits received by a DELETED placeholder', async () => {
      const courier = randomUUID();
      const requester = await fresh();
      await service.markDeleted({ userId: courier });
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId: requester, amount: 3 });
      await service.settleCredits({ orderId, courierId: courier });
      assert.equal((await account(courier)).total_credits, 3);
      const grant = await service.initCredits({ userId: courier });
      assert.deepEqual(grant, { totalCredits: 13, reservedCredits: 0, availableCredits: 13 });
      assert.equal((await account(courier)).status, 'DELETED');
      assert.equal((await account(courier)).total_credits + (await account(requester)).total_credits, 20);
      assert.equal((await history(courier)).find(row => row.type === 'INITIAL_GRANT').total_amount_change, 10);
      assert.deepEqual(await service.initCredits({ userId: courier }), grant);
    });

    await t.test('restores transfer the actual balance once with only one new history row and no new idempotency records', async () => {
      const old = await fresh();
      const courier = await fresh();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId: old, amount: 4 });
      await service.settleCredits({ orderId, courierId: courier });
      await service.markDeleted({ userId: old });
      const oldHistory = await history(old);
      const records = (await client.query('SELECT * FROM idempotency_records ORDER BY operation_type, idempotency_key')).rows;
      const next = randomUUID();
      await Promise.all(Array.from({ length: 8 }, () => service.restoreCredits({ previousUserId: old, userId: next })));
      assert.deepEqual(await account(old), { user_id: old, total_credits: 0, reserved_credits: 0, status: 'CLOSED' });
      assert.deepEqual(await account(next), { user_id: next, total_credits: 6, reserved_credits: 0, status: 'ACTIVE' });
      assert.deepEqual(await history(old), oldHistory);
      const entries = await history(next);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].type, 'BALANCE_RESTORED');
      assert.equal(entries[0].total_amount_change, 6);
      assert.equal(entries[0].total_reserved_change, 0);
      assert.equal(entries[0].order_id, null);
      assert.equal(entries[0].reservation_id, null);
      assert.equal(JSON.stringify([await account(next), entries]).includes(old), false);
      assert.deepEqual((await client.query('SELECT * FROM idempotency_records ORDER BY operation_type, idempotency_key')).rows, records);
      assert.equal((await account(courier)).total_credits + (await account(next)).total_credits, 20);
    });

    await t.test('zero balances get a restoration row and restored accounts can later be restored again', async () => {
      const old = await fresh();
      const courier = await fresh();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId: old, amount: 10 });
      await service.settleCredits({ orderId, courierId: courier });
      const next = randomUUID();
      await service.restoreCredits({ previousUserId: old, userId: next });
      assert.equal((await history(next))[0].total_amount_change, 0);
      const third = randomUUID();
      await service.markDeleted({ userId: next });
      await service.restoreCredits({ previousUserId: next, userId: third });
      assert.equal((await account(third)).total_credits, 0);
      assert.equal((await history(third)).length, 1);
      assert.equal((await history(next)).length, 1);
    });

    await t.test('existing destinations acknowledge only a CLOSED source; missing and placeholder sources remain retryable', async () => {
      const destination = await fresh();
      const old = await fresh();
      for (const source of [old, 'missing-source']) {
        await rejectsUnchanged(() => service.restoreCredits({ previousUserId: source, userId: destination }), RestoreError);
      }
      await service.markDeleted({ userId: old });
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: old, userId: destination }), RestoreError);
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: 'missing-source', userId: randomUUID() }), retryable);
      const inconsistent = randomUUID();
      await client.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, 0)', [inconsistent]);
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: inconsistent, userId: randomUUID() }), RestoreError);
      await service.restoreCredits({ previousUserId: old, userId: randomUUID() });
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: old, userId: randomUUID() }), RestoreError);
      const before = await snapshot();
      await service.restoreCredits({ previousUserId: old, userId: destination });
      assert.deepEqual(await snapshot(), before);
    });

    await t.test('DELETED blocks reads and new holds/updates but saved reserve/update results still replay', async () => {
      const id = await fresh();
      const orderId = randomUUID();
      const reserved = await service.reserveCredits({ orderId, requesterId: id, amount: 2 });
      const updated = await service.updateReservation({ orderId, amount: 3, expectedVersion: 1 });
      await service.markDeleted({ userId: id });
      await rejectsUnchanged(() => service.getBalance({ userId: id }), notFound);
      await rejectsUnchanged(() => service.getUserCreditHistory({ userId: id }), notFound);
      await rejectsUnchanged(() => service.reserveCredits({ orderId: randomUUID(), requesterId: id, amount: 1 }), notFound);
      await rejectsUnchanged(() => service.updateReservation({ orderId, amount: 4, expectedVersion: 2 }), notFound);
      const before = await snapshot();
      assert.deepEqual(await service.reserveCredits({ orderId, requesterId: id, amount: 2 }), reserved);
      assert.deepEqual(await service.updateReservation({ orderId, amount: 3, expectedVersion: 1 }), updated);
      assert.deepEqual(await snapshot(), before);
      await service.releaseCredits({ orderId });
    });

    await t.test('DELETED requester and courier can settle; CLOSED courier cannot receive settlement', async () => {
      const requester = await fresh();
      const courier = await fresh();
      const orderId = randomUUID();
      await service.reserveCredits({ orderId, requesterId: requester, amount: 3 });
      await Promise.all([service.markDeleted({ userId: requester }), service.markDeleted({ userId: courier })]);
      await rejectsUnchanged(() => service.restoreCredits({ previousUserId: requester, userId: randomUUID() }), retryable);
      await service.settleCredits({ orderId, courierId: courier });
      assert.equal((await account(requester)).total_credits, 7);
      assert.equal((await account(courier)).total_credits, 13);
      assert.equal((await account(courier)).status, 'DELETED');
      await service.restoreCredits({ previousUserId: courier, userId: randomUUID() });
      const other = await fresh();
      const otherOrder = randomUUID();
      await service.reserveCredits({ orderId: otherOrder, requesterId: other, amount: 1 });
      await rejectsUnchanged(() => service.settleCredits({ orderId: otherOrder, courierId: courier }), notFound);
      for (const read of [() => service.getBalance({ userId: courier }), () => service.getUserCreditHistory({ userId: courier })]) {
        await rejectsUnchanged(read, notFound);
      }
      await rejectsUnchanged(() => service.reserveCredits({ orderId: randomUUID(), requesterId: courier, amount: 1 }), notFound);
      assert.equal((await service.getReservation({ orderId })).status, 'SETTLED');
    });

    await t.test('a history failure rolls back creation and closure; retry moves credits exactly once', async () => {
      const old = await fresh();
      const next = randomUUID();
      const original = SqlCreditRepository.prototype.appendHistory;
      const before = await snapshot();
      const injected = new Error('Injected restoration history failure');
      const mock = t.mock.method(SqlCreditRepository.prototype, 'appendHistory', async function(entry) {
        if (entry.type === 'BALANCE_RESTORED') throw injected;
        return original.call(this, entry);
      });
      try {
        await assert.rejects(service.restoreCredits({ previousUserId: old, userId: next }), error => error === injected);
        assert.deepEqual(await snapshot(), before);
      } finally { mock.mock.restore(); }
      await service.restoreCredits({ previousUserId: old, userId: next });
      assert.equal((await account(next)).total_credits, 10);
    });

    await t.test('REST balance/history reject DELETED and CLOSED accounts while restored accounts expose only new history', async () => {
      const old = await fresh();
      const next = randomUUID();
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const server = createRestServer(service, publicKey.export({ type: 'spki', format: 'pem' }), async () => true, () => true);
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const origin = 'http://127.0.0.1:' + server.address().port;
      const get = (id, route) => fetch(origin + '/credits/me/' + route, {
        headers: { authorization: 'Bearer ' + jwt.sign({ sub: id }, privateKey, { algorithm: 'RS256', expiresIn: 60 }) },
      });
      try {
        await service.markDeleted({ userId: old });
        for (const route of ['balance', 'history']) assert.equal((await get(old, route)).status, 404);
        await service.restoreCredits({ previousUserId: old, userId: next });
        for (const route of ['balance', 'history']) {
          assert.equal((await get(old, route)).status, 404);
          assert.equal((await get(next, route)).status, 200);
        }
        const result = await (await get(next, 'history')).json();
        assert.equal(result.entries.length, 1);
        assert.equal(result.entries[0].type, 'BALANCE_RESTORED');
        assert.equal(JSON.stringify(result).includes(old), false);
      } finally { await new Promise(resolve => server.close(resolve)); }
    });

    await t.test('competing destinations and crossed restores complete without doubling or deadlock', async () => {
      const old = await fresh();
      const first = randomUUID();
      const second = randomUUID();
      const outcomes = await Promise.allSettled([first, second].map(userId => service.restoreCredits({ previousUserId: old, userId })));
      assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
      assert.ok(outcomes.find(r => r.status === 'rejected').reason instanceof RestoreError);
      const accounts = [];
      for (const id of [old, first, second]) accounts.push(await account(id));
      assert.equal(accounts.filter(Boolean).reduce((total, row) => total + row.total_credits, 0), 10);
      const left = await fresh();
      const right = await fresh();
      const crossed = await Promise.allSettled([
        service.restoreCredits({ previousUserId: left, userId: right }),
        service.restoreCredits({ previousUserId: right, userId: left }),
      ]);
      assert.ok(crossed.every(result => result.status === 'rejected' && result.reason instanceof RestoreError));
    });

    await t.test('concurrent reserve/restore and settle/restore preserve balances and holds', async () => {
      for (let i = 0; i < 6; i += 1) {
        const old = await fresh();
        const next = randomUUID();
        const orderId = randomUUID();
        const results = await Promise.allSettled([
          service.restoreCredits({ previousUserId: old, userId: next }),
          service.reserveCredits({ orderId, requesterId: old, amount: 2 }),
        ]);
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        if ((await account(old)).status !== 'CLOSED') {
          await service.markDeleted({ userId: old });
          const courier = await fresh();
          await Promise.allSettled([
            service.restoreCredits({ previousUserId: old, userId: next }),
            service.settleCredits({ orderId, courierId: courier }),
          ]);
          await service.restoreCredits({ previousUserId: old, userId: next });
          assert.equal((await account(next)).total_credits + (await account(courier)).total_credits, 20);
        } else {
          assert.equal((await account(next)).total_credits, 10);
        }
        assert.equal((await account(old)).total_credits, 0);
        assert.equal((await account(old)).reserved_credits, 0);
      }
    });

    await t.test('status, CLOSED balance, restored deltas/links and exclusive allocation constraints are enforced', async () => {
      const id = randomUUID();
      await client.query('INSERT INTO credit_accounts (user_id, total_credits) VALUES ($1, 0)', [id]);
      assert.equal((await account(id)).status, 'ACTIVE');
      for (const status of ['UNKNOWN', null]) {
        await assert.rejects(client.query('UPDATE credit_accounts SET status = $2 WHERE user_id = $1', [id, status]), error => ['23514', '23502'].includes(error.code));
      }
      await client.query('UPDATE credit_accounts SET total_credits = 1 WHERE user_id = $1', [id]);
      await assert.rejects(client.query("UPDATE credit_accounts SET status = 'CLOSED' WHERE user_id = $1", [id]), error => error.code === '23514');
      const repository = new SqlCreditRepository(client);
      const held = await fresh();
      await service.reserveCredits({ orderId: randomUUID(), requesterId: held, amount: 1 });
      await rejectsUnchanged(() => repository.closeAccount(held), /could not be closed/);
      await repository.closeAccount(id);
      await assert.rejects(repository.closeAccount(id), /could not be closed/);
      assert.equal(await repository.markDeleted(id), false);
      assert.equal(await repository.markDeleted('absent'), false);
      const funded = await fresh();
      const restored = randomUUID();
      await service.restoreCredits({ previousUserId: funded, userId: restored });
      await assert.rejects(client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ($1, 'INITIAL_GRANT', 10, 0)", [restored]), error => error.code === '23505');
      await assert.rejects(client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ($1, 'BALANCE_RESTORED', 0, 0)", [restored]), error => error.code === '23505');
      const initial = await fresh();
      await assert.rejects(client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change) VALUES ($1, 'BALANCE_RESTORED', 0, 0)", [initial]), error => error.code === '23505');
      for (const [amount, reserved, orderId] of [[-1, 0, null], [0, 1, null], [0, 0, randomUUID()]]) {
        await assert.rejects(client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change, order_id) VALUES ($1, 'BALANCE_RESTORED', $2, $3, $4)", [id, amount, reserved, orderId]), error => error.code === '23514');
      }
      const closed = await account(id);
      await repository.saveAccount({ userId: id, totalCredits: 0, reservedCredits: 0, status: 'ACTIVE' });
      assert.deepEqual(await account(id), closed);
    });
  } finally {
    await pool.end();
    try { if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.end(); }
  }
});
