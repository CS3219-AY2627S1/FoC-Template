/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: Kafka client, idempotent acks=all producer that connects lazily, and the send error
 *        type, using @confluentinc/kafka-javascript like credit-service and user-service.
 * Author review: Reviewed and approved by @phuc
 */
import { KafkaJS } from "@confluentinc/kafka-javascript";

export interface KafkaRecord {
  key: string | null;
  value: string;
}

/** The producer calls used here; tests substitute a fake. */
export interface ProducerLike {
  connect(): Promise<void>;
  send(record: { topic: string; messages: KafkaRecord[] }): Promise<unknown>;
  disconnect(): Promise<void>;
}

/** Any failure to reach Kafka or to get an acknowledgement. Callers treat it as an outage and retry. */
export class KafkaSendError extends Error {}

export function createKafka(config: { brokers: string[]; clientId: string }): KafkaJS.Kafka {
  return new KafkaJS.Kafka({
    kafkaJS: {
      brokers: config.brokers,
      clientId: config.clientId,
      logLevel: KafkaJS.logLevel.WARN,
      connectionTimeout: 3_000,
      // The callers' loops handle long outages; the client only retries briefly
      retry: { retries: 2, initialRetryTime: 200 },
    },
  });
}

export function createProducer(kafka: KafkaJS.Kafka): ProducerLike {
  return kafka.producer({
    // Idempotence keeps a retried send from writing duplicates; acks=-1 is acks=all
    kafkaJS: { idempotent: true, acks: -1 },
    // An unacknowledged send fails after this, so the outbox row stays unpublished and is resent
    "message.timeout.ms": 5_000,
    "socket.timeout.ms": 5_000,
    // Send what is there at once rather than waiting to fill a batch
    "linger.ms": 1,
    "allow.auto.create.topics": false,
  });
}

/**
 * One producer shared by the outbox publisher and the consumer's DLQ. It connects on first use
 * and again after a failed connect, so startup never waits for Kafka.
 */
export class SharedProducer {
  private connecting: Promise<void> | undefined;

  constructor(private readonly producer: ProducerLike) {}

  /** Resolves once Kafka has acknowledged every message (acks=all). Throws KafkaSendError. */
  async send(topic: string, messages: KafkaRecord[]): Promise<void> {
    try {
      this.connecting ??= this.producer.connect().catch((err) => {
        this.connecting = undefined;
        throw err;
      });
      await this.connecting;
      await this.producer.send({ topic, messages });
    } catch (err) {
      throw new KafkaSendError(`Kafka send to ${topic} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async disconnect(): Promise<void> {
    // Also aborts a connect still in progress
    await this.producer.disconnect();
    this.connecting = undefined;
  }
}
