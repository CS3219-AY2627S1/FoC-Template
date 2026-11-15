// AI assistance: Codex (GPT-6), 2026-10-18. Scope: account-status producer. Author review: Reviewed and approved by @phuc.
import { KafkaJS } from "@confluentinc/kafka-javascript";
import { loadKafkaConfig } from "./config";

export function createProducer(): KafkaJS.Producer {
  const { brokers, clientId } = loadKafkaConfig();
  const kafka = new KafkaJS.Kafka({ kafkaJS: {
    brokers, clientId, logLevel: KafkaJS.logLevel.WARN,
    connectionTimeout: 1000, authenticationTimeout: 1000,
    // Idempotent producers require at least one retry; the outer loop handles longer outages.
    retry: { retries: 1, initialRetryTime: 200 },
  } });
  return kafka.producer({
    kafkaJS: { idempotent: true, acks: -1 },
    "message.timeout.ms": 3000,
    "socket.timeout.ms": 3000,
    "allow.auto.create.topics": false,
    "linger.ms": 1,
  });
}
