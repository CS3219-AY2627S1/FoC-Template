/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
 * Scope: Generated implementation of errand outbox event publication and batch scheduling
 * Author review: Verified event publishing behavior and that ordering within each key is preserved, matching kafka key behavior.
 */

import type { ErrandEvent, ErrandEventType, ErrandEventPayload } from '@relay/contracts'
import type { Kafka, Producer } from 'kafkajs'
import { ErrandRepository } from '../backend/src/repositories/errand.repository.js'

export class ErrandEventPublisher {
  private readonly producer: Producer
  private timer?: ReturnType<typeof setTimeout>
  private flushing = false
  private running = false
  private fullBatch = false
  private lastCleanup = 0

  constructor(
    kafka: Kafka,
    private readonly repository: ErrandRepository,
    private readonly topic: string,
  ) {
    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      retry: { retries: 5, initialRetryTime: 100, maxRetryTime: 1000 },
    })
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.producer.connect()
    } catch (error) {
      this.running = false
      throw error
    }
    if (this.running) void this.tick()
  }

  private async tick(): Promise<void> {
    try {
      await this.flush()
    } catch (error) {
      this.fullBatch = false
      console.error('Errand event outbox delivery failed; retrying:', error)
    }
    if (this.running) this.timer = setTimeout(() => void this.tick(), this.fullBatch ? 0 : 1_000)
  }

  async flush(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    try {
      const pending = await this.repository.unpublishedEvents()
      this.fullBatch = pending.length === 100
      const byKey = new Map<string, Promise<void>>()
      const tasks = pending.map((stored) => {
        const payload = stored.payload as unknown as ErrandEventPayload
        const key = payload.errandId
        const task = (byKey.get(key) ?? Promise.resolve()).then(async () => {
          if (!key) throw new Error('errandId is required for Kafka message key')
          const event: ErrandEvent = {
            eventId: stored.id,
            eventType: stored.eventType as ErrandEventType,
            timestamp: new Date().toISOString(),
            version: 1,
            payload,
          }
          await this.producer.send({
            topic: this.topic,
            acks: -1,
            messages: [{ key, value: JSON.stringify(event) }],
          })
          await this.repository.markEventPublished(stored.id)
        })
        byKey.set(key, task)
        return task.then(() => undefined, (error: unknown) => error)
      })
      const results = await Promise.all(tasks)
      const failure = results.find((result) => result !== undefined)
      if (failure !== undefined) throw failure
    } finally {
      try {
        if (Date.now() - this.lastCleanup >= 60_000) {
          await this.repository.deleteOldPublishedEvents(
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          )
          this.lastCleanup = Date.now()
        }
      } catch (error) {
        console.error('Errand outbox cleanup failed; retrying:', error)
      }
      this.flushing = false
    }
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    while (this.flushing) await new Promise((resolve) => setTimeout(resolve, 50))
    await this.producer.disconnect()
  }
}
