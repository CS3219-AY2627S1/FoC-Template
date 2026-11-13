/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated reservation and credit outcome test cases.
 * Author review: Verified that edge cases are handled.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { CreditRepository, prisma } from '../dist/repositories/credit.repository.js'

const ref = (id, type) => ({ service: 'delivery', id, type })

test('early failure writes zero reserve and release without touching balance', async () => {
  const repository = new CreditRepository()
  const userId = randomUUID()
  const id = randomUUID()
  try {
    await prisma.creditBalance.create({ data: { userId, availableCredit: 100, reserveCredit: 0 } })
    const before = await prisma.creditBalance.findUniqueOrThrow({ where: { userId } })
    await repository.closeUnreservedCredit(ref(id, 'CREDIT_RELEASE'), userId)
    await repository.closeUnreservedCredit(ref(id, 'CREDIT_RELEASE'), userId)
    const records = await prisma.transactionRecord.findMany({
      where: {
        reference: { in: [`delivery:${id}:CREDIT_RESERVE`, `delivery:${id}:CREDIT_RELEASE`] },
      },
    })
    assert.equal(records.length, 2)
    assert.deepEqual(
      new Set(records.map((record) => record.type)),
      new Set(['CREDIT_RESERVE', 'CREDIT_RELEASE']),
    )
    assert.ok(records.every((record) => record.amount.toNumber() === 0))
    const after = await prisma.creditBalance.findUniqueOrThrow({ where: { userId } })
    assert.equal(after.availableCredit.toNumber(), before.availableCredit.toNumber())
    assert.equal(after.reserveCredit.toNumber(), before.reserveCredit.toNumber())
    assert.equal(after.lastUpdated.getTime(), before.lastUpdated.getTime())
    await assert.rejects(
      () =>
        repository.reserveCredit({
          transactionReference: ref(id, 'CREDIT_RESERVE'),
          userId,
          amount: 5,
        }),
      (error) => error.code === 'TRANSACTION_CONFLICT',
    )
  } finally {
    await prisma.transactionRecord.deleteMany({
      where: { reference: { startsWith: `delivery:${id}:` } },
    })
    await prisma.creditBalance.deleteMany({ where: { userId } })
  }
})

test('failure and reserve racing leave no credit held', async () => {
  const repository = new CreditRepository()
  const userId = randomUUID()
  const id = randomUUID()
  try {
    await prisma.creditBalance.create({ data: { userId, availableCredit: 100, reserveCredit: 0 } })
    const results = await Promise.allSettled([
      repository.reserveCredit({
        transactionReference: ref(id, 'CREDIT_RESERVE'),
        userId,
        amount: 5,
      }),
      repository.closeUnreservedCredit(ref(id, 'CREDIT_RELEASE'), userId),
    ])
    assert.equal(results[1].status, 'fulfilled')
    assert.ok(
      results[0].status === 'fulfilled' || results[0].reason.code === 'TRANSACTION_CONFLICT',
    )
    const balance = await repository.findBalance(userId)
    assert.equal(balance.availableCredit, 100)
    assert.equal(balance.reserveCredit, 0)
    const reserve = await prisma.transactionRecord.findUniqueOrThrow({
      where: { reference: `delivery:${id}:CREDIT_RESERVE` },
    })
    const release = await prisma.transactionRecord.findUniqueOrThrow({
      where: { reference: `delivery:${id}:CREDIT_RELEASE` },
    })
    assert.equal(reserve.amount.toNumber(), release.amount.toNumber())
  } finally {
    await prisma.transactionRecord.deleteMany({
      where: { reference: { startsWith: `delivery:${id}:` } },
    })
    await prisma.creditBalance.deleteMany({ where: { userId } })
  }
})

test('concurrent release and transfer cannot both settle one reservation', async () => {
  const repository = new CreditRepository()
  const senderId = randomUUID()
  const receiverId = randomUUID()
  const ids = []
  try {
    await prisma.creditBalance.createMany({
      data: [
        { userId: senderId, availableCredit: 1000, reserveCredit: 0 },
        { userId: receiverId, availableCredit: 100, reserveCredit: 0 },
      ],
    })
    for (let attempt = 0; attempt < 10; attempt++) {
      const id = randomUUID()
      ids.push(id)
      await repository.reserveCredit({
        transactionReference: ref(id, 'CREDIT_RESERVE'),
        userId: senderId,
        amount: 10,
      })
      const results = await Promise.allSettled([
        repository.releaseCredit({
          transactionReference: ref(id, 'CREDIT_RELEASE'),
          userId: senderId,
          amount: 10,
        }),
        repository.transferCredit({
          transactionReference: ref(id, 'CREDIT_TRANSFER'),
          senderId,
          receiverId,
          amount: 10,
        }),
      ])
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
      const outcomes = await prisma.transactionRecord.findMany({
        where: {
          reference: { in: [`delivery:${id}:CREDIT_RELEASE`, `delivery:${id}:CREDIT_TRANSFER`] },
        },
      })
      assert.equal(outcomes.length, 1)
      await assert.rejects(
        outcomes[0].type === 'CREDIT_RELEASE'
          ? () =>
              repository.transferCredit({
                transactionReference: ref(id, 'CREDIT_TRANSFER'),
                senderId,
                receiverId,
                amount: 10,
              })
          : () =>
              repository.releaseCredit({
                transactionReference: ref(id, 'CREDIT_RELEASE'),
                userId: senderId,
                amount: 10,
              }),
      )
    }
    assert.equal((await repository.findBalance(senderId)).reserveCredit, 0)
  } finally {
    await prisma.transactionRecord.deleteMany({
      where: {
        reference: {
          in: ids.flatMap((id) => [
            `delivery:${id}:CREDIT_RESERVE`,
            `delivery:${id}:CREDIT_RELEASE`,
            `delivery:${id}:CREDIT_TRANSFER`,
          ]),
        },
      },
    })
    await prisma.creditBalance.deleteMany({ where: { userId: { in: [senderId, receiverId] } } })
  }
})

test('same id from different services has independent credit outcomes', async () => {
  const repository = new CreditRepository()
  const userId = randomUUID()
  const id = randomUUID()
  const reference = (service, type) => ({ service, id, type })
  try {
    await prisma.creditBalance.create({ data: { userId, availableCredit: 100, reserveCredit: 0 } })
    for (const service of ['delivery', 'orders']) {
      await repository.reserveCredit({
        transactionReference: reference(service, 'CREDIT_RESERVE'),
        userId,
        amount: 10,
      })
    }
    await repository.releaseCredit({
      transactionReference: reference('delivery', 'CREDIT_RELEASE'),
      userId,
      amount: 10,
    })
    await assert.rejects(
      () =>
        repository.reserveCredit({
          transactionReference: reference('delivery', 'CREDIT_RESERVE'),
          userId,
          amount: 10,
        }),
      (error) => error.code === 'TRANSACTION_CONFLICT',
    )
    await repository.releaseCredit({
      transactionReference: reference('orders', 'CREDIT_RELEASE'),
      userId,
      amount: 10,
    })
    const balance = await repository.findBalance(userId)
    assert.equal(balance.availableCredit, 100)
    assert.equal(balance.reserveCredit, 0)
  } finally {
    await prisma.transactionRecord.deleteMany({
      where: {
        reference: {
          in: ['delivery', 'orders'].flatMap((service) =>
            ['CREDIT_RESERVE', 'CREDIT_RELEASE'].map((type) => `${service}:${id}:${type}`),
          ),
        },
      },
    })
    await prisma.creditBalance.deleteMany({ where: { userId } })
  }
})

test('zero reservations can be released or transferred without changing balances', async () => {
  const repository = new CreditRepository()
  const senderId = randomUUID()
  const receiverId = randomUUID()
  const releasedId = randomUUID()
  const transferredId = randomUUID()
  try {
    await prisma.creditBalance.createMany({
      data: [
        { userId: senderId, availableCredit: 100, reserveCredit: 0 },
        { userId: receiverId, availableCredit: 100, reserveCredit: 0 },
      ],
    })
    for (const id of [releasedId, transferredId]) {
      await repository.reserveCredit({
        transactionReference: ref(id, 'CREDIT_RESERVE'),
        userId: senderId,
        amount: 0,
      })
    }
    await repository.releaseCredit({
      transactionReference: ref(releasedId, 'CREDIT_RELEASE'),
      userId: senderId,
      amount: 0,
    })
    await repository.transferCredit({
      transactionReference: ref(transferredId, 'CREDIT_TRANSFER'),
      senderId,
      receiverId,
      amount: 0,
    })
    assert.equal((await repository.findBalance(senderId)).availableCredit, 100)
    assert.equal((await repository.findBalance(senderId)).reserveCredit, 0)
    assert.equal((await repository.findBalance(receiverId)).availableCredit, 100)
    await assert.rejects(
      () =>
        repository.transferCredit({
          transactionReference: ref(releasedId, 'CREDIT_TRANSFER'),
          senderId,
          receiverId,
          amount: 0,
        }),
      /after release/,
    )
    await assert.rejects(
      () =>
        repository.releaseCredit({
          transactionReference: ref(transferredId, 'CREDIT_RELEASE'),
          userId: senderId,
          amount: 0,
        }),
      /after transfer/,
    )
  } finally {
    await prisma.transactionRecord.deleteMany({
      where: {
        reference: {
          in: [releasedId, transferredId].flatMap((id) =>
            ['CREDIT_RESERVE', 'CREDIT_RELEASE', 'CREDIT_TRANSFER'].map(
              (type) => `delivery:${id}:${type}`,
            ),
          ),
        },
      },
    })
    await prisma.creditBalance.deleteMany({ where: { userId: { in: [senderId, receiverId] } } })
  }
})
