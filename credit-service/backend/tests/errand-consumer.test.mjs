/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated event, harness and consumer test cases.
 * Author review: Verified edge cases are handled
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { ErrandEventConsumer } from '../dist/consumers/errand.consumer.js'

function event(type, payload) {
  return {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    version: 1,
    eventType: type,
    payload: { errandId: randomUUID(), ...payload },
  }
}

function harness(overrides = {}) {
  const sent = []
  const calls = []
  const service = {
    findReservation: async () => ({ userId: 'requester', amount: 10 }),
    releaseCredit: async () => {
      calls.push('release')
    },
    transferCredit: async () => {
      calls.push('transfer')
    },
    closeUnreservedCredit: async () => {
      calls.push('close')
    },
    ...overrides,
  }
  const kafka = {
    consumer: () => ({ connect: async () => {}, disconnect: async () => {} }),
    producer: () => ({
      send: async (record) => {
        sent.push(JSON.parse(record.messages[0].value))
      },
      connect: async () => {},
      disconnect: async () => {},
    }),
  }
  const consumer = new ErrandEventConsumer(service, kafka)
  const handle = async (
    value,
    key = typeof value === 'object' ? value.payload.errandId : 'source-key',
  ) =>
    consumer.handleMessage({
      key: Buffer.from(key),
      value: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
    })
  return { sent, calls, consumer, handle }
}

test('bad events and invariant failures reach the DLQ once without retrying', async () => {
  const cases = [
    ['{bad json', 'ERRAND_EVENT_INVALID'],
    [
      event('ErrandCompleted', { requesterSub: 'wrong', courierSub: 'courier' }),
      'ERRAND_REQUESTER_MISMATCH',
    ],
    [event('ErrandCompleted', { requesterSub: 'requester' }), 'ERRAND_COURIER_MISSING'],
    [
      event('ErrandCompleted', { requesterSub: 'requester', courierSub: 'requester' }),
      'ERRAND_COURIER_MISMATCH',
    ],
  ]
  for (const [input, expectedCode] of cases) {
    const { handle, sent, calls } = harness()
    await handle(input)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].error.code, expectedCode)
    assert.equal(calls.length, 0)
  }
})

test('mismatched errand keys reach the DLQ before credit writes', async () => {
  const invalid = harness()
  await invalid.handle(event('ErrandExpired', {}), 'wrong-key')
  assert.equal(invalid.sent[0].error.code, 'ERRAND_EVENT_INVALID')
  assert.equal(invalid.calls.length, 0)
})

test('missing reservation and credit write errors reach the DLQ', async () => {
  const missing = harness({ findReservation: async () => null })
  await missing.handle(event('ErrandExpired', {}))
  assert.equal(missing.sent[0].error.code, 'ERRAND_RESERVATION_NOT_FOUND')

  const earlyFailure = harness({ findReservation: async () => null })
  await earlyFailure.handle(event('ErrandCreationFailed', { requesterSub: 'requester' }))
  assert.deepEqual(earlyFailure.calls, ['close'])
  assert.equal(earlyFailure.sent.length, 0)

  const missingRequester = harness()
  await missingRequester.handle(event('ErrandCreationFailed', {}))
  assert.equal(missingRequester.sent[0].error.code, 'ERRAND_EVENT_INVALID')
  assert.equal(missingRequester.calls.length, 0)

  const closed = harness({
    transferCredit: async () => {
      throw new Error('Cannot transfer credit after release.')
    },
  })
  await closed.handle(
    event('ErrandCompleted', { requesterSub: 'requester', courierSub: 'courier' }),
  )
  assert.equal(closed.sent[0].error.code, 'ERRAND_CREDIT_OUTCOME_CONFLICT')
  assert.equal(closed.calls.length, 0)

  const conflict = harness({
    releaseCredit: async () => {
      throw new Error('Cannot release credit for a confirmed errand.')
    },
  })
  await conflict.handle(event('ErrandCancelled', {}))
  assert.equal(conflict.sent[0].error.code, 'ERRAND_CREDIT_OUTCOME_CONFLICT')

  const database = harness({
    closeUnreservedCredit: async () => {
      throw new Error('database unavailable')
    },
  })
  await database.handle(event('ErrandCreationFailed', { requesterSub: 'requester' }))
  assert.equal(database.sent[0].error.code, 'ERRAND_CREDIT_OPERATION_FAILED')
})

test('successful processing skips the DLQ; DLQ failures keep the source message retryable', async () => {
  const success = harness()
  await success.handle(event('ErrandExpired', {}))
  assert.deepEqual(success.calls, ['release'])
  assert.equal(success.sent.length, 0)

  const zero = harness({ findReservation: async () => ({ userId: 'requester', amount: 0 }) })
  await zero.handle(event('ErrandCompleted', { requesterSub: 'requester', courierSub: 'courier' }))
  assert.deepEqual(zero.calls, ['transfer'])
  assert.equal(zero.sent.length, 0)

  const failedDlq = harness({ findReservation: async () => null })
  failedDlq.consumer.producer.send = async () => {
    throw new Error('DLQ unavailable')
  }
  await assert.rejects(failedDlq.handle(event('ErrandExpired', {})), /DLQ unavailable/)
})
test('a temporary errand DLQ failure is retried before acknowledgement', async () => {
  const { consumer, sent } = harness()
  let attempts = 0
  const send = consumer.producer.send
  consumer.producer.send = async (record) => {
    attempts++
    if (attempts === 1) throw new Error('DLQ temporarily unavailable')
    await send(record)
  }
  await consumer.handleWithRetry({ key: Buffer.from('bad-key'), value: Buffer.from('{bad json') })
  assert.equal(attempts, 2)
  assert.equal(sent.length, 1)
})
