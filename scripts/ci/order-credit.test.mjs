// AI assistance: OpenAI Codex, 2026-11-09. Scope: approved real-service messaging/SQL assertions. Review: Reviewed and approved by @ron on 2026-11-09.
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../order-service/package.json', import.meta.url));
const { Pool } = require('pg');
const { KafkaJS } = require('@confluentinc/kafka-javascript');
const required = key => { if (!process.env[key]) throw new Error(`${key} is required; use scripts/ci/messaging.mjs journey`); return process.env[key]; };
const userApi = required('USER_API');
const orderApi = required('ORDER_API');
const supplierApi = required('SUPPLIER_API');
const order = new Pool({ connectionString: required('ORDER_DATABASE_URL') });
const credit = new Pool({ connectionString: required('CREDIT_DATABASE_URL') });
const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: required('KAFKA_BROKERS').split(','), clientId: 'ci-real-services', logLevel: KafkaJS.logLevel.ERROR } });
const producer = kafka.producer({ kafkaJS: { idempotent: true, acks: -1 } });
const admin = kafka.admin();
const observer = kafka.consumer({ kafkaJS: { groupId: `ci-dlq-${randomUUID()}`, fromBeginning: true } });
const dead = [];

async function until(label, check, timeout = 30_000) {
  const end = Date.now() + timeout;
  do {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < end);
  throw new Error(`Timed out waiting for ${label}`);
}

async function api(base, path, token, body, status = 200) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
  return data;
}

async function balance(id) {
  const { rows } = await credit.query('SELECT available_balance::int AS available, reserved_balance::int AS reserved FROM credit_accounts WHERE user_id=$1', [id]);
  return rows[0];
}
async function expectBalance(id, available, reserved) {
  await until('exact credit balance', async () => {
    const row = await balance(id);
    return row?.available === available && row?.reserved === reserved;
  });
  assert.deepEqual(await balance(id), { available, reserved });
}
async function account() {
  const username = `ci_${randomUUID().slice(0, 8)}`;
  const member = await api(userApi, '/auth/register', null, { username, email: `${username}@u.nus.edu`, password: 'CiMessagingPassword1' }, 201);
  const { accessToken } = await api(userApi, '/auth/login', null, { identifier: username, password: 'CiMessagingPassword1' });
  await expectBalance(member.id, 100, 0);
  return { id: member.id, token: accessToken };
}
async function create(member, amount) {
  const catalogue = await api(supplierApi, '/api/v1/suppliers', member.token);
  assert.ok(catalogue.items.length, 'live seeded Supplier required');
  const now = Date.now();
  return api(orderApi, '/errands', member.token, {
    supplierId: catalogue.items[0].id, items: [{ name: 'Messaging test', quantity: 1 }], dropoffLocation: 'COM2 lobby', notes: null,
    creditAmount: amount, listingDeadline: new Date(now + 3600000).toISOString(), pickupDeadline: new Date(now + 7200000).toISOString(), deliveryDeadline: new Date(now + 10800000).toISOString(),
  }, 202);
}
async function state(member, id, expected) {
  return until(`Order state ${expected}`, async () => {
    const data = await api(orderApi, `/errands/${id}`, member.token);
    return data.state === expected ? data : false;
  });
}
async function replay(db, topic, id, type) {
  const { rows } = await db.query('SELECT payload FROM outbox WHERE message_key=$1 AND event_type=$2', [id, type]);
  assert.equal(rows.length, 1, 'one logical outbox event');
  await producer.send({ topic, messages: [{ key: id, value: JSON.stringify(rows[0].payload) }] });
}
async function consumed(topic, group) {
  const target = await admin.fetchTopicOffsets(topic);
  await until(`${group} consumed replay`, async () => {
    const [offsets] = await admin.fetchOffsets({ groupId: group, topics: [topic] });
    return target.every(p => BigInt(offsets.partitions.find(q => q.partition === p.partition)?.offset ?? '-1') >= BigInt(p.high));
  });
}
async function count(db, sql, values) { return Number((await db.query(sql, values)).rows[0].n); }

before(async () => {
  await producer.connect(); await admin.connect(); await observer.connect();
  await observer.subscribe({ topics: ['credit.commands.dlq'] });
  await observer.run({ eachMessage: async ({ message }) => dead.push({ key: message.key?.toString(), body: JSON.parse(message.value.toString()) }) });
});
after(async () => {
  await observer.disconnect(); await producer.disconnect(); await admin.disconnect();
  await order.end(); await credit.end();
});

test('actual Order and Credit: reserve, duplicate commands/replies, and complete pay exactly once', { timeout: 120_000 }, async () => {
  const requester = await account(); const courier = await account();
  const e = await create(requester, 25);
  await state(requester, e.id, 'OPEN');
  await expectBalance(requester.id, 75, 25);
  await replay(order, 'credit.commands', e.id, 'ReserveRequested');
  await consumed('credit.commands', 'credit-service');
  await replay(credit, 'credit.results', e.id, 'CreditReserved');
  await consumed('credit.results', 'order-service');
  assert.equal(await count(credit, 'SELECT count(*) AS n FROM credit_reservations WHERE order_id=$1', [e.id]), 1);
  assert.equal(await count(order, "SELECT count(*) AS n FROM errand_history WHERE errand_id=$1 AND action='reserved'", [e.id]), 1);
  for (const action of ['accept', 'pickup', 'deliver']) await api(orderApi, `/errands/${e.id}/${action}`, courier.token, {});
  await api(orderApi, `/errands/${e.id}/confirm`, requester.token, {});
  await state(requester, e.id, 'COMPLETED');
  await expectBalance(requester.id, 75, 0); await expectBalance(courier.id, 125, 0);
  await replay(order, 'credit.commands', e.id, 'OrderCompleted');
  await consumed('credit.commands', 'credit-service');
  assert.deepEqual(await balance(courier.id), { available: 125, reserved: 0 });
  assert.equal(await count(credit, "SELECT count(*) AS n FROM credit_transactions WHERE order_id=$1 AND type='CAPTURE_CREDIT'", [e.id]), 1);
  assert.equal(await count(order, "SELECT count(*) AS n FROM errand_history WHERE errand_id=$1 AND to_state='COMPLETED'", [e.id]), 1);
});

test('actual Order and Credit: cancellation releases a hold exactly once', { timeout: 90_000 }, async () => {
  const member = await account(); const e = await create(member, 20);
  await state(member, e.id, 'OPEN'); await expectBalance(member.id, 80, 20);
  await api(orderApi, `/errands/${e.id}/cancel`, member.token, {});
  await state(member, e.id, 'CANCELLED'); await expectBalance(member.id, 100, 0);
  await replay(order, 'credit.commands', e.id, 'OrderCancelled');
  await consumed('credit.commands', 'credit-service');
  assert.deepEqual(await balance(member.id), { available: 100, reserved: 0 });
  assert.equal(await count(credit, "SELECT count(*) AS n FROM credit_transactions WHERE order_id=$1 AND type='RELEASE'", [e.id]), 1);
});

test('actual Order and Credit: invalid messages change nothing and later rejection/valid work completes', { timeout: 120_000 }, async () => {
  const member = await account();
  for (const value of ['{not-json', JSON.stringify({ type: 'ReserveRequested', schema_version: 999 })]) {
    const key = randomUUID();
    await producer.send({ topic: 'credit.commands', messages: [{ key, value }] });
    const dlq = await until('diagnostic DLQ message', () => dead.find(m => m.key === key));
    assert.equal(dlq.body.source_topic, 'credit.commands');
    assert.equal(typeof dlq.body.reason, 'string'); assert.ok(dlq.body.reason.length);
    assert.equal(dlq.body.original_value, value);
    assert.equal(await count(credit, 'SELECT count(*) AS n FROM credit_reservations WHERE order_id=$1', [key]), 0);
    assert.deepEqual(await balance(member.id), { available: 100, reserved: 0 });
  }
  const rejected = await create(member, 101);
  const closed = await state(member, rejected.id, 'RESERVATION_REJECTED');
  assert.equal(closed.rejectionReason, 'INSUFFICIENT_CREDIT');
  await expectBalance(member.id, 100, 0);
  const valid = await create(member, 10);
  await state(member, valid.id, 'OPEN'); await expectBalance(member.id, 90, 10);
  await api(orderApi, `/errands/${valid.id}/cancel`, member.token, {});
  await expectBalance(member.id, 100, 0);
});
