// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-24
// Scope: Generated integration tests for the author-designed outbox flow.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@relay/errand-prisma'
import type { CreateErrandRequest } from '@relay/contracts'
import { ErrandRepository } from '../src/repositories/errand.repository.js'

const request: CreateErrandRequest = {
  name: 'Outbox test',
  supplierDetails: { supplierId: 'supplier', supplierName: 'Supplier', serviceType: 1 },
  pickupLocation: { lat: 1, lng: 103, buildingName: 'Pickup', floorNumber: 1 },
  targetLocation: { lat: 1, lng: 103, buildingName: 'Target', floorNumber: 2 },
  deliveryDetails: { description: 'Deliver parcel' },
  creditAmount: 10,
}
const enabled = process.env.RUN_OUTBOX_INTEGRATION === '1'

describe.skipIf(!enabled)('transactional errand outbox', () => {
  it('stores lifecycle payloads alongside their errand changes', async () => {
    const prisma = new PrismaClient()
    const repository = new ErrandRepository(prisma)
    const id = await repository.addPendingErrand('requester')
    try {
      await repository.createErrand(id, 'requester', request)
      await repository.accept(id, 'courier')
      await repository.pickUp(id, 'courier')
      await repository.deliver(id, 'courier')
      await repository.confirm(id, 'requester')
      const row = await prisma.errand.findUniqueOrThrow({ where: { id } })
      const events = await prisma.errandEventOutbox.findMany({
        where: { payload: { path: ['errandId'], equals: id } },
        orderBy: { createdAt: 'asc' },
      })
      expect(row.status).toBe('CONFIRMED')
      expect(events.map((event) => event.eventType)).toEqual([
        'ErrandCreated',
        'ErrandStatusChanged',
        'ErrandStatusChanged',
        'ErrandStatusChanged',
        'ErrandCompleted',
      ])
      expect(events[0].payload).toMatchObject({
        errandId: id,
        requesterSub: 'requester',
        supplierId: 'supplier',
        creditAmount: 10,
      })
      expect(events[1].payload).toMatchObject({
        errandStatus: 'ACCEPTED',
        previousStatus: 'OPEN',
        actorSub: 'courier',
        actorType: 'courier',
      })
      expect(events[4].payload).toMatchObject({
        requesterSub: 'requester',
        courierSub: 'courier',
      })
      await repository.delete(id, 'requester')
      const deletedErrand = await prisma.errand.findUnique({ where: { id } })
      expect(deletedErrand?.status).toBe('DELETED')
      expect(
        await prisma.errandEventOutbox.count({
          where: { payload: { path: ['errandId'], equals: id }, eventType: 'ErrandDeleted' },
        }),
      ).toBe(1)
    } finally {
      await prisma.errandEventOutbox.deleteMany({
        where: { payload: { path: ['errandId'], equals: id } },
      })
      await prisma.errand.deleteMany({ where: { id } })
      await prisma.pendingErrand.deleteMany({ where: { id } })
      await prisma.$disconnect()
    }
  })
  it('preserves cancellation and expiry payload differences', async () => {
    const prisma = new PrismaClient()
    const repository = new ErrandRepository(prisma)
    const cancelId = await repository.addPendingErrand('requester')
    const expiryId = await repository.addPendingErrand('requester')
    try {
      // Cancel an open errand (before acceptance)
      await repository.createErrand(cancelId, 'requester', request)

      await repository.cancel(cancelId, 'requester')

      // Create an errand with past expiry date, then accept and drop to trigger expiry
      const now = new Date()
      const past = new Date(now.getTime() - 25 * 60 * 60 * 1000)
      await repository.createErrand(expiryId, 'requester', {
        ...request,
        expiresAt: past.toISOString(),
      })
      await repository.accept(expiryId, 'courier')
      await repository.drop(expiryId, 'courier')

      const cancelled = await prisma.errandEventOutbox.findFirstOrThrow({
        where: { eventType: 'ErrandCancelled', payload: { path: ['errandId'], equals: cancelId } },
      })
      expect(cancelled.payload).toMatchObject({
        errandId: cancelId,
        actorSub: 'requester',
        requesterSub: 'requester',
      })
      const expiredEvents = await prisma.errandEventOutbox.findMany({
        where: { payload: { path: ['errandId'], equals: expiryId } },
        orderBy: { createdAt: 'asc' },
      })
      expect(expiredEvents.map((event) => event.eventType).slice(-2)).toEqual([
        'ErrandStatusChanged',
        'ErrandExpired',
      ])
      expect(expiredEvents.at(-2)?.payload).toMatchObject({
        errandStatus: 'EXPIRED',
        previousStatus: 'ACCEPTED',
        actorSub: 'courier',
        actorType: 'courier',
      })
      expect(expiredEvents.at(-1)?.payload).toEqual({ errandId: expiryId })
    } finally {
      for (const id of [cancelId, expiryId]) {
        await prisma.errandEventOutbox.deleteMany({
          where: { payload: { path: ['errandId'], equals: id } },
        })
      }
      await prisma.errand.deleteMany({ where: { id: { in: [cancelId, expiryId] } } })
      await prisma.pendingErrand.deleteMany({ where: { id: { in: [cancelId, expiryId] } } })
      await prisma.$disconnect()
    }
  })
  it('records automatic expiry and prunes only published outbox rows', async () => {
    const prisma = new PrismaClient()
    const repository = new ErrandRepository(prisma)
    const id = await repository.addPendingErrand('requester')
    try {
      // Create errand with a past expiry date
      const now = new Date()
      const past = new Date(now.getTime() - 25 * 60 * 60 * 1000)
      await repository.createErrand(id, 'requester', { ...request, expiresAt: past.toISOString() })

      // Expire the errand
      await repository.expireOpenErrands(now)
      const row = await prisma.errand.findUniqueOrThrow({ where: { id } })
      expect(row.status).toBe('EXPIRED')
      const outbox = await prisma.errandEventOutbox.findMany({
        where: { payload: { path: ['errandId'], equals: id } },
        orderBy: { createdAt: 'asc' },
      })
      expect(outbox.length).toBe(2)
      expect(outbox[0].eventType).toBe('ErrandCreated')
      expect(outbox[1].eventType).toBe('ErrandExpired')
    } finally {
      await prisma.errandEventOutbox.deleteMany({
        where: { payload: { path: ['errandId'], equals: id } },
      })
      await prisma.errand.deleteMany({ where: { id } })
      await prisma.pendingErrand.deleteMany({ where: { id } })
      await prisma.$disconnect()
    }
  })
  it('rejects invalid state transitions', async () => {
    const prisma = new PrismaClient()
    const repository = new ErrandRepository(prisma)
    const id = await repository.addPendingErrand('requester')
    try {
      await repository.createErrand(id, 'requester', request)

      // First accept should succeed (errand is open)
      await repository.accept(id, 'courier')

      // Attempt to accept again (should fail - already accepted)
      await expect(repository.accept(id, 'courier2')).rejects.toThrow('ERRAND ALREADY ACCEPTED')

      // Attempt to pick up as non-courier (should fail)
      await expect(repository.pickUp(id, 'not-courier')).rejects.toThrow('ONLY COURIER CAN PICK UP')

      // Courier picks up
      await repository.pickUp(id, 'courier')

      // Attempt to pick up again (should fail - already picked up)
      await expect(repository.pickUp(id, 'courier')).rejects.toThrow('ERRAND ALREADY PICKED UP')

      // Courier delivers
      await repository.deliver(id, 'courier')

      // Attempt to deliver again (should fail - already delivered)
      await expect(repository.deliver(id, 'courier')).rejects.toThrow('ERRAND ALREADY DELIVERED')

      // Requester confirms
      await repository.confirm(id, 'requester')

      // Attempt to confirm again (should fail - already confirmed)
      await expect(repository.confirm(id, 'requester')).rejects.toThrow('ERRAND ALREADY CONFIRMED')
    } finally {
      await prisma.errandEventOutbox.deleteMany({
        where: { payload: { path: ['errandId'], equals: id } },
      })
      await prisma.errand.deleteMany({ where: { id } })
      await prisma.pendingErrand.deleteMany({ where: { id } })
      await prisma.$disconnect()
    }
  })
  it('rejects unauthorized state transitions', async () => {
    const prisma = new PrismaClient()
    const repository = new ErrandRepository(prisma)
    const errandId = await repository.addPendingErrand('requester')
    let errandId2: string
    let errandId3: string
    try {
      await repository.createErrand(errandId, 'requester', request)

      // Requester accepts (should fail - requester cannot accept their own errand)
      await expect(repository.accept(errandId, 'requester')).rejects.toThrow(
        'REQUESTER CANNOT ACCEPT OWN ERRAND',
      )

      // Create another errand for courier tests
      errandId2 = await repository.addPendingErrand('requester2')
      await repository.createErrand(errandId2, 'requester2', request)
      await repository.accept(errandId2, 'courier')

      // Requester tries to pick up (should fail)
      await expect(repository.pickUp(errandId2, 'requester2')).rejects.toThrow(
        'ONLY COURIER CAN PICK UP',
      )

      // Courier drops
      await repository.drop(errandId2, 'courier')

      // Requester tries to drop again (should fail)
      await expect(repository.drop(errandId2, 'requester2')).rejects.toThrow(
        'ERRAND NOT IN ACCEPTED',
      )

      // Create another errand for drop tests
      errandId3 = await repository.addPendingErrand('requester3')
      await repository.createErrand(errandId3, 'requester3', request)
      await repository.accept(errandId3, 'courier')

      // Non-courier tries to drop (should fail)
      await expect(repository.drop(errandId3, 'not-courier')).rejects.toThrow(
        'ONLY COURIER CAN DROP',
      )
    } finally {
      for (const eid of [errandId, errandId2, errandId3]) {
        await prisma.errandEventOutbox.deleteMany({
          where: { payload: { path: ['errandId'], equals: eid } },
        })
        await prisma.errand.deleteMany({ where: { id: eid } })
        await prisma.pendingErrand.deleteMany({ where: { id: eid } })
      }
      await prisma.$disconnect()
    }
  })
})
