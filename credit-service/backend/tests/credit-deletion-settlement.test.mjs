// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the credit deletion and pending-settlement tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { CreditRepository, prisma } from '../dist/repositories/credit.repository.js'
import { CreditService } from '../dist/services/credit.service.js'

const userRef = (id) => ({ service: 'user', id, type: 'USER_DELETION' })
const errandRef = (id, type) => ({ service: 'errand', id, type })

test('settlement is preserved regardless of whether deletion or completion arrives first', async () => {
  const repository = new CreditRepository()
  const service = new CreditService(repository)
  const requester = randomUUID()
  const deletedCourierFirst = randomUUID()
  const deletedCourierLast = randomUUID()
  const activeCourier = randomUUID()
  const errandForDeletedCourierFirst = randomUUID()
  const errandForDeletedCourierLast = randomUUID()
  const errandForDeletedRequester = randomUUID()
  const users = [requester, deletedCourierFirst, deletedCourierLast, activeCourier]

  try {
    await prisma.creditBalance.createMany({
      data: users.map((userId) => ({ userId, availableCredit: 100, reserveCredit: 0 })),
    })

    await repository.reserveCredit({
      transactionReference: errandRef(errandForDeletedCourierFirst, 'CREDIT_RESERVE'),
      userId: requester,
      amount: 10,
    })
    await repository.deleteUserCredit({
      transactionReference: userRef(deletedCourierFirst),
      userId: deletedCourierFirst,
    })
    await repository.transferCredit({
      transactionReference: errandRef(errandForDeletedCourierFirst, 'CREDIT_TRANSFER'),
      senderId: requester,
      receiverId: deletedCourierFirst,
      amount: 10,
    })

    const deletedFirstReference = `errand:${errandForDeletedCourierFirst}:CREDIT_TRANSFER`
    assert.equal(await repository.findBalance(deletedCourierFirst), null)
    assert.equal(
      (await prisma.creditSettlement.findUniqueOrThrow({ where: { reference: deletedFirstReference } }))
        .status,
      'PENDING',
    )

    await repository.reserveCredit({
      transactionReference: errandRef(errandForDeletedCourierLast, 'CREDIT_RESERVE'),
      userId: requester,
      amount: 15,
    })
    await repository.transferCredit({
      transactionReference: errandRef(errandForDeletedCourierLast, 'CREDIT_TRANSFER'),
      senderId: requester,
      receiverId: deletedCourierLast,
      amount: 15,
    })

    const deletedLastReference = `errand:${errandForDeletedCourierLast}:CREDIT_TRANSFER`
    assert.equal(
      (await prisma.creditSettlement.findUniqueOrThrow({ where: { reference: deletedLastReference } }))
        .status,
      'CREDITED',
    )
    await repository.deleteUserCredit({
      transactionReference: userRef(deletedCourierLast),
      userId: deletedCourierLast,
    })
    assert.equal(await repository.findBalance(deletedCourierLast), null)
    assert.equal(
      (await prisma.creditSettlement.findUniqueOrThrow({ where: { reference: deletedLastReference } }))
        .status,
      'PENDING',
    )
    await assert.rejects(
      service.viewCredit({ userId: deletedCourierLast }),
      (error) => error.code === 'USER_NOT_FOUND',
    )

    await repository.reserveCredit({
      transactionReference: errandRef(errandForDeletedRequester, 'CREDIT_RESERVE'),
      userId: requester,
      amount: 20,
    })
    await repository.deleteUserCredit({ transactionReference: userRef(requester), userId: requester })
    await repository.transferCredit({
      transactionReference: errandRef(errandForDeletedRequester, 'CREDIT_TRANSFER'),
      senderId: requester,
      receiverId: activeCourier,
      amount: 20,
    })

    assert.equal((await repository.findBalance(activeCourier)).availableCredit, 120)
    await assert.rejects(
      repository.reserveCredit({
        transactionReference: errandRef(randomUUID(), 'CREDIT_RESERVE'),
        userId: requester,
        amount: 1,
      }),
      (error) => error.code === 'USER_NOT_FOUND',
    )
  } finally {
    await prisma.creditSettlement.deleteMany({
      where: { OR: [{ senderId: { in: users } }, { receiverId: { in: users } }] },
    })
    await prisma.transactionRecord.deleteMany({
      where: { OR: [{ senderId: { in: users } }, { receiverId: { in: users } }] },
    })
    await prisma.creditBalance.deleteMany({ where: { userId: { in: users } } })
    await prisma.$disconnect()
  }
})
