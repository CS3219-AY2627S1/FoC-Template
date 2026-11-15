/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: The background outbox publisher loop and periodic cleanup (implementation-proposal §4.4).
 * Author review: Reviewed and approved by @phuc
 */
import { Pool } from "pg";
import { OUTBOX } from "./config";
import { Producer, sendMessages } from "./kafka";
import { errorMessage, log } from "./log";
import { deletePublishedOutboxEvents, publishOutboxBatch } from "./outbox";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publishes outbox events until stop() is called. Batches run back to back while there is
 * work; when the outbox is empty it waits OUTBOX.idlePollMs. A failed batch is retried.
 */
export function startOutboxPublisher(pool: Pool, producer: Producer): { stop: () => Promise<void> } {
  let stopping = false;

  const produce = (messages: Parameters<Parameters<typeof publishOutboxBatch>[1]>[0]) =>
    sendMessages(
      producer,
      messages.map((m) => ({ topic: m.topic, key: m.key, value: JSON.stringify(m.payload) })),
    );

  const loop = (async () => {
    let failures = 0;
    while (!stopping) {
      try {
        const published = await publishOutboxBatch(pool, produce);
        if (failures > 0) log.info("outbox_publisher_recovered", { after_failures: failures });
        failures = 0;
        if (published > 0) log.info("outbox_published", { count: published });
        else await sleep(OUTBOX.idlePollMs);
      } catch (err) {
        failures++;
        if (failures === 1) log.warn("outbox_publish_failed", { error: errorMessage(err) });
        await sleep(Math.min(OUTBOX.idlePollMs * 2 ** failures, 5_000));
      }
    }
  })();

  const cleanup = setInterval(() => {
    deletePublishedOutboxEvents(pool)
      .then((n) => n > 0 && log.info("outbox_cleaned", { deleted: n }))
      .catch((err) => log.warn("outbox_cleanup_failed", { error: errorMessage(err) }));
  }, OUTBOX.cleanupIntervalMs);

  return {
    async stop() {
      stopping = true;
      clearInterval(cleanup);
      await loop;
    },
  };
}
