/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-11-05
 * Scope: Generated MSK errand expiry smoke tests
 * Author review: Verified errand expiry and credit release behavior matches actual implementation.
 */

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const [mode, userId, errandId = randomUUID()] = process.argv.slice(2)
assert.ok(mode && userId && errandId)

if (mode === 'credit-setup' || mode === 'credit-check') {
  const { PrismaClient } = await import('@relay/credit-prisma')
  const prisma = new PrismaClient()
  try {
    if (mode === 'credit-setup') {
      await prisma.$transaction(async tx => {
        await tx.creditBalance.update({
          where: { userId },
          data: { availableCredit: { decrement: 5 }, reserveCredit: { increment: 5 } },
        })
        await tx.transactionRecord.create({
          data: { reference: `errand:${errandId}:CREDIT_RESERVE`, senderId: userId, receiverId: userId, type: 'CREDIT_RESERVE', amount: 5 },
        })
      })
    } else {
      let release
      for (let i = 0; i < 60; i++) {
        release = await prisma.transactionRecord.findUnique({ where: { reference: `errand:${errandId}:CREDIT_RELEASE` } })
        if (release) break
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      assert.ok(release, 'credit release from expired errand event')
      const balance = await prisma.creditBalance.findUnique({ where: { userId } })
      assert.equal(Number(release.amount), 5)
      console.log(JSON.stringify({ errandId, release: release.reference, availableCredit: Number(balance.availableCredit), reserveCredit: Number(balance.reserveCredit) }))
    }
  } finally { await prisma.$disconnect() }
} else if (mode === 'errand-expire' || mode === 'errand-expire-real') {
  const { PrismaClient } = await import('@relay/errand-prisma')
  const prisma = new PrismaClient()
  try {
    await prisma.errand.create({
      data: {
        id: errandId, requesterSub: userId, supplierId: 'msk-smoke-supplier',
        pickupLat: 1.3, pickupLng: 103.8, pickupBuildingName: 'Test Pickup', pickupFloorNumber: 1,
        targetLat: 1.31, targetLng: 103.81, targetBuildingName: 'Test Target', targetFloorNumber: 2,
        name: 'MSK expiry smoke', supplierName: 'Test Supplier', serviceType: 0,
        deliveryDescription: 'MSK smoke test', creditAmount: 5,
        expiresAt: new Date(Date.now() - 1000),
      },
    })
    if (mode === 'errand-expire-real') {
      const { ErrandRepository } = await import('./errand-service/backend/src/repositories/errand.repository.ts')
      assert.ok(await new ErrandRepository(prisma).expireOpenErrands() >= 1)
    } else {
      await prisma.$transaction(async tx => {
        await tx.errand.update({ where: { id: errandId }, data: { status: 'EXPIRED' } })
        await tx.errandEventOutbox.create({ data: { id: randomUUID(), eventType: 'ErrandExpired', payload: { errandId } } })
      })
    }
    const row = await prisma.errand.findUnique({ where: { id: errandId } })
    assert.equal(row.status, 'EXPIRED')
    console.log(JSON.stringify({ errandId, status: row.status }))
  } finally { await prisma.$disconnect() }
} else throw new Error('Unknown mode')
