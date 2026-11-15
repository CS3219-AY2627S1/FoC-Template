/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: The message consumer described in implementation-proposal §7.1 and §7.3: parse, call
 *        the handler, act on its outcome (direct rejection reply, DLQ), then commit the offset
 *        of that one message. Retries in place up to the author's limit (5) before the DLQ.
 * Author review: Reviewed and approved by @phuc
 */
import { Pool } from "pg";
import { handleAccountStatus } from "./accounts";
import { CONSUMER_GROUP, MESSAGE_RETRY, TOPICS } from "./config";
import { isDatabaseUnavailable } from "./dbAvailability";
import { Consumer, KafkaSendError, OutgoingMessage } from "./kafka";
import { errorMessage, log } from "./log";
import { parseAccountStatusNotification, parseCreditCommand } from "./messages";
import { handleClosingMessage, handleReserveRequested } from "./reservations";

export interface IncomingRecord {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
}

export interface ConsumerDeps {
  pool: Pool;
  send: (messages: OutgoingMessage[]) => Promise<void>;
}

const DLQ_FOR: Record<string, string> = {
  [TOPICS.accountStatus]: TOPICS.accountStatusDlq,
  [TOPICS.commands]: TOPICS.commandsDlq,
};

/** Sends the record to its topic's DLQ with the reason (implementation-proposal §7.3). */
async function sendToDlq(deps: ConsumerDeps, record: IncomingRecord, reason: string, attempts: number): Promise<void> {
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
  await deps.send([{ topic: DLQ_FOR[record.topic], key: record.key, value }]);
  log.warn("message_dead_lettered", { topic: record.topic, offset: record.offset, reason });
}

function parseJson(value: string | null): { ok: true; body: unknown } | { ok: false } {
  if (value === null) return { ok: false };
  try {
    return { ok: true, body: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

/**
 * Handles one record completely: on return, the offset may be committed. Throws if nothing
 * that must happen has happened yet (the database transaction rolled back, or a reply/DLQ
 * message was not acknowledged).
 */
export async function processRecord(deps: ConsumerDeps, record: IncomingRecord): Promise<void> {
  const json = parseJson(record.value);
  if (!json.ok) return sendToDlq(deps, record, "value is not valid JSON", 1);
  const where = { topic: record.topic, offset: record.offset };

  if (record.topic === TOPICS.accountStatus) {
    const parsed = parseAccountStatusNotification(json.body);
    if (!parsed.ok) return sendToDlq(deps, record, parsed.reason, 1);
    const outcome = await handleAccountStatus(deps.pool, parsed.message);
    if (outcome.kind === "invalid") return sendToDlq(deps, record, outcome.reason, 1);
    log.info("account_status_processed", { ...where, outcome: outcome.kind, operation_id: parsed.message.operationId });
    return;
  }

  if (record.topic === TOPICS.commands) {
    const parsed = parseCreditCommand(json.body);
    if (!parsed.ok) return sendToDlq(deps, record, parsed.reason, 1);
    const msg = parsed.message;

    if (msg.type === "ReserveRequested") {
      const outcome = await handleReserveRequested(deps.pool, msg);
      if (outcome.kind === "rejected") {
        // Decision D5: produce the rejection and wait for the ack before the offset commit
        const { topic, key, payload } = outcome.reply;
        await deps.send([{ topic, key, value: JSON.stringify(payload) }]);
      }
      log.info("reserve_processed", {
        ...where,
        outcome: outcome.kind,
        reason: outcome.kind === "rejected" ? outcome.reason : undefined,
        operation_id: msg.operationId,
        order_id: msg.orderId,
      });
      return;
    }

    const outcome = await handleClosingMessage(deps.pool, msg);
    if (outcome.kind === "invalid") return sendToDlq(deps, record, outcome.reason, 1);
    log.info("closing_message_processed", {
      ...where,
      type: msg.type,
      outcome: outcome.kind,
      operation_id: msg.operationId,
      order_id: msg.orderId,
    });
    return;
  }

  throw new Error(`No handler for topic ${record.topic}`);
}

/** Database or Kafka unreachable: retry until it is back instead of using up attempts. */
function isOutage(err: unknown): boolean {
  return isDatabaseUnavailable(err) || err instanceof KafkaSendError;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(attempt: number): number {
  return Math.min(MESSAGE_RETRY.initialDelayMs * 2 ** (attempt - 1), MESSAGE_RETRY.maxDelayMs);
}

/**
 * processRecord() with retries: up to MESSAGE_RETRY.maxAttempts in place, then the DLQ.
 * During an outage it throws after a pause, so the consumer seeks back and redelivers the
 * same message later.
 */
export async function processWithRetry(deps: ConsumerDeps, record: IncomingRecord): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await processRecord(deps, record);
      return;
    } catch (err) {
      const where = { topic: record.topic, offset: record.offset, attempt, error: errorMessage(err) };
      if (isOutage(err)) {
        log.warn("message_retry_outage", where);
        await sleep(MESSAGE_RETRY.maxDelayMs);
        throw err;
      }
      if (attempt >= MESSAGE_RETRY.maxAttempts) {
        log.error("message_failed", where);
        await sendToDlq(deps, record, `failed after ${attempt} attempts: ${errorMessage(err)}`, attempt);
        return;
      }
      log.warn("message_retry", where);
      await sleep(retryDelay(attempt));
    }
  }
}

/**
 * Subscribes to user.account-status and credit.commands and processes each message in
 * partition order, committing its offset only after it is fully handled (decision D7).
 */
export async function startConsumer(consumer: Consumer, deps: ConsumerDeps): Promise<void> {
  await consumer.connect();
  await consumer.subscribe({ topics: [TOPICS.accountStatus, TOPICS.commands] });
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const record: IncomingRecord = {
        topic,
        partition,
        offset: message.offset,
        key: message.key ? message.key.toString("utf8") : null,
        value: message.value ? message.value.toString("utf8") : null,
      };
      await processWithRetry(deps, record);
      // The committed offset is the next message to read
      await consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
    },
  });
  log.info("consumer_started", { group: CONSUMER_GROUP, topics: [TOPICS.accountStatus, TOPICS.commands] });
}
