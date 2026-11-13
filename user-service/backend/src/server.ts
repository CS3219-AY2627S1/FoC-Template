// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-21
// Scope: Generated initial implementation of the User Service server.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import type { Server } from 'node:http'
import { app, closeAppResources } from './app.js'
import { getEnv } from './config/env.js'
import { LocalImageStorage } from './storage/local-image-storage.js'
import { UserProfileImageDeletionConsumer } from './consumers/user-profile-image.consumer.js'

const env = getEnv()
let server: Server | undefined
const profileImageConsumer = new UserProfileImageDeletionConsumer(new LocalImageStorage())
let consumerStopping = false

async function startProfileImageConsumer(): Promise<void> {
  while (!consumerStopping) {
    try {
      await profileImageConsumer.start()
      return
    } catch (error) {
      console.error('User profile cleanup consumer unavailable; retrying:', error)
      await profileImageConsumer.stop()
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received; shutting down User Service.`)
  consumerStopping = true
  await profileImageConsumer.stop()

  await new Promise<void>((resolve) => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })

  await closeAppResources()
  process.exit(0)
}

server = app.listen(env.port, () => {
  console.log(`User Service listening on port ${env.port}`)
})
void startProfileImageConsumer()

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
