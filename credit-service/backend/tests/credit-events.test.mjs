/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated credit HTTP and Kafka workflow integration test cases.
 * Author review: Verified correctness and edge cases are covered.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createCognitoFixture } from '../../../packages/user-auth-backend-middleware/tests/cognito-token-fixture.mjs'
import { Kafka } from 'kafkajs'
import { createApp, closeAppResources } from '../dist/app.js'
import { prisma } from '../dist/repositories/credit.repository.js'
import { CreditRepository } from '../dist/repositories/credit.repository.js'
import { CreditService } from '../dist/services/credit.service.js'
import { ErrandEventConsumer } from '../dist/consumers/errand.consumer.js'
import { UserEventConsumer } from '../dist/consumers/user.consumer.js'

async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Timed out waiting for a credit event.')
}

test('new users view, reserve, and transfer credit through HTTP and Kafka', async () => {
  const topics = {
    userEvents: process.env.KAFKA_TOPIC_USER_EVENTS,
    userDlq: process.env.KAFKA_TOPIC_USER_DLQ,
    errandEvents: process.env.KAFKA_TOPIC_ERRAND_EVENTS,
    errandDlq: process.env.KAFKA_TOPIC_ERRAND_DLQ,
  }
  assert.ok(Object.values(topics).every(Boolean))
  const requester = randomUUID()
  const courier = randomUUID()
  const confirmId = randomUUID()
  const zeroConfirmId = randomUUID()
  const zeroCancelId = randomUUID()
  const cancelId = randomUUID()
  const expireId = randomUUID()
  const requesterMismatchId = randomUUID()
  const courierMissingId = randomUUID()
  const unreservedId = randomUUID()
  const failedReservedId = randomUUID()
  const failedUnreservedId = randomUUID()
  const ids = [requester, courier]
  const fixture = await createCognitoFixture('credit-events-test')
  const cookies = { requester: fixture.cookie(requester), courier: fixture.cookie(courier) }
  const api = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => api.once('listening', resolve))
  const url = `http://127.0.0.1:${api.address().port}`
  const kafka = new Kafka({
    clientId: 'relay-credit-workflow-test',
    brokers: (process.env.KAFKA_BROKERS ?? 'kafka:9092').split(','),
  })
  const creditService = new CreditService(new CreditRepository())
  const errandConsumer = new ErrandEventConsumer(creditService, kafka)
  const userConsumer = new UserEventConsumer(creditService, kafka)
  const request = async (cookie, path = '/api/credit', body) => {
    const response = await fetch(url + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Cookie: cookies[cookie] ?? `relay_access=${cookie}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(path === '/internal/credit/reserve'
          ? { 'x-credit-service-token': process.env.CREDIT_SERVICE_INTERNAL_TOKEN }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, body: await response.json() }
  }
  const producer = kafka.producer()
  const dlqConsumer = kafka.consumer({ groupId: `relay-credit-dlq-test-${randomUUID()}` })
  const dlqEvents = []
  const send = (topic, key, eventType, payload) =>
    producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify({
            eventId: randomUUID(),
            eventType,
            timestamp: new Date().toISOString(),
            version: 1,
            payload,
          }),
        },
      ],
    })
  const reserve = (id, amount) =>
    request('requester', '/internal/credit/reserve', {
      transactionReference: { service: 'errand', id, type: 'CREDIT_RESERVE' },
      userId: requester,
      amount,
    })
  try {
    await producer.connect()
    await Promise.all([errandConsumer.start(), userConsumer.start()])
    await dlqConsumer.connect()
    await dlqConsumer.subscribe({ topic: topics.errandDlq, fromBeginning: false })
    await dlqConsumer.run({
      eachMessage: async ({ message }) => {
        dlqEvents.push(JSON.parse(message.value.toString()))
      },
    })
    for (const userId of ids)
      await send(topics.userEvents, userId, 'UserRegistered', { cognitoSub: userId })
    await until(async () => (await request('requester')).status === 200)
    await until(async () => (await request('courier')).status === 200)
    assert.equal((await request('requester')).body.availableCredit, 100)
    assert.equal((await request('courier')).body.availableCredit, 100)

    assert.equal((await reserve(zeroConfirmId, 0)).status, 200)
    assert.equal((await reserve(zeroCancelId, 0)).status, 200)
    await send(topics.errandEvents, zeroConfirmId, 'ErrandCompleted', {
      errandId: zeroConfirmId,
      requesterSub: requester,
      courierSub: courier,
    })
    await send(topics.errandEvents, zeroCancelId, 'ErrandCancelled', {
      errandId: zeroCancelId,
      requesterSub: requester,
    })
    await until(
      async () =>
        (await prisma.transactionRecord.count({
          where: {
            reference: {
              in: [
                `errand:${zeroConfirmId}:CREDIT_TRANSFER`,
                `errand:${zeroCancelId}:CREDIT_RELEASE`,
              ],
            },
          },
        })) === 2,
    )
    assert.equal((await request('requester')).body.availableCredit, 100)
    assert.equal((await request('requester')).body.reserveCredit, 0)
    assert.equal((await request('courier')).body.availableCredit, 100)

    for (const [id, amount] of [
      [confirmId, 10],
      [cancelId, 5],
      [expireId, 5],
    ]) {
      const response = await reserve(id, amount)
      assert.equal(response.status, 200)
      assert.equal(response.body.status, 'RESERVE_SUCCESS')
    }
    const reserved = await request('requester')
    assert.equal(reserved.body.availableCredit, 80)
    assert.equal(reserved.body.reserveCredit, 20)

    await send(topics.errandEvents, confirmId, 'ErrandCompleted', {
      errandId: confirmId,
      requesterSub: requester,
      courierSub: courier,
    })
    await send(topics.errandEvents, cancelId, 'ErrandCancelled', {
      errandId: cancelId,
      requesterSub: requester,
    })
    await send(topics.errandEvents, expireId, 'ErrandExpired', { errandId: expireId })
    await until(async () => {
      const requesterCredit = await request('requester')
      const courierCredit = await request('courier')
      return (
        requesterCredit.body.availableCredit === 90 &&
        requesterCredit.body.reserveCredit === 0 &&
        courierCredit.body.availableCredit === 110
      )
    })
    const finalRequester = await request('requester')
    assert.equal(finalRequester.body.availableCredit, 90)
    assert.equal(finalRequester.body.reserveCredit, 0)

    assert.equal((await reserve(failedReservedId, 7)).status, 200)
    await send(topics.errandEvents, failedReservedId, 'ErrandCreationFailed', {
      errandId: failedReservedId,
      requesterSub: requester,
    })
    await send(topics.errandEvents, failedUnreservedId, 'ErrandCreationFailed', {
      errandId: failedUnreservedId,
      requesterSub: requester,
    })
    await until(async () => {
      const credit = await request('requester')
      const released = await prisma.transactionRecord.count({
        where: { reference: `errand:${failedReservedId}:CREDIT_RELEASE` },
      })
      return released === 1 && credit.body.availableCredit === 90 && credit.body.reserveCredit === 0
    })
    const lateReservation = await reserve(failedReservedId, 7)
    assert.equal(lateReservation.status, 409)
    assert.equal(lateReservation.body.code, 'TRANSACTION_CONFLICT')
    assert.equal((await reserve(confirmId, 10)).status, 409)
    assert.equal(
      await prisma.transactionRecord.count({
        where: { reference: `errand:${failedReservedId}:CREDIT_RELEASE` },
      }),
      1,
    )
    await until(
      async () =>
        (await prisma.transactionRecord.count({
          where: { reference: `errand:${failedUnreservedId}:CREDIT_RELEASE` },
        })) === 1,
    )
    const zeroReserve = await prisma.transactionRecord.findUniqueOrThrow({
      where: { reference: `errand:${failedUnreservedId}:CREDIT_RESERVE` },
    })
    const zeroRelease = await prisma.transactionRecord.findUniqueOrThrow({
      where: { reference: `errand:${failedUnreservedId}:CREDIT_RELEASE` },
    })
    assert.equal(zeroReserve.amount.toNumber(), 0)
    assert.equal(zeroRelease.amount.toNumber(), 0)

    assert.equal((await reserve(requesterMismatchId, 1)).status, 200)
    assert.equal((await reserve(courierMissingId, 1)).status, 200)
    await send(topics.errandEvents, unreservedId, 'ErrandExpired', {
      errandId: unreservedId,
    })
    await send(topics.errandEvents, requesterMismatchId, 'ErrandCancelled', {
      errandId: requesterMismatchId,
      requesterSub: courier,
    })
    await send(topics.errandEvents, courierMissingId, 'ErrandCompleted', {
      errandId: courierMissingId,
      requesterSub: requester,
    })
    await until(async () => dlqEvents.length === 3)
    assert.deepEqual(
      new Set(dlqEvents.map((event) => event.error.code)),
      new Set([
        'ERRAND_RESERVATION_NOT_FOUND',
        'ERRAND_REQUESTER_MISMATCH',
        'ERRAND_COURIER_MISSING',
      ]),
    )
    for (const event of dlqEvents) {
      assert.equal(event.version, 1)
      assert.ok(event.eventId)
      assert.ok(event.timestamp)
      assert.ok(event.payload.errandId)
      assert.ok(event.error.message)
    }
    await send(topics.errandEvents, confirmId, 'ErrandCancelled', {
      errandId: confirmId,
      requesterSub: requester,
    })
    await send(topics.errandEvents, cancelId, 'ErrandCompleted', {
      errandId: cancelId,
      requesterSub: requester,
      courierSub: courier,
    })
    await until(async () => dlqEvents.length === 5)
    assert.deepEqual(
      new Set(
        dlqEvents
          .filter((item) => item.error.code === 'ERRAND_CREDIT_OUTCOME_CONFLICT')
          .map((item) => item.payload.errandId),
      ),
      new Set([confirmId, cancelId]),
    )

    const afterRejectedEvents = await request('requester')
    assert.equal(afterRejectedEvents.body.availableCredit, 88)
    assert.equal(afterRejectedEvents.body.reserveCredit, 2)
    assert.equal((await reserve(failedUnreservedId, 7)).status, 409)

    await send(topics.userEvents, requester, 'UserDeleted', { cognitoSub: requester })
    await until(async () => (await request('requester')).status === 404)
  } finally {
    await Promise.all([errandConsumer.stop(), userConsumer.stop()])
    await dlqConsumer.disconnect()
    await producer.disconnect()
    await prisma.transactionRecord.deleteMany({
      where: { OR: [{ senderId: { in: ids } }, { receiverId: { in: ids } }] },
    })
    await prisma.creditBalance.deleteMany({ where: { userId: { in: ids } } })
    api.closeAllConnections()
    await Promise.all([new Promise((resolve) => api.close(resolve)), fixture.close()])
    await closeAppResources()
  }
})
