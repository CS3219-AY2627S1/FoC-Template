// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-11-02
// Scope: Scaffolded notification service startup and lifecycle handling.
// Author review: Reviewed outputs, corrected phrasing and syntax, and adjusted implementation
// details to fit project requirements.

import { createServer } from 'http'
import { Kafka } from 'kafkajs'
import { createNotificationApp } from './app.js'
import { getEnv } from './config/env.js'
import { ErrandNotificationEventStream } from './services/notificationEventStream.js'

const env = getEnv()
const eventStream = new ErrandNotificationEventStream()
const mode = process.env.KAFKA_AUTH_MODE ?? 'none'
if (mode === 'scram' && (!process.env.KAFKA_USERNAME || !process.env.KAFKA_PASSWORD)) {
  throw new Error('KAFKA_USERNAME and KAFKA_PASSWORD are required for SCRAM')
}
const kafka = new Kafka({
  clientId: 'errand-notification',
  brokers: env.kafkaBrokers.split(','),
  ...(mode === 'scram'
    ? {
        ssl: true,
        sasl: {
          mechanism: 'scram-sha-512' as const,
          username: process.env.KAFKA_USERNAME!,
          password: process.env.KAFKA_PASSWORD!,
        },
      }
    : {}),
})

const { app, consumer, startConsumer } = createNotificationApp(eventStream, kafka)

const server = createServer(app)

server.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`)
})

let shuttingDown = false

// Graceful shutdown
const shutdown = async (signal: string) => {
  if (shuttingDown) {
    console.log('Shutdown already in progress...')
    return
  }
  shuttingDown = true

  console.log(`${signal} received, shutting down gracefully...`)
  console.log(`Active subscribers: ${eventStream.getSubscriberCount()}`)

  // Stop accepting new requests, then finish open SSE responses so EventSource
  // can reconnect to a ready pod instead of waiting for the force-exit timer.
  const forceExit = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, 30_000)
  forceExit.unref()

  server.close(async (error) => {
    if (error) console.error('HTTP server close failed:', error)
    else console.log('HTTP server closed')
    try {
      await consumer.stop()
      console.log('Kafka consumer stopped')
      clearTimeout(forceExit)
      process.exit(error ? 1 : 0)
    } catch (stopError) {
      console.error('Kafka consumer shutdown failed:', stopError)
      process.exit(1)
    }
  })
  eventStream.closeAll()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start the Kafka consumer
startConsumer().catch((err) => {
  console.error('Failed to start consumer:', err)
  process.exit(1)
})
