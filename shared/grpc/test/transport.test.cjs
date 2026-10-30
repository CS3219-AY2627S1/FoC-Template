// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-21 (Asia/Singapore).
// Scope: Verified six authenticated credit RPCs, removed initialization/history calls, and corrected the stale User Service stub assertion.
// Author review: I reviewed that the tests are correctly specified and verified.
// Prompts and key responses: ../../../credit-service/ai/usage-log.md, entries 007, 009–012, 016, 021 and 024.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createRequire } = require('node:module');
require('tsx/cjs');
const { status, Metadata } = require('@grpc/grpc-js');
const rpc = require('../dist');
const userServer = require('../../../user-service/src/grpc/server.ts');
// Existing services may have their own dependency installation. Server credentials
// must come from the same grpc-js instance that constructed the existing server.
const userRequire = createRequire(path.resolve(__dirname, '../../../user-service/package.json'));
const userCredentials = userRequire('@grpc/grpc-js').ServerCredentials;
const orderServer = require('../../../order-service/grpc/dist/grpc/server.js');
const creditServer = require('../../../credit-service/dist/grpc/server.js');

async function listen(t, server, createClient, config, serverCredentials) {
  const port = await rpc.startServer(server, 0, '127.0.0.1', serverCredentials);
  const client = createClient('127.0.0.1:' + port, config);
  t.after(async () => {
    client.close();
    await rpc.stopServer(server, 100);
  });
  return client;
}

test('scaffold stubs are reachable, credit rejects unauthenticated calls, and user validates missing IDs', async (t) => {
  const user = await listen(
    t,
    userServer.createGrpcServer(),
    rpc.createUserClient,
    undefined,
    userCredentials.createInsecure(),
  );
  const order = await listen(t, orderServer.createGrpcServer(), rpc.createOrderClient);
  const credit = await listen(t, creditServer.createGrpcServer({}, {}), rpc.createCreditClient);
  for (const invoke of [
    () => order.getOrder({ orderId: 'order-1' }),
  ]) {
    await assert.rejects(invoke(), (error) => error.code === status.UNIMPLEMENTED);
  }
  for (const invoke of [
    () => credit.getBalance({ userId: 'user-1' }),
    () => credit.reserveCredits({ orderId: 'order-1', requesterId: 'user-1', amount: 4 }),
    () => credit.updateReservation({ orderId: 'order-1', amount: 5, expectedVersion: 1 }),
    () => credit.releaseCredits({ orderId: 'order-1' }),
    () => credit.settleCredits({ orderId: 'order-1', courierId: 'user-2' }),
    () => credit.getReservation({ orderId: 'order-1' }),
  ]) {
    await assert.rejects(invoke(), (error) => error.code === status.UNAUTHENTICATED);
  }
  await assert.rejects(user.getPublicProfile({}), (error) => error.code === status.INVALID_ARGUMENT);
});

test('public profile fields use the existing user wire contract', async (t) => {
  const profile = { userId: 'u1', username: 'student', firstName: 'Campus', lastName: 'Friend' };
  const server = rpc.createServer(rpc.UserService.service, {
    GetPublicProfile(call, callback) {
      assert.equal(call.request.userId, 'u1');
      callback(null, profile);
    },
  });
  const client = await listen(t, server, rpc.createUserClient);
  assert.deepEqual(await client.getPublicProfile({ userId: 'u1' }), profile);
});

test('supplier bigint IDs retain precision and floors are integers', async (t) => {
  const id = '9007199254740993';
  const server = rpc.createServer(rpc.SupplierService.service, {
    GetSupplier(call, callback) {
      assert.equal(call.request.supplierId, id);
      callback(null, {
        supplierId: id,
        name: 'NUS Co-op',
        type: 'shopping',
        buildingName: 'Central Library',
        floor: 1,
        locationDescription: 'Inside the library',
        latitude: 1.2967,
        longitude: 103.7732,
      });
    },
    IsOpen: rpc.unimplemented('IsOpen'),
  });
  const client = await listen(t, server, rpc.createSupplierClient);
  const supplier = await client.getSupplier({ supplierId: id });
  assert.equal(supplier.supplierId, id);
  assert.equal(supplier.floor, 1);
  assert.equal(supplier.buildingName, 'Central Library');
  assert.equal(supplier.startingTime, undefined);
});

test('supplier IsOpen returns a boolean', async (t) => {
  const server = rpc.createServer(rpc.SupplierService.service, {
    GetSupplier: rpc.unimplemented('GetSupplier'),
    IsOpen(call, callback) {
      assert.equal(call.request.supplierId, '1');
      callback(null, { isOpen: true });
    },
  });
  const client = await listen(t, server, rpc.createSupplierClient);
  assert.deepEqual(await client.isOpen({ supplierId: '1' }), { isOpen: true });
});

test('metadata and gRPC error codes/details survive the client wrapper', async (t) => {
  const metadata = new Metadata();
  metadata.set('x-request-id', 'grpc-test');
  const server = rpc.createServer(rpc.CreditService.service, {
    GetBalance(call, callback) {
      assert.deepEqual(call.metadata.get('x-request-id'), ['grpc-test']);
      callback({ code: status.INVALID_ARGUMENT, details: 'userId is required' });
    },
  });
  const client = await listen(t, server, rpc.createCreditClient);
  await assert.rejects(
    client.getBalance({}, { metadata }),
    (error) => error.code === status.INVALID_ARGUMENT && error.details === 'userId is required',
  );
});

test('clients enforce a finite timeout and respect an earlier upstream deadline', async (t) => {
  let receivedDeadline;
  const server = rpc.createServer(rpc.CreditService.service, {
    GetBalance(call, callback) {
      if (call.request.userId === 'ready') {
        callback(null, { totalCredits: 0, availableCredits: 0, reservedCredits: 0 });
      } else {
        receivedDeadline = call.getDeadline();
        // Intentionally leave this test RPC pending until its deadline.
      }
    },
  });
  const client = await listen(t, server, rpc.createCreditClient, { timeoutMs: 150 });
  await client.getBalance({ userId: 'ready' }, { timeoutMs: 3000 });
  await assert.rejects(
    client.getBalance({ userId: 'slow' }),
    (error) => error.code === status.DEADLINE_EXCEEDED,
  );
  const deadline = Date.now() + 150;
  await assert.rejects(
    client.getBalance(
      { userId: 'slow' },
      {
        timeoutMs: 3000,
        deadline: new Date(deadline),
      },
    ),
    (error) => error.code === status.DEADLINE_EXCEEDED,
  );
  assert.ok(receivedDeadline <= deadline + 20);
});
