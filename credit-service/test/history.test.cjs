// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-26 (Asia/Singapore).
// Scope: Tested the human-finalized history migration, sequence ordering, and account-lock pagination concurrency. Verified REST pagination against database ordering without exposing sequence IDs. Added/tested/documented startup-only listener health with database-based HTTP status as the human specified. Implemented/documented the human-defined history constraints and scoped SQL/seeded concurrency checks. Tested entry-ID bookmarks, scoped sequence lookup and uniform REST rejection while preserving sequence pagination. Ran paging/repository scenarios against the metadata-free idempotency schema.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–025, 031, 038, 039, 043, 045.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID, generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { Client, Pool } = require('pg');
require('tsx/cjs');
const { ValidationError } = require('../src/services/validation.ts');
const { CreditService } = require('../src/services/CreditService.ts');
const { SqlCreditRepository } = require('../src/repos/SqlCreditRepository.ts');
const { createRestServer } = require('../src/rest/server.ts');
const { encodeHistoryBookmark } = require('../src/services/historyBookmark.ts');

const migrations = ['001_initial.sql', '002_align_credit_contract.sql', '003_uppercase_reservation_status.sql', '004_reservation_invariants.sql'];
const latest = '006_history_types_and_paging.sql';

test('history migration and sequence paging use the human-defined labels and account locking', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for history checks.',
}, async (t) => {
  const schema = 'history_check_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: 4, connectionTimeoutMillis: 5000, options: '-c search_path=' + schema });
  let connected = false;
  const apply = async (name) => {
    const sql = await readFile(join(__dirname, '../migrations', name), 'utf8');
    await client.query('BEGIN');
    try { await client.query(sql); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  };
  const insert = async (type, change = 0, userId = 'legacy', reserved = 0, reservation) => client.query(
    'INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change, order_id, reservation_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [userId, type, change, reserved, reservation?.order_id ?? null, reservation?.reservation_id ?? null],
  );
  try {
    await client.connect(); connected = true;
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const migration of migrations) await apply(migration);
    await client.query("INSERT INTO credit_accounts (user_id, total_credits) VALUES ('legacy', 10), ('other', 10)");

    await t.test('ambiguous legacy transfers roll back all migration changes', async () => {
      const { rows: [row] } = await insert('transfer', 0);
      await assert.rejects(apply(latest), (error) => error.code === '23514');
      assert.equal((await client.query('SELECT type FROM credit_history WHERE id = $1', [row.id])).rows[0].type, 'transfer');
      assert.equal((await client.query("SELECT count(*) FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'credit_history' AND column_name = 'sequence_id'", [schema])).rows[0].count, '0');
      await client.query('DELETE FROM credit_history WHERE id = $1', [row.id]);
    });

    await t.test('duplicate legacy initial grants reject migration without losing either row', async () => {
      await insert('init_credits', 10); await insert('init_credits', 10);
      await assert.rejects(apply(latest), (error) => error.code === '23505');
      assert.equal((await client.query("SELECT count(*) FROM credit_history WHERE type = 'init_credits'")).rows[0].count, '2');
      await client.query('DELETE FROM credit_history');
    });

    await t.test('one migration converts all legacy types and creates the exact sequence and grant indexes', async () => {
      const expected = ['INITIAL_GRANT', 'RESERVED', 'RESERVATION_UPDATED', 'RELEASED', 'TRANSFER_OUT', 'TRANSFER_IN'];
      const reservation = (await client.query("INSERT INTO reservations (order_id, requester_id, credit_amount, version) VALUES ($1,'legacy',3,1) RETURNING *", [randomUUID()])).rows[0];
      for (const [type, change, reserved] of [['init_credits', 10, 0], ['reserve', 0, 3], ['update', 0, -1], ['release', 0, -2], ['transfer', -3, -3], ['transfer', 3, 0]]) await insert(type, change, 'legacy', reserved, type === 'init_credits' ? undefined : reservation);
      await apply(latest);
      const rows = (await client.query('SELECT * FROM credit_history ORDER BY sequence_id')).rows;
      assert.deepEqual(rows.map((row) => row.type).sort(), expected.sort());
      assert.equal(new Set(rows.map((row) => row.sequence_id)).size, 6);
      assert.ok(rows.every((row) => typeof row.sequence_id === 'string'));
      const { rows: [column] } = await client.query("SELECT data_type, is_identity, identity_generation FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'credit_history' AND column_name = 'sequence_id'", [schema]);
      assert.deepEqual(column, { data_type: 'bigint', is_identity: 'YES', identity_generation: 'ALWAYS' });
      const indexes = (await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = 'credit_history'", [schema])).rows;
      assert.ok(indexes.find((row) => row.indexname === 'credit_history_sequence_id_unique').indexdef.includes('UNIQUE'));
      assert.ok(indexes.find((row) => row.indexname === 'credit_history_user_sequence_idx').indexdef.includes('(user_id, sequence_id DESC)'));
      assert.ok(indexes.find((row) => row.indexname === 'credit_history_initial_grant_unique').indexdef.includes("WHERE (type = 'INITIAL_GRANT'::text)"));
      assert.ok(!indexes.some((row) => /order_id/.test(row.indexdef)));
      await assert.rejects(insert('INITIAL_GRANT', 10), (error) => error.code === '23505');
      for (const type of ['init_credits', 'reserve', 'update', 'release', 'transfer', 'RESERVARTION_UPDATED']) {
        await assert.rejects(insert(type), (error) => error.code === '23514');
      }
      await assert.rejects(client.query("INSERT INTO credit_history (user_id, type, total_amount_change, total_reserved_change, sequence_id) VALUES ('other', 'RESERVED', 0, 1, 999)"), (error) => error.code === '428C9');
    });

    await apply('007_credit_delta_constraints.sql');
    await apply('008_history_links_and_uniqueness.sql');
    await apply('009_remove_account_reservation_timestamps.sql');
    await apply('010_remove_idempotency_metadata.sql');

    await t.test('sequence boundary excludes writes during paging and preserves bigint precision', async () => {
      const service = new CreditService(pool);
      const userId = randomUUID();
      await client.query('ALTER SEQUENCE credit_history_sequence_id_seq RESTART WITH 9007199254740993');
      await service.initCredits({ userId });
      for (let i = 0; i < 4; i += 1) {
        const orderId = randomUUID();
        await service.reserveCredits({ orderId, requesterId: userId, amount: 1 });
        await service.releaseCredits({ orderId });
      }
      const connection = await pool.connect();
      try {
        const repository = new SqlCreditRepository(connection);
        const all = await repository.findHistoryByUser(userId, undefined, 100);
        assert.equal(all.length, 9);
        assert.equal(all.at(-1).sequenceId, '9007199254740993');
        assert.equal(await repository.findHistorySequenceId(all.at(-1).id, userId), '9007199254740993');
        assert.equal(await repository.findHistorySequenceId(all.at(-1).id, 'other'), undefined);
        assert.equal(await repository.findHistorySequenceId(randomUUID(), userId), undefined);
        const first = await repository.findHistoryByUser(userId, undefined, 3);
        const boundary = first.at(-1).sequenceId;
        await service.reserveCredits({ orderId: randomUUID(), requesterId: userId, amount: 1 });
        const rest = await repository.findHistoryByUser(userId, boundary, 100);
        assert.deepEqual([...first, ...rest].map((row) => row.id), all.map((row) => row.id));
        assert.ok(rest.every((row) => BigInt(row.sequenceId) < BigInt(boundary)));
        assert.deepEqual(await repository.findHistoryByUser('unknown', undefined, 100), []);
      } finally { connection.release(); }
    });

    await t.test('user-history service defaults to 50, caps at 100, scopes tokens and excludes later writes', async () => {
      const service = new CreditService(pool);
      const userId = randomUUID();
      await service.initCredits({ userId });
      for (let i = 0; i < 51; i += 1) {
        const orderId = randomUUID();
        await service.reserveCredits({ orderId, requesterId: userId, amount: 1 });
        await service.releaseCredits({ orderId });
      }
      const first = await service.getUserCreditHistory({ userId });
      assert.equal(first.entries.length, 50);
      assert.ok(first.entries.every((row) => row.userId === userId));
      assert.equal(typeof first.entries[0].sequenceId, 'string');
      assert.equal(Buffer.from(first.nextPageToken, 'base64url').toString('utf8'), first.entries.at(-1).id);
      const hundred = await service.getUserCreditHistory({ userId, pageSize: 100 });
      assert.equal(hundred.entries.length, 100);
      await service.reserveCredits({ orderId: randomUUID(), requesterId: userId, amount: 1 });
      const second = await service.getUserCreditHistory({ userId, pageToken: first.nextPageToken });
      const last = await service.getUserCreditHistory({ userId, pageToken: second.nextPageToken });
      assert.equal(second.entries.length, 50);
      assert.equal(last.entries.length, 3);
      assert.equal(last.nextPageToken, null);
      const ids = [...first.entries, ...second.entries, ...last.entries].map((row) => row.sequenceId);
      assert.equal(new Set(ids).size, 103);
      assert.deepEqual(ids, [...ids].sort((a, b) => BigInt(a) > BigInt(b) ? -1 : 1));
      assert.deepEqual(await service.getUserCreditHistory({ userId: 'unknown' }), { entries: [], nextPageToken: null });
      for (const input of [
        { userId: 'other', pageToken: first.nextPageToken },
        { userId, pageToken: encodeHistoryBookmark(randomUUID()) },
        { userId, pageToken: Buffer.from(JSON.stringify({ userId, sequenceId: first.entries.at(-1).sequenceId })).toString('base64url') },
      ]) await assert.rejects(service.getUserCreditHistory(input), error =>
        error instanceof ValidationError && error.message === 'Invalid history page token');
    });

    await t.test('REST pages omit sequence IDs and match database sequence order across a later write', async () => {
      const service = new CreditService(pool);
      const userId = randomUUID();
      await service.initCredits({ userId });
      for (let i = 0; i < 3; i += 1) {
        const orderId = randomUUID();
        await service.reserveCredits({ orderId, requesterId: userId, amount: 1 });
        await service.releaseCredits({ orderId });
      }
      const expected = (await client.query(
        'SELECT id, sequence_id FROM credit_history WHERE user_id = $1 ORDER BY sequence_id DESC', [userId],
      )).rows;
      assert.ok(expected.every((row) => BigInt(row.sequence_id) > 9007199254740992n));
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const server = createRestServer(service, publicKey.export({ type: 'spki', format: 'pem' }), async () => true, () => false);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const origin = 'http://127.0.0.1:' + server.address().port;
      const headers = { authorization: 'Bearer ' + jwt.sign({ sub: userId }, privateKey, { algorithm: 'RS256', expiresIn: 60 }) };
      const seen = [];
      let token;
      let firstToken;
      try {
        do {
          const response = await fetch(origin + '/credits/me/history?pageSize=2' + (token ? '&pageToken=' + encodeURIComponent(token) : ''), { headers });
          assert.equal(response.status, 200);
          const page = await response.json();
          for (const entry of page.entries) {
            assert.equal(Object.hasOwn(entry, 'sequenceId'), false);
            assert.equal(Object.hasOwn(entry, 'sequence_id'), false);
            seen.push(entry.id);
          }
          if (page.nextPageToken !== null) {
            assert.equal(Buffer.from(page.nextPageToken, 'base64url').toString('utf8'), page.entries.at(-1).id);
          }
          if (!token) {
            firstToken = page.nextPageToken;
            await service.reserveCredits({ orderId: randomUUID(), requesterId: userId, amount: 1 });
          }
          token = page.nextPageToken;
        } while (token);
        assert.deepEqual(seen, expected.map((row) => row.id));
        assert.equal(new Set(seen).size, expected.length);
        const otherHeaders = { authorization: 'Bearer ' + jwt.sign({ sub: 'other' }, privateKey, { algorithm: 'RS256', expiresIn: 60 }) };
        for (const [badToken, callerHeaders] of [
          ['garbage', headers],
          [Buffer.from('not-a-uuid').toString('base64url'), headers],
          [encodeHistoryBookmark(randomUUID()), headers],
          [Buffer.from(JSON.stringify({ userId, sequenceId: expected[0].sequence_id })).toString('base64url'), headers],
          [firstToken, otherHeaders],
        ]) {
          const response = await fetch(origin + '/credits/me/history?pageToken=' + encodeURIComponent(badToken), { headers: callerHeaders });
          assert.equal(response.status, 400);
          assert.deepEqual(await response.json(), { error: 'Bad Request', message: 'Invalid history page token' });
        }
      } finally { await new Promise((resolve) => server.close(resolve)); }
    });

    await t.test('an uncommitted history writer holds the user account lock through commit', { timeout: 10000 }, async () => {
      const service = new CreditService(pool);
      const userId = randomUUID();
      await service.initCredits({ userId });
      const orderId = randomUUID();
      const reservation = await service.reserveCredits({ orderId, requesterId: userId, amount: 2 });
      await client.query('BEGIN');
      let pending;
      try {
        await client.query('SELECT user_id FROM credit_accounts WHERE user_id = $1 FOR UPDATE', [userId]);
        const { rows: [late] } = await client.query("INSERT INTO credit_history (user_id, order_id, reservation_id, type, total_amount_change, total_reserved_change) VALUES ($1, $2, $3, 'RESERVATION_UPDATED', 0, 1) RETURNING sequence_id", [userId, orderId, reservation.reservationId]);
        pending = service.updateReservation({ orderId, amount: 3, expectedVersion: 1 });
        // The page query can see committed rows while the later insert remains invisible.
        const reader = await pool.connect();
        let first;
        try { first = await new SqlCreditRepository(reader).findHistoryByUser(userId, undefined, 1); }
        finally { reader.release(); }
        assert.ok(BigInt(first[0].sequenceId) < BigInt(late.sequence_id));
        await client.query('COMMIT');
        await pending;
        const reader2 = await pool.connect();
        try {
          const repository = new SqlCreditRepository(reader2);
          const laterPage = await repository.findHistoryByUser(userId, first[0].sequenceId, 100);
          assert.equal(laterPage.length, 1);
          assert.equal(laterPage[0].type, 'INITIAL_GRANT');
          const latestRows = await repository.findHistoryByUser(userId, undefined, 2);
          assert.ok(BigInt(latestRows[0].sequenceId) > BigInt(late.sequence_id));
          assert.equal(latestRows[1].sequenceId, late.sequence_id);
        } finally { reader2.release(); }
      } catch (error) {
        await client.query('ROLLBACK');
        if (pending) await pending.catch(() => {});
        throw error;
      }
    });
  } finally {
    await pool.end();
    try { if (connected) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await client.end(); }
  }
});
