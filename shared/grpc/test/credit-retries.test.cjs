// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21 (Asia/Singapore).
// Scope: Verified human-defined Credit retry limits, jitter/backoff overrides,
// deadline budgets, exact error preservation, and real gRPC retry transport.
// Author review: I reviewed that the tests are correctly specified and verified.
// Prompts and key responses: ../../../credit-service/ai/usage-log.md, entry 027.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Metadata, status } = require('@grpc/grpc-js');
const rpc = require('../dist');

const methods = [
  'getBalance', 'reserveCredits', 'updateReservation',
  'releaseCredits', 'settleCredits', 'getReservation',
];

function serviceError(code, details = 'last failure') {
  const metadata = new Metadata();
  metadata.set('x-credit-error-reason', 'PRESERVED_REASON');
  return Object.assign(new Error(details), { code, details, metadata });
}

function stubClient(t, handler, config = {}) {
  for (const method of methods) {
    t.mock.method(rpc.CreditService.prototype, method, (request, metadata, options, callback) => {
      handler(method, request, metadata, options, callback);
      return { cancel() {} };
    });
  }
  const client = rpc.createCreditClient('127.0.0.1:1', config);
  t.after(() => client.close());
  return client;
}

// Advance only the retry waits. The stubbed transport does not schedule timers.
function clock(t, random = 0.5, oversleep = 0) {
  let now = 10000;
  const delays = [];
  t.mock.method(Date, 'now', () => now);
  t.mock.method(Math, 'random', () => random);
  t.mock.method(global, 'setTimeout', (callback, delay) => {
    delays.push(delay);
    now += delay + oversleep;
    queueMicrotask(callback);
  });
  return { delays, advance: ms => { now += ms; } };
}

for (const method of methods) {
  test(`${method} retries transient failures with identical fields, metadata and deadline`, async t => {
    const attempts = [];
    const response = { marker: 'successful result' };
    const client = stubClient(t, (name, request, metadata, options, callback) => {
      attempts.push({ name, request, metadata, deadline: options.deadline });
      if (attempts.length === 1) callback(serviceError(status.UNAVAILABLE));
      else if (attempts.length === 2) callback(serviceError(status.ABORTED));
      else callback(null, response);
    });
    const time = clock(t);
    const request = { orderId: 'order', requesterId: 'user', amount: 4, expectedVersion: 1 };
    const metadata = new Metadata();
    metadata.set('x-credit-service-token', 'test-token');

    assert.equal(await client[method](request, { metadata }), response);
    assert.equal(attempts.length, 3);
    assert.deepEqual(time.delays, [37.5, 75]);
    for (const attempt of attempts) {
      assert.equal(attempt.name, method);
      assert.equal(attempt.request, request);
      assert.equal(attempt.metadata, metadata);
      assert.equal(attempt.deadline, 11300);
    }
  });
}

test('three total attempts return the exact last error including details and trailers', async t => {
  const errors = [
    serviceError(status.UNAVAILABLE, 'first'),
    serviceError(status.ABORTED, 'second'),
    serviceError(status.DEADLINE_EXCEEDED, 'third'),
  ];
  let attempts = 0;
  const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
    callback(errors[attempts++]);
  });
  clock(t);
  await assert.rejects(client.getBalance({}), error => error === errors[2]);
  assert.equal(attempts, 3);
});

test('a server DEADLINE_EXCEEDED can retry when the overall budget remains', async t => {
  let attempts = 0;
  const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
    attempts += 1;
    if (attempts === 1) callback(serviceError(status.DEADLINE_EXCEEDED));
    else callback(null, { userId: 'user' });
  });
  const time = clock(t);
  assert.deepEqual(await client.getBalance({ userId: 'user' }), { userId: 'user' });
  assert.equal(attempts, 2);
  assert.deepEqual(time.delays, [37.5]);
});

for (const code of [
  status.CANCELLED, status.UNKNOWN, status.INVALID_ARGUMENT, status.NOT_FOUND,
  status.ALREADY_EXISTS, status.PERMISSION_DENIED, status.RESOURCE_EXHAUSTED,
  status.FAILED_PRECONDITION, status.OUT_OF_RANGE, status.UNIMPLEMENTED,
  status.INTERNAL, status.DATA_LOSS, status.UNAUTHENTICATED,
]) {
  test(`does not retry non-transient code ${code}`, async t => {
    let attempts = 0;
    const original = serviceError(code);
    const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
      attempts += 1;
      callback(original);
    });
    const time = clock(t);
    await assert.rejects(client.getBalance({}), error => error === original);
    assert.equal(attempts, 1);
    assert.deepEqual(time.delays, []);
  });
}

test('unexpected errors are returned unchanged without retrying', async t => {
  const original = new TypeError('local transport bug');
  let attempts = 0;
  const client = stubClient(t, () => { attempts += 1; throw original; });
  const time = clock(t);
  await assert.rejects(client.getBalance({}), error => error === original);
  assert.equal(attempts, 1);
  assert.deepEqual(time.delays, []);
});

test('backoff grows, caps at 500 ms, and uses the specified half-base jitter', async t => {
  let attempts = 0;
  const original = serviceError(status.UNAVAILABLE);
  const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
    attempts += 1;
    callback(original);
  }, { maxAttempts: 6 });
  const time = clock(t);
  await assert.rejects(client.getBalance({}), error => error === original);
  assert.equal(attempts, 6);
  assert.deepEqual(time.delays, [37.5, 75, 150, 300, 375]);
});

for (const random of [0, 0.999999]) {
  test(`jitter stays within half/full base when random is ${random}`, async t => {
    const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
      callback(serviceError(status.UNAVAILABLE));
    }, { maxAttempts: 2 });
    const time = clock(t, random);
    await assert.rejects(client.getBalance({}));
    assert.equal(time.delays.length, 1);
    assert.equal(time.delays[0], 25 + random * 25);
    assert.ok(time.delays[0] >= 25 && time.delays[0] <= 50);
  });
}

test('client overrides and partial per-call overrides merge with defaults', async t => {
  let attempts = 0;
  const deadlines = [];
  const client = stubClient(t, (_name, _request, _metadata, options, callback) => {
    attempts += 1;
    deadlines.push(options.deadline);
    callback(serviceError(status.UNAVAILABLE));
  }, {
    maxAttempts: 4, initialDelayMs: 80, backoffMultiplier: 3,
    maxDelayMs: 200, timeoutMs: 900,
  });
  const time = clock(t, 0);
  await assert.rejects(client.getBalance({}, { maxAttempts: 3, timeoutMs: 700 }));
  assert.equal(attempts, 3);
  assert.deepEqual(time.delays, [40, 100]);
  assert.deepEqual(deadlines, [10700, 10700, 10700]);

  attempts = 0;
  time.delays.length = 0;
  deadlines.length = 0;
  await assert.rejects(client.getBalance({}, {
    initialDelayMs: 20, backoffMultiplier: 2, maxDelayMs: 30,
  }));
  assert.equal(attempts, 4);
  assert.deepEqual(time.delays, [10, 15, 15]);
  assert.deepEqual(deadlines, [11040, 11040, 11040, 11040]);
});

test('maxAttempts 1 disables retries for a single call', async t => {
  let attempts = 0;
  const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
    attempts += 1;
    callback(serviceError(status.UNAVAILABLE));
  });
  const time = clock(t);
  await assert.rejects(client.getBalance({}, { maxAttempts: 1 }));
  assert.equal(attempts, 1);
  assert.deepEqual(time.delays, []);
});

for (const timeoutMs of [20, 25]) {
  test(`does not wait or retry when a 25 ms delay consumes a ${timeoutMs} ms budget`, async t => {
    let attempts = 0;
    const original = serviceError(status.UNAVAILABLE);
    const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
      attempts += 1;
      callback(original);
    });
    const time = clock(t, 0);
    await assert.rejects(client.getBalance({}, { timeoutMs }), error => error === original);
    assert.equal(attempts, 1);
    assert.deepEqual(time.delays, []);
  });
}

test('the earlier upstream deadline limits attempts and backoff', async t => {
  let attempts = 0;
  const deadlines = [];
  const original = serviceError(status.ABORTED);
  const client = stubClient(t, (_name, _request, _metadata, options, callback) => {
    attempts += 1;
    deadlines.push(options.deadline);
    callback(original);
  });
  const time = clock(t, 0);
  await assert.rejects(client.getBalance({}, { deadline: new Date(10060) }), error => error === original);
  assert.equal(attempts, 2);
  assert.deepEqual(time.delays, [25]);
  assert.deepEqual(deadlines, [10060, 10060]);
});

test('an attempt consuming the entire deadline is not retried', async t => {
  let attempts = 0;
  const original = serviceError(status.DEADLINE_EXCEEDED);
  let time;
  const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
    attempts += 1;
    time.advance(1300);
    callback(original);
  });
  time = clock(t);
  await assert.rejects(client.getBalance({}), error => error === original);
  assert.equal(attempts, 1);
  assert.deepEqual(time.delays, []);
});

test('a delayed timer cannot start another attempt after the deadline', async t => {
  let attempts = 0;
  const original = serviceError(status.UNAVAILABLE);
  const client = stubClient(t, (_name, _request, _metadata, _options, callback) => {
    attempts += 1;
    callback(original);
  });
  const time = clock(t, 0, 2000);
  await assert.rejects(client.getBalance({}), error => error === original);
  assert.equal(attempts, 1);
  assert.deepEqual(time.delays, [25]);
});

test('an already expired upstream deadline starts no transport attempt', async t => {
  let attempts = 0;
  const client = stubClient(t, () => { attempts += 1; });
  const time = clock(t);
  await assert.rejects(client.getBalance({}, { deadline: 10000 }), error => error.code === status.DEADLINE_EXCEEDED);
  assert.equal(attempts, 0);
  assert.deepEqual(time.delays, []);
});

for (const invalid of [
  { maxAttempts: 0 }, { maxAttempts: 1.5 }, { maxAttempts: Infinity },
  { initialDelayMs: -1 }, { initialDelayMs: NaN },
  { maxDelayMs: -1 }, { maxDelayMs: 2147483648 },
  { backoffMultiplier: 0.5 }, { backoffMultiplier: Infinity },
]) {
  test(`invalid retry configuration is rejected before an attempt: ${JSON.stringify(invalid)}`, async t => {
    assert.throws(() => rpc.createCreditClient('127.0.0.1:1', invalid), RangeError);
    let attempts = 0;
    const client = stubClient(t, () => { attempts += 1; });
    await assert.rejects(client.getBalance({}, invalid), RangeError);
    assert.equal(attempts, 0);
  });
}

test('real gRPC retries preserve request fields, service metadata and the final reason trailer', async t => {
  const requests = [];
  const deadlines = [];
  const trailer = new Metadata();
  trailer.set('x-credit-error-reason', 'REQUEST_CONFLICT');
  const server = rpc.createServer(rpc.CreditService.service, {
    ReserveCredits(call, callback) {
      requests.push(call.request);
      deadlines.push(Number(call.getDeadline()));
      assert.deepEqual(call.metadata.get('x-credit-service-token'), ['retry-test']);
      if (requests.length < 3) {
        callback({ code: status.UNAVAILABLE, details: 'temporary' });
      } else {
        callback({ code: status.FAILED_PRECONDITION, details: 'original final details', metadata: trailer });
      }
    },
  });
  const port = await rpc.startServer(server, 0, '127.0.0.1');
  const client = rpc.createCreditClient(`127.0.0.1:${port}`);
  t.after(async () => { client.close(); await rpc.stopServer(server, 100); });
  const metadata = new Metadata();
  metadata.set('x-credit-service-token', 'retry-test');
  const request = {
    orderId: '00000000-0000-4000-8000-000000000001',
    requesterId: 'requester', amount: 4,
  };
  await assert.rejects(client.reserveCredits(request, { metadata }), error => {
    assert.equal(error.code, status.FAILED_PRECONDITION);
    assert.equal(error.details, 'original final details');
    assert.deepEqual(error.metadata.get('x-credit-error-reason'), ['REQUEST_CONFLICT']);
    return true;
  });
  assert.deepEqual(requests, [request, request, request]);
  // Wire timeout encoding and transport latency can introduce millisecond rounding.
  assert.ok(Math.max(...deadlines) - Math.min(...deadlines) < 50);
});
