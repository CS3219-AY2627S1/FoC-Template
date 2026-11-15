/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Outbox insert, batch publisher and publisher loop, adapted from credit-service/src/outbox.ts
 *        and src/publisher.ts (branch_credit) without causation_id, retention cleanup or event_id in
 *        the payload (the contract fixes its keys); the loop takes a MessagePublisher.
 * Author review: Reviewed and approved by @mattis.
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Publication in sequential-id order under a shared advisory lock, wake-on-commit through
 *        LISTEN/NOTIFY with a fallback poll, outage back-off that wakes do not shorten, and the
 *        backlog query, for the Kafka integration with Credit Service.
 * Author review of additional changes: Reviewed and approved by @phuc
 */
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { OUTBOX } from "./config";
import { inTransaction, rollback } from "./db";
import { errorMessage, log } from "./log";
import { metrics } from "./metrics";

/**
 * Adds an event to the outbox. Call it inside the transaction that makes the change, so the
 * event exists if and only if the change committed. Returns the row's event_id. The NOTIFY is
 * delivered only if the transaction commits, and wakes every publisher at once.
 */
export async function insertOutboxEvent(
  client: PoolClient,
  event: { eventType: string; topic: string; key: string; payload: Record<string, unknown> },
): Promise<string> {
  const eventId = randomUUID();
  await client.query(
    `INSERT INTO outbox (event_id, event_type, topic, message_key, payload) VALUES ($1, $2, $3, $4, $5)`,
    [eventId, event.eventType, event.topic, event.key, event.payload],
  );
  await client.query("SELECT pg_notify($1, '')", [OUTBOX.wakeChannel]);
  return eventId;
}

export interface OutboxMessage {
  eventId: string;
  topic: string;
  key: string;
  payload: Record<string, unknown>;
  /** When the row was written; the publisher measures latency from it */
  createdAt: Date;
}

/** Where the outbox publisher sends messages: KafkaCreditPublisher, or StubCreditBus. */
export interface MessagePublisher {
  publish(messages: OutboxMessage[]): Promise<void>;
}

/**
 * Publishes up to OUTBOX.batchSize unpublished events in id order. `produce` must resolve only
 * once every message is acknowledged; if it throws, nothing is marked and the same rows, with
 * the same payloads and operation_ids, are sent again later.
 *
 * The transaction holds an advisory lock through produce() and the marking, so only one
 * publisher (across all replicas) sends at a time and rows leave in id order. A publisher that
 * cannot take the lock returns 0 and tries again on its next poll. Returns the count sent.
 */
export async function publishOutboxBatch(
  pool: Pool,
  produce: (messages: OutboxMessage[]) => Promise<void>,
): Promise<number> {
  return inTransaction(pool, async (client) => {
    const { rows: [lock] } = await client.query("SELECT pg_try_advisory_xact_lock($1) AS ok", [OUTBOX.lockId]);
    if (!lock.ok) return rollback(0);
    const { rows } = await client.query(
      `SELECT id, event_id, topic, message_key, payload, created_at
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY id
       LIMIT $1`,
      [OUTBOX.batchSize],
    );
    if (rows.length === 0) return 0;

    await produce(
      rows.map((r) => ({ eventId: r.event_id, topic: r.topic, key: r.message_key, payload: r.payload, createdAt: r.created_at })),
    );

    await client.query("UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])", [rows.map((r) => r.id)]);
    return rows.length;
  });
}

/** Unpublished rows and the age of the oldest, in milliseconds (0 when there are none). */
export async function outboxBacklog(pool: Pool): Promise<{ outboxPending: number; outboxOldestMs: number }> {
  const { rows: [row] } = await pool.query(
    `SELECT count(*)::int AS pending,
            COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at))) * 1000, 0)::float8 AS oldest_ms
     FROM outbox WHERE published_at IS NULL`,
  );
  return { outboxPending: row.pending, outboxOldestMs: Math.round(row.oldest_ms) };
}

/**
 * Keeps a LISTEN on OUTBOX.wakeChannel and calls `onWake` for each NOTIFY. Wake-ups are only
 * hints: if the connection is lost it is re-made after a pause, and the publisher's fallback
 * poll covers the gap.
 */
export function listenForCommits(pool: Pool, onWake: () => void): { stop(): Promise<void> } {
  let stopped = false;
  let client: PoolClient | undefined;
  let retryTimer: NodeJS.Timeout | undefined;

  const connect = async (): Promise<void> => {
    if (stopped) return;
    try {
      const c = await pool.connect();
      if (stopped) return c.release();
      client = c;
      c.on("notification", onWake);
      c.on("error", (err) => {
        log.warn("outbox_listen_lost", { error: errorMessage(err) });
        if (client === c) client = undefined;
        c.release(err);
        retryTimer = setTimeout(() => void connect(), OUTBOX.maxBackoffMs);
      });
      await c.query(`LISTEN ${OUTBOX.wakeChannel}`); // a fixed identifier, never user input
      // A row committed while there was no listener is picked up by the next poll
      onWake();
    } catch (err) {
      if (client) {
        client.release(err instanceof Error ? err : new Error(String(err)));
        client = undefined;
      }
      if (!stopped) retryTimer = setTimeout(() => void connect(), OUTBOX.maxBackoffMs);
    }
  };
  void connect();

  return {
    async stop() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      const c = client;
      client = undefined;
      if (c) {
        c.removeAllListeners("notification");
        // Released as broken: the pool drops it instead of handing out a listening connection
        c.release(new Error("outbox listener stopped"));
      }
    },
  };
}

/**
 * Publishes outbox events until stop() is called. Batches run back to back while there is
 * work. When the outbox is empty it waits for a commit's NOTIFY, or OUTBOX.idlePollMs at most.
 * A failed batch is retried after a back-off that doubles up to OUTBOX.maxBackoffMs; wake-ups
 * do not shorten it. Batches never overlap; stop() waits for the running one.
 */
export function startOutboxPublisher(
  pool: Pool,
  publisher: MessagePublisher,
  opts: { listen?: boolean } = {},
): { stop(): Promise<void>; wake(): void } {
  let stopping = false;
  let woken = false;
  let endPause: (() => void) | undefined;
  let interruptible = false;

  const wake = () => {
    woken = true;
    if (interruptible) endPause?.();
  };
  // Resolves after ms; also at once on stop(), and on a wake if `canWake`
  const pause = (ms: number, canWake: boolean) =>
    new Promise<void>((resolve) => {
      if (stopping || (canWake && woken)) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        endPause = undefined;
        resolve();
      }
      endPause = done;
      interruptible = canWake;
    });

  const listener = opts.listen === false ? undefined : listenForCommits(pool, wake);

  const loop = (async () => {
    let failures = 0;
    while (!stopping) {
      try {
        // Cleared before the batch, so a commit during it triggers another batch straight away
        woken = false;
        const started = Date.now();
        const published = await publishOutboxBatch(pool, async (messages) => {
          await publisher.publish(messages);
          const acked = Date.now();
          for (const m of messages) metrics.publishLatency(acked - new Date(m.createdAt).getTime());
        });
        if (failures > 0) log.info("outbox_publisher_recovered", { afterFailures: failures });
        failures = 0;
        if (published > 0) {
          metrics.increment("outboxPublished", published);
          metrics.increment("outboxBatches");
          log.info("outbox_published", { count: published, durationMs: Date.now() - started });
        } else {
          await pause(OUTBOX.idlePollMs, true);
        }
      } catch (err) {
        failures++;
        metrics.increment("outboxPublishFailures");
        const delayMs = Math.min(OUTBOX.idlePollMs * 2 ** Math.min(failures, 10), OUTBOX.maxBackoffMs);
        // One line when it starts failing, then one per back-off ceiling so a long outage stays visible
        if (failures === 1 || delayMs === OUTBOX.maxBackoffMs) {
          log.warn("outbox_publish_failed", { error: errorMessage(err), failures, retryInMs: delayMs });
        }
        await pause(delayMs, false);
      }
    }
  })();

  let stopped: Promise<void> | undefined;
  return {
    wake,
    stop() {
      if (stopped) return stopped;
      stopping = true;
      endPause?.();
      stopped = (async () => {
        await loop;
        await listener?.stop();
      })();
      return stopped;
    },
  };
}
