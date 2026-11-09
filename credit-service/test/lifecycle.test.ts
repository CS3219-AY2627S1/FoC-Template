/* AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-11-09.
 * Scope: Kafka-independent startup and shutdown regressions for #58.
 * Author review: Reviewed and approved by @phuc. */
import assert from "node:assert/strict";
import { it } from "node:test";
import { startWorkers } from "../src/lifecycle";

it("retries failed Kafka startup without blocking the caller, then stops the publisher", async () => {
  let attempts = 0;
  let stopped = false;
  let disconnects = 0;
  let published!: () => void;
  const ready = new Promise<void>((resolve) => { published = resolve; });
  const workers = startWorkers({
    async connect() { if (++attempts < 2) throw new Error("Kafka offline"); },
    async disconnect() { disconnects++; },
    startPublisher() { published(); return { async stop() { stopped = true; } }; },
    retryMs: 1,
  });
  assert.equal(attempts, 1);
  await ready;
  await workers.stop();
  assert.equal(attempts, 2);
  assert.equal(stopped, true);
  assert.ok(disconnects >= 2);
});

it("wakes a pending retry on shutdown without starting a publisher", async () => {
  const workers = startWorkers({
    async connect() { throw new Error("offline"); },
    async disconnect() {},
    startPublisher() { throw new Error("must not start"); },
    retryMs: 60000,
  });
  await workers.stop();
});
