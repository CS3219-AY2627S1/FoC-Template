// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-30 (Asia/Singapore).
// Scope: Tested the human-requested shared-client getter through connection loss and consumer restoration.
// Review: Pending human review; prompts/key responses: ../ai/usage-log.md, entry 047.
// AI-generated; human review pending.

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const { resolve } = require('node:path');
require('tsx/cjs');

test('shared client stays unhealthy until reconnect and consumer recovery complete', async (t) => {
  const entry = resolve(__dirname, '../../shared/messaging/src/index.ts');
  const connections = [];
  let resumeRecovery, failRecovery = false, registrations = 0;
  class Channel extends EventEmitter {
    async assertExchange() {}
    async assertQueue() {}
    async bindQueue() {}
    async prefetch() {}
    async consume() {
      registrations += 1;
      if (registrations > 1) {
        if (failRecovery) throw new Error('consumer recovery failed');
        await new Promise(resolve => { resumeRecovery = resolve; });
      }
    }
    async close() { this.emit('close'); }
  }
  class Connection extends EventEmitter {
    channel = new Channel();
    async createConfirmChannel() { return this.channel; }
    async close() { this.emit('close'); }
  }
  const amqp = { async connect() { const value = new Connection(); connections.push(value); return value; } };
  const originalLoad = Module._load;
  Module._load = function(request, parent, main) {
    if (parent?.filename === entry) {
      if (request === 'amqplib') return amqp;
      if (request === './queueLog') return { QueueLogger: class { info() {} error() {} } };
    }
    return originalLoad.call(this, request, parent, main);
  };
  let RabbitMQClient;
  try { ({ RabbitMQClient } = require(entry)); }
  finally { Module._load = originalLoad; }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const broker = new RabbitMQClient({ queues: ['test.users'], prefetch: 10 });
  try {
    assert.equal(broker.isConnected, false);
    await broker.connect();
    assert.equal(broker.isConnected, true);
    await broker.consumeFromQueue('test.users', async () => {});
    assert.equal(registrations, 1);

    connections[0].emit('close');
    assert.equal(broker.isConnected, false);
    t.mock.timers.tick(1000);
    await new Promise(setImmediate);
    assert.equal(connections.length, 2);
    assert.equal(registrations, 2);
    assert.equal(broker.isConnected, false, 'A transport is not ready while its consumer is still recovering');
    resumeRecovery();
    await new Promise(setImmediate);
    assert.equal(broker.isConnected, true);

    // Failed consumer restoration must remain down until a later retry succeeds.
    failRecovery = true;
    connections[1].channel.emit('close');
    assert.equal(broker.isConnected, false);
    t.mock.timers.tick(1000);
    await new Promise(setImmediate);
    assert.equal(broker.isConnected, false);
    assert.equal(connections.length, 3);
    failRecovery = false;
    t.mock.timers.tick(2000);
    await new Promise(setImmediate);
    assert.equal(connections.length, 4);
    assert.equal(broker.isConnected, false);
    resumeRecovery();
    await new Promise(setImmediate);
    assert.equal(broker.isConnected, true);

    await broker.close();
    assert.equal(broker.isConnected, false);
    t.mock.timers.tick(30000);
    await new Promise(setImmediate);
    assert.equal(connections.length, 4, 'Explicit close must stop reconnection');
  } finally { await broker.close(); }
});
