// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-14
// Scope: Generated initial implementation, debugged implementation
// Author review: I validated correctness and edited for style.

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Kafka, logLevel } from 'kafkajs'
import { PrismaClient } from '@relay/credit-prisma'

const brokers = (process.env.KAFKA_BROKERS ?? 'kafka:9092').split(',')
const userTopic = process.env.KAFKA_TOPIC_USER_EVENTS ?? 'user-events'
const dlqTopic = process.env.KAFKA_TOPIC_USER_DLQ ?? 'user-events-dlq'
const kafka = new Kafka({
  clientId: 'user-dlq-integration-check',
  brokers,
  logLevel: logLevel.ERROR,
})
const producer = kafka.producer()
const dlqConsumer = kafka.consumer({ groupId: `user-dlq-check-${randomUUID()}` })
const admin = kafka.admin()
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
const subject = randomUUID()
const lateSubject = randomUUID()
const invalidKey = randomUUID()
const keys = new Set([subject, lateSubject, invalidKey])
const rejected = []
const event = (eventType, cognitoSub) => ({
  eventId: randomUUID(),
  timestamp: new Date().toISOString(),
  version: 1,
  eventType,
  payload: { cognitoSub },
})
const messages = [
  { key: invalidKey, value: '{bad json' },
  { key: subject, value: JSON.stringify(event('UserRegistered', subject)) },
  { key: subject, value: JSON.stringify(event('UserRegistered', subject)) },
  { key: subject, value: JSON.stringify(event('UserDeleted', subject)) },
  { key: subject, value: JSON.stringify(event('UserDeleted', subject)) },
  { key: lateSubject, value: JSON.stringify(event('UserDeleted', lateSubject)) },
  { key: lateSubject, value: JSON.stringify(event('UserRegistered', lateSubject)) },
]

try {
  await admin.connect()
  await producer.connect()
  await dlqConsumer.connect()
  await dlqConsumer.subscribe({ topic: dlqTopic, fromBeginning: true })
  await dlqConsumer.run({
    eachMessage: async ({ message }) => {
      if (keys.has(message.key?.toString())) rejected.push(JSON.parse(message.value.toString()))
    },
  })
  const sent = await producer.send({ topic: userTopic, messages })
  const expectedOffset = BigInt(sent[0].baseOffset) + BigInt(messages.length)
  let committed = -1n
  for (let attempt = 0; attempt < 40; attempt++) {
    const offsets = await admin.fetchOffsets({
      groupId: 'relay-credit-user-events',
      topic: userTopic,
    })
    committed = BigInt(offsets[0].partitions.find((row) => row.partition === 0).offset)
    if (committed >= expectedOffset && rejected.length >= 4) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  assert.ok(
    committed >= expectedOffset,
    `source offset ${committed} did not reach ${expectedOffset}`,
  )
  assert.equal(rejected.length, 4)
  assert.deepEqual(
    new Set(rejected.map((item) => item.error.code)),
    new Set(['USER_EVENT_INVALID', 'USER_EVENT_DUPLICATE', 'USER_EVENT_OUT_OF_ORDER']),
  )
  assert.equal(
    await prisma.creditBalance.count({ where: { userId: { in: [subject, lateSubject] } } }),
    0,
  )
  assert.equal(
    await prisma.transactionRecord.count({
      where: { reference: `user:${subject}:INITIAL_ALLOCATION` },
    }),
    1,
  )
  console.log(`PASS user DLQ and source offset ${committed}`)
} finally {
  await dlqConsumer.disconnect().catch(() => undefined)
  await producer.disconnect().catch(() => undefined)
  await admin.disconnect().catch(() => undefined)
  await prisma.transactionRecord.deleteMany({
    where: {
      OR: [
        { senderId: { in: [subject, lateSubject] } },
        { receiverId: { in: [subject, lateSubject] } },
      ],
    },
  })
  await prisma.creditBalance.deleteMany({ where: { userId: { in: [subject, lateSubject] } } })
  await prisma.$disconnect()
}
