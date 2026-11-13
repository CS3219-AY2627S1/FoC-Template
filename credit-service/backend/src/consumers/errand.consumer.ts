/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of process, handleMessage, handleWithRetry, start, stop.
 * Author review: Verified correctness and sent events to ensured topic offset will not get stuck.
 */
import type { Kafka, Consumer, KafkaMessage, Producer } from 'kafkajs'
import { ErrandEventTypes, type ErrandEvent } from '@relay/contracts'
import { getEnv } from '../config/env.js'
import { CreditService } from '../services/credit.service.js'
import {
  parseErrandEvent,
  classifyErrandEventError,
  rejectedErrandEvent,
  requireRequester,
  validateReservation,
  requireCourier,
} from '../validators/errand-event.validator.js'

export class ErrandEventConsumer {
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
    this.topic = env.kafkaTopics.errandEvents
    this.dlqTopic = env.kafkaTopics.errandDlq
    this.consumer = kafka.consumer({
      groupId: 'relay-credit-events',
      allowAutoTopicCreation: false,
    })
    this.producer = kafka.producer({ allowAutoTopicCreation: false })
  }

  private async process(event: ErrandEvent): Promise<void> {
    const { errandId, requesterSub, courierSub } = event.payload
    const handled: readonly string[] = [
      ErrandEventTypes.ERRAND_CREATION_FAILED,
      ErrandEventTypes.ERRAND_COMPLETED,
      ErrandEventTypes.ERRAND_CANCELLED,
      ErrandEventTypes.ERRAND_EXPIRED,
    ]
    if (!handled.includes(event.eventType)) return
    if (event.eventType === ErrandEventTypes.ERRAND_CREATION_FAILED) {
      await this.creditService.closeUnreservedCredit(
        { service: 'errand', id: errandId, type: 'CREDIT_RELEASE' },
        requireRequester(requesterSub),
      )
      return
    }
    const reservation = validateReservation(
      await this.creditService.findReservation({ service: 'errand', id: errandId }),
      requesterSub,
    )
    if (event.eventType === ErrandEventTypes.ERRAND_COMPLETED) {
      const courierId = requireCourier(courierSub, reservation.userId)
      await this.creditService.transferCredit({
        transactionReference: { service: 'errand', id: errandId, type: 'CREDIT_TRANSFER' },
        senderId: reservation.userId,
        receiverId: courierId,
        amount: reservation.amount,
      })
    } else {
      await this.creditService.releaseCredit({
        transactionReference: { service: 'errand', id: errandId, type: 'CREDIT_RELEASE' },
        userId: reservation.userId,
        amount: reservation.amount,
      })
    }
  }

  // Kafka may commit the source offset only after processing or DLQ publication succeeds.
  async handleMessage(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    const key = message.key?.toString()
    let value: unknown = null
    let event: ErrandEvent | undefined
    try {
      const raw = message.value?.toString() ?? 'null'
      value = raw
      value = JSON.parse(raw)
      event = parseErrandEvent(value, key)
      await this.process(event)
      console.log('Processed ' + this.topic + ' for ' + (key ?? 'unknown'))
    } catch (error) {
      const rejection = classifyErrandEventError(error)
      const failed = rejectedErrandEvent(event, value, key, rejection)
      // Propagate a DLQ failure; acknowledging the source then would lose the event.
      await this.producer.send({
        topic: this.dlqTopic,
        messages: [{ key: failed.payload.errandId, value: JSON.stringify(failed) }],
      })
      console.warn(
        'Rejected ' + failed.eventType + ' for ' + failed.payload.errandId + ': ' + rejection.code,
      )
    }
  }

  private async handleWithRetry(message: Pick<KafkaMessage, 'key' | 'value'>): Promise<void> {
    while (!this.stopping) {
      try {
        await this.handleMessage(message)
        return
      } catch (error) {
        console.error('Errand event DLQ delivery failed; retrying the same source message:', error)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    throw new Error('Errand event consumer stopped before the source message was acknowledged.')
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
