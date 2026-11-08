/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Generated the dead-letter topic for messages the consumer skips, and their replay.
 * Author review: Ngooi Jun Sen to validate before merge.
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
}

// Where a dead letter came from travels in headers; the value is the original message.
const HEADER = {
  topic: 'x-original-topic',
  partition: 'x-original-partition',
  offset: 'x-original-offset',
  reason: 'x-reason',
  error: 'x-error',
} as const;

/**
 * Sends a message the consumer is about to skip to foc.badges.dlq (NFR3.1.1), so
 * it can be replayed once the cause is fixed. Keyed by the original topic and
 * partition, so dead letters from one partition stay in order. Throws if Kafka
 * refuses it; the caller logs that, as the message is then lost.
 */
export async function sendToDeadLetter(sender: DeadLetterSender, letter: DeadLetter): Promise<void> {
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

/** Reads a dead letter back from the topic; null if its headers are missing or wrong. */
export function readDeadLetter(value: Buffer | null, headers: RawHeaders): DeadLetter | null {
  const topic = header(headers, HEADER.topic);
  const partition = Number(header(headers, HEADER.partition));
  const offset = header(headers, HEADER.offset);
  const reason = header(headers, HEADER.reason);
  if (topic === undefined || !Number.isInteger(partition) || offset === undefined) return null;
  if (reason !== 'failed' && reason !== 'invalid') return null;
  return { topic, partition, offset, raw: value?.toString('utf8') ?? '', reason, error: header(headers, HEADER.error) ?? null };
}

export type ReplayOutcome = 'replayed' | 'requeued' | 'dropped';

/**
 * Runs one dead letter through its handler again. Handlers ignore what they
 * have already applied, so a message that did get through in the end changes
 * nothing. One that still throws or is still invalid goes back on the end of
 * the topic for the next replay; one with unreadable headers or no handler is
 * dropped, as nothing could ever apply it.
 */
export async function replayDeadLetter(
  sender: DeadLetterSender,
  value: Buffer | null,
  headers: RawHeaders,
): Promise<ReplayOutcome> {
  const letter = readDeadLetter(value, headers);
  const handler = letter && handlerFor(letter.topic);
  if (!letter || !handler) return 'dropped';

  try {
    if ((await handler(letter.raw)) !== 'invalid') return 'replayed';
    await sendToDeadLetter(sender, { ...letter, reason: 'invalid', error: null });
  } catch (error) {
    await sendToDeadLetter(sender, {
      ...letter,
      reason: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return 'requeued';
}
