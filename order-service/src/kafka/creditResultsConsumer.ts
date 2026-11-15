/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: credit.results consumer: validation, key and operation correlation, deduplicated
 *        handling through handleCreditResult(), in-place retries, outage redelivery, the
 *        credit.results.dlq, offset commits after handling, and a background connect loop.
 *        Message flow adapted from credit-service/src/consumer.ts.
 * Author review: Reviewed and approved by @phuc
 * Additional AI assistance: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: stop() disconnects a consumer or admin client that is still connecting or subscribing.
 * Author review of additional changes: Reviewed and approved by @phuc
 */
import type { KafkaJS } from "@confluentinc/kafka-javascript";
import type { Pool } from "pg";
import { CONSUMER, CONSUMER_GROUP, TOPICS } from "../config";
import { handleCreditResult, UNCORRELATED_OUTCOMES, type CreditResultOutcome } from "../credit/creditResults";
import { isDatabaseUnavailable } from "../dbAvailability";
import { parseCreditResult } from "../domain/messages";
import { errorMessage, log } from "../log";
import { metrics } from "../metrics";
import { KafkaSendError, type KafkaRecord } from "./client";

export interface IncomingRecord {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
  /** Kafka's message timestamp, in milliseconds since the epoch */
  timestamp?: string;
}

export interface ConsumerDeps {
  pool: Pool;
  /** Produces to credit.results.dlq and resolves once acknowledged; throws KafkaSendError. */
  sendToDlq(messages: KafkaRecord[]): Promise<void>;
  /** Waits ms, or less once the consumer is stopping. */
  sleep(ms: number): Promise<void>;
  isStopping(): boolean;
}

export type RecordOutcome = CreditResultOutcome | "dead_lettered";

async function deadLetter(deps: ConsumerDeps, record: IncomingRecord, reason: string, attempts: number): Promise<"dead_lettered"> {
  const value = JSON.stringify({
    source_topic: record.topic,
    source_partition: record.partition,
    source_offset: record.offset,
    original_key: record.key,
    original_value: record.value,
    reason,
    attempts,
    failed_at: new Date().toISOString(),
  });
  await deps.sendToDlq([{ key: record.key, value }]);
  metrics.increment("resultsDeadLettered");
  log.warn("credit_result_dead_lettered", { partition: record.partition, offset: record.offset, key: record.key, reason, attempts });
  return "dead_lettered";
}

/**
 * Handles one record completely: when it returns, the offset may be committed. It throws if
 * something that must happen has not (the transaction rolled back, or the DLQ did not
 * acknowledge), so the record is handled again.
 */
export async function processRecord(deps: ConsumerDeps, record: IncomingRecord): Promise<RecordOutcome> {
  let body: unknown;
  try {
    body = JSON.parse(record.value ?? "");
  } catch {
    return deadLetter(deps, record, "value is not valid JSON", 1);
  }
  const parsed = parseCreditResult(body);
  if (!parsed.ok) return deadLetter(deps, record, parsed.reason, 1);
  const msg = parsed.message;
  // The contract keys every reply by order_id; a different key would break per-errand ordering
  if (record.key?.toLowerCase() !== msg.orderId) {
    return deadLetter(deps, record, "message key does not match order_id", 1);
  }

  const outcome = await handleCreditResult(deps.pool, msg);
  if (UNCORRELATED_OUTCOMES.has(outcome)) {
    const reason = outcome === "ignored_unknown_order" ? "no errand with this order_id" : "operation_id is not the errand's reservation operation";
    return deadLetter(deps, record, reason, 1);
  }
  if (outcome === "already_processed") metrics.increment("resultsDuplicates");
  log.info("credit_result_processed", {
    type: msg.type, orderId: msg.orderId, eventId: msg.eventId, outcome, partition: record.partition, offset: record.offset,
  });
  return outcome;
}

/** Database or Kafka unreachable: the record is redelivered until it is back, never dead-lettered. */
export function isOutage(err: unknown): boolean {
  return isDatabaseUnavailable(err) || err instanceof KafkaSendError;
}

function backoff(attempt: number): number {
  return Math.min(CONSUMER.retryInitialDelayMs * 2 ** (attempt - 1), CONSUMER.retryMaxDelayMs);
}

/**
 * processRecord() with retries: up to CONSUMER.maxAttempts in place, then the DLQ. During an
 * outage, or once stopping, it throws after a pause, so the consumer seeks back and the same
 * record is delivered again; `outages` counts consecutive outage failures for the pause length.
 */
export async function processWithRetry(
  deps: ConsumerDeps, record: IncomingRecord, outages: { count: number },
): Promise<RecordOutcome> {
  for (let attempt = 1; ; attempt++) {
    try {
      const outcome = await processRecord(deps, record);
      outages.count = 0;
      return outcome;
    } catch (err) {
      const where = { partition: record.partition, offset: record.offset, attempt, error: errorMessage(err) };
      if (isOutage(err) || deps.isStopping()) {
        outages.count++;
        metrics.increment("resultsOutageRetries");
        log.warn("credit_result_retry_outage", { ...where, consecutiveOutages: outages.count });
        await deps.sleep(backoff(outages.count));
        throw err;
      }
      if (attempt >= CONSUMER.maxAttempts) {
        log.error("credit_result_failed", where);
        return deadLetter(deps, record, `failed after ${attempt} attempts: ${errorMessage(err)}`, attempt);
      }
      metrics.increment("resultsRetries");
      log.warn("credit_result_retry", where);
      await deps.sleep(backoff(attempt));
    }
  }
}

/** The consumer calls used here; tests can substitute a fake. */
export type ConsumerLike = Pick<KafkaJS.Consumer, "connect" | "subscribe" | "run" | "commitOffsets" | "disconnect">;

export function createResultsConsumer(kafka: KafkaJS.Kafka): ConsumerLike {
  return kafka.consumer({
    kafkaJS: {
      groupId: CONSUMER_GROUP,
      fromBeginning: true, // a reply sent before Order Service first subscribed is still read
      autoCommit: false, // the offset is committed per message, after it is handled
    },
  });
}

/** The admin calls used here; tests can substitute a fake. */
export type AdminLike = Pick<KafkaJS.Admin, "connect" | "fetchTopicMetadata" | "disconnect">;

/** Resolves when both topics exist; throws otherwise (topics are never auto-created). */
async function checkTopics(admin: AdminLike): Promise<void> {
  await admin.connect();
  try {
    const metadata = await admin.fetchTopicMetadata({ topics: [TOPICS.results, TOPICS.resultsDlq], timeout: 5_000 });
    const found = new Set(metadata.map((t) => t.name));
    for (const topic of [TOPICS.results, TOPICS.resultsDlq]) {
      if (!found.has(topic)) throw new Error(`topic ${topic} does not exist (run kafka/create-topics.sh)`);
    }
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

/**
 * Connects and subscribes in the background, retrying with back-off until it works, then
 * handles credit.results in partition order, committing each offset only after the record is
 * handled. stop() ends the retries and disconnects whatever client exists, whether it is still
 * connecting, subscribing or running (a running consumer finishes its record in progress).
 */
export function startCreditResultsConsumer(
  kafka: KafkaJS.Kafka,
  deps: Omit<ConsumerDeps, "sleep" | "isStopping">,
  makeConsumer: () => ConsumerLike = () => createResultsConsumer(kafka),
  makeAdmin: () => AdminLike = () => kafka.admin(),
): { stop(): Promise<void> } {
  let stopping = false;
  const wakers = new Set<() => void>();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (stopping) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        wakers.delete(done);
        resolve();
      }
      wakers.add(done);
    });
  const full: ConsumerDeps = { ...deps, sleep, isStopping: () => stopping };
  const outages = { count: 0 };
  // The clients of the current attempt, known from the moment they exist, so stop() can
  // disconnect them even while they are still connecting
  let consumer: ConsumerLike | undefined;
  let admin: AdminLike | undefined;

  const running = (async () => {
    for (let attempt = 1; !stopping; attempt++) {
      const c = makeConsumer();
      consumer = c;
      try {
        admin = makeAdmin();
        await checkTopics(admin);
        admin = undefined;
        if (stopping) break;
        await c.connect();
        if (stopping) break;
        await c.subscribe({ topics: [TOPICS.results] });
        if (stopping) break;
        await c.run({
          eachMessage: async ({ topic, partition, message }) => {
            const record: IncomingRecord = {
              topic,
              partition,
              offset: message.offset,
              key: message.key ? message.key.toString("utf8") : null,
              value: message.value ? message.value.toString("utf8") : null,
              timestamp: message.timestamp,
            };
            await processWithRetry(full, record, outages);
            metrics.increment("resultsProcessed");
            if (record.timestamp) metrics.resultLag(Date.now() - Number(record.timestamp));
            // The committed offset is the next one to read
            await c.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
          },
        });
        log.info("credit_results_consumer_started", { group: CONSUMER_GROUP, topic: TOPICS.results, attempts: attempt });
        return;
      } catch (err) {
        await c.disconnect().catch(() => {});
        const delayMs = Math.min(CONSUMER.connectRetryInitialMs * 2 ** (attempt - 1), CONSUMER.connectRetryMaxMs);
        log.warn("credit_results_consumer_start_failed", { error: errorMessage(err), attempt, retryInMs: delayMs });
        await sleep(delayMs);
      }
    }
  })();

  let stopped: Promise<void> | undefined;
  return {
    stop() {
      if (stopped) return stopped;
      stopping = true;
      for (const wake of [...wakers]) wake();
      const disconnect = (client: { disconnect(): Promise<void> } | undefined) =>
        client?.disconnect().catch((err) => log.warn("credit_results_consumer_disconnect_failed", { error: errorMessage(err) }));
      stopped = (async () => {
        // At once: this aborts a connect in progress (the Confluent client's disconnect does),
        // so stop() never waits out a connection timeout; a running consumer finishes its
        // record in progress first, and that record's offset is committed only if it finished
        await Promise.all([disconnect(consumer), disconnect(admin)]);
        await running;
        // The loop may have got further after that disconnect (a connect that completed just as
        // stop() was called); whatever client it ended with is disconnected now
        await disconnect(consumer);
      })();
      return stopped;
    },
  };
}
