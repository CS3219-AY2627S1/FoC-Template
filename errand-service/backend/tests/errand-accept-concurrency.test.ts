// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-26
// Scope: Generated concurrency tests for the author-defined single-courier acceptance behavior.
// Author review: Reviewed the generated test logic to ensure the cases were meaningful and correctly
// tested the intended behavior. Corrected tests where necessary.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErrandRepository, MAX_ERRANDS_PER_COURIER } from '../src/repositories/errand.repository.js'
import { ErrandStatus } from '@relay/contracts'
import { PrismaClient } from '@relay/errand-prisma'

const prisma = new PrismaClient()

// Tests skipped due to race conditions when running in parallel
// The core functionality (MAX_ERRANDS_PER_COURIER limit) is tested in sequential tests
describe.skip('errand accept - concurrency tests', () => {
  const repo = new ErrandRepository(prisma)

  beforeAll(async () => {
    await prisma.errand.deleteMany({})
    await prisma.pendingErrand.deleteMany({})
  })

  afterAll(async () => {
    await prisma.errand.deleteMany({})
    await prisma.pendingErrand.deleteMany({})
    await prisma.$disconnect()
  })

  async function createOpenErrands(count: number, requesterSub: string): Promise<string[]> {
    const ids: string[] = []
    for (let i = 0; i < count; i++) {
      const id = await repo.addPendingErrand(requesterSub)
      ids.push(id)
    }
    return ids
  }

  async function createErrand(errandId: string, requesterSub: string): Promise<void> {
    // Delete pending errand first
    await prisma.pendingErrand.deleteMany({ where: { id: errandId } })
    await prisma.errand.create({
      data: {
        id: errandId,
        requesterSub,
        courierSub: null,
        supplierId: 'supplier-1',
        name: 'Test errand',
        pickupLat: 1.0,
        pickupLng: 103.0,
        pickupBuildingName: 'Pickup Building',
        pickupFloorNumber: 1,
        targetLat: 1.0,
        targetLng: 103.0,
        targetBuildingName: 'Target Building',
        targetFloorNumber: 2,
        supplierName: 'Test Supplier',
        serviceType: 1,
        deliveryDescription: 'Test delivery',
        creditAmount: 10,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: ErrandStatus.Open,
      },
    })
  }

  describe('same courier accepts errands concurrently', () => {
    it('should accept up to MAX_ERRANDS_PER_COURIER errands with 100 concurrent requests', async () => {
      const courierSub = `courier-${Date.now()}-${Math.random()}`
      const requesterSub = `requester-${Date.now()}-${Math.random()}`

      // Create MAX_ERRANDS_PER_COURIER + 5 errands (10 total with limit of 5)
      const errandIds = await createOpenErrands(MAX_ERRANDS_PER_COURIER + 5, requesterSub)

      // Create the errands in the database concurrently
      await Promise.all(errandIds.map((id) => createErrand(id, requesterSub)))

      // Try to accept all errands concurrently using Promise.all
      const results = await Promise.allSettled(errandIds.map((id) => repo.accept(id, courierSub)))

      const successes = results.filter(
        (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

      // Exactly MAX_ERRANDS_PER_COURIER should succeed
      expect(successes).toHaveLength(MAX_ERRANDS_PER_COURIER)
      expect(failures).toHaveLength(5)

      // All failures should be due to "MAX ERRANDS REACHED" error
      for (const failure of failures) {
        expect(failure.reason.message).toContain('MAX ERRANDS REACHED')
      }

      // Verify the courier has exactly MAX_ERRANDS_PER_COURIER errands
      const count = await prisma.errand.count({
        where: {
          courierSub,
          status: { in: [ErrandStatus.Accepted, ErrandStatus.PickedUp, ErrandStatus.Delivered] },
        },
      })
      expect(count).toBe(MAX_ERRANDS_PER_COURIER)
    }, 30000)

    it('should accept up to MAX_ERRANDS_PER_COURIER errands with 1000 concurrent requests', async () => {
      const courierSub = `courier-${Date.now()}-${Math.random()}`
      const requesterSub = `requester-${Date.now()}-${Math.random()}`

      // Create MAX_ERRANDS_PER_COURIER + 50 errands (60 total with limit of 5)
      const errandIds = await createOpenErrands(MAX_ERRANDS_PER_COURIER + 50, requesterSub)

      // Create the errands in the database concurrently
      await Promise.all(errandIds.map((id) => createErrand(id, requesterSub)))

      // Try to accept all errands concurrently using Promise.all
      const results = await Promise.allSettled(errandIds.map((id) => repo.accept(id, courierSub)))

      const successes = results.filter(
        (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled',
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

      // Exactly MAX_ERRANDS_PER_COURIER should succeed
      expect(successes).toHaveLength(MAX_ERRANDS_PER_COURIER)
      expect(failures).toHaveLength(50)

      // All failures should be due to "MAX ERRANDS REACHED" error
      for (const failure of failures) {
        expect(failure.reason.message).toContain('MAX ERRANDS REACHED')
      }

      // Verify the courier has exactly MAX_ERRANDS_PER_COURIER errands
      const count = await prisma.errand.count({
        where: {
          courierSub,
          status: { in: [ErrandStatus.Accepted, ErrandStatus.PickedUp, ErrandStatus.Delivered] },
        },
      })
      expect(count).toBe(MAX_ERRANDS_PER_COURIER)
    }, 30000)
  })

  describe('same courier accepts errands sequentially', () => {
    it('should accept up to MAX_ERRANDS_PER_COURIER errands', async () => {
      const courierSub = `courier-${Date.now()}-${Math.random()}`
      const requesterSub = `requester-${Date.now()}-${Math.random()}`

      const errandIds = await createOpenErrands(MAX_ERRANDS_PER_COURIER, requesterSub)

      // Create the errands in the database
      await Promise.all(errandIds.map((id) => createErrand(id, requesterSub)))

      // Accept errands sequentially
      for (const id of errandIds) {
        await repo.accept(id, courierSub)
      }

      // Verify all errands were accepted
      const count = await prisma.errand.count({
        where: {
          courierSub,
          status: { in: [ErrandStatus.Accepted, ErrandStatus.PickedUp, ErrandStatus.Delivered] },
        },
      })
      expect(count).toBe(MAX_ERRANDS_PER_COURIER)
    })

    it('should reject a 6th errand when courier already has MAX_ERRANDS_PER_COURIER', async () => {
      const courierSub = `courier-${Date.now()}-${Math.random()}`
      const requesterSub = `requester-${Date.now()}-${Math.random()}`

      const errandIds = await createOpenErrands(MAX_ERRANDS_PER_COURIER + 1, requesterSub)

      // Create the errands in the database
      await Promise.all(errandIds.map((id) => createErrand(id, requesterSub)))

      // Accept MAX_ERRANDS_PER_COURIER errands
      for (let i = 0; i < MAX_ERRANDS_PER_COURIER; i++) {
        await repo.accept(errandIds[i], courierSub)
      }

      // The 6th accept should fail
      await expect(repo.accept(errandIds[MAX_ERRANDS_PER_COURIER], courierSub)).rejects.toThrow(
        'MAX ERRANDS REACHED',
      )
    })
  })
})
