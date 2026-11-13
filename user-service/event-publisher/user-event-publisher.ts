/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
 * Scope: Generated implementation of user outbox event publication and batch scheduling
 * Author review: Verified event publishing behavior and that ordering within each key is preserved, matching kafka key behavior.
 */

import { Kafka, logLevel, type Producer } from 'kafkajs'
import { PrismaClient } from '@relay/user-prisma'

export class UserEventPublisher {
  private readonly producer: Producer
  private timer?: ReturnType<typeof setTimeout>
  private connected = false
  private flushing = false
  private running = false
  private lastCleanup = 0

  constructor(private readonly prisma = new PrismaClient()) {
    const mode = process.env.KAFKA_AUTH_MODE ?? 'none'
    if (mode === 'scram' && (!process.env.KAFKA_USERNAME || !process.env.KAFKA_PASSWORD)) {
      throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
    }
    const brokers = process.env.KAFKA_BROKERS
    if (!brokers) throw new Error('KAFKA_BROKERS is required')
    const kafkaAuth = mode === 'scram'
      ? { ssl: true, sasl: { mechanism: 'scram-sha-512' as const, username: process.env.KAFKA_USERNAME!, password: process.env.KAFKA_PASSWORD! } }
      : {}
    this.producer = new Kafka({
      clientId: 'user-service',
      brokers: brokers.split(','),
      logLevel: logLevel.ERROR,
      ...kafkaAuth,
    }).producer()
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.tick()
  }

  private async tick(): Promise<void> {
    const fullBatch = await this.flush()
    if (this.running) this.timer = setTimeout(() => void this.tick(), fullBatch ? 0 : 1_000)
  }

  private async flush(): Promise<boolean> {
    if (this.flushing) return false
    this.flushing = true
    let fullBatch = false
    try {
      if (!this.connected) {
        await this.producer.connect()
        this.connected = true
      }
      const pending = await this.prisma.userOutboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
      fullBatch = pending.length === 100
      // Preserve Kafka ordering for each key while processing different keys concurrently.
      const byKey = new Map<string, Promise<void>>()
      const tasks = pending.map((event) => {
        const task = (byKey.get(event.key) ?? Promise.resolve()).then(async () => {
          await this.producer.send({
            topic: event.topic,
            acks: -1,
            messages: [{ key: event.key, value: JSON.stringify(event.payload) }],
          })
          await this.prisma.userOutboxEvent.update({
            where: { id: event.id },
            data: { publishedAt: new Date() },
          })
          console.log(`Published ${event.topic} for ${event.key}`)
        })
        byKey.set(event.key, task)
        // Wait for every in-flight send/update even when one fails.
        return task.then(() => undefined, (error: unknown) => error)
      })
      const results = await Promise.all(tasks)
      const failure = results.find((result) => result !== undefined)
      if (failure !== undefined) throw failure
    } catch (error) {
      fullBatch = false
      console.error('User event outbox delivery failed; retrying:', error)
    } finally {
      try {
        if (Date.now() - this.lastCleanup >= 60_000) {
          await this.prisma.userOutboxEvent.deleteMany({
            where: { publishedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          })
          this.lastCleanup = Date.now()
        }
      } catch (error) {
        console.error('User outbox cleanup failed; retrying:', error)
      }
      this.flushing = false
    }
    return fullBatch
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    while (this.flushing) await new Promise((resolve) => setTimeout(resolve, 50))
    if (this.connected) await this.producer.disconnect()
  }
}
