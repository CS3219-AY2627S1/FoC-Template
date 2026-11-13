/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of server startup and consumer initialization.
 * Author review: Verified kafka consumer behavior and correctness, and tested server startup with docker
 */
import type { Server } from 'node:http'
import { Kafka, logLevel } from 'kafkajs'
import { app, closeAppResources } from './app.js'
import { getEnv } from './config/env.js'
import { ErrandEventConsumer } from './consumers/errand.consumer.js'
import { UserEventConsumer } from './consumers/user.consumer.js'
import { CreditService } from './services/credit.service.js'
import { CreditRepository } from './repositories/credit.repository.js'

const env = getEnv()
const creditService = new CreditService(new CreditRepository())

const mode = process.env.KAFKA_AUTH_MODE ?? 'none'
if (mode === 'scram' && (!process.env.KAFKA_USERNAME || !process.env.KAFKA_PASSWORD)) {
  throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
}
const kafkaAuth = mode === 'scram'
  ? { ssl: true, sasl: { mechanism: 'scram-sha-512' as const, username: process.env.KAFKA_USERNAME!, password: process.env.KAFKA_PASSWORD! } }
  : {}

const kafka = new Kafka({
  clientId: 'credit-service', 
  brokers: env.kafkaBrokers, 
  logLevel: logLevel.ERROR, 
  ...kafkaAuth,
})

const errandConsumer = new ErrandEventConsumer(creditService, kafka)
const userConsumer = new UserEventConsumer(creditService, kafka)
let server: Server | undefined
let stopping = false

type EventConsumer = { start(): Promise<void>; stop(): Promise<void> }

async function startConsumer(name: string, consumer: EventConsumer): Promise<void> {
  while (!stopping) {
    try {
      await consumer.start()
      return
    } catch (error) {
      console.error(`${name} event consumer failed to start; retrying:`, error)
      await consumer.stop().catch(() => undefined)
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

void startConsumer('Errand', errandConsumer)
void startConsumer('User', userConsumer)

async function shutdown(signal: string): Promise<void> {
  stopping = true
  console.log(`${signal} received; shutting down Credit Service.`)

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })

  await Promise.all([errandConsumer.stop(), userConsumer.stop()])
  await closeAppResources()
  process.exit(0)
}

server = app.listen(env.port, () => {
  console.log(`Credit Service listening on port ${env.port}`)
})

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
