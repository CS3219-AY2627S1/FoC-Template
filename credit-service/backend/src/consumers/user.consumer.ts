/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of process, handleMessage, handleWithRetry, start, stop.
 * Author review: Verified correctness and sent events to ensured topic offset will not get stuck.
 */
import type { Kafka, Consumer, KafkaMessage, Producer } from 'kafkajs'
import {
  UserEventTypes,
  type UserEvent,
  type AllocateInitialCreditCommand,
  type DeleteUserCreditCommand,
} from '@relay/contracts'
import { getEnv } from '../config/env.js'
import { CreditService } from '../services/credit.service.js'
import {
  parseUserEvent,
  classifyUserEventError,
  rejectedUserEvent,
  validateUserCreditOutcome,
} from '../validators/user-event.validator.js'

export class UserEventConsumer {
  private readonly consumer: Consumer
  private readonly producer: Producer
  private readonly topic: string
  private readonly dlqTopic: string
  private stopping = false

  constructor(
    private readonly creditService: CreditService,
    kafka: Kafka,
  ) {
    const env = getEnv()
    this.topic = env.kafkaTopics.userEvents
    this.dlqTopic = env.kafkaTopics.userDlq
    this.consumer = kafka.consumer({
      groupId: 'relay-credit-user-events',
      allowAutoTopicCreation: false,
    })
    this.producer = kafka.producer({ allowAutoTopicCreation: false })
  }

  private async process(event: UserEvent): Promise<void> {
    const userId = event.payload.cognitoSub
    if (event.eventType === UserEventTypes.USER_REGISTERED) {
      const command: AllocateInitialCreditCommand = {
        transactionReference: { service: 'user', id: userId, type: 'INITIAL_ALLOCATION' },
        userId,
      }
      const outcome = await this.creditService.allocateInitialCredit(command)
      validateUserCreditOutcome(outcome, event.eventType)
    } else if (event.eventType === UserEventTypes.USER_DELETED) {
      const command: DeleteUserCreditCommand = {
        transactionReference: { service: 'user', id: userId, type: 'USER_DELETION' },
        userId,
      }
      const outcome = await this.creditService.deleteUserCredit(command)
      validateUserCreditOutcome(outcome, event.eventType)
    }
  }

  // Returning acknowledges the source message. A failed DLQ write is thrown so
  // Kafka retries instead of silently losing the rejected event.
  async handleMessage(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    const key = message.key?.toString()
    const raw = message.value?.toString() ?? 'null'
    let event: UserEvent | undefined
    try {
      event = parseUserEvent(raw, key)
      await this.process(event)
      console.log(`Processed ${this.topic} for ${event.payload.cognitoSub}`)
    } catch (error) {
      const rejection = classifyUserEventError(error)
      const failed = rejectedUserEvent(event, raw, key, rejection)
      await this.producer.send({
        topic: this.dlqTopic,
        messages: [{ key: failed.payload.cognitoSub, value: JSON.stringify(failed) }],
      })
      console.warn(
        `Rejected ${failed.eventType} for ${failed.payload.cognitoSub}: ${rejection.code}`,
      )
    }
  }

  private async handleWithRetry(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    while (!this.stopping) {
      try {
        await this.handleMessage(message)
        return
      } catch (error) {
        console.error('User event DLQ delivery failed; retrying the same source message:', error)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    throw new Error('User event consumer stopped before the source message was acknowledged.')
  }

  async start(): Promise<void> {
    this.stopping = false
    await this.producer.connect()
    await this.consumer.connect()
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true })
    await this.consumer.run({ eachMessage: async ({ message }) => this.handleWithRetry(message) })
  }

  async stop(): Promise<void> {
    this.stopping = true
    await this.consumer.disconnect()
    await this.producer.disconnect()
  }
}
