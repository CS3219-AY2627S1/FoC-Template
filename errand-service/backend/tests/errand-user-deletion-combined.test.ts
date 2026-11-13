// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-11-08
// Scope: Generated initial implementation of the combined user-deletion tests.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PrismaClient } from '@relay/errand-prisma'
import { ErrandEventTypes, ErrandStatus } from '@relay/contracts'
import { ErrandRepository } from '../src/repositories/errand.repository.js'

const prisma = new PrismaClient()
const repository = new ErrandRepository(prisma)

describe('combined requester and courier deletion handling', () => {
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

  async function createDeliveredErrand(requesterSub: string, courierSub: string): Promise<string> {
    const row = await prisma.errand.create({
      data: {
        requesterSub,
        courierSub,
        supplierId: 'supplier-combined-deletion-test',
        name: 'Combined deletion test errand',
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
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        status: ErrandStatus.Delivered,
      },
    })
    return row.id
  }

  it('settles exactly once when requester deletion arrives before courier deletion', async () => {
    const requester = 'requester-combined-first'
    const courier = 'courier-combined-first'
    const errandId = await createDeliveredErrand(requester, courier)

    expect(await repository.handleRequesterDeleted(requester)).toBe(1)
    expect(await repository.handleCourierDeleted(courier)).toBe(0)

    const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
    const completions = await prisma.errandEventOutbox.findMany({
      where: { eventType: ErrandEventTypes.ERRAND_COMPLETED },
    })

    expect(errand.status).toBe(ErrandStatus.Confirmed)
    expect(errand.courierSub).toBe(courier)
    expect(completions).toHaveLength(1)
    expect((completions[0].payload as { courierSub?: string }).courierSub).toBe(courier)
  })

  it('settles exactly once when courier deletion arrives before requester deletion', async () => {
    const requester = 'requester-courier-first'
    const courier = 'courier-courier-first'
    const errandId = await createDeliveredErrand(requester, courier)

    expect(await repository.handleCourierDeleted(courier)).toBe(1)
    expect(await repository.handleRequesterDeleted(requester)).toBe(0)

    const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
    const completions = await prisma.errandEventOutbox.findMany({
      where: { eventType: ErrandEventTypes.ERRAND_COMPLETED },
    })

    expect(errand.status).toBe(ErrandStatus.Confirmed)
    expect(errand.courierSub).toBe(courier)
    expect(completions).toHaveLength(1)
    expect((completions[0].payload as { courierSub?: string }).courierSub).toBe(courier)
  })

  it('does not duplicate completion when the same deletion is delivered again', async () => {
    const requester = 'requester-duplicate-deletion'
    const courier = 'courier-duplicate-deletion'
    const errandId = await createDeliveredErrand(requester, courier)

    expect(await repository.handleCourierDeleted(courier)).toBe(1)
    expect(await repository.handleCourierDeleted(courier)).toBe(0)

    const errand = await prisma.errand.findUniqueOrThrow({ where: { id: errandId } })
    const completions = await prisma.errandEventOutbox.findMany({
      where: { eventType: ErrandEventTypes.ERRAND_COMPLETED },
    })

    expect(errand.status).toBe(ErrandStatus.Confirmed)
    expect(completions).toHaveLength(1)
  })
})
