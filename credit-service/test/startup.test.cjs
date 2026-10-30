// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-22 (Asia/Singapore).
// Scope: Tested the human-requested entrypoint consumer startup and shutdown wiring. dded/tested/documented startup-only listener health with database-based HTTP status as the human specified.
// Author review: I reviewed that the test specification is correct.
// Prompts/key responses: ../ai/usage-log.md, entry 036, 038.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { join } = require('node:path');
const execute = promisify(execFile);

// Exercise the actual entrypoint in an isolated process. Mock transport/database
// boundaries so lifecycle tests neither contact RabbitMQ nor modify real data.
async function lifecycle(options = {}) {
  const source = `
    const assert = require('node:assert/strict');
    const { EventEmitter } = require('node:events');
    const Module = require('node:module');
    const entry = ${JSON.stringify(join(__dirname, '../src/index.ts'))};
    const options = ${JSON.stringify(options)};
    const events = [], signals = {};
    let consumerReady;
    let readListener;
    class Pool {
      on() {}
      async query() { return {}; }
      async end() { events.push('pool.end'); }
    }
    class CreditService {}
    const broker = { async close() { events.push('consumer.close'); if (options.closeFailure) throw new Error('close failed'); } };
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
      './events/broker': { async startUserEventConsumer(service, url) {
        assert.ok(service instanceof CreditService); assert.equal(url, 'amqp://demo-broker:5672');
        events.push('consumer.start');
        if (options.consumerFailure) throw new Error('connect failed');
        if (options.delayedConsumer) await new Promise(resolve => { consumerReady = resolve; });
        return broker;
      } },
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
    console.error = () => events.push('logged.error');
    process.on = (signal, callback) => { signals[signal] = callback; return process; };
    process.exit = code => events.push('exit:' + code);
    (async () => {
      require(entry);
      await new Promise(setImmediate);
      const beforeReady = [...events];
      const listenerBeforeReady = readListener();
      if (options.shutdownDuringConnect) {
        signals.SIGTERM();
        await new Promise(setImmediate);
      }
      const duringConnectShutdown = [...events];
      if (consumerReady) consumerReady();
      await new Promise(setImmediate);
      const beforeShutdown = [...events];
      const listenerBeforeShutdown = readListener();
      if (signals.SIGTERM) {
        signals.SIGTERM();
        if (signals.SIGINT) signals.SIGINT();
        await new Promise(setImmediate);
      }
      process.stdout.write(JSON.stringify({ events, beforeReady, beforeShutdown, duringConnectShutdown, listenerBeforeReady, listenerBeforeShutdown, listenerAfterShutdown: readListener() }));
    })().catch(error => { process.stderr.write(error.stack); process.exitCode = 1; });
  `;
  const { stdout } = await execute(process.execPath, ['-r', 'tsx/cjs', '-e', source]);
  return JSON.parse(stdout);
}

test('consumer starts once with CreditService and configured URL; shutdown closes it before ending the pool', async () => {
  const { events, beforeShutdown, listenerBeforeShutdown, listenerAfterShutdown } = await lifecycle();
  assert.equal(listenerBeforeShutdown, true);
  assert.equal(listenerAfterShutdown, false);
  assert.ok(beforeShutdown.includes('consumer.start'));
  assert.ok(beforeShutdown.indexOf('rest.start') < beforeShutdown.indexOf('consumer.start'));
  assert.ok(beforeShutdown.indexOf('grpc.start') < beforeShutdown.indexOf('consumer.start'));
  assert.equal(beforeShutdown.includes('pool.end'), false);
  assert.ok(events.indexOf('consumer.close') < events.indexOf('pool.end'));
  assert.equal(events.filter(value => value === 'consumer.close').length, 1);
  assert.equal(events.filter(value => value === 'pool.end').length, 1);
  assert.equal(events.includes('exit:1'), false);
});


test('slow consumer connection does not delay either API or signal registration', async () => {
  const { beforeReady, events, listenerBeforeReady, listenerBeforeShutdown } = await lifecycle({ delayedConsumer: true });
  assert.equal(listenerBeforeReady, false);
  assert.equal(listenerBeforeShutdown, true);
  assert.ok(beforeReady.includes('grpc.start'));
  assert.ok(beforeReady.includes('rest.start'));
  assert.ok(beforeReady.includes('consumer.start'));
  assert.equal(events.filter(value => value === 'consumer.close').length, 1);
});

for (const options of [{ consumerFailure: true }, { moduleMissing: true }]) {
  test('consumer failure is logged and leaves API lifecycle running: ' + JSON.stringify(options), async () => {
    const { beforeShutdown, events, listenerBeforeShutdown } = await lifecycle(options);
    assert.equal(listenerBeforeShutdown, false);
    assert.ok(beforeShutdown.includes('grpc.start'));
    assert.ok(beforeShutdown.includes('rest.start'));
    assert.ok(beforeShutdown.includes('logged.error'));
    for (const action of ['grpc.stop', 'rest.close', 'pool.end', 'exit:1']) assert.equal(beforeShutdown.includes(action), false);
    assert.ok(events.includes('grpc.stop'));
    assert.ok(events.includes('rest.close'));
    assert.equal(events.filter(value => value === 'pool.end').length, 1);
    assert.equal(events.includes('consumer.close'), false);
    assert.equal(events.includes('exit:1'), false);
  });
}

test('shutdown during consumer startup closes a late connection before ending the pool', async () => {
  const { events, duringConnectShutdown, listenerAfterShutdown } = await lifecycle({ delayedConsumer: true, shutdownDuringConnect: true });
  assert.equal(listenerAfterShutdown, false);
  assert.ok(duringConnectShutdown.includes('grpc.stop'));
  assert.ok(duringConnectShutdown.includes('rest.close'));
  assert.equal(duringConnectShutdown.includes('pool.end'), false);
  assert.ok(events.indexOf('consumer.close') < events.indexOf('pool.end'));
  assert.equal(events.filter(value => value === 'pool.end').length, 1);
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
    assert.equal(events.includes('consumer.start'), false);
  });
}
