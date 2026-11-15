/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Tests that stop() disconnects the credit.results consumer and admin client while they
 *        are still connecting or subscribing, using fake clients.
 * Author review: Reviewed and approved by @phuc
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import type { KafkaJS } from "@confluentinc/kafka-javascript";
import type { Pool } from "pg";
import { TOPICS } from "../src/config";
import { startCreditResultsConsumer, type AdminLike, type ConsumerLike } from "../src/kafka/creditResultsConsumer";

/** A promise with its resolve/reject exposed. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

/**
 * A consumer whose connect() and subscribe() wait until the test releases them. Like the
 * Confluent client, disconnect() aborts a connect that is still in progress.
 */
class FakeConsumer implements ConsumerLike {
  readonly connecting = deferred();
  readonly subscribing = deferred();
  connected = false;
  disconnects = 0;
  runs = 0;
  holdConnect = true;
  holdSubscribe = false;

  constructor() {
    this.connecting.promise.catch(() => {}); // rejected by disconnect() even when nobody waits
  }

  async connect(): Promise<void> {
    if (this.holdConnect) await this.connecting.promise;
    this.connected = true;
  }
  async subscribe(): Promise<void> {
    if (this.holdSubscribe) await this.subscribing.promise;
  }
  async run(): Promise<void> {
    this.runs++;
  }
  async commitOffsets(): Promise<void> {}
  async disconnect(): Promise<void> {
    this.disconnects++;
    this.connecting.reject(new Error("disconnected while connecting"));
    this.connected = false;
  }
}

class FakeAdmin implements AdminLike {
  readonly connecting = deferred();
  disconnects = 0;
  constructor(private readonly hold: boolean) {
    this.connecting.promise.catch(() => {});
  }
  async connect(): Promise<void> {
    if (this.hold) await this.connecting.promise;
  }
  async fetchTopicMetadata() {
    return [TOPICS.results, TOPICS.resultsDlq].map((name) => ({ name, partitions: [] }));
  }
  async disconnect(): Promise<void> {
    this.disconnects++;
    this.connecting.reject(new Error("disconnected while connecting"));
  }
}

const kafka = {} as KafkaJS.Kafka; // only reached through the injected factories
const deps = { pool: {} as Pool, sendToDlq: async () => {} };

beforeEach(() => {
  mock.method(console, "log", () => {});
  mock.method(console, "error", () => {});
});
afterEach(() => mock.restoreAll());

describe("credit.results consumer shutdown", () => {
  it("stop() while the consumer is connecting disconnects it at once and never subscribes", async () => {
    const consumer = new FakeConsumer();
    const handle = startCreditResultsConsumer(kafka, deps, () => consumer, () => new FakeAdmin(false));
    await tick(); // the topic check passed; connect() is now waiting
    const t = Date.now();
    await handle.stop();
    assert.ok(Date.now() - t < 500, `stop took ${Date.now() - t} ms`);
    assert.ok(consumer.disconnects >= 1);
    assert.equal(consumer.connected, false);
    assert.equal(consumer.runs, 0);
  });

  it("stop() while subscribing leaves no connected consumer behind", async () => {
    const consumer = new FakeConsumer();
    consumer.holdConnect = false;
    consumer.holdSubscribe = true;
    const handle = startCreditResultsConsumer(kafka, deps, () => consumer, () => new FakeAdmin(false));
    await tick(); // connected; subscribe() is now waiting
    assert.equal(consumer.connected, true);
    const stopping = handle.stop();
    consumer.subscribing.resolve(); // the subscribe completes just after stop() was called
    await stopping;
    assert.equal(consumer.connected, false, "the consumer that connected must be disconnected");
    assert.equal(consumer.runs, 0, "a stopping consumer must not start running");
  });

  it("stop() while the topic check's admin client is connecting disconnects it", async () => {
    const admin = new FakeAdmin(true);
    const consumer = new FakeConsumer();
    const handle = startCreditResultsConsumer(kafka, deps, () => consumer, () => admin);
    await tick(); // admin.connect() is now waiting
    const t = Date.now();
    await handle.stop();
    assert.ok(Date.now() - t < 500, `stop took ${Date.now() - t} ms`);
    assert.ok(admin.disconnects >= 1);
    assert.equal(consumer.connected, false);
  });

  it("a running consumer is disconnected once by stop()", async () => {
    const consumer = new FakeConsumer();
    consumer.holdConnect = false;
    const handle = startCreditResultsConsumer(kafka, deps, () => consumer, () => new FakeAdmin(false));
    await tick();
    assert.equal(consumer.runs, 1);
    await handle.stop();
    assert.equal(consumer.connected, false);
  });
});
