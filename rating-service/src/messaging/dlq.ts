/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the dead-letter topic for messages the consumer skips, and their replay,
 *        with a cap on how often one is replayed.
 * Reviewed by Ngooi Jun Sen.
 */

import { config } from '../config.js';
import { handlerFor } from './handlers.js';

// The slice of a Kafka producer the dead-letter path needs; tests pass a fake.
export interface DeadLetterSender {
  send(record: {
    topic: string;
    messages: { key: string; value: string; headers: Record<string, string> }[];
  }): Promise<unknown>;
}

export interface DeadLetter {
  topic: string;
  partition: number;
  offset: string;
  raw: string;
  // 'failed': every attempt threw. 'invalid': it doesn't match the contract.
  reason: 'failed' | 'invalid';
  error: string | null;
  // Replays that have failed so far; 0 when the consumer first skips it.
  replays: number;
  // When the consumer first skipped it (ISO 8601). Kept across re-queues.
  firstFailedAt: string;
}

// What the consumer passes when it first skips a message.
export type NewDeadLetter = Omit<DeadLetter, 'replays' | 'firstFailedAt'> &
  Partial<Pick<DeadLetter, 'replays' | 'firstFailedAt'>>;

// Where a dead letter came from travels in headers; the value is the original message.
const HEADER = {
  topic: 'x-original-topic',
  partition: 'x-original-partition',
  offset: 'x-original-offset',
  reason: 'x-reason',
  error: 'x-error',
  replays: 'x-replay-count',
  firstFailedAt: 'x-first-failed-at',
} as const;

/**
 * Sends a message the consumer is about to skip to foc.rating.dlq (NFR3.1.1), so
 * it can be replayed once the cause is fixed. Keyed by the original topic and
 * partition, so dead letters from one partition stay in order. Throws if Kafka
 * refuses it; the caller logs that, as the message is then lost.
 */
export async function sendToDeadLetter(sender: DeadLetterSender, letter: NewDeadLetter): Promise<void> {
  await sender.send({
    topic: config.kafka.dlqTopic,
    messages: [
      {
        key: `${letter.topic}:${letter.partition}`,
        value: letter.raw,
        headers: {
          [HEADER.topic]: letter.topic,
          [HEADER.partition]: String(letter.partition),
          [HEADER.offset]: letter.offset,
          [HEADER.reason]: letter.reason,
          ...(letter.error !== null && { [HEADER.error]: letter.error }),
          [HEADER.replays]: String(letter.replays ?? 0),
          [HEADER.firstFailedAt]: letter.firstFailedAt ?? new Date().toISOString(),
        },
      },
    ],
  });
}

type RawHeaders = Record<string, Buffer | string | (Buffer | string)[] | undefined> | undefined;

function header(headers: RawHeaders, name: string): string | undefined {
  const value = headers?.[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined ? undefined : first.toString();
}

/**
 * Reads a dead letter back from the topic; null if its headers are missing or
 * wrong. A missing or unreadable replay count or failure time (a dead letter
 * written before they existed) counts as no replays yet, failing now.
 */
export function readDeadLetter(value: Buffer | null, headers: RawHeaders): DeadLetter | null {
  const topic = header(headers, HEADER.topic);
  const partition = Number(header(headers, HEADER.partition));
  const offset = header(headers, HEADER.offset);
  const reason = header(headers, HEADER.reason);
  if (topic === undefined || !Number.isInteger(partition) || offset === undefined) return null;
  if (reason !== 'failed' && reason !== 'invalid') return null;

  const replays = Number(header(headers, HEADER.replays));
  const firstFailedAt = header(headers, HEADER.firstFailedAt);
  return {
    topic,
    partition,
    offset,
    raw: value?.toString('utf8') ?? '',
    reason,
    error: header(headers, HEADER.error) ?? null,
    replays: Number.isInteger(replays) && replays >= 0 ? replays : 0,
    firstFailedAt:
      firstFailedAt !== undefined && !Number.isNaN(Date.parse(firstFailedAt))
        ? firstFailedAt
        : new Date().toISOString(),
  };
}

export type ReplayOutcome = 'replayed' | 'requeued' | 'expired' | 'dropped';

export interface ReplayResult {
  outcome: ReplayOutcome;
  // The dead letter as read, for logging; null when its headers were unreadable.
  letter: DeadLetter | null;
}

/**
 * Runs one dead letter through its handler again. Handlers ignore what they
 * have already applied, so a message that did get through in the end changes
 * nothing. One that still throws or is still invalid goes back on the end of
 * the topic for the next replay, until it has failed DLQ_MAX_REPLAYS replays or
 * is older than the topic's retention: then it is 'expired', so a message that
 * can never succeed doesn't circle forever. One with unreadable headers or no
 * handler is 'dropped', as nothing could ever apply it. The caller logs both in
 * full.
 */
export async function replayDeadLetter(
  sender: DeadLetterSender,
  value: Buffer | null,
  headers: RawHeaders,
  now: Date = new Date(),
): Promise<ReplayResult> {
  const letter = readDeadLetter(value, headers);
  const handler = letter && handlerFor(letter.topic);
  if (!letter || !handler) return { outcome: 'dropped', letter };

  let failure: Pick<DeadLetter, 'reason' | 'error'>;
  try {
    if ((await handler(letter.raw)) !== 'invalid') return { outcome: 'replayed', letter };
    failure = { reason: 'invalid', error: null };
  } catch (error) {
    failure = { reason: 'failed', error: error instanceof Error ? error.message : String(error) };
  }

  const failed = { ...letter, ...failure, replays: letter.replays + 1 };
  const age = now.getTime() - Date.parse(letter.firstFailedAt);
  if (failed.replays >= config.kafka.dlqMaxReplays || age >= config.kafka.dlqMaxAgeMs) {
    return { outcome: 'expired', letter: failed };
  }
  await sendToDeadLetter(sender, failed);
  return { outcome: 'requeued', letter: failed };
}
