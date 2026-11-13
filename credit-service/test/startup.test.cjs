// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
// Scope: Tested the human-requested entrypoint consumer startup and shutdown wiring. dded/tested/documented startup-only listener health with database-based HTTP status as the human specified.
// Author review: I reviewed that the test specification is correct.
// Prompts/key responses: ../ai/usage-log.md, entry 036, 038.
// Entry 047: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
// Scope: Tested reusable-client retries, capped delays, live health and shutdown races.
// Changes await human review; prompts/key responses: ../ai/usage-log.md, entry 047.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join } = require('node:path');
const execute = promisify(execFile);

// Exercise the actual entrypoint with controlled transport, database and retry
// boundaries. Retry waits advance explicitly; no real RabbitMQ or sleeps needed.
async function lifecycle(options = {}) {
  const source = `
    const assert = require('node:assert/strict');
    const { EventEmitter } = require('node:events');
    const Module = require('node:module');
    const entry = ${JSON.stringify(join(__dirname, '../src/index.ts'))};
    const options = ${JSON.stringify(options)};
    const events = [], signals = {}, errors = [], delays = [];
    let consumerReady, registrationReady, retryReady, readListener;
    let connected = false, attempts = 0, registrations = 0;
    class Pool {
      on() {}
      async query() { return {}; }
      async end() { events.push('pool.end'); }
    }
    class CreditService {}
    const broker = {
      get isConnected() { return connected; },
      async connect() {
        events.push('consumer.connect'); attempts += 1;
        if (options.consumerFailure || attempts <= (options.connectFailures ?? 0)) throw new Error('connect failed');
        if (options.delayedConsumer) await new Promise(resolve => { consumerReady = resolve; });
        connected = true;
      },
      async close() {
        events.push('consumer.close'); connected = false;
        if (options.closeFailure) throw new Error('close failed');
      },
    };
    const rest = new EventEmitter();
    rest.listen = (_port, _host, done) => {
      events.push('rest.start');
      if (options.restFailure) queueMicrotask(() => rest.emit('error', new Error('listen failed')));
      else done();
    };
    rest.close = done => { events.push('rest.close'); done(); };
    const mocks = {
      '@foc/grpc': {
        async startServer(_server, _port, _host, credentials) {
          assert.equal(credentials, 'plaintext'); events.push('grpc.start');
          if (options.grpcFailure) throw new Error('bind failed');
          return 50054;
        },
        async stopServer() { events.push('grpc.stop'); },
      },
      'node:fs/promises': { async readFile() { return 'public-key'; } },
      'node:timers/promises': { setTimeout(ms, _value, { signal }) {
        delays.push(ms); events.push('retry.wait');
        return new Promise((resolve, reject) => {
          const abort = () => { events.push('retry.cancel'); retryReady = undefined; reject(new Error('aborted')); };
          signal.addEventListener('abort', abort, { once: true });
          retryReady = () => { signal.removeEventListener('abort', abort); retryReady = undefined; resolve(); };
          if (signal.aborted) abort();
        });
      } },
      pg: { Pool },
      '@grpc/grpc-js': { ServerCredentials: { createInsecure: () => 'plaintext' } },
      './env': { env: {
        CREDIT_ORDER_SERVICE_TOKEN: 'test-order-token', CREDIT_JWT_PUBLIC_KEY_PATH: 'public-key',
        RABBITMQ_URL: 'amqp://demo-broker:5672', GRPC_HOST: '127.0.0.1', GRPC_PORT: 50054,
        HTTP_HOST: '127.0.0.1', HTTP_PORT: 3004,
      } },
      './grpc/server': { createGrpcServer() { return { forceShutdown() { events.push('grpc.forceShutdown'); } }; } },
      './services/CreditService': { CreditService },
      './rest/server': { createRestServer(_service, _key, _ping, listenerStarted) { readListener = listenerStarted; return rest; } },
      './events/broker': {
        createUserEventClient(url) {
          assert.equal(url, 'amqp://demo-broker:5672'); events.push('consumer.create'); return broker;
        },
        async startUserEventConsumer(service, client) {
          assert.ok(service instanceof CreditService); assert.equal(client, broker); assert.equal(connected, true);
          events.push('consumer.start'); registrations += 1;
          if (registrations <= (options.registrationFailures ?? 0)) throw new Error('registration failed');
          if (options.delayedRegistration) await new Promise(resolve => { registrationReady = resolve; });
        },
      },
    };
    const originalLoad = Module._load;
    Module._load = function(request, parent, main) {
      if (parent?.filename === entry && Object.hasOwn(mocks, request)) {
        if (request === './events/broker' && options.moduleMissing) throw new Error('Cannot find @foc/messaging');
        return mocks[request];
      }
      return originalLoad.call(this, request, parent, main);
    };
    console.log = () => {};
    console.error = (message, detail) => { events.push('logged.error'); errors.push({ message, detail }); };
    process.on = (signal, callback) => { signals[signal] = callback; return process; };
    process.exit = code => events.push('exit:' + code);
    (async () => {
      require(entry);
      await new Promise(setImmediate);
      const beforeReady = [...events];
      const listenerBeforeReady = readListener();
      for (let i = 0; i < (options.retriesToRun ?? 0); i += 1) {
        assert.ok(retryReady, 'Expected a scheduled retry'); retryReady(); await new Promise(setImmediate);
      }
      if (options.shutdownDuringConnect || options.shutdownDuringRegistration) {
        signals.SIGTERM(); await new Promise(setImmediate);
      }
      const duringConnectShutdown = [...events];
      if (consumerReady) consumerReady();
      if (registrationReady) registrationReady();
      await new Promise(setImmediate);
      const beforeShutdown = [...events];
      const listenerBeforeShutdown = readListener();
      let listenerAfterDisconnect, listenerAfterRecovery;
      if (options.disconnectAfterReady) {
        connected = false; listenerAfterDisconnect = readListener();
        connected = true; listenerAfterRecovery = readListener();
      }
      if (signals.SIGTERM) {
        signals.SIGTERM(); if (signals.SIGINT) signals.SIGINT(); await new Promise(setImmediate);
      }
      assert.equal(retryReady, undefined, 'No retry timer may survive shutdown');
      process.stdout.write(JSON.stringify({ events, errors, delays, beforeReady, beforeShutdown, duringConnectShutdown,
        listenerBeforeReady, listenerBeforeShutdown, listenerAfterDisconnect, listenerAfterRecovery, listenerAfterShutdown: readListener() }));
    })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
  `;
  const { stdout } = await execute(process.execPath, ['-r', 'tsx/cjs', '-e', source], { timeout: 10000 });
  return JSON.parse(stdout);
}

test('one client connects and registers once after API startup; shutdown closes it before the pool', async () => {
  const { events, beforeShutdown, listenerBeforeShutdown, listenerAfterShutdown } = await lifecycle();
  assert.equal(listenerBeforeShutdown, true);
  assert.equal(listenerAfterShutdown, false);
  assert.ok(beforeShutdown.indexOf('rest.start') < beforeShutdown.indexOf('consumer.connect'));
  assert.ok(beforeShutdown.indexOf('grpc.start') < beforeShutdown.indexOf('consumer.connect'));
  assert.equal(beforeShutdown.includes('pool.end'), false);
  for (const action of ['consumer.create', 'consumer.connect', 'consumer.start', 'consumer.close', 'pool.end']) {
    assert.equal(events.filter(value => value === action).length, 1, action);
  }
  assert.ok(events.indexOf('consumer.close') < events.indexOf('pool.end'));
  assert.equal(events.includes('exit:1'), false);
});

test('slow connection leaves APIs running and health down until registration succeeds', async () => {
  const { beforeReady, listenerBeforeReady, listenerBeforeShutdown } = await lifecycle({ delayedConsumer: true });
  assert.equal(listenerBeforeReady, false);
  assert.equal(listenerBeforeShutdown, true);
  for (const action of ['grpc.start', 'rest.start', 'consumer.connect']) assert.ok(beforeReady.includes(action));
  assert.equal(beforeReady.includes('consumer.start'), false);
});

test('failed connections reuse one client, log each next delay, recover and register once', async () => {
  const { events, delays, errors, listenerBeforeReady, listenerBeforeShutdown } = await lifecycle({ connectFailures: 3, retriesToRun: 3 });
  assert.equal(listenerBeforeReady, false);
  assert.equal(listenerBeforeShutdown, true);
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.deepEqual(errors.map(error => error.detail), delays.map(retryInMs => ({ message: 'connect failed', retryInMs })));
  assert.equal(events.filter(value => value === 'consumer.create').length, 1);
  assert.equal(events.filter(value => value === 'consumer.connect').length, 4);
  assert.equal(events.filter(value => value === 'consumer.start').length, 1);
  assert.equal(events.includes('retry.cancel'), false);
});

test('persistent failures keep retrying at the 30-second cap and shutdown cancels the pending wait', async () => {
  const { events, delays, errors, listenerBeforeShutdown } = await lifecycle({ consumerFailure: true, retriesToRun: 10 });
  assert.equal(listenerBeforeShutdown, false);
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000]);
  assert.equal(errors.length, 11);
  assert.equal(events.filter(value => value === 'consumer.create').length, 1);
  assert.equal(events.filter(value => value === 'consumer.connect').length, 11);
  assert.equal(events.includes('consumer.start'), false);
  assert.ok(events.includes('retry.cancel'));
  assert.ok(events.indexOf('retry.cancel') < events.indexOf('pool.end'));
  assert.equal(events.filter(value => value === 'pool.end').length, 1);
});

test('missing broker package is retried without shutting down APIs; shutdown cancels its wait', async () => {
  const { beforeShutdown, events, delays } = await lifecycle({ moduleMissing: true, retriesToRun: 2 });
  assert.deepEqual(delays, [1000, 2000, 4000]);
  for (const action of ['grpc.stop', 'rest.close', 'pool.end', 'exit:1']) assert.equal(beforeShutdown.includes(action), false);
  assert.ok(events.includes('retry.cancel'));
  assert.equal(events.includes('consumer.create'), false);
  assert.equal(events.filter(value => value === 'pool.end').length, 1);
});

test('failed consumer registration is retried on the existing client, then stops retrying after success', async () => {
  const { events, delays, listenerBeforeShutdown } = await lifecycle({ registrationFailures: 1, retriesToRun: 1 });
  assert.deepEqual(delays, [1000]);
  assert.equal(listenerBeforeShutdown, true);
  assert.equal(events.filter(value => value === 'consumer.create').length, 1);
  assert.equal(events.filter(value => value === 'consumer.start').length, 2);
});

test('later disconnect and shared-client recovery update health without registering another consumer', async () => {
  const { events, listenerAfterDisconnect, listenerAfterRecovery } = await lifecycle({ disconnectAfterReady: true });
  assert.equal(listenerAfterDisconnect, false);
  assert.equal(listenerAfterRecovery, true);
  assert.equal(events.filter(value => value === 'consumer.connect').length, 1);
  assert.equal(events.filter(value => value === 'consumer.start').length, 1);
});

test('shutdown during connection waits for it, skips registration and closes the late connection', async () => {
  const { events, duringConnectShutdown, listenerAfterShutdown } = await lifecycle({ delayedConsumer: true, shutdownDuringConnect: true });
  assert.equal(listenerAfterShutdown, false);
  assert.ok(duringConnectShutdown.includes('grpc.stop'));
  assert.ok(duringConnectShutdown.includes('rest.close'));
  assert.equal(duringConnectShutdown.includes('pool.end'), false);
  assert.equal(events.includes('consumer.start'), false);
  assert.ok(events.indexOf('consumer.close') < events.indexOf('pool.end'));
});

test('shutdown during registration never reports health up and closes before ending the pool', async () => {
  const { events, listenerBeforeReady, listenerBeforeShutdown } = await lifecycle({ delayedRegistration: true, shutdownDuringRegistration: true });
  assert.equal(listenerBeforeReady, false);
  assert.equal(listenerBeforeShutdown, false);
  assert.ok(events.indexOf('consumer.close') < events.indexOf('pool.end'));
});

test('broker close failure is logged but still closes APIs and ends the database pool', async () => {
  const { events } = await lifecycle({ closeFailure: true });
  assert.ok(events.includes('logged.error'));
  assert.ok(events.includes('grpc.stop'));
  assert.ok(events.includes('rest.close'));
  assert.ok(events.indexOf('consumer.close') < events.indexOf('pool.end'));
  assert.equal(events.filter(value => value === 'pool.end').length, 1);
});

for (const failure of ['grpcFailure', 'restFailure']) {
  test('API startup failure closes the pool without attempting a consumer: ' + failure, async () => {
    const { events } = await lifecycle({ [failure]: true });
    assert.ok(events.includes('grpc.forceShutdown'));
    assert.ok(events.includes('pool.end'));
    assert.ok(events.includes('exit:1'));
    assert.equal(events.includes('consumer.create'), false);
  });
}
