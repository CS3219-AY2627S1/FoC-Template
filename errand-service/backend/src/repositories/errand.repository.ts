// AI Assistance Disclosure:
// Tool: OpenCode (Qwen3-Coder-Next)
// Date: 2026-10-12
// Scope: Implemented author-defined lifecycle persistence and locks, transactional outbox blocks, and
// Supplier-related errand update/delete methods.
// Author review: Reviewed every output and substantially revised transition ordering and edge-case
// details. Atomicity was implemented by the author.

// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-10-11
// Scope: Generated initial implementation of the Errand Service repository.
// Author review: I validated correctness, edited for domain needs, and debugged as necessary.

import { Prisma, PrismaClient, type Errand as PrismaErrand } from '@relay/errand-prisma'
import { ErrandEventTypes } from '@relay/contracts'
import {
  CreateErrandRequest,
  Errand,
  ErrandLocation,
  ErrandStatus,
  ErrandEventPayload,
  ErrandEventType,
  OperatingHours,
  ServiceType,
  SupplierErrandSummary,
  SupplierErrandViewRequest,
} from '@relay/contracts'

export const MAX_ERRANDS_PER_COURIER = 5

export type ErrandAuditRow = {
  id: string
  requesterSub: string
  courierSub: string | null
  status: ErrandStatus
  creditAmount: number
}
import { endOfSingaporeDay } from '../utils/deadline.js'

async function appendEvent(
  tx: Prisma.TransactionClient,
  event: { eventType: ErrandEventType; payload: ErrandEventPayload },
): Promise<void> {
  await tx.errandEventOutbox.create({
    data: {
      id: crypto.randomUUID(),
      eventType: event.eventType,
      payload: event.payload as unknown as Prisma.InputJsonValue,
    },
  })
}

export class ErrandRepository {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  // ============================================================================
  // Outbox/Event methods
  // ============================================================================

  async addPendingErrand(requesterSub: string): Promise<string> {
    const id = crypto.randomUUID()
    await this.prisma.pendingErrand.create({ data: { id, requesterSub } })
    return id
  }

  async deletePendingErrand(id: string): Promise<void> {
    await this.prisma.pendingErrand.deleteMany({
      where: { id },
    })
  }

  async publishCreationFailedEvent(id: string, requesterSub: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await appendEvent(tx, {
        eventType: ErrandEventTypes.ERRAND_CREATION_FAILED,
        payload: { errandId: id, actorType: 'system', requesterSub },
      })
    })
  }

  async createErrand(
    id: string,
    requesterSub: string,
    request: CreateErrandRequest,
  ): Promise<Errand> {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.pendingErrand.findUnique({ where: { id } })
      if (!pending || pending.requesterSub !== requesterSub) {
        throw new Error('Pending errand was already recovered.')
      }
      const row = await tx.errand.create({
        data: {
          id,
          requesterSub,
          supplierId: request.supplierDetails.supplierId,
          name: request.name,
          pickupLat: request.pickupLocation.lat,
          pickupLng: request.pickupLocation.lng,
          pickupBuildingName: request.pickupLocation.buildingName,
          pickupFloorNumber: request.pickupLocation.floorNumber,
          targetLat: request.targetLocation.lat,
          targetLng: request.targetLocation.lng,
          targetBuildingName: request.targetLocation.buildingName,
          targetFloorNumber: request.targetLocation.floorNumber,
          supplierName: request.supplierDetails.supplierName,
          serviceType: request.supplierDetails.serviceType,
          deliveryDescription: request.deliveryDetails.description,
          deliveryInstructions: request.deliveryDetails.instructions,
          creditAmount: request.creditAmount,
          ...(request.startAt ? { startAt: new Date(request.startAt) } : {}),
          expiresAt: request.expiresAt ? new Date(request.expiresAt) : defaultExpiry(),
        },
      })
      await tx.pendingErrand.delete({ where: { id } })
      await appendEvent(tx, {
        eventType: ErrandEventTypes.ERRAND_CREATED,
        payload: {
          errandId: id,
          requesterSub,
          supplierId: row.supplierId,
          creditAmount: row.creditAmount,
          expiresAt: row.expiresAt.toISOString(),
          recipientSubs: [row.requesterSub],
        },
      })
      return toContract(row)
    })
  }

  async recoverExpiredPending(cutoff = new Date(Date.now() - 30_000)): Promise<number> {
    const rows = await this.prisma.pendingErrand.findMany({
      where: { createdAt: { lt: cutoff } },
      take: 100,
      orderBy: { createdAt: 'asc' },
    })
    let count = 0
    for (const row of rows) {
      await this.prisma.$transaction(async (tx) => {
        const removed = await tx.pendingErrand.deleteMany({
          where: { id: row.id, createdAt: { lt: cutoff } },
        })
        if (!removed.count) return
        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_CREATION_FAILED,
          payload: {
            errandId: row.id,
            actorType: 'system',
            requesterSub: row.requesterSub,
          },
        })
        count++
      })
    }
    return count
  }

  async unpublishedEvents() {
    return this.prisma.errandEventOutbox.findMany({
      where: { publishedAt: null },
      take: 100,
      orderBy: { createdAt: 'asc' },
    })
  }

  async markEventPublished(id: string): Promise<void> {
    await this.prisma.errandEventOutbox.updateMany({
      where: { id, publishedAt: null },
      data: { publishedAt: new Date() },
    })
  }

  async deleteOldPublishedEvents(cutoff: Date): Promise<number> {
    const result = await this.prisma.errandEventOutbox.deleteMany({
      where: { publishedAt: { lt: cutoff } },
    })
    return result.count
  }

  // ============================================================================
  // Query methods
  // ============================================================================

  async findVisibleById(errandId: string, userSub: string): Promise<Errand | null> {
    const row = await this.prisma.errand.findFirst({
      where: {
        id: errandId,
        OR: [{ requesterSub: userSub }, { courierSub: userSub }],
        status: { not: ErrandStatus.Deleted },
      },
    })
    return row ? toContract(row) : null
  }

  async findRequesterForAcceptance(errandId: string): Promise<string | null> {
    const row = await this.prisma.errand.findFirst({
      where: { id: errandId, status: { not: ErrandStatus.Deleted } },
      select: { requesterSub: true },
    })
    return row?.requesterSub ?? null
  }

  async listOwnedBy(requesterSub: string): Promise<Errand[]> {
    const rows = await this.prisma.errand.findMany({
      where: {
        requesterSub,
        status: { not: ErrandStatus.Deleted },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })
    return rows.map(toContract)
  }

  async listVisibleTo(userSub: string): Promise<Errand[]> {
    const rows = await this.prisma.errand.findMany({
      where: {
        OR: [{ requesterSub: userSub }, { courierSub: userSub }],
        status: { not: ErrandStatus.Deleted },
      },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toContract)
  }

  async listBySupplier(supplierId: string): Promise<Errand[]> {
    const rows = await this.prisma.errand.findMany({
      where: { supplierId, status: { not: ErrandStatus.Deleted } },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toContract)
  }

  async listOpenBySupplier(supplierId: string): Promise<Errand[]> {
    const rows = await this.prisma.errand.findMany({
      where: { supplierId, status: ErrandStatus.Open, courierSub: null },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toContract)
  }

  async listSupplierView(
    request: SupplierErrandViewRequest & { viewerSub: string },
  ): Promise<SupplierErrandSummary[]> {
    const where: Prisma.ErrandWhereInput =
      request.scope === 'explore'
        ? {
            status: ErrandStatus.Open,
            requesterSub: { not: request.viewerSub },
            ...(request.supplierId ? { supplierId: request.supplierId } : {}),
            expiresAt: { gt: new Date() },
          }
        : {
            requesterSub: request.viewerSub,
            status: { not: ErrandStatus.Deleted },
            ...(request.supplierId ? { supplierId: request.supplierId } : {}),
          }

    const rows = await this.prisma.errand.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toSupplierSummary)
  }

  // ============================================================================
  // State transitions
  // ============================================================================

  async listRequesterSubjects(): Promise<string[]> {
    const rows = await this.prisma.errand.findMany({
      distinct: ['requesterSub'],
      select: { requesterSub: true },
      orderBy: { requesterSub: 'asc' },
    })
    return rows.map((row) => row.requesterSub)
  }

  async listErrandsForAudit(requesterSub: string): Promise<ErrandAuditRow[]> {
    const rows = await this.prisma.errand.findMany({
      where: { requesterSub },
      select: { id: true, requesterSub: true, courierSub: true, status: true, creditAmount: true },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map((row) => ({ ...row, status: row.status as ErrandStatus }))
  }

  /**
   * Safe audit remediation for legacy OPEN errands only. Assigned errands are
   * intentionally left untouched unless an operator explicitly resolves them.
   */
  async remediateProfilelessOpenErrands(requesterSub: string): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.errand.findMany({
        where: { requesterSub, status: ErrandStatus.Open },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      const remediated: string[] = []
      for (const row of rows) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`errand:${row.id}`})::bigint)
        `
        const updated = await tx.errand.updateMany({
          where: { id: row.id, requesterSub, status: ErrandStatus.Open },
          data: { status: ErrandStatus.Cancelled },
        })
        if (!updated.count) continue
        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_CANCELLED,
          payload: {
            errandId: row.id,
            errandStatus: ErrandStatus.Cancelled,
            previousStatus: ErrandStatus.Open,
            actorType: 'system',
            requesterSub,
            recipientSubs: [requesterSub],
            metadata: { remediation: 'profileless-requester-audit' },
          },
        })
        remediated.push(row.id)
      }
      return remediated
    })
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }

  /**
   * Applies requester deletion without involving the HTTP actor flow.
   * Each errand is locked and re-read so a concurrent accept/delivery cannot
   * overwrite the deletion transition.
   */
  async handleRequesterDeleted(requesterSub: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const activeStatuses: ErrandStatus[] = [
        ErrandStatus.Open,
        ErrandStatus.Accepted,
        ErrandStatus.PickedUp,
        ErrandStatus.Delivered,
      ]
      const candidates = await tx.errand.findMany({
        where: {
          requesterSub,
          status: { in: activeStatuses },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      let changedCount = 0

      for (const candidate of candidates) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`errand:${candidate.id}`})::bigint)
        `
        const current = await tx.errand.findUnique({ where: { id: candidate.id } })
        if (
          !current ||
          current.requesterSub !== requesterSub ||
          !activeStatuses.includes(current.status as ErrandStatus)
        ) {
          continue
        }

        const settlesCourier = current.status !== ErrandStatus.Open
        const nextStatus = settlesCourier ? ErrandStatus.Confirmed : ErrandStatus.Cancelled
        const updated = await tx.errand.update({
          where: { id: current.id },
          data: { status: nextStatus },
        })
        await appendEvent(tx, {
          eventType: settlesCourier
            ? ErrandEventTypes.ERRAND_COMPLETED
            : ErrandEventTypes.ERRAND_CANCELLED,
          payload: {
            errandId: updated.id,
            errandStatus: nextStatus,
            previousStatus: current.status as ErrandStatus,
            actorType: 'system',
            requesterSub: updated.requesterSub,
            ...(settlesCourier && updated.courierSub
              ? { courierSub: updated.courierSub, recipientSubs: [updated.courierSub] }
              : { recipientSubs: [updated.requesterSub] }),
          },
        })
        changedCount += 1
      }

      return changedCount
    })
  }

  /**
   * Applies courier deletion without involving the HTTP actor flow.
   * ACCEPTED and PICKED_UP errands are reopened while still valid. Expired
   * ones release their reservation through ErrandExpired. DELIVERED errands
   * are confirmed and retain the deleted courier subject so Credit Service can
   * route the payment to pending settlement.
   */
  async handleCourierDeleted(courierSub: string, now = new Date()): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const activeStatuses: ErrandStatus[] = [
        ErrandStatus.Accepted,
        ErrandStatus.PickedUp,
        ErrandStatus.Delivered,
      ]
      const candidates = await tx.errand.findMany({
        where: { courierSub, status: { in: activeStatuses } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      let changedCount = 0

      for (const candidate of candidates) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${`errand:${candidate.id}`})::bigint)
        `
        const current = await tx.errand.findUnique({ where: { id: candidate.id } })
        if (
          !current ||
          current.courierSub !== courierSub ||
          !activeStatuses.includes(current.status as ErrandStatus)
        ) {
          continue
        }

        if (current.status === ErrandStatus.Delivered) {
          const updated = await tx.errand.update({
            where: { id: current.id },
            data: { status: ErrandStatus.Confirmed },
          })
          await appendEvent(tx, {
            eventType: ErrandEventTypes.ERRAND_COMPLETED,
            payload: {
              errandId: updated.id,
              errandStatus: ErrandStatus.Confirmed,
              previousStatus: ErrandStatus.Delivered,
              actorType: 'system',
              requesterSub: updated.requesterSub,
              courierSub,
              recipientSubs: [courierSub],
              metadata: { reason: 'courier-deleted' },
            },
          })
          changedCount += 1
          continue
        }

        const isExpired = current.expiresAt <= now
        const nextStatus = isExpired ? ErrandStatus.Expired : ErrandStatus.Open
        const updated = await tx.errand.update({
          where: { id: current.id },
          data: { courierSub: null, status: nextStatus },
        })

        if (isExpired) {
          await appendEvent(tx, {
            eventType: ErrandEventTypes.ERRAND_EXPIRED,
            payload: {
              errandId: updated.id,
              errandStatus: ErrandStatus.Expired,
              previousStatus: current.status as ErrandStatus,
              actorType: 'system',
              requesterSub: updated.requesterSub,
              recipientSubs: [updated.requesterSub],
              metadata: { reason: 'courier-deleted' },
            },
          })
        } else {
          await appendEvent(tx, {
            eventType: ErrandEventTypes.ERRAND_STATUS_CHANGED,
            payload: {
              errandId: updated.id,
              errandStatus: ErrandStatus.Open,
              previousStatus: current.status as ErrandStatus,
              actorType: 'system',
              requesterSub: updated.requesterSub,
              recipientSubs: [updated.requesterSub],
              metadata: { reason: 'courier-deleted' },
            },
          })
        }
        changedCount += 1
      }

      return changedCount
    })
  }

  async accept(errandId: string, actorSub: string): Promise<Errand> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`courier:${actorSub}`})::bigint)
      `
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${`errand:${errandId}`})::bigint)
      `

      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT FOUND')
      }

      if (errand.status === ErrandStatus.Accepted) {
        throw new Error('ERRAND ALREADY ACCEPTED')
      }

      if (errand.status !== ErrandStatus.Open) {
        throw new Error('ERRAND NOT IN OPEN')
      }

      if (errand.expiresAt <= new Date()) {
        throw new Error('ERRAND ALREADY EXPIRED')
      }

      if (errand.requesterSub === actorSub) {
        throw new Error('REQUESTER CANNOT ACCEPT OWN ERRAND')
      }

      const currentCount = await tx.errand.count({
        where: {
          courierSub: actorSub,
          status: { in: [ErrandStatus.Accepted, ErrandStatus.PickedUp, ErrandStatus.Delivered] },
        },
      })

      if (currentCount >= MAX_ERRANDS_PER_COURIER) {
        throw new Error('MAX ERRANDS REACHED')
      }

      let updated: PrismaErrand
      try {
        updated = await tx.errand.update({
          where: { id: errandId, status: ErrandStatus.Open, courierSub: null },
          data: {
            courierSub: actorSub,
            status: ErrandStatus.Accepted,
          },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
          throw new Error('ERRAND ALREADY ACCEPTED')
        }
        throw error
      }

      await appendEvent(tx, {
        eventType: ErrandEventTypes.ERRAND_STATUS_CHANGED,
        payload: {
          errandId,
          errandStatus: ErrandStatus.Accepted,
          previousStatus: ErrandStatus.Open,
          actorSub: actorSub,
          actorType: 'user',
          requesterSub: updated.requesterSub,
          courierSub: updated.courierSub!,
          recipientSubs: [updated.requesterSub],
        },
      })

      return updated
    })

    return toContract(result)
  }

  async cancel(errandId: string, actorSub: string): Promise<Errand> {
    return this.prisma.$transaction(async (tx) => {
      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT FOUND')
      }

      if (errand.status === ErrandStatus.Cancelled) {
        throw new Error('ERRAND ALREADY CANCELLED')
      }

      if (errand.status !== ErrandStatus.Open) {
        throw new Error('ERRAND NOT IN OPEN')
      }

      if (errand.requesterSub !== actorSub) {
        throw new Error('ONLY REQUESTER CAN CANCEL')
      }

      try {
        const updated = await tx.errand.update({
          where: { id: errandId, status: ErrandStatus.Open },
          data: { status: ErrandStatus.Cancelled },
        })

        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_CANCELLED,
          payload: {
            errandId,
            errandStatus: ErrandStatus.Cancelled,
            previousStatus: ErrandStatus.Open,
            actorSub,
            actorType: 'user',
            requesterSub: updated.requesterSub,
            recipientSubs: [updated.requesterSub],
          },
        })

        return toContract(updated)
      } catch (error) {
        if (isUpdateUnsuccessful(error)) {
          throw new Error('ERRAND NOT IN OPEN')
        }
        throw error
      }
    })
  }

  async pickUp(errandId: string, actorSub: string): Promise<Errand> {
    return this.prisma.$transaction(async (tx) => {
      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT FOUND')
      }

      if (errand.status === ErrandStatus.PickedUp) {
        throw new Error('ERRAND ALREADY PICKED UP')
      }

      if (errand.status !== ErrandStatus.Accepted) {
        throw new Error('ERRAND NOT IN ACCEPTED')
      }

      if (errand.courierSub !== actorSub) {
        throw new Error('ONLY COURIER CAN PICK UP')
      }

      try {
        const updated = await tx.errand.update({
          where: { id: errandId, status: ErrandStatus.Accepted },
          data: { status: ErrandStatus.PickedUp },
        })

        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_STATUS_CHANGED,
          payload: {
            errandId,
            errandStatus: ErrandStatus.PickedUp,
            previousStatus: ErrandStatus.Accepted,
            actorSub,
            actorType: 'user',
            requesterSub: updated.requesterSub,
            courierSub: updated.courierSub!,
            recipientSubs: [updated.requesterSub],
          },
        })

        return toContract(updated)
      } catch (error) {
        if (isUpdateUnsuccessful(error)) {
          throw new Error('ERRAND NOT IN ACCEPTED')
        }
        throw error
      }
    })
  }

  async deliver(errandId: string, actorSub: string): Promise<Errand> {
    return this.prisma.$transaction(async (tx) => {
      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT FOUND')
      }

      if (errand.status === ErrandStatus.Delivered) {
        throw new Error('ERRAND ALREADY DELIVERED')
      }

      if (errand.status !== ErrandStatus.PickedUp) {
        throw new Error('ERRAND NOT IN PICKED_UP')
      }

      if (errand.courierSub !== actorSub) {
        throw new Error('ONLY COURIER CAN DELIVER')
      }

      const deliveredAt = new Date()

      try {
        const updated = await tx.errand.update({
          where: { id: errandId, status: ErrandStatus.PickedUp },
          data: {
            status: ErrandStatus.Delivered,
            confirmationDeadline: endOfSingaporeDay(deliveredAt),
          },
        })

        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_STATUS_CHANGED,
          payload: {
            errandId,
            errandStatus: ErrandStatus.Delivered,
            previousStatus: ErrandStatus.PickedUp,
            actorSub,
            actorType: 'user',
            requesterSub: updated.requesterSub,
            courierSub: updated.courierSub!,
            recipientSubs: [updated.requesterSub],
          },
        })

        return toContract(updated)
      } catch (error) {
        if (isUpdateUnsuccessful(error)) {
          throw new Error('ERRAND NOT IN PICKED_UP')
        }
        throw error
      }
    })
  }

  async confirm(errandId: string, actorSub: string): Promise<Errand> {
    return this.prisma.$transaction(async (tx) => {
      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT IN FOUND')
      }

      if (errand.status === ErrandStatus.Confirmed) {
        throw new Error('ERRAND ALREADY CONFIRMED')
      }

      if (errand.status !== ErrandStatus.Delivered) {
        throw new Error('ERRAND NOT IN DELIVERED')
      }

      if (errand.requesterSub !== actorSub) {
        throw new Error('ONLY REQUESTER CAN CONFIRM')
      }

      try {
        const updated = await tx.errand.update({
          where: { id: errandId, status: ErrandStatus.Delivered, courierSub: { not: null } },
          data: { status: ErrandStatus.Confirmed },
        })

        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_COMPLETED,
          payload: {
            errandId,
            errandStatus: ErrandStatus.Confirmed,
            previousStatus: ErrandStatus.Delivered,
            actorSub,
            actorType: 'user',
            requesterSub: updated.requesterSub,
            courierSub: updated.courierSub!,
            recipientSubs: [updated.courierSub!],
          },
        })

        return toContract(updated)
      } catch (error) {
        if (isUpdateUnsuccessful(error)) {
          throw new Error('ERRAND NOT IN DELIVERED')
        }
        throw error
      }
    })
  }

  async drop(errandId: string, actorSub: string): Promise<Errand> {
    return this.prisma.$transaction(async (tx) => {
      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT FOUND')
      }

      if (errand.status !== ErrandStatus.Accepted) {
        throw new Error('ERRAND NOT IN ACCEPTED')
      }

      if (errand.courierSub !== actorSub) {
        throw new Error('ONLY COURIER CAN DROP')
      }

      // Determine status based on expiry
      const now = new Date()
      const isExpired = errand.expiresAt && new Date(errand.expiresAt) <= now
      const newStatus = isExpired ? ErrandStatus.Expired : ErrandStatus.Open

      try {
        const updated = await tx.errand.update({
          where: { id: errandId, status: ErrandStatus.Accepted, courierSub: actorSub },
          data: { courierSub: null, status: newStatus },
        })

        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_STATUS_CHANGED,
          payload: {
            errandId,
            errandStatus: ErrandStatus.Open,
            previousStatus: ErrandStatus.Accepted,
            actorSub,
            actorType: 'user',
            requesterSub: updated.requesterSub,
            courierSub: updated.courierSub!,
            recipientSubs: [updated.requesterSub],
          },
        })

        if (newStatus === ErrandStatus.Expired) {
          await appendEvent(tx, {
            eventType: ErrandEventTypes.ERRAND_EXPIRED,
            payload: {
              errandId,
              errandStatus: ErrandStatus.Expired,
              previousStatus: ErrandStatus.Accepted,
              actorType: 'system',
              requesterSub: updated.requesterSub,
              courierSub: updated.courierSub!,
              recipientSubs: [updated.requesterSub],
            },
          })
        }

        return toContract(updated)
      } catch (error) {
        if (isUpdateUnsuccessful(error)) {
          throw new Error('ERRAND NOT IN ACCEPTED')
        }
        throw error
      }
    })
  }

  async delete(errandId: string, actorSub: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const errand = await tx.errand.findFirst({
        where: {
          id: errandId,
        },
      })

      if (!errand) {
        throw new Error('ERRAND NOT FOUND')
      }

      if (errand.status === ErrandStatus.Deleted) {
        throw new Error('ERRAND ALREADY DELETED')
      }

      if (
        errand.status !== ErrandStatus.Cancelled &&
        errand.status !== ErrandStatus.Expired &&
        errand.status !== ErrandStatus.Confirmed
      ) {
        throw new Error('ERRAND NOT IN TERMINAL')
      }

      if (errand.requesterSub !== actorSub) {
        throw new Error('ONLY REQUESTER CAN DELETE')
      }

      try {
        const updated = await tx.errand.update({
          where: {
            id: errandId,
            status: { in: [ErrandStatus.Cancelled, ErrandStatus.Expired, ErrandStatus.Confirmed] },
          },
          data: { status: ErrandStatus.Deleted },
        })
        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_DELETED,
          payload: {
            errandId,
            errandStatus: ErrandStatus.Deleted,
            previousStatus: errand.status,
            actorSub,
            actorType: 'user',
            requesterSub: updated.requesterSub,
            courierSub: updated.courierSub!,
            recipientSubs: [updated.courierSub!],
          },
        })
      } catch (error) {
        if (isUpdateUnsuccessful(error)) {
          throw new Error('ERRAND NOT IN TERMINAL')
        }
        throw error
      }
    })
  }

  async deleteOpenOrAcceptedErrandsBySupplier(
    supplierId: string,
  ): Promise<{ deletedErrandIds: string[] }> {
    const result = { deletedErrandIds: [] as string[] }

    await this.prisma.$transaction(async (tx) => {
      // This findMany is necessary to get the IDs of the errands that will be deleted,
      // since updateMany does not return the updated rows
      const errands = await tx.errand.findMany({
        where: {
          supplierId,
          status: { in: [ErrandStatus.Open, ErrandStatus.Accepted] },
        },
      })

      if (errands.length === 0) {
        return
      }

      const updateResult = await tx.errand.updateMany({
        where: {
          supplierId,
          status: { in: [ErrandStatus.Open, ErrandStatus.Accepted] },
        },
        data: { status: ErrandStatus.Deleted },
      })

      const deletedErrandIds = errands.slice(0, updateResult.count).map((e) => e.id)

      for (const errandId of deletedErrandIds) {
        const errand = errands.find((e) => e.id === errandId)
        if (errand) {
          await appendEvent(tx, {
            eventType: ErrandEventTypes.ERRAND_DELETED,
            payload: {
              errandId: errand.id,
              errandStatus: ErrandStatus.Deleted,
              previousStatus: errand.status,
              actorType: 'system',
              requesterSub: errand.requesterSub,
              courierSub: errand.courierSub!,
              recipientSubs: [errand.requesterSub, errand.courierSub!],
            },
          })
        }
      }

      result.deletedErrandIds = deletedErrandIds
      return
    })

    return result
  }

  async updateErrandsBySupplier(
    supplierId: string,
    updates: Partial<{
      name: string
      location: ErrandLocation
      operatingHours: OperatingHours
      isOperational: boolean
      serviceTypes: ServiceType[]
    }>,
  ): Promise<{ deletedErrandIds: string[] }> {
    const result = { deletedErrandIds: [] as string[] }

    await this.prisma.$transaction(async (tx) => {
      // Only update OPEN and ACCEPTED errands
      const rows = await tx.errand.findMany({
        where: { supplierId, status: { in: [ErrandStatus.Open, ErrandStatus.Accepted] } },
      })

      const updatedRows = await Promise.all(
        rows.map(async (row: any) => {
          const changes: any = { updatedAt: new Date() }

          if (updates.name !== undefined) {
            changes.supplierName = updates.name
          }

          if (updates.location) {
            changes.pickupLat = updates.location.lat
            changes.pickupLng = updates.location.lng
            if (updates.location.buildingName !== undefined) {
              changes.pickupBuildingName = updates.location.buildingName
            }
            if (updates.location.floorNumber !== undefined) {
              changes.pickupFloorNumber = updates.location.floorNumber
            }
          }

          return await tx.errand.update({
            where: { id: row.id },
            data: changes,
          })
        }),
      )

      result.deletedErrandIds = updatedRows.map(toContract).map((e) => e.id)

      return
    })

    return result
  }

  // ============================================================================
  // Background tasks
  // ============================================================================

  async expireOpenErrands(now = new Date()): Promise<number> {
    const rows = await this.prisma.errand.findMany({
      where: { status: ErrandStatus.Open, expiresAt: { lte: now } },
      select: { id: true, requesterSub: true },
    })
    let count = 0
    for (const row of rows) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.errand.updateMany({
          where: { id: row.id, status: ErrandStatus.Open, expiresAt: { lte: now } },
          data: { status: ErrandStatus.Expired },
        })
        if (!changed.count) return
        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_EXPIRED,
          payload: {
            errandId: row.id,
            errandStatus: ErrandStatus.Expired,
            previousStatus: ErrandStatus.Open,
            actorType: 'system',
            requesterSub: row.requesterSub,
            recipientSubs: [row.requesterSub],
          },
        })

        count++
      })
    }
    return count
  }

  async confirmDeliveredErrands(now = new Date()): Promise<number> {
    const rows = await this.prisma.errand.findMany({
      where: {
        status: ErrandStatus.Delivered,
        confirmationDeadline: { lte: now },
        courierSub: { not: null },
      },
      select: { id: true },
    })
    let count = 0

    for (const row of rows) {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.errand.updateMany({
          where: {
            id: row.id,
            status: ErrandStatus.Delivered,
            confirmationDeadline: { lte: now },
            courierSub: { not: null },
          },
          data: { status: ErrandStatus.Confirmed },
        })
        if (!changed.count) return

        const confirmed = await tx.errand.findUniqueOrThrow({ where: { id: row.id } })
        await appendEvent(tx, {
          eventType: ErrandEventTypes.ERRAND_COMPLETED,
          payload: {
            errandId: confirmed.id,
            errandStatus: ErrandStatus.Confirmed,
            previousStatus: ErrandStatus.Delivered,
            actorType: 'system',
            requesterSub: confirmed.requesterSub,
            courierSub: confirmed.courierSub!,
            recipientSubs: [confirmed.courierSub!],
          },
        })

        count++
      })
    }

    return count
  }
}

// ============================================================================`
// Helper functions
// ============================================================================

function isUpdateUnsuccessful(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
}

function defaultExpiry(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000)
}

function toContract(row: any): Errand {
  return {
    id: row.id,
    name: row.name,
    requesterSub: row.requesterSub,
    courierSub: row.courierSub,
    courierProfile: null,
    supplierDetails: {
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      serviceType: row.serviceType,
    },
    pickupLocation: {
      lat: row.pickupLat,
      lng: row.pickupLng,
      buildingName: row.pickupBuildingName,
      floorNumber: row.pickupFloorNumber,
    },
    targetLocation: {
      lat: row.targetLat,
      lng: row.targetLng,
      buildingName: row.targetBuildingName,
      floorNumber: row.targetFloorNumber,
    },
    deliveryDetails: {
      description: row.deliveryDescription,
      ...(row.deliveryInstructions ? { instructions: row.deliveryInstructions } : {}),
    },
    creditAmount: row.creditAmount,
    status: row.status as ErrandStatus,
    startAt: row.startAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    confirmationDeadline: row.confirmationDeadline?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toSupplierSummary(row: PrismaErrand): SupplierErrandSummary {
  const errand = toContract(row)
  return errand
}
