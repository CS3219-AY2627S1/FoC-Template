// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the auth user-deletion (Cognito finalizer) consumer.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'
import { Kafka, logLevel, type Consumer, type KafkaMessage, type Producer } from 'kafkajs'
import { UserEventTypes, type UserEvent } from '@relay/contracts'
import { getEnv, type AuthEnv } from '../config/env.js'
import { classifyUserEventError, parseUserEvent, rejectedUserEvent } from './user-event.validator.js'

export interface CognitoUserDeleter {
  deleteUser(cognitoSub: string): Promise<void>
}

export class CognitoUserDeletionGateway implements CognitoUserDeleter {
  private readonly client: CognitoIdentityProviderClient

  constructor(private readonly env = getEnv()) {
    this.client = new CognitoIdentityProviderClient({ region: env.region, endpoint: env.endpoint })
  }

  async deleteUser(cognitoSub: string): Promise<void> {
    try {
      await this.client.send(new AdminDeleteUserCommand({ UserPoolId: this.env.poolId, Username: cognitoSub }))
    } catch (error) {
      if (error instanceof Error && error.name === 'UserNotFoundException') return
      throw error
    }
  }
}

function createKafka(env: AuthEnv): Kafka {
  if (env.kafkaAuthMode === 'scram' && (!env.kafkaUsername || !env.kafkaPassword)) {
    throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
  }
  return new Kafka({
    clientId: 'user-auth-user-deletion-consumer',
    brokers: env.kafkaBrokers,
    logLevel: logLevel.ERROR,
    ...(env.kafkaAuthMode === 'scram'
      ? { ssl: true, sasl: { mechanism: 'scram-sha-512' as const, username: env.kafkaUsername!, password: env.kafkaPassword! } }
      : {}),
  })
}

export class UserDeletionConsumer {
  private readonly consumer: Consumer
  private readonly producer: Producer
  private stopping = false

  constructor(
    private readonly deleter: CognitoUserDeleter,
    kafka = createKafka(getEnv()),
    private readonly env = getEnv(),
  ) {
    this.consumer = kafka.consumer({ groupId: 'relay-auth-user-events', allowAutoTopicCreation: false })
    this.producer = kafka.producer({ allowAutoTopicCreation: false })
  }

  private async deleteWithRetry(cognitoSub: string): Promise<void> {
    let lastError: unknown
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.deleter.deleteUser(cognitoSub)
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
      if (event.eventType === UserEventTypes.USER_DELETED) {
        await this.deleteWithRetry(event.payload.cognitoSub)
        console.log(`Finalized Cognito deletion for ${event.payload.cognitoSub}`)
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
        console.error('User auth event DLQ delivery failed; retrying:', error)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    throw new Error('User auth event consumer stopped before the source message was acknowledged.')
  }

  async start(): Promise<void> {
    this.stopping = false
    await this.producer.connect()
    await this.consumer.connect()
    // New cleanup groups intentionally start at the current tail; historical deletions are audited separately.
    await this.consumer.subscribe({ topic: this.env.kafkaUserEventsTopic, fromBeginning: false })
    await this.consumer.run({ eachMessage: async ({ message }) => this.handleWithRetry(message) })
  }

  async stop(): Promise<void> {
    this.stopping = true
    await this.consumer.disconnect()
    await this.producer.disconnect()
  }
}
