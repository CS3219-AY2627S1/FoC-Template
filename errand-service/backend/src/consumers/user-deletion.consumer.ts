// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the errand user-deletion Kafka consumer.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { randomUUID } from 'node:crypto'
import { Kafka, logLevel, type Consumer, type KafkaMessage, type Producer } from 'kafkajs'
import {
  UserEventTypes,
  type UserEvent,
  type UserEventDlqErrorCode,
  type UserEventDlqMessage,
} from '@relay/contracts'
import { getEnv, type ErrandEnv } from '../config/env.js'
import { ErrandRepository } from '../repositories/errand.repository.js'
import { z } from 'zod'

const schema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum([UserEventTypes.USER_REGISTERED, UserEventTypes.USER_DELETED]),
  timestamp: z.iso.datetime(),
  version: z.literal(1),
  payload: z.object({
    cognitoSub: z.string().trim().min(1).refine((value) => !value.includes(':')),
    profilePictureKey: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
})

class UserEventRejection extends Error {
  constructor(readonly code: UserEventDlqErrorCode, message: string) {
    super(message)
  }
}

function parseUserEvent(raw: string, key: string | undefined): UserEvent {
  const event = schema.parse(JSON.parse(raw)) as UserEvent
  if (key !== event.payload.cognitoSub) {
    throw new UserEventRejection('USER_EVENT_INVALID', 'The Kafka key does not match the user subject.')
  }
  return event
}

function classify(error: unknown): UserEventRejection {
  if (error instanceof UserEventRejection) return error
  if (error instanceof SyntaxError || error instanceof z.ZodError) {
    return new UserEventRejection('USER_EVENT_INVALID', 'The message is not a valid user event.')
  }
  return new UserEventRejection('ERRAND_USER_DELETION_FAILED', 'Requester errands could not be transitioned.')
}

function rejected(
  event: UserEvent | undefined,
  raw: string,
  key: string | undefined,
  error: UserEventRejection,
): UserEventDlqMessage {
  if (event) return { ...event, error: { code: error.code, message: error.message } }
  return {
    eventId: randomUUID(),
    eventType: 'UserEventInvalid',
    timestamp: new Date().toISOString(),
    version: 1,
    payload: { cognitoSub: key || 'unknown', metadata: { rawEvent: raw } },
    error: { code: error.code, message: error.message },
  }
}

function createKafka(env: ErrandEnv): Kafka {
  if (env.kafkaAuthMode === 'scram' && (!env.kafkaUsername || !env.kafkaPassword)) {
    throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
  }
  return new Kafka({
    clientId: 'errand-user-deletion-consumer',
    brokers: env.kafkaBrokers,
    logLevel: logLevel.ERROR,
    ...(env.kafkaAuthMode === 'scram'
      ? {
          ssl: true,
          sasl: {
            mechanism: 'scram-sha-512' as const,
            username: env.kafkaUsername!,
            password: env.kafkaPassword!,
          },
        }
      : {}),
  })
}

export class UserDeletionConsumer {
  private readonly consumer: Consumer
  private readonly producer: Producer
  private stopping = false

  constructor(
    private readonly repository: ErrandRepository,
    kafka = createKafka(getEnv()),
    private readonly env = getEnv(),
  ) {
    this.consumer = kafka.consumer({
      groupId: 'relay-errand-user-events',
      allowAutoTopicCreation: false,
    })
    this.producer = kafka.producer({ allowAutoTopicCreation: false })
  }

  async handleMessage(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    const key = message.key?.toString()
    const raw = message.value?.toString() ?? 'null'
    let event: UserEvent | undefined
    try {
      event = parseUserEvent(raw, key)
      if (event.eventType === UserEventTypes.USER_DELETED) {
        const requesterChanged = await this.repository.handleRequesterDeleted(event.payload.cognitoSub)
        const courierChanged = await this.repository.handleCourierDeleted(event.payload.cognitoSub)
        console.log(
          `Applied user deletion for ${event.payload.cognitoSub}; changed ${requesterChanged} requester and ${courierChanged} courier errands`,
        )
      }
    } catch (error) {
      const rejection = classify(error)
      const failed = rejected(event, raw, key, rejection)
      await this.producer.send({
        topic: this.env.kafkaUserDlqTopic,
        messages: [{ key: failed.payload.cognitoSub, value: JSON.stringify(failed) }],
      })
      console.warn(`Rejected ${failed.eventType} for ${failed.payload.cognitoSub}: ${rejection.code}`)
    }
  }

  private async handleWithRetry(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    while (!this.stopping) {
      try {
        await this.handleMessage(message)
        return
      } catch (error) {
        console.error('Errand user-event DLQ delivery failed; retrying:', error)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    throw new Error('Errand user-event consumer stopped before the source message was acknowledged.')
  }

  async start(): Promise<void> {
    this.stopping = false
    await this.producer.connect()
    await this.consumer.connect()
    // This new group intentionally starts at the current tail; historical user deletions require audit/backfill.
    await this.consumer.subscribe({ topic: this.env.kafkaUserEventsTopic, fromBeginning: false })
    await this.consumer.run({ eachMessage: async ({ message }) => this.handleWithRetry(message) })
  }

  async stop(): Promise<void> {
    this.stopping = true
    await this.consumer.disconnect()
    await this.producer.disconnect()
  }
}
