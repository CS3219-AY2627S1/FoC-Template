/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated credit command unit test cases.
 * Author review: Verified correctness.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { CreditRepository, prisma } from '../dist/repositories/credit.repository.js'

test('release, transfer, and deletion are atomic and idempotent', async () => {
  const repository = new CreditRepository()
  const requester = randomUUID()
  const courier = randomUUID()
  const lateUser = randomUUID()
  const errandId = randomUUID()
  const releaseId = randomUUID()
  const userRef = (id, type) => ({ service: 'user', id, type })
  const errandRef = (id, type) => ({ service: 'errand', id, type })
  try {
    assert.equal(
      await repository.allocateInitialCredit({
        transactionReference: userRef(requester, 'INITIAL_ALLOCATION'),
        userId: requester,
      }),
      'processed',
    )
    await repository.allocateInitialCredit({
      transactionReference: userRef(courier, 'INITIAL_ALLOCATION'),
      userId: courier,
    })
    await repository.reserveCredit({
      transactionReference: errandRef(releaseId, 'CREDIT_RESERVE'),
      userId: requester,
      amount: 10,
    })
    await repository.reserveCredit({
      transactionReference: errandRef(errandId, 'CREDIT_RESERVE'),
      userId: requester,
      amount: 12.5,
    })
    const release = {
      transactionReference: errandRef(releaseId, 'CREDIT_RELEASE'),
      userId: requester,
      amount: 10,
    }
    await repository.releaseCredit(release)
    await repository.releaseCredit(release)
    assert.deepEqual(
      (({ availableCredit, reserveCredit }) => ({ availableCredit, reserveCredit }))(
        await repository.findBalance(requester),
      ),
      { availableCredit: 87.5, reserveCredit: 12.5 },
    )
    const transfer = {
      transactionReference: errandRef(errandId, 'CREDIT_TRANSFER'),
      senderId: requester,
      receiverId: courier,
      amount: 12.5,
    }
    await repository.transferCredit(transfer)
    await repository.transferCredit(transfer)
    assert.equal((await repository.findBalance(requester)).reserveCredit, 0)
    assert.equal((await repository.findBalance(courier)).availableCredit, 112.5)
    await assert.rejects(() =>
      repository.releaseCredit({
        transactionReference: errandRef(errandId, 'CREDIT_RELEASE'),
        userId: requester,
        amount: 12.5,
      }),
    )
    await assert.rejects(() =>
      repository.transferCredit({
        transactionReference: errandRef(randomUUID(), 'CREDIT_TRANSFER'),
        senderId: requester,
        receiverId: courier,
        amount: 100,
      }),
    )
    assert.equal((await repository.findBalance(courier)).availableCredit, 112.5)
    const deletion = {
      transactionReference: userRef(requester, 'USER_DELETION'),
      userId: requester,
    }
    assert.equal(await repository.deleteUserCredit(deletion), 'processed')
    assert.equal(await repository.deleteUserCredit(deletion), 'duplicate')
    assert.equal(await repository.findBalance(requester), null)
    assert.equal(
      await repository.allocateInitialCredit({
        transactionReference: userRef(requester, 'INITIAL_ALLOCATION'),
        userId: requester,
      }),
      'duplicate',
    )
    assert.equal(await repository.findBalance(requester), null)
    assert.equal(
      await repository.deleteUserCredit({
        transactionReference: userRef(lateUser, 'USER_DELETION'),
        userId: lateUser,
      }),
      'processed',
    )
    assert.equal(
      await repository.allocateInitialCredit({
        transactionReference: userRef(lateUser, 'INITIAL_ALLOCATION'),
        userId: lateUser,
      }),
      'out-of-order',
    )
    const history = await repository.findHistory(requester)
    assert.equal(history.filter((record) => record.type === 'CREDIT_RESERVE').length, 2)
    assert.equal(history.filter((record) => record.type === 'CREDIT_RELEASE').length, 1)
    assert.equal(history.filter((record) => record.type === 'CREDIT_TRANSFER').length, 1)
    assert.equal(history.filter((record) => record.type === 'USER_DELETION').length, 1)
    assert.equal(history.find((record) => record.type === 'USER_DELETION').amount, 87.5)
  } finally {
    await prisma.creditSettlement.deleteMany({
      where: {
        OR: [
          { senderId: { in: [requester, courier, lateUser] } },
          { receiverId: { in: [requester, courier, lateUser] } },
        ],
      },
    })
    await prisma.transactionRecord.deleteMany({
      where: {
        OR: [
          { senderId: { in: [requester, courier, lateUser] } },
          { receiverId: { in: [requester, courier, lateUser] } },
        ],
      },
    })
    await prisma.creditBalance.deleteMany({
      where: { userId: { in: [requester, courier, lateUser] } },
    })
    await prisma.$disconnect()
  }
})
