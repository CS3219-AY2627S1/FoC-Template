// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the profile-image cleanup consumer.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { Kafka, logLevel, type Consumer, type KafkaMessage, type Producer } from 'kafkajs'
import { UserEventTypes, type UserEvent } from '@relay/contracts'
import { getEnv, type UserServiceEnv } from '../config/env.js'
import type { ImageStorage } from '../storage/image-storage.js'
import { classifyUserEventError, parseUserEvent, rejectedUserEvent } from './user-event.validator.js'

function createKafka(env: UserServiceEnv): Kafka {
  if (env.kafkaAuthMode === 'scram' && (!env.kafkaUsername || !env.kafkaPassword)) {
    throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
  }
  return new Kafka({
    clientId: 'user-profile-image-consumer',
    brokers: env.kafkaBrokers,
    logLevel: logLevel.ERROR,
    ...(env.kafkaAuthMode === 'scram'
      ? { ssl: true, sasl: { mechanism: 'scram-sha-512' as const, username: env.kafkaUsername!, password: env.kafkaPassword! } }
      : {}),
  })
}

export class UserProfileImageDeletionConsumer {
  private readonly consumer: Consumer
  private readonly producer: Producer
  private stopping = false

  constructor(
    private readonly storage: ImageStorage,
    kafka = createKafka(getEnv()),
    private readonly env = getEnv(),
  ) {
    this.consumer = kafka.consumer({ groupId: 'relay-user-profile-cleanup', allowAutoTopicCreation: false })
    this.producer = kafka.producer({ allowAutoTopicCreation: false })
  }

  private async deleteWithRetry(key: string): Promise<void> {
    let lastError: unknown
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.storage.delete(key)
        return
      } catch (error) {
        lastError = error
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)))
      }
    }
    throw lastError
  }

  async handleMessage(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    const key = message.key?.toString()
    const raw = message.value?.toString() ?? 'null'
    let event: UserEvent | undefined
    try {
      event = parseUserEvent(raw, key)
      if (event.eventType === UserEventTypes.USER_DELETED && event.payload.profilePictureKey) {
        await this.deleteWithRetry(event.payload.profilePictureKey)
        console.log(`Deleted profile image for ${event.payload.cognitoSub}`)
      }
    } catch (error) {
      const rejection = classifyUserEventError(error)
      const failed = rejectedUserEvent(event, raw, key, rejection)
      await this.producer.send({ topic: this.env.kafkaUserDlqTopic, messages: [{ key: failed.payload.cognitoSub, value: JSON.stringify(failed) }] })
      console.warn(`Rejected ${failed.eventType} for ${failed.payload.cognitoSub}: ${rejection.code}`)
    }
  }

  private async handleWithRetry(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    while (!this.stopping) {
      try { await this.handleMessage(message); return } catch (error) {
        console.error('User profile cleanup DLQ delivery failed; retrying:', error)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    throw new Error('User profile cleanup consumer stopped before the source message was acknowledged.')
  }

  async start(): Promise<void> {
    this.stopping = false
    await this.producer.connect()
    await this.consumer.connect()
    // This group is intentionally tail-only; historical deletions are handled by a separate audit/backfill.
    await this.consumer.subscribe({ topic: this.env.kafkaUserEventsTopic, fromBeginning: false })
    await this.consumer.run({ eachMessage: async ({ message }) => this.handleWithRetry(message) })
  }

  async stop(): Promise<void> {
    this.stopping = true
    await this.consumer.disconnect()
    await this.producer.disconnect()
  }
}
