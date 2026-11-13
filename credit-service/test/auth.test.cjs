// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Tested human-specified service/JWT authentication, gRPC authorization/error metadata. Implemented/documented the human-decided plaintext-only Credit gRPC transport; service-token and REST JWT authentication retained.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–026, 035.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateKeyPairSync } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join } = require('node:path');
const jwt = require('jsonwebtoken');
const { Metadata, status } = require('@grpc/grpc-js');
require('tsx/cjs');
const { ValidationError } = require('../src/services/validation.ts');
const { serviceIdentityVerifier, AuthenticationError } = require('../src/grpc/auth.ts');
const { userTokenVerifier, AuthenticationError: UserAuthenticationError } = require('../src/rest/auth.ts');
const { grpcError } = require('../src/grpc/errors.ts');
const { CreditOperationError, CreditService } = require('../src/services/CreditService.ts');
const { createGrpcServer } = require('../src/grpc/server.ts');
const { startServer, stopServer, createCreditClient } = require('@foc/grpc');

test('service identity comes only from a distinct configured secret', () => {
  const identify = serviceIdentityVerifier({ 'order-service': 'order-secret', other: 'other-secret' });
  assert.equal(identify('order-secret'), 'order-service');
  assert.equal(identify('other-secret'), 'other');
  for (const token of [undefined, '', Buffer.from('order-secret'), 'unknown', 'order-service']) {
    assert.throws(() => identify(token), AuthenticationError);
  }
  assert.throws(() => serviceIdentityVerifier({ a: '', b: 'valid' }));
  assert.throws(() => serviceIdentityVerifier({ a: 'same', b: 'same' }));
});

test('user tokens require RSA RS256, a subject, and a future expiry', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const verify = userTokenVerifier(pair.publicKey.export({ type: 'spki', format: 'pem' }));
  const now = Math.floor(Date.now() / 1000);
  const sign = (payload, key = pair.privateKey, algorithm = 'RS256') =>
    'Bearer ' + jwt.sign(payload, key, { algorithm });
  assert.equal(verify(sign({ sub: 'student', exp: now + 60, role: 'admin', userId: 'someone-else' })), 'student');
  for (const authorization of [
    undefined, '', 'Bearer garbage',
    sign({ sub: 'student', exp: now - 1 }),
    sign({ sub: 'student' }),
    sign({ exp: now + 60 }),
    sign({ sub: '', exp: now + 60 }),
    sign({ sub: 'student', exp: now + 60 }, other.privateKey),
    sign({ sub: 'student', exp: now + 60 }, 'symmetric-secret', 'HS256'),
    sign({ sub: 'student', exp: now + 60 }, pair.privateKey, 'RS384'),
  ]) assert.throws(() => verify(authorization), UserAuthenticationError);
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  assert.throws(() => userTokenVerifier(ec.publicKey.export({ type: 'spki', format: 'pem' })), /must be RSA/);
});

test('business errors retain exact reason metadata; transient and unknown errors are classified', (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  for (const reason of ['ACCOUNT_NOT_FOUND', 'RESERVATION_NOT_FOUND', 'INSUFFICIENT_CREDITS', 'VERSION_CONFLICT', 'INVALID_STATE', 'REQUEST_CONFLICT']) {
    const error = grpcError(new CreditOperationError('FAILED_PRECONDITION', 'Expected business failure', reason));
    assert.equal(error.code, status.FAILED_PRECONDITION);
    assert.deepEqual(error.metadata.get('x-credit-error-reason'), [reason]);
  }
  assert.equal(grpcError(new ValidationError('Invalid amount')).code, status.INVALID_ARGUMENT);
  for (const code of ['40001', '40P01', '55P03']) assert.equal(grpcError({ code }).code, status.ABORTED);
  for (const code of ['08006', '57P01', 'ECONNRESET', 'ECONNREFUSED']) assert.equal(grpcError({ code }).code, status.UNAVAILABLE);
  for (const message of ['timeout exceeded when trying to connect', 'Connection terminated due to connection timeout', 'Connection terminated unexpectedly']) {
    assert.equal(grpcError(new Error(message)).code, status.UNAVAILABLE);
  }
  const unknown = grpcError(new Error('private database details'));
  assert.equal(unknown.code, status.INTERNAL);
  assert.ok(!unknown.details.includes('private'));
  assert.equal(logged.length, 1);
});

test('an ordinary service TypeError returns generic INTERNAL and is logged; validation remains INVALID_ARGUMENT', async (t) => {
  const failure = new TypeError('private service bug: cannot read balance property');
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  let connections = 0;
  const service = new CreditService({ async connect() { connections += 1; throw failure; } });
  const server = createGrpcServer(service, { 'order-service': 'order-secret' });
  const port = await startServer(server, 0, '127.0.0.1');
  const client = createCreditClient('127.0.0.1:' + port);
  t.after(async () => { client.close(); await stopServer(server, 100); });
  const metadata = new Metadata();
  metadata.set('x-credit-service-token', 'order-secret');
  await assert.rejects(client.getBalance({ userId: '' }, { metadata }), (error) => error.code === status.INVALID_ARGUMENT);
  assert.equal(connections, 0);
  assert.equal(logged.length, 0);
  await assert.rejects(client.getBalance({ userId: 'valid-user' }, { metadata }), (error) => {
    assert.equal(error.code, status.INTERNAL);
    assert.equal(error.details, 'Internal credit-service error');
    assert.ok(!error.message.includes('private'));
    assert.deepEqual(error.metadata.get('x-credit-error-reason'), []);
    return true;
  });
  assert.equal(connections, 1);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1], failure);
});

test('Credit configuration needs no local/TLS settings and ignores obsolete transport variables', async () => {
  const source = `
    const assert = require('node:assert/strict');
    const { env } = require(${JSON.stringify(join(__dirname, '../src/env.ts'))});
    assert.equal(env.GRPC_PORT, 50054);
    assert.equal(env.CREDIT_ORDER_SERVICE_TOKEN, 'test-order-token');
    for (const name of ['CREDIT_LOCAL_MODE', 'CREDIT_TLS_CERT_PATH', 'CREDIT_TLS_KEY_PATH']) {
      assert.equal(Object.hasOwn(env, name), false);
    }
  `;
  const base = { ...process.env, DOTENV_CONFIG_PATH: join(__dirname, 'not-an-env-file'),
  CREDIT_ORDER_SERVICE_TOKEN: 'test-order-token', GRPC_PORT: '50054',
  RABBITMQ_URL: 'amqp://test-broker:5672', PGHOST: 'localhost', PGPORT: '5432',
  PGUSER: 'credit', PGPASSWORD: 'credit', PGDATABASE: 'credit' };
  for (const key of ['CREDIT_LOCAL_MODE', 'CREDIT_TLS_CERT_PATH', 'CREDIT_TLS_KEY_PATH']) delete base[key];
  const execute = promisify(execFile);
  await execute(process.execPath, ['-r', 'tsx/cjs', '-e', source], { env: base });
  await execute(process.execPath, ['-r', 'tsx/cjs', '-e', source], { env: {
    ...base, CREDIT_LOCAL_MODE: 'obsolete-invalid-value', CREDIT_TLS_CERT_PATH: '/missing/cert', CREDIT_TLS_KEY_PATH: '/missing/key',
  } });
});

test('all six RPCs authenticate before business logic; known wrong service is forbidden', async (t) => {
  let calls = 0;
  const service = Object.fromEntries(['getBalance', 'reserveCredits', 'updateReservation', 'releaseCredits', 'settleCredits', 'getReservation']
    .map((method) => [method, async () => { calls += 1; throw new Error('Should not be called'); }]));
  const server = createGrpcServer(service, { 'order-service': 'order-secret', 'other-service': 'other-secret' });
  const port = await startServer(server, 0, '127.0.0.1');
  const client = createCreditClient('127.0.0.1:' + port);
  t.after(async () => { client.close(); await stopServer(server, 100); });
  for (const method of Object.keys(service)) {
    for (const tokens of [[], ['unknown'], ['order-secret', 'order-secret'], ['other-secret']]) {
      const metadata = new Metadata();
      for (const token of tokens) metadata.add('x-credit-service-token', token);
      metadata.set('x-calling-service', 'order-service');
      await assert.rejects(client[method]({}, { metadata }), (error) =>
        error.code === (tokens[0] === 'other-secret' ? status.PERMISSION_DENIED : status.UNAUTHENTICATED));
    }
  }
  assert.equal(calls, 0);
});

test('authorized calls return user-scoped balances, full reservations, and business reason trailers', async (t) => {
  const reservation = {
    orderId: '9f27cd6c-06f0-4db7-9b45-0106dfcfc4ff', requesterId: 'requester', amount: 3,
    status: 'RESERVED', reservationId: 'c82c6bd3-bf5d-4734-bea4-4fed93906ba2', version: 1,
  };
  const methods = [];
  const service = {
    async getBalance({ userId }) {
      if (userId === 'missing') throw new CreditOperationError('NOT_FOUND', 'Account missing', 'ACCOUNT_NOT_FOUND');
      return { userId, totalCredits: 10, reservedCredits: 3, availableCredits: 7 };
    },
    ...Object.fromEntries(['reserveCredits', 'updateReservation', 'releaseCredits', 'settleCredits', 'getReservation']
      .map((method) => [method, async (request) => { methods.push([method, request]); return reservation; }])),
  };
  const server = createGrpcServer(service, { 'order-service': 'order-secret' });
  const port = await startServer(server, 0, '127.0.0.1');
  const client = createCreditClient('127.0.0.1:' + port);
  t.after(async () => { client.close(); await stopServer(server, 100); });
  const metadata = new Metadata();
  metadata.set('x-credit-service-token', 'order-secret');
  assert.deepEqual(await client.getBalance({ userId: 'requester' }, { metadata }), { userId: 'requester', totalCredits: 10, reservedCredits: 3, availableCredits: 7 });
  for (const method of ['reserveCredits', 'updateReservation', 'releaseCredits', 'settleCredits']) {
    const result = await client[method]({ orderId: reservation.orderId, requesterId: 'requester', amount: 3, expectedVersion: 1, courierId: 'courier' }, { metadata });
    assert.equal(result.orderId, reservation.orderId);
    assert.equal(result.reservationId, reservation.reservationId);
  }
  assert.deepEqual(await client.getReservation({ orderId: reservation.orderId }, { metadata }), reservation);
  assert.equal(methods.length, 5);
  await assert.rejects(client.getBalance({ userId: 'missing' }, { metadata }), (error) => {
    assert.equal(error.code, status.NOT_FOUND);
    assert.deepEqual(error.metadata.get('x-credit-error-reason'), ['ACCOUNT_NOT_FOUND']);
    return true;
  });
});

test('invalid UUIDs and amounts are rejected by every relevant service method before connecting', async () => {
  const service = new CreditService({ connect() { throw new Error('Unexpected connection'); } });
  for (const orderId of ['not-a-uuid', '9F27CD6C-06F0-4DB7-9B45-0106DFCFC4FF', '9f27cd6c06f04db79b450106dfcfc4ff']) {
    for (const invoke of [
      () => service.reserveCredits({ orderId, requesterId: 'requester', amount: 1 }),
      () => service.updateReservation({ orderId, amount: 2, expectedVersion: 1 }),
      () => service.releaseCredits({ orderId }),
      () => service.settleCredits({ orderId, courierId: 'courier' }),
      () => service.getReservation({ orderId }),
    ]) await assert.rejects(invoke(), ValidationError);
  }
});
