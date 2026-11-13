// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Generated credit wire tests and verified removal of initialization from the RPC service/client in favour of the human-decided event workflow.
// Author review: I reviewed that the tests are correctly specified and verified.
// Prompts and key responses: ../../../credit-service/ai/usage-log.md, entries 007, 009–012 and 016 and 021 and 026.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Metadata } = require('@grpc/grpc-js');
const rpc = require('../dist');

test('credit service and client expose exactly the six order-service RPCs without initialization', () => {
  assert.deepEqual(Object.keys(rpc.CreditService.service).sort(), [
    'GetBalance', 'GetReservation',
    'ReleaseCredits', 'ReserveCredits', 'SettleCredits', 'UpdateReservation',
  ]);
  const client = rpc.createCreditClient('127.0.0.1:1');
  try {
    assert.equal(Object.hasOwn(client, 'initCredits'), false);
    assert.equal(Object.hasOwn(client, 'getUserCreditHistory'), false);
    assert.equal(Object.hasOwn(client, 'getOrderCreditHistory'), false);
  } finally {
    client.close();
  }
});

test('credit RPCs transport the finalized response shapes without caller idempotency keys', async (t) => {
  const timestamp = { seconds: '1792454400', nanos: 123456000 };
  const common = {
    orderId: '00000000-0000-4000-8000-000000000001',
    requesterId: 'requester',
    amount: 3,
    reservationId: '00000000-0000-4000-8000-000000000002',
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const server = rpc.createServer(rpc.CreditService.service, {
    GetBalance(call, callback) {
      assert.equal(call.request.userId, 'requester');
      callback(null, {
        userId: 'requester', totalCredits: 10, reservedCredits: 3, availableCredits: 7,
        createdAt: timestamp, updatedAt: timestamp,
      });
    },
    ReserveCredits(call, callback) {
      assert.equal(call.request.requesterId, common.requesterId);
      assert.equal(call.request.amount, 3);
      assert.equal(Object.hasOwn(call.request, 'creditAmount'), false);
      assert.equal(Object.hasOwn(call.request, 'idempotencyKey'), false);
      callback(null, { ...common, status: 'RESERVED' });
    },
    UpdateReservation(call, callback) {
      assert.equal(call.request.orderId, common.orderId);
      assert.equal(call.request.amount, 5);
      assert.equal(call.request.expectedVersion, 1);
      assert.equal(Object.hasOwn(call.request, 'idempotencyKey'), false);
      callback(null, { ...common, amount: 5, version: 2, status: 'RESERVED' });
    },
    ReleaseCredits(call, callback) {
      assert.equal(call.request.orderId, common.orderId);
      assert.equal(Object.hasOwn(call.request, 'idempotencyKey'), false);
      callback(null, { ...common, status: 'RELEASED' });
    },
    SettleCredits(call, callback) {
      assert.equal(call.request.orderId, common.orderId);
      assert.equal(call.request.courierId, 'courier');
      assert.equal(Object.hasOwn(call.request, 'idempotencyKey'), false);
      callback(null, { ...common, status: 'SETTLED', courierId: call.request.courierId });
    },
    GetReservation(call, callback) {
      assert.equal(call.request.orderId, common.orderId);
      callback(null, { ...common, status: 'SETTLED', courierId: 'courier' });
    },
  });
  const port = await rpc.startServer(server, 0, '127.0.0.1');
  const client = rpc.createCreditClient('127.0.0.1:' + port);
  t.after(async () => {
    client.close();
    await rpc.stopServer(server, 100);
  });

  assert.deepEqual(await client.getBalance({ userId: 'requester' }), {
    userId: 'requester', totalCredits: 10, reservedCredits: 3, availableCredits: 7,
  });
  const reserved = await client.reserveCredits({
    orderId: common.orderId, requesterId: common.requesterId,
    amount: 3,
  });
  assert.equal(reserved.reservationId, common.reservationId);
  assert.equal(reserved.amount, 3);
  assert.equal(reserved.version, 1);
  assert.deepEqual(Object.keys(reserved).sort(), ['amount', 'orderId', 'requesterId', 'reservationId', 'status', 'version']);
  assert.equal(reserved.status, 'RESERVED');
  assert.equal(Object.hasOwn(reserved, 'courierId'), false);
  const updated = await client.updateReservation({ orderId: common.orderId, amount: 5, expectedVersion: 1 });
  assert.equal(updated.amount, 5);
  assert.equal(updated.version, 2);
  assert.equal((await client.releaseCredits({ orderId: common.orderId })).status, 'RELEASED');
  const settled = await client.settleCredits({ orderId: common.orderId, courierId: 'courier' });
  assert.equal(settled.status, 'SETTLED');
  assert.equal(settled.courierId, 'courier');
  // proto-loader exposes a synthetic oneof presence marker for optional courierId.
  assert.deepEqual(Object.keys(settled).filter((key) => !key.startsWith('_')).sort(), ['amount', 'courierId', 'orderId', 'requesterId', 'reservationId', 'status', 'version']);
  const { _courierId, ...lookedUp } = await client.getReservation({ orderId: common.orderId });
  assert.deepEqual(lookedUp, {
    orderId: common.orderId, requesterId: common.requesterId,
    reservationId: common.reservationId, courierId: 'courier',
    status: 'SETTLED', amount: 3, version: 1,
  });
});
