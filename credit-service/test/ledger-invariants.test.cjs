// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
// Scope: Implemented human-specified scoped SQL ledger checks and seeded bounded-parallel credit scenarios.
// Author review: I reviewed that the test specification is correct.
// Prompts/key responses: ../ai/usage-log.md, entry 039.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client, Pool } = require('pg');
require('tsx/cjs');
const { CreditService, CreditOperationError } = require('../src/services/CreditService.ts');
const { assertLedgerInvariants, findLedgerViolations } = require('./helpers/ledger-invariants.cjs');

const POOL_SIZE = 6;
const ROUNDS = 8;
const REQUESTS_PER_ROUND = 48;

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
}

async function withScenario(seed, body) {
  const schema = 'ledger_check_' + randomUUID().replaceAll('-', '');
  const admin = new Client({ connectionTimeoutMillis: 5000 });
  const pool = new Pool({ max: POOL_SIZE, connectionTimeoutMillis: 5000,
    options: '-c search_path=' + schema + ' -c statement_timeout=15000 -c lock_timeout=5000' });
  const service = new CreditService(pool);
  const random = seededRandom(seed);
  const pick = values => values[Math.floor(random() * values.length)];
  const uuid = () => {
    const chars = Array.from({ length: 4 }, () => Math.floor(random() * 0x100000000).toString(16).padStart(8, '0')).join('').split('');
    chars[12] = '4'; chars[16] = ((parseInt(chars[16], 16) & 3) | 8).toString(16);
    const hex = chars.join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  };
  const userIds = Array.from({ length: 4 }, (_, i) => `ledger-${seed}-${i}`);
  const orders = new Set();
  const pastRequests = [];
  const stats = { attempted: {}, succeeded: {}, businessErrors: 0, maxParallel: 0 };
  let connected = false, active = 0;
  const scope = async () => ({ userIds, reservationIds: (await admin.query(
    'SELECT reservation_id FROM reservations WHERE order_id = ANY($1::uuid[]) ORDER BY reservation_id', [[...orders]],
  )).rows.map(row => row.reservation_id) });
  const verify = async label => {
    assert.equal(active, 0, 'All mutations must settle before checking the ledger');
    await assertLedgerInvariants(admin, await scope(), `seed=${seed} ${label}`);
  };
  const round = async (label, requests) => {
    let cursor = 0;
    const unexpected = [];
    const workers = Array.from({ length: Math.min(POOL_SIZE, requests.length) }, async () => {
      while (cursor < requests.length && unexpected.length === 0) {
        const request = requests[cursor++];
        stats.attempted[request.method] = (stats.attempted[request.method] ?? 0) + 1;
        if (request.input.orderId) orders.add(request.input.orderId);
        active += 1; stats.maxParallel = Math.max(stats.maxParallel, active);
        try {
          await service[request.method]({ ...request.input });
          stats.succeeded[request.method] = (stats.succeeded[request.method] ?? 0) + 1;
        } catch (error) {
          if (error instanceof CreditOperationError && ['NOT_FOUND', 'FAILED_PRECONDITION', 'ALREADY_EXISTS'].includes(error.code)) stats.businessErrors += 1;
          else unexpected.push({ request, error }); // Includes deadlocks (40P01); never retry/hide them here.
        } finally { active -= 1; }
      }
    });
    await Promise.all(workers);
    assert.equal(active, 0);
    if (unexpected.length) {
      const first = unexpected[0];
      throw new Error(`seed=${seed} ${label}: unexpected ${first.error.code ?? first.error.name} in ${JSON.stringify(first.request)}`, { cause: first.error });
    }
    pastRequests.push(...requests);
    await verify(label);
  };
  const reserve = (requesterId, amount = 1, orderId = uuid()) => ({ method: 'reserveCredits', input: { orderId, requesterId, amount } });
  const update = (orderId, amount, expectedVersion) => ({ method: 'updateReservation', input: { orderId, amount, expectedVersion } });
  const release = orderId => ({ method: 'releaseCredits', input: { orderId } });
  const settle = (orderId, courierId) => ({ method: 'settleCredits', input: { orderId, courierId } });
  const ctx = { seed, schema, admin, service, pool, userIds, orders, stats, random, pick, uuid, scope, verify, round, reserve, update, release, settle, pastRequests };
  try {
    await admin.connect(); connected = true;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir(join(__dirname, '../migrations'))).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      await admin.query('BEGIN');
      try { await admin.query(await readFile(join(__dirname, '../migrations', name), 'utf8')); await admin.query('COMMIT'); }
      catch (error) { await admin.query('ROLLBACK'); throw error; }
    }
    await round('initialize', userIds.map(userId => ({ method: 'initCredits', input: { userId } })));
    await body(ctx);
    assert.ok(stats.maxParallel <= POOL_SIZE);
  } finally {
    await pool.end();
    try { if (connected) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  }
}

async function deterministic(ctx) {
  const { userIds: [a, b, c, d], reserve, round, update, release, settle } = ctx;
  const holds = [reserve(a, 3), reserve(b, 3), reserve(c, 2), reserve(d, 1)];
  await round('four parallel holds', holds);
  const [one, two, three, active] = holds.map(row => row.input.orderId);
  const edit = update(one, 4, 1);
  await round('increase, decrease and duplicate update', [edit, edit, update(two, 2, 1)]);
  await round('opposing settlements and duplicate release', [settle(one, b), settle(two, a), release(three), release(three)]);
  await round('terminal replays and rejected transitions', [settle(one, b), settle(one, c), release(one), settle(three, a), holds[0], edit]);
  for (const method of ['reserveCredits', 'updateReservation', 'releaseCredits', 'settleCredits']) assert.ok(ctx.stats.succeeded[method] > 0, method);
  return { one, three, active };
}

async function verifyOracle(ctx, ids) {
  const { admin, scope, verify, userIds } = ctx;
  const r = (await admin.query('SELECT * FROM reservations WHERE order_id = $1', [ids.active])).rows[0];
  const probes = [
    ["UPDATE credit_history SET order_id = $1 WHERE reservation_id = $2 AND type = 'RESERVED'", [ctx.uuid(), r.reservation_id], 'history_links_and_actor'],
    ["UPDATE credit_history SET user_id = $1 WHERE reservation_id = $2 AND type = 'RESERVED'", [userIds[0], r.reservation_id], 'history_links_and_actor'],
    ['UPDATE reservations SET version = version + 1 WHERE reservation_id = $1', [r.reservation_id], 'reservation_version'],
    ['UPDATE reservations SET credit_amount = credit_amount + 1 WHERE reservation_id = $1', [r.reservation_id], 'reservation_held_amount'],
    ['UPDATE credit_accounts SET reserved_credits = reserved_credits + 1 WHERE user_id = $1', [r.requester_id], 'account_active_holds'],
    ['UPDATE credit_accounts SET total_credits = total_credits + 1 WHERE user_id = $1', [r.requester_id], 'account_history_balances'],
    ['UPDATE credit_accounts SET total_credits = total_credits + 1 WHERE user_id = $1', [r.requester_id], 'scenario_conservation'],
    ["DELETE FROM credit_history WHERE reservation_id = $1 AND type = 'RESERVED'", [r.reservation_id], 'reservation_original_hold'],
    ["DELETE FROM credit_history WHERE order_id = $1 AND type = 'TRANSFER_IN'", [ids.one], 'reservation_status_history'],
    ["DELETE FROM credit_history WHERE order_id = $1 AND type = 'RELEASED'", [ids.three], 'reservation_status_history'],
    ["UPDATE credit_history SET total_amount_change = -1, total_reserved_change = -1 WHERE order_id = $1 AND type = 'TRANSFER_OUT'", [ids.one], 'reservation_status_history'],
    ["UPDATE credit_history SET total_amount_change = total_amount_change + 1 WHERE order_id = $1 AND type = 'TRANSFER_IN'", [ids.one], 'reservation_status_history'],
    ["UPDATE credit_history SET total_reserved_change = -1 WHERE order_id = $1 AND type = 'RELEASED'", [ids.three], 'reservation_status_history'],
    ["UPDATE credit_history SET user_id = $1 WHERE order_id = $2 AND type = 'TRANSFER_IN'", [userIds[2], ids.one], 'history_links_and_actor'],
    ["INSERT INTO credit_history (user_id, order_id, reservation_id, type, total_amount_change, total_reserved_change) VALUES ($1,$2,$3,'RELEASED',0,-1),($1,$2,$3,'TRANSFER_OUT',-1,-1),($4,$2,$3,'TRANSFER_IN',1,0)", [r.requester_id, r.order_id, r.reservation_id, userIds[0]], 'reservation_terminal_sets'],
  ];
  for (const [sql, values, expected] of probes) {
    await admin.query('BEGIN');
    try {
      await admin.query(sql, values);
      const violations = await findLedgerViolations(admin, await scope());
      assert.ok(violations.some(row => row.violation === expected), `Oracle must detect deliberately injected ${expected}`);
    } finally { await admin.query('ROLLBACK'); }
    await verify('after rolled-back oracle probe');
  }
  const existingScope = await scope();
  assert.ok((await findLedgerViolations(admin, {
    ...existingScope, userIds: [...userIds, 'missing-scenario-account'],
  })).some(row => row.violation === 'scenario_missing_account'));
  // A deliberately inconsistent unrelated fixture must not affect this scenario.
  const outsider = 'unrelated-' + ctx.seed;
  await ctx.service.initCredits({ userId: outsider });
  const outsideReservation = await ctx.service.reserveCredits({ orderId: ctx.uuid(), requesterId: outsider, amount: 1 });
  await admin.query('BEGIN');
  try {
    await admin.query('UPDATE credit_accounts SET total_credits = 99 WHERE user_id = $1', [outsider]);
    await admin.query('UPDATE reservations SET version = 99 WHERE reservation_id = $1', [outsideReservation.reservationId]);
    await verify('ignores unrelated account outside the explicit scope');
    assert.ok((await findLedgerViolations(admin, { userIds: [outsider], reservationIds: [outsideReservation.reservationId] })).length > 0);
  } finally { await admin.query('ROLLBACK'); }
}

async function randomized(ctx) {
  const { admin, userIds, pick, random, round, reserve, update, release, settle, uuid, pastRequests } = ctx;
  for (let number = 0; number < ROUNDS; number += 1) {
    const snapshot = (await admin.query('SELECT * FROM reservations WHERE order_id = ANY($1::uuid[]) ORDER BY order_id', [[...ctx.orders]])).rows;
    const requests = [];
    const target = snapshot.find(row => row.status === 'RESERVED');
    if (target) {
      const amount = target.credit_amount + 1;
      const courier = pick(userIds.filter(userId => userId !== target.requester_id));
      const edit = update(target.order_id, amount, target.version);
      requests.push(edit, edit, update(target.order_id, amount + 1, target.version), release(target.order_id), settle(target.order_id, courier), settle(target.order_id, courier));
    }
    while (requests.length < REQUESTS_PER_ROUND) {
      const kind = Math.floor(random() * 5);
      const r = snapshot.length ? pick(snapshot) : undefined;
      if (kind === 0 || !r) {
        const request = reserve(pick(userIds), 1 + Math.floor(random() * 14), uuid());
        requests.push(request);
        if (random() < 0.3 && requests.length < REQUESTS_PER_ROUND) requests.push(request);
      } else if (kind === 1) requests.push(update(r.order_id, 1 + Math.floor(random() * 14), random() < 0.75 ? r.version : 1));
      else if (kind === 2) requests.push(release(r.order_id));
      else if (kind === 3) requests.push(settle(r.order_id, pick(userIds))); // Includes self-settle business failures.
      else requests.push(pick(pastRequests)); // Replays both successful and previously rejected logical actions.
    }
    // Seeded Fisher-Yates controls submission order; concurrent winners can vary.
    for (let i = requests.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [requests[i], requests[j]] = [requests[j], requests[i]]; }
    await round('random round ' + number, requests);
  }
}

test('scoped SQL ledger invariants hold across deterministic and seeded parallel scenarios', {
  skip: !process.env.PGDATABASE && 'Set PGDATABASE and PG connection variables for ledger scenarios.',
  timeout: 120000,
}, async (t) => {
  t.mock.method(console, 'info', () => {});
  const override = process.env.CREDIT_INVARIANT_SEED;
  if (override !== undefined) assert.ok(/^\d+$/.test(override) && Number(override) <= 0xffffffff, 'CREDIT_INVARIANT_SEED must be a uint32 decimal');
  const seeds = override === undefined ? [0x3219, 0x8f823, 0x5eed1234, 0xdeadbeef] : [Number(override)];
  let seed = 0x3219;
  try {
    await withScenario(seed, async ctx => { const ids = await deterministic(ctx); await verifyOracle(ctx, ids); });
    for (seed of seeds) {
      await withScenario(seed, async ctx => {
        await deterministic(ctx);
        await randomized(ctx);
        t.diagnostic(`seed=${seed} ${JSON.stringify(ctx.stats)}`);
      });
    }
  } catch (error) {
    t.diagnostic(`FAILED seed=${seed}; rerun with CREDIT_INVARIANT_SEED=${seed}. Stop: no remaining scenario rounds/seeds run.`);
    throw error;
  }
});
