// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the auth deletion-consumer tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import assert from 'node:assert/strict'
import test from 'node:test'
import { UserDeletionConsumer } from '../dist/consumers/user-deletion.consumer.js'

class FakeConsumer {
  async connect() {}
  async disconnect() {}
  async subscribe() {}
  async run() {}
}

class FakeProducer {
  messages = []
  async connect() {}
  async disconnect() {}
  async send(record) { this.messages.push(record) }
}

class FakeKafka {
  producerInstance = new FakeProducer()
  consumer() { return new FakeConsumer() }
  producer() { return this.producerInstance }
}

const event = (eventType = 'UserDeleted') => ({
  eventId: 'f6f9e9e0-4d6f-4c4d-8aa7-1b3c4a83cf73',
  eventType,
  timestamp: new Date().toISOString(),
  version: 1,
  payload: { cognitoSub: 'cognito-sub-1' },
})

test('finalizes a UserDeleted event and ignores UserRegistered', async () => {
  const deleted = []
  const consumer = new UserDeletionConsumer({ deleteUser: async (sub) => deleted.push(sub) }, new FakeKafka())

  await consumer.handleMessage({ key: 'cognito-sub-1', value: JSON.stringify(event()) })
  await consumer.handleMessage({ key: 'cognito-sub-1', value: JSON.stringify(event('UserRegistered')) })

  assert.deepEqual(deleted, ['cognito-sub-1'])
})

test('treats a missing Cognito user as an idempotent success through the gateway contract', async () => {
  const consumer = new UserDeletionConsumer({ deleteUser: async () => {} }, new FakeKafka())
  await assert.doesNotReject(() => consumer.handleMessage({ key: 'cognito-sub-1', value: JSON.stringify(event()) }))
})
