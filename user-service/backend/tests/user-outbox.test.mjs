import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { UserRepository, prisma } from '../dist/repositories/user.repository.js'

test('profile registration and deletion write user events to the outbox', async () => {
  assert.ok(process.env.KAFKA_TOPIC_USER_EVENTS)
  const repository = new UserRepository()
  const cognitoSub = randomUUID()
  const username = `outbox-${cognitoSub.slice(0, 12)}`
  try {
    await repository.createProfile(cognitoSub, { username })
    const registration = await prisma.userOutboxEvent.findFirst({
      where: { key: cognitoSub, topic: process.env.KAFKA_TOPIC_USER_EVENTS },
    })
    assert.equal(registration.payload.eventType, 'UserRegistered')
    assert.deepEqual(registration.payload.payload, { cognitoSub })
    assert.equal(registration.payload.version, 1)
    assert.ok(registration.payload.eventId)
    assert.ok(registration.payload.timestamp)
    await repository.deleteProfile(cognitoSub)
    assert.equal(await repository.findByCognitoSub(cognitoSub), null)
    const deletion = await prisma.userOutboxEvent.findFirst({
      where: {
        key: cognitoSub,
        topic: process.env.KAFKA_TOPIC_USER_EVENTS,
        payload: { path: ['eventType'], equals: 'UserDeleted' },
      },
    })
    assert.equal(deletion.payload.eventType, 'UserDeleted')
    assert.deepEqual(deletion.payload.payload, { cognitoSub })
    assert.equal(deletion.payload.version, 1)
    assert.ok(deletion.payload.eventId)
    assert.ok(deletion.payload.timestamp)
  } finally {
    await prisma.userProfile.deleteMany({ where: { cognitoSub } })
    await prisma.userOutboxEvent.deleteMany({ where: { key: cognitoSub } })
    await prisma.$disconnect()
  }
})
