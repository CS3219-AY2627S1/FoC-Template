// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Generated callback-boundary tests for awaited initialization, unchanged failure propagation, exact user identity, and invalid event rejection. Aligned tests with the human-edited handler and imported shared contract.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: [I reviewed that the test specification is correct.
// Prompts and key responses: ../ai/usage-log.md, entries 005–025, 037.

const assert = require('node:assert/strict');
const { test } = require('node:test');
require('tsx/cjs');
const { NonRetryableError } = require('@foc/messaging');
const { InitialAllocationError } = require('../src/services/CreditService.ts');
const { createUserCreatedHandler } = require('../src/events/userCreated.ts');

const balance = { totalCredits: 10, reservedCredits: 0, availableCredits: 10 };
const event = (overrides = {}) => ({
  type: 'user.created',
  eventId: 'first-event',
  occurredAt: '2026-10-20T13:02:00.000Z',
  userId: 'new-user',
  ...overrides,
});

test('handler remains pending until initialization finishes', async () => {
  let finish;
  const initialization = new Promise((resolve) => { finish = resolve; });
  const received = [];
  const handler = createUserCreatedHandler({
    initCredits(input) {
      received.push(input);
      return initialization;
    },
  });
  let complete = false;
  const delivery = handler({ payload: event() }).then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false);
  assert.deepEqual(received, [{ userId: 'new-user' }]);
  finish(balance);
  await delivery;
  assert.equal(complete, true);
});

test('the same user reaches initialization with the same input across different events', async () => {
  const received = [];
  const handler = createUserCreatedHandler({
    async initCredits(input) { received.push(input); return balance; },
  });
  await handler({ payload: event() });
  await handler({ payload: event({ eventId: 'republished-event', occurredAt: '2026-10-21T00:00:00.000Z' }) });
  assert.deepEqual(received, [{ userId: 'new-user' }, { userId: 'new-user' }]);
  // Database-backed grant deduplication belongs to CreditService, not this test.
});

test('permanent and transient service failures reject unchanged, without a success result', async () => {
  for (const failure of [
    Object.assign(new Error('Account has no confirmed initial grant'), { permanent: true }),
    new Error('Database connection failed'),
    new Error('Lock acquisition failed'),
  ]) {
    const handler = createUserCreatedHandler({
      async initCredits() { throw failure; },
    });
    await assert.rejects(handler({ payload: event() }), (error) => error === failure);
  }
});

test('invalid event type or user identity fails before initialization', async () => {
  let calls = 0;
  const handler = createUserCreatedHandler({
    async initCredits() { calls += 1; return balance; },
  });
  for (const payload of [
    null, {}, { type: 'user.restored', userId: 'new-user' },
    event({ eventId: null }), event({ occurredAt: null }),
    ...['', ' user', 'user ', 'user\nname', 'user\u0085name', 'x'.repeat(129), null, 42]
      .map((userId) => event({ userId })),
  ]) {
    await assert.rejects(handler({ payload }), NonRetryableError);
  }
  assert.equal(calls, 0);
});

test('eventId and occurredAt follow the required string fields in the shared schema', async () => {
  let calls = 0;
  const handler = createUserCreatedHandler({ async initCredits() { calls += 1; return balance; } });
  for (const payload of [
    { type: 'user.created', userId: 'new-user' },
    event({ eventId: undefined }), event({ occurredAt: undefined }),
    event({ eventId: 42 }), event({ occurredAt: 123 }),
  ]) await assert.rejects(handler({ payload }), NonRetryableError);
  assert.equal(calls, 0);
  await handler({ payload: event() });
  assert.equal(calls, 1);
});

test('delivery eventId must match the payload when supplied', async () => {
  let calls = 0;
  const handler = createUserCreatedHandler({ async initCredits() { calls += 1; return balance; } });
  await assert.rejects(handler({ eventId: 'other-event', retryCount: 0, payload: event() }), NonRetryableError);
  assert.equal(calls, 0);
  await handler({ eventId: 'first-event', retryCount: 0, payload: event() });
  assert.equal(calls, 1);
});

test('known inconsistent initial allocations are non-retryable and preserve the original cause', async () => {
  const failure = new InitialAllocationError('ALREADY_EXISTS', 'Account has no confirmed initial grant');
  const handler = createUserCreatedHandler({ async initCredits() { throw failure; } });
  await assert.rejects(handler({ payload: event() }), error => error instanceof NonRetryableError && error.cause === failure);
});
