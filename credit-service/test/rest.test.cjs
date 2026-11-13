// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 - 2026-10-22 (Asia/Singapore).
// Scope: Tested human-specified own-data REST authentication/serialization, errors, and strict paging bookmarks. Covered public health responses and omission of internal history sequence IDs. Added/tested/documented startup-only listener health with database-based HTTP status as the human specified. Tested base64url entry-ID bookmark decoding and rejection of malformed/legacy formats.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–026, 031, 038, 043.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');
require('tsx/cjs');
const { ValidationError } = require('../src/services/validation.ts');
const { createRestServer } = require('../src/rest/server.ts');
const { CreditService, CreditOperationError } = require('../src/services/CreditService.ts');
const { encodeHistoryBookmark, decodeHistoryBookmark } = require('../src/services/historyBookmark.ts');

test('bookmarks encode only the history entry UUID and reject malformed or legacy formats', () => {
  const encode = value => Buffer.from(value).toString('base64url');
  const entryId = '9f27cd6c-06f0-4db7-9b45-0106dfcfc4ff';
  const valid = encodeHistoryBookmark(entryId);
  assert.equal(Buffer.from(valid, 'base64url').toString('utf8'), entryId);
  assert.equal(decodeHistoryBookmark(valid), entryId);
  const invalid = [
    undefined, '', '!', valid + '=', 'a', valid.slice(0, -1),
    Buffer.from([0xff]).toString('base64url'),
    ...['not-a-uuid', entryId.replaceAll('-', ''), entryId + ' ', ' ' + entryId, entryId + '\n',
      JSON.stringify(entryId), JSON.stringify({ id: entryId }),
      JSON.stringify({ userId: 'student', sequenceId: '9007199254740993' }),
      JSON.stringify(['student', '1']), '{}', 'null'].map(encode),
  ];
  for (const token of invalid) {
    assert.throws(() => decodeHistoryBookmark(token), error =>
      error instanceof ValidationError && error.message === 'Invalid history page token');
  }
});

test('invalid history input fails before obtaining a database connection', async () => {
  const service = new CreditService({ connect() { throw new Error('Unexpected connection'); } });
  for (const pageSize of [0, -1, 1.5, 101, NaN, Infinity, null, '50']) {
    await assert.rejects(service.getUserCreditHistory({ userId: 'student', pageSize }), ValidationError);
  }
  await assert.rejects(service.getUserCreditHistory({ userId: 'student', pageToken: '' }), ValidationError);
  const legacy = Buffer.from(JSON.stringify({ userId: 'student', sequenceId: '1' })).toString('base64url');
  await assert.rejects(service.getUserCreditHistory({ userId: 'student', pageToken: legacy }), ValidationError);
  await assert.rejects(service.getUserCreditHistory({ userId: ' bad' }), ValidationError);
});

test('matched REST routes authenticate before business logic and derive user scope from the RS256 subject, including admins', async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const calls = [];
  const service = {
    async getBalance(input) { calls.push(input); return { userId: input.userId, totalCredits: 10, reservedCredits: 2, availableCredits: 8 }; },
    async getUserCreditHistory(input) {
      calls.push(input);
      return { entries: [{ id: 'history-id', userId: input.userId, sequenceId: '9007199254740993', orderId: null, reservationId: null,
        type: 'INITIAL_GRANT', totalAmountChange: 10, totalReservedChange: 0, createdAt: new Date('2026-10-20T00:00:00.000Z') }], nextPageToken: null };
    },
  };
  const server = createRestServer(service, publicKey.export({ type: 'spki', format: 'pem' }), async () => true, () => false);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const authorization of [undefined, 'Bearer invalid', 'Bearer ' + jwt.sign({ sub: 'student', exp: 1 }, privateKey, { algorithm: 'RS256' })]) {
    const response = await fetch(origin + '/credits/me/balance', { headers: authorization ? { authorization } : {} });
    assert.equal(response.status, 401);
    assert.deepEqual(Object.keys(await response.json()).sort(), ['error', 'message']);
  }
  assert.equal(calls.length, 0);
  const token = jwt.sign({ sub: 'student', role: 'admin', userId: 'other' }, privateKey, { algorithm: 'RS256', expiresIn: 60 });
  const headers = { authorization: 'Bearer ' + token };
  const balance = await fetch(origin + '/credits/me/balance?userId=other', { headers });
  assert.equal(balance.status, 200);
  assert.deepEqual(await balance.json(), { userId: 'student', totalCredits: 10, reservedCredits: 2, availableCredits: 8 });
  const page = await fetch(origin + '/credits/me/history?pageSize=2&pageToken=bookmark&userId=other', { headers });
  assert.equal(page.status, 200);
  const data = await page.json();
  assert.equal(data.nextPageToken, null);
  assert.equal(data.entries[0].userId, 'student');
  assert.equal(Object.hasOwn(data.entries[0], 'sequenceId'), false);
  assert.deepEqual(Object.keys(data.entries[0]).sort(), [
    'id', 'userId', 'orderId', 'reservationId', 'type', 'totalAmountChange', 'totalReservedChange', 'createdAt',
  ].sort());
  assert.equal(data.entries[0].createdAt, '2026-10-20T00:00:00.000Z');
  assert.equal(data.entries[0].orderId, null);
  assert.deepEqual(calls, [{ userId: 'student' }, { userId: 'student', pageSize: 2, pageToken: 'bookmark' }]);
  for (const query of ['pageSize=bad', 'pageSize=', 'pageSize=1&pageSize=2', 'pageToken=a&pageToken=b']) {
    const response = await fetch(origin + '/credits/me/history?' + query, { headers });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'Bad Request');
  }
  for (const path of ['/credits/other/balance', '/credits/orders/history']) {
    assert.equal((await fetch(origin + path, { headers })).status, 404);
  }
  assert.equal((await fetch(origin + '/credits/me/balance', { method: 'POST', headers })).status, 404);
  assert.equal(calls.length, 2);
});

test('REST reports account/database failures and logs unexpected service errors, including TypeError, without exposing them', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args));
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let failure;
  const server = createRestServer({ async getBalance() { throw failure; } }, publicKey.export({ type: 'spki', format: 'pem' }), async () => true, () => false);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const headers = { authorization: 'Bearer ' + jwt.sign({ sub: 'student' }, privateKey, { algorithm: 'RS256', expiresIn: 60 }) };
  const url = 'http://127.0.0.1:' + server.address().port + '/credits/me/balance';
  for (const [error, code] of [
    [new CreditOperationError('NOT_FOUND', 'Account missing', 'ACCOUNT_NOT_FOUND'), 404],
    [{ code: 'ECONNRESET' }, 503], [new Error('private database details'), 500],
    [new TypeError('private service bug in balance calculation'), 500],
    [new ValidationError('Invalid user input'), 400],
  ]) {
    failure = error;
    const response = await fetch(url, { headers });
    assert.equal(response.status, code);
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['error', 'message']);
    assert.ok(!body.message.includes('private'));
    if (code === 500) {
      assert.equal(body.message, 'Internal credit-service error');
      assert.equal(logged.at(-1)[1], error);
    }
  }
  assert.equal(logged.length, 2);
});

test('unknown REST paths return 404 without authentication; both known GET routes require a token', async (t) => {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let calls = 0;
  const service = {
    async getBalance() { calls += 1; throw new Error('Must not reach service'); },
    async getUserCreditHistory() { calls += 1; throw new Error('Must not reach service'); },
  };
  const server = createRestServer(service, publicKey.export({ type: 'spki', format: 'pem' }), async () => true, () => false);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
    const response = await fetch(origin + '/unknown-path', { headers });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not Found', message: 'Endpoint not found.' });
  }
  for (const path of ['/credits/me/balance', '/credits/me/history']) {
    assert.equal((await fetch(origin + path)).status, 401);
  }
  assert.equal(calls, 0);
});

test('known limitation: unsupported REST methods return 404 rather than 405, even without a token', async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const service = { async getBalance() { assert.fail('Wrong method must not call business logic'); } };
  const server = createRestServer(service, publicKey.export({ type: 'spki', format: 'pem' }), async () => true, () => false);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const token = jwt.sign({ sub: 'student' }, privateKey, { algorithm: 'RS256', expiresIn: 60 });
  for (const path of ['/credits/me/balance', '/credits/me/history']) {
    for (const headers of [{}, { authorization: 'Bearer ' + token }]) {
      assert.equal((await fetch(origin + path, { method: 'POST', headers })).status, 404);
    }
  }
});


test('public health reports listener startup independently while HTTP status stays database-based', async (t) => {
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let dbUp = true;
  let listenerUp = false;
  let probes = 0;
  const service = {
    async getBalance() { assert.fail('Health must not read balances'); },
    async getUserCreditHistory() { assert.fail('Health must not read history'); },
  };
  const server = createRestServer(service, publicKey.export({ type: 'spki', format: 'pem' }), async () => {
    probes += 1;
    return dbUp;
  }, () => listenerUp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/health';
  for (const database of [true, false]) for (const listener of [false, true]) {
    dbUp = database;
    listenerUp = listener;
    for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
      const response = await fetch(url, { headers });
      assert.equal(response.status, database ? 200 : 503);
      assert.deepEqual(await response.json(), {
        status: database ? 'ok' : 'degraded', db: database ? 'up' : 'down', listener: listener ? 'up' : 'down',
      });
    }
  }
  assert.equal((await fetch(url, { method: 'POST' })).status, 404);
  assert.equal(probes, 8);
});
