// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-14
// Scope: Generated initial implementation, debugged implementation
// Author review: I validated correctness and edited for style.

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { UserEventConsumer } from '../dist/consumers/user.consumer.js'
import { parseUserEvent } from '../dist/validators/user-event.validator.js'

process.env.KAFKA_TOPIC_USER_EVENTS ??= 'user-events'
process.env.KAFKA_TOPIC_USER_DLQ ??= 'user-events-dlq'

function event(eventType = 'UserRegistered', subject = randomUUID()) {
  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    version: 1,
    eventType,
    payload: { cognitoSub: subject },
  }
}

function harness(outcomes = {}) {
  const sent = []
  const calls = []
  const service = {
    allocateInitialCredit: async () => {
      calls.push('allocate')
      return outcomes.registered ?? 'processed'
    },
    deleteUserCredit: async () => {
      calls.push('delete')
      return outcomes.deleted ?? 'processed'
    },
  }
  const producer = {
    send: async (record) => {
      sent.push(record)
    },
    connect: async () => {},
    disconnect: async () => {},
  }
  const kafka = {
    consumer: () => ({ connect: async () => {}, disconnect: async () => {} }),
    producer: () => producer,
  }
  const consumer = new UserEventConsumer(service, kafka)
  const handle = (value, key) =>
    consumer.handleMessage({
      key: key === null ? null : Buffer.from(key ?? value?.payload?.cognitoSub ?? 'source-key'),
      value:
        value === null
          ? null
          : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
    })
  return { consumer, handle, sent, calls, producer, service }
}

test('malformed, invalid and mismatched user events go to the DLQ', async () => {
  const cases = [
    ['{bad json', 'USER_EVENT_INVALID'],
    [null, 'USER_EVENT_INVALID'],
    [event('UnknownEvent'), 'USER_EVENT_INVALID'],
    [{ ...event(), version: 2 }, 'USER_EVENT_INVALID'],
    [event('UserRegistered', 'bad:subject'), 'USER_EVENT_INVALID'],
  ]
  for (const [input, code] of cases) {
    const { handle, sent, calls } = harness()
    await handle(input)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].topic, 'user-events-dlq')
    assert.equal(JSON.parse(sent[0].messages[0].value).error.code, code)
    assert.equal(calls.length, 0)
  }
  const missingKey = harness()
  await missingKey.handle(event(), null)
  assert.equal(JSON.parse(missingKey.sent[0].messages[0].value).error.code, 'USER_EVENT_INVALID')
  const mismatch = harness()
  await mismatch.handle(event(), 'different-subject')
  assert.equal(JSON.parse(mismatch.sent[0].messages[0].value).error.code, 'USER_EVENT_INVALID')
  assert.equal(mismatch.calls.length, 0)
})

test('preserves additive user-deletion cleanup fields', () => {
  const payload = {
    ...event('UserDeleted'),
    payload: {
      cognitoSub: randomUUID(),
      profilePictureKey: 'profiles/user/avatar.png',
      metadata: { reason: 'self_service_deletion' },
    },
  }

  const parsed = parseUserEvent(JSON.stringify(payload), payload.payload.cognitoSub)
  assert.deepEqual(parsed.payload, payload.payload)
})

test('duplicate and out-of-order user events go to the DLQ', async () => {
  for (const [input, outcome, expected] of [
    [event(), { registered: 'duplicate' }, 'USER_EVENT_DUPLICATE'],
    [event('UserDeleted'), { deleted: 'duplicate' }, 'USER_EVENT_DUPLICATE'],
    [event(), { registered: 'out-of-order' }, 'USER_EVENT_OUT_OF_ORDER'],
  ]) {
    const { handle, sent } = harness(outcome)
    await handle(input)
    assert.equal(JSON.parse(sent[0].messages[0].value).error.code, expected)
  }
})

test('credit failures go to the DLQ and do not block the next message', async () => {
  const { handle, sent, calls, service } = harness()
  service.allocateInitialCredit = async () => {
    throw new Error('database unavailable')
  }
  await handle(event())
  assert.equal(JSON.parse(sent[0].messages[0].value).error.code, 'USER_CREDIT_OPERATION_FAILED')
  service.allocateInitialCredit = async () => {
    calls.push('allocate')
    return 'processed'
  }
  await handle(event())
  assert.deepEqual(calls, ['allocate'])
  assert.equal(sent.length, 1)
})

test('a failed DLQ send keeps the source event retryable', async () => {
  const { handle, producer } = harness()
  producer.send = async () => {
    throw new Error('DLQ unavailable')
  }
  await assert.rejects(handle('{bad json'), /DLQ unavailable/)
})

test('a temporary DLQ failure is retried before the message is acknowledged', async () => {
  const { consumer, producer, sent } = harness()
  let attempts = 0
  const send = producer.send
  producer.send = async (record) => {
    attempts++
    if (attempts === 1) throw new Error('DLQ temporarily unavailable')
    await send(record)
  }
  await consumer.handleWithRetry({ key: Buffer.from('bad-key'), value: Buffer.from('{bad json') })
  assert.equal(attempts, 2)
  assert.equal(sent.length, 1)
})
