// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the deletion state-matrix tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@relay/errand-prisma'
import { ErrandEventTypes, ErrandStatus } from '@relay/contracts'
import { ErrandRepository } from '../src/repositories/errand.repository.js'

const prisma = new PrismaClient()
const repository = new ErrandRepository(prisma)

describe('user deletion errand state matrix', () => {
  beforeAll(async () => {
    await prisma.errand.deleteMany({})
    await prisma.errandEventOutbox.deleteMany({})
  })

  beforeEach(async () => {
    await prisma.errand.deleteMany({})
    await prisma.errandEventOutbox.deleteMany({})
  })

  afterAll(async () => {
    await prisma.errand.deleteMany({})
    await prisma.errandEventOutbox.deleteMany({})
    await prisma.$disconnect()
  })

  async function createErrand(status: ErrandStatus, expiresAt: Date): Promise<string> {
    const row = await prisma.errand.create({
      data: {
        requesterSub: 'requester-matrix',
        courierSub: status === ErrandStatus.Open ? null : 'courier-matrix',
        supplierId: 'supplier-state-matrix-test',
        name: 'State matrix test errand',
        pickupLat: 1,
        pickupLng: 103,
        pickupBuildingName: 'Pickup',
        pickupFloorNumber: 1,
        targetLat: 1,
        targetLng: 103,
        targetBuildingName: 'Target',
        targetFloorNumber: 2,
        supplierName: 'Test Supplier',
        serviceType: 1,
        deliveryDescription: 'Test delivery',
        creditAmount: 10,
        expiresAt,
        status,
      },
    })
    return row.id
  }

  it.each([
    [ErrandStatus.Open, ErrandEventTypes.ERRAND_CANCELLED],
    [ErrandStatus.Accepted, ErrandEventTypes.ERRAND_COMPLETED],
    [ErrandStatus.PickedUp, ErrandEventTypes.ERRAND_COMPLETED],
    [ErrandStatus.Delivered, ErrandEventTypes.ERRAND_COMPLETED],
  ] as const)('requester deletion resolves %s as expected', async (status, eventType) => {
    const errandId = await createErrand(status, new Date(Date.now() + 60 * 60 * 1000))

    expect(await repository.handleRequesterDeleted('requester-matrix')).toBe(1)

    const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
    const events = await prisma.errandEventOutbox.findMany({ where: { eventType } })

    expect(errand.status).toBe(status === ErrandStatus.Open ? ErrandStatus.Cancelled : ErrandStatus.Confirmed)
    expect(events).toHaveLength(1)
  })

  it.each([ErrandStatus.Accepted, ErrandStatus.PickedUp] as const)(
    'courier deletion reopens valid %s errands and clears the courier',
    async (status) => {
      const errandId = await createErrand(status, new Date(Date.now() + 60 * 60 * 1000))

      expect(await repository.handleCourierDeleted('courier-matrix')).toBe(1)

      const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
      const events = await prisma.errandEventOutbox.findMany({
        where: { eventType: ErrandEventTypes.ERRAND_STATUS_CHANGED },
      })

      expect(errand.status).toBe(ErrandStatus.Open)
      expect(errand.courierSub).toBeNull()
      expect(events).toHaveLength(1)
      expect((events[0].payload as { courierSub?: string }).courierSub).toBeUndefined()
    },
  )

  it.each([ErrandStatus.Accepted, ErrandStatus.PickedUp] as const)(
    'courier deletion expires overdue %s errands and releases the reservation',
    async (status) => {
      const errandId = await createErrand(status, new Date(Date.now() - 1))

      expect(await repository.handleCourierDeleted('courier-matrix')).toBe(1)

      const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
      const events = await prisma.errandEventOutbox.findMany({
        where: { eventType: ErrandEventTypes.ERRAND_EXPIRED },
      })

      expect(errand.status).toBe(ErrandStatus.Expired)
      expect(errand.courierSub).toBeNull()
      expect(events).toHaveLength(1)
    },
  )

  it('does not modify terminal errands or emit another event', async () => {
    const errandId = await createErrand(ErrandStatus.Confirmed, new Date(Date.now() + 60 * 60 * 1000))

    expect(await repository.handleRequesterDeleted('requester-matrix')).toBe(0)
    expect(await repository.handleCourierDeleted('courier-matrix')).toBe(0)

    const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
    const events = await prisma.errandEventOutbox.findMany({})

    expect(errand.status).toBe(ErrandStatus.Confirmed)
    expect(events).toHaveLength(0)
  })
})
