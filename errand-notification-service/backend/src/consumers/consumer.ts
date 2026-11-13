// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-02
// Scope: Implemented the author-designed Kafka consumer flow
// flow.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import type { Kafka, Consumer, EachMessagePayload } from 'kafkajs'

export class ErrandNotificationConsumer {
  private consumer?: Consumer

  constructor(private readonly kafka: Kafka) {}

  async start(
    groupId: string,
    topics: string[],
    handlers: Record<string, (payload: EachMessagePayload) => Promise<void>>,
  ): Promise<void> {
    if (this.consumer) throw new Error('Notification consumer is already started')
    const consumer = this.kafka.consumer({
      groupId,
      allowAutoTopicCreation: false,
      sessionTimeout: 30_000,
      rebalanceTimeout: 60_000,
    })
    try {
      await consumer.connect()
      for (const topic of topics) await consumer.subscribe({ topic })
      await consumer.run({
        eachMessage: async (payload) => {
          const handler = handlers[payload.topic]
          if (handler) await handler(payload)
        },
      })
      this.consumer = consumer
    } catch (error) {
      await consumer.disconnect().catch(() => undefined)
      throw error
    }
  }

  async stop(): Promise<void> {
    const consumer = this.consumer
    this.consumer = undefined
    if (consumer) await consumer.disconnect()
  }
}
