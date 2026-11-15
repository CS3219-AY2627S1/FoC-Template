/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-18
 * Scope: KafkaCreditPublisher, the MessagePublisher that sends outbox rows to credit.commands
 *        keyed by order_id, replacing StubCreditBus when CREDIT_MODE=kafka.
 * Author review: Reviewed and approved by @phuc
 */
import type { MessagePublisher, OutboxMessage } from "../outbox";
import type { SharedProducer } from "./client";

/**
 * Sends each outbox row's payload unchanged (its operation_id included) with the row's
 * message_key, which is the errand id, i.e. the payload's order_id. The rows of one batch go
 * in one send per run of the same topic, so their order is kept. Resolves only once Kafka has
 * acknowledged them all, so the outbox marks nothing that might be lost.
 */
export class KafkaCreditPublisher implements MessagePublisher {
  constructor(private readonly producer: SharedProducer) {}

  async publish(messages: OutboxMessage[]): Promise<void> {
    let start = 0;
    while (start < messages.length) {
      let end = start + 1;
      while (end < messages.length && messages[end].topic === messages[start].topic) end++;
      await this.producer.send(
        messages[start].topic,
        messages.slice(start, end).map((m) => ({ key: m.key, value: JSON.stringify(m.payload) })),
      );
      start = end;
    }
  }
}
