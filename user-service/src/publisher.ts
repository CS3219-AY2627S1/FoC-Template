// AI assistance: Codex (GPT-6), 2026-10-18. Scope: background publisher lifecycle. Author review: Reviewed and approved by @phuc.
import { Pool } from "pg";
import { OUTBOX } from "./config";
import { deletePublishedOutboxEvents, outboxBacklog, OutboxMessage, publishOutboxBatch } from "./outbox";
import { onPublisherWake } from "./publisherWake";

// Structural interface keeps lifecycle tests independent of the native Kafka library.
export interface StatusProducer {
  connect(): Promise<void>;
  send(record: { topic: string; messages: OutboxMessage[] }): Promise<unknown>;
  disconnect(): Promise<void>;
}

export function startOutboxPublisher(db: Pool, producer: StatusProducer) {
  let stopping = false;
  let connected = false;
  let pendingWake = false;
  let resume: (() => void) | undefined;
  const unsubscribe = onPublisherWake(() => { pendingWake = true; resume?.(); });
  const pause = (ms: number, interruptible = true) => new Promise<void>((resolve) => {
    if (stopping || (interruptible && pendingWake)) { pendingWake = false; resolve(); return; }
    const finish = () => { clearTimeout(timer); resume = undefined; resolve(); };
    const timer = setTimeout(finish, ms);
    // Wake-ups shorten idle polls, but must not defeat outage back-off.
    resume = interruptible ? finish : undefined;
    stopPause = finish;
  });
  let stopPause: (() => void) | undefined;

  const loop = (async () => {
    let failures = 0;
    let nextCleanup = Date.now() + OUTBOX.cleanupIntervalMs;
    let nextMetrics = Date.now();
    while (!stopping) {
      try {
        if (!connected) { await producer.connect(); connected = true; }
        if (stopping) break;
        const started = Date.now();
        pendingWake = false;
        const count = await publishOutboxBatch(db, async (messages) => {
          if (stopping) throw new Error("Publisher stopping");
          await producer.send({ topic: OUTBOX.topic, messages });
        });
        if (failures) console.info("outbox_publisher_recovered", { afterFailures: failures });
        failures = 0;
        if (count) console.info("outbox_published", { count, durationMs: Date.now() - started });
        if (!stopping && Date.now() >= nextMetrics) {
          console.info("outbox_backlog", await outboxBacklog(db));
          nextMetrics = Date.now() + 60_000;
        }
        if (!stopping && Date.now() >= nextCleanup) {
          const deleted = await deletePublishedOutboxEvents(db);
          if (deleted) console.info("outbox_cleaned", { deleted });
          // Large cleanups continue in bounded statements interleaved with publishing.
          if (deleted < 1000) nextCleanup = Date.now() + OUTBOX.cleanupIntervalMs;
        }
        if (count === 0) await pause(OUTBOX.idlePollMs);
      } catch (err) {
        if (stopping) break;
        failures++;
        if (failures === 1) console.warn("outbox_publish_failed", { error: err instanceof Error ? err.message : String(err) });
        await pause(Math.min(OUTBOX.idlePollMs * 2 ** Math.min(failures, 5), 5000), false);
      }
    }
  })();

  let stopped: Promise<void> | undefined;
  return {
    stop(): Promise<void> {
      if (stopped) return stopped;
      stopping = true;
      unsubscribe();
      stopPause?.();
      // disconnect() also aborts an in-progress connect in the Confluent client.
      // Await both so no publisher DB work survives pool shutdown.
      stopped = Promise.allSettled([producer.disconnect(), loop]).then((results) => {
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      });
      return stopped;
    },
  };
}
