// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the profile-image consumer tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { describe, expect, it } from 'vitest'
import { UserProfileImageDeletionConsumer } from '../src/consumers/user-profile-image.consumer.js'
import type { ImageStorage } from '../src/storage/image-storage.js'

class FakeConsumer {
  async connect() {}
  async disconnect() {}
  async subscribe() {}
  async run() {}
}

class FakeProducer {
  messages: unknown[] = []
  async connect() {}
  async disconnect() {}
  async send(record: unknown) { this.messages.push(record) }
}

class FakeKafka {
  producerInstance = new FakeProducer()
  consumer() { return new FakeConsumer() }
  producer() { return this.producerInstance }
}

const env = {
  kafkaBrokers: ['kafka:9092'],
  kafkaAuthMode: 'none',
  kafkaUserEventsTopic: 'user-events',
  kafkaUserDlqTopic: 'user-events-dlq',
} as never

const message = (profilePictureKey?: string) => ({
  key: Buffer.from('cognito-sub-1'),
  value: Buffer.from(JSON.stringify({
    eventId: 'f6f9e9e0-4d6f-4c4d-8aa7-1b3c4a83cf73',
    eventType: 'UserDeleted',
    timestamp: new Date().toISOString(),
    version: 1,
    payload: { cognitoSub: 'cognito-sub-1', ...(profilePictureKey ? { profilePictureKey } : {}) },
  })),
})

describe('UserProfileImageDeletionConsumer', () => {
  it('deletes the profile image from a UserDeleted event', async () => {
    const deleted: string[] = []
    const storage = { delete: async (key: string) => deleted.push(key) } as ImageStorage
    const consumer = new UserProfileImageDeletionConsumer(storage, new FakeKafka() as never, env)

    await consumer.handleMessage(message('profiles/cognito-sub-1/image.png'))

    expect(deleted).toEqual(['profiles/cognito-sub-1/image.png'])
  })

  it('accepts older UserDeleted events without a profile image key', async () => {
    const storage = { delete: async () => { throw new Error('must not be called') } } as ImageStorage
    const consumer = new UserProfileImageDeletionConsumer(storage, new FakeKafka() as never, env)

    await expect(consumer.handleMessage(message())).resolves.toBeUndefined()
  })
})
