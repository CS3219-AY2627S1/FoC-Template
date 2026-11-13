/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-28
 * Scope: Generated implementation for auth service startup
 * Author review: Verified correctness
 */

import { app } from './app.js'
import { getEnv } from './config/env.js'
import { CognitoUserDeletionGateway, UserDeletionConsumer } from './consumers/user-deletion.consumer.js'
const { port } = getEnv()
const server = app.listen(port, () => console.log(`User Auth Service listening on port ${port}`))
const deletionConsumer = new UserDeletionConsumer(new CognitoUserDeletionGateway())
let stopping = false
const startConsumer = async () => {
  while (!stopping) {
    try { await deletionConsumer.start(); return } catch (error) {
      console.error('User auth deletion consumer unavailable; retrying:', error)
      await deletionConsumer.stop()
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }
}
void startConsumer()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopping = true
    void deletionConsumer.stop().finally(() => server.close(() => process.exit(0)))
  })
}
