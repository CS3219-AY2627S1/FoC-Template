/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-16
 * Scope: Kafka client and producer with the producer settings from implementation-proposal §7.2
 *        (acks=all, idempotence), using the author's chosen library
 *        (@confluentinc/kafka-javascript, KafkaJS-style API).
 * Author review: Reviewed and approved by @phuc
 */
import { KafkaJS } from "@confluentinc/kafka-javascript";
import { loadKafkaConfig } from "./config";

export type Producer = KafkaJS.Producer;
export type Consumer = KafkaJS.Consumer;

export interface OutgoingMessage {
  topic: string;
  key: string | null;
  value: string;
}

/** Any failure to send to Kafka. The caller treats it as temporary and retries. */
export class KafkaSendError extends Error {}

export function createKafka(): KafkaJS.Kafka {
  const { brokers, clientId } = loadKafkaConfig();
  return new KafkaJS.Kafka({ kafkaJS: { brokers, clientId, logLevel: KafkaJS.logLevel.WARN } });
}

export function createProducer(kafka: KafkaJS.Kafka): Producer {
  // Idempotence keeps retried sends from writing duplicates; acks=-1 is acks=all
  return kafka.producer({ kafkaJS: { idempotent: true, acks: -1 } });
}

/**
 * Sends the messages and resolves once Kafka has acknowledged all of them. Messages for the
 * same topic keep their order.
 */
export async function sendMessages(producer: Producer, messages: OutgoingMessage[]): Promise<void> {
  const byTopic = new Map<string, OutgoingMessage[]>();
  for (const m of messages) {
    byTopic.set(m.topic, [...(byTopic.get(m.topic) ?? []), m]);
  }
  try {
    for (const [topic, list] of byTopic) {
      await producer.send({ topic, messages: list.map((m) => ({ key: m.key, value: m.value })) });
    }
  } catch (err) {
    throw new KafkaSendError(`Kafka send failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
