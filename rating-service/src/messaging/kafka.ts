/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5)
 * Scope: Generated the Kafka consumer and producer wiring, including dead letters to
 *        foc.rating.dlq.
 * Reviewed by Ngooi Jun Sen.
 */

import { KafkaJS } from '@confluentinc/kafka-javascript';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { type NewDeadLetter, sendToDeadLetter } from './dlq.js';
import { handlerFor } from './handlers.js';
import { startOutboxPurge, startOutboxRelay } from './outbox.js';
import { withRetries } from './retry.js';

type KafkaSettings = typeof config.kafka;

// Deployed clusters use TLS + SCRAM-SHA-512 (ADR-0004). A local broker with no
// username set connects in plaintext.
export function createKafka(settings: KafkaSettings): KafkaJS.Kafka {
  const secured = settings.username !== '';
  return new KafkaJS.Kafka({
    kafkaJS: {
      clientId: settings.clientId,
      brokers: [...settings.brokers],
      ssl: secured,
      ...(secured && {
        sasl: {
          mechanism: 'scram-sha-512' as const,
          username: settings.username,
          password: settings.password,
        },
      }),
    },
    ...(settings.caCert !== '' && { 'ssl.ca.location': settings.caCert }),
  });
}

// Starts the consumer of foc.rating.commands and foc.user.status, the outbox
// relay to foc.user.rating and the purge of sent outbox rows. The producer also
// sends dead letters to foc.rating.dlq. Returns a function that stops them all.
export async function startMessaging(log: FastifyBaseLogger): Promise<() => Promise<void>> {
  const settings = config.kafka;
  const kafka = createKafka(settings);

  const producer = kafka.producer();
  await producer.connect();
  const stopPurge = startOutboxPurge(settings.outboxPurgeMs, settings.outboxRetentionHours * 3_600_000, (err) =>
    log.warn({ err }, 'outbox purge failed; will retry'),
  );
  const stopRelay = startOutboxRelay(producer, settings.outboxPollMs, (err) =>
    log.warn({ err }, 'outbox relay pass failed; will retry'),
  );

  const consumer = kafka.consumer({
    kafkaJS: { groupId: settings.groupId, fromBeginning: true },
  });
  await consumer.connect();
  const topics = [settings.commandsTopic, settings.userTopic];
  await consumer.subscribe({ topics });

  // NFR3.1.1: skip the message so it can't block the partition, but keep it on
  // the dead-letter topic for npm run replay:dlq. If even that fails, throw: the
  // message is redelivered rather than lost, and the partition waits for Kafka.
  const deadLetter = async (letter: NewDeadLetter): Promise<void> => {
    try {
      await sendToDeadLetter(producer, letter);
    } catch (err) {
      log.error({ err, topic: letter.topic, partition: letter.partition, offset: letter.offset }, 'could not dead-letter the rating message');
      throw err;
    }
  };

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const where = { topic, partition, offset: message.offset };
      const handler = handlerFor(topic);
      if (!handler) return;
      const raw = message.value?.toString('utf8') ?? '';

      const result = await withRetries(
        () => handler(raw),
        settings.maxAttempts,
        (err, attempt) => log.warn({ err, attempt, ...where }, 'rating command failed'),
      );

      if (!result.ok) {
        log.error({ err: result.error, ...where, raw }, 'rating command skipped after retries');
        const error = result.error instanceof Error ? result.error.message : String(result.error);
        await deadLetter({ topic, partition, offset: message.offset, raw, reason: 'failed', error });
      } else if (result.value === 'invalid') {
        log.error({ ...where, raw }, 'rating command rejected: does not match the contract');
        await deadLetter({ topic, partition, offset: message.offset, raw, reason: 'invalid', error: null });
      } else {
        log.debug({ ...where, outcome: result.value }, 'rating command handled');
      }
    },
  });

  log.info({ brokers: settings.brokers, topics }, 'kafka messaging started');

  return async () => {
    stopRelay();
    stopPurge();
    await consumer.disconnect();
    await producer.disconnect();
  };
}
