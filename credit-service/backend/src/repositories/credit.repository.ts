/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6 Sol), date: 2026-10-17
 * Scope: Generated implementation of referenceOf, referenceWithType, nonnegativeAmount, findBalance, findHistory, findReservation, allocateInitialCredit, reserveCredit, closeUnreservedCredit, releaseCredit, transferCredit and deleteUserCredit.
 * Author review: Verified correctness and that trasaction atomicity is strictly maintained. Also checked credit error codes and messages.
 */
import { PrismaClient, Prisma } from '@relay/credit-prisma'
import type {
  AllocateInitialCreditCommand,
  CreditBalance,
  DeleteUserCreditCommand,
  ReleaseCreditCommand,
  ReserveCreditRequest,
  ReserveCreditResponse,
  TransactionRecord,
  TransferCreditCommand,
  TransactionReference,
  TransactionType,
} from '@relay/contracts'
import { getEnv } from '../config/env.js'
import { CreditServiceError } from '../types/credit.types.js'

export const prisma = new PrismaClient({
  datasources: { db: { url: getEnv().databaseUrl } },
})

function referenceOf(command: {
  transactionReference: { service: string; id: string; type: string }
}): string {
  const { service, id, type } = command.transactionReference
  if (!service || !id || service.includes(':') || id.includes(':')) {
    throw new Error('Invalid transaction reference.')
  }
  return `${service}:${id}:${type}`
}

type ReferenceIdentity = Pick<TransactionReference, 'service' | 'id'>

function referenceWithType(ref: ReferenceIdentity, type: TransactionType): string {
  return referenceOf({ transactionReference: { ...ref, type } })
}

function nonnegativeAmount(amount: number): Prisma.Decimal {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Credit amount must be nonnegative.')
  return new Prisma.Decimal(amount)
}

export type UserCreditEventOutcome = 'processed' | 'duplicate' | 'out-of-order'

export class CreditRepository {
  async findBalance(userId: string): Promise<CreditBalance | null> {
    const balance = await prisma.creditBalance.findFirst({
      where: { userId, status: 'ACTIVE' },
    })
    return balance
      ? {
          userId: balance.userId,
          availableCredit: balance.availableCredit.toNumber(),
          reserveCredit: balance.reserveCredit.toNumber(),
          lastUpdated: balance.lastUpdated,
        }
      : null
  }

  async findHistory(userId: string, offset = 0): Promise<TransactionRecord[]> {
    const records = await prisma.transactionRecord.findMany({
      where: { OR: [{ senderId: userId }, { receiverId: userId }] },
      orderBy: [{ time: 'desc' }, { reference: 'desc' }],
      skip: offset,
      take: 100,
    })
    return records.map((record: any) => {
      const [service, id] = record.reference.split(':')
      return {
        reference: { service, id, type: record.type },
        time: record.time,
        senderId: record.senderId,
        receiverId: record.receiverId,
        type: record.type,
        amount: record.amount.toNumber(),
      }
    })
  }

  async findReservation(
    ref: ReferenceIdentity,
  ): Promise<{ userId: string; amount: number } | null> {
    const record = await prisma.transactionRecord.findUnique({
      where: { reference: referenceWithType(ref, 'CREDIT_RESERVE') },
    })
    return record ? { userId: record.senderId, amount: record.amount.toNumber() } : null
  }

  async allocateInitialCredit(
    command: AllocateInitialCreditCommand,
  ): Promise<UserCreditEventOutcome> {
    const reference = referenceOf(command)
    if (
      command.transactionReference.type !== 'INITIAL_ALLOCATION' ||
      command.userId !== command.transactionReference.id
    )
      throw new Error('Invalid initial credit allocation command.')
    try {
      return await prisma.$transaction(async (tx) => {
        await this.lockUsers(tx, command.userId)
        if (await tx.transactionRecord.findUnique({ where: { reference } }))
          return 'duplicate' as const
        // A delayed registration event must never recreate a deleted user's balance.
        if (
          await tx.transactionRecord.findUnique({
            where: { reference: referenceWithType(command.transactionReference, 'USER_DELETION') },
          })
        )
          return 'out-of-order' as const
        await tx.creditBalance.create({
          data: { userId: command.userId, availableCredit: 100, reserveCredit: 0 },
        })
        await tx.transactionRecord.create({
          data: {
            reference,
            senderId: 'SYSTEM',
            receiverId: command.userId,
            type: 'INITIAL_ALLOCATION',
            amount: 100,
          },
        })
        return 'processed' as const
      })
    } catch (error) {
      if (
        (error as { code?: string }).code === 'P2002' &&
        (await prisma.transactionRecord.findUnique({ where: { reference } }))
      )
        return 'duplicate'
      throw error
    }
  }

  async reserveCredit(request: ReserveCreditRequest): Promise<ReserveCreditResponse> {
    const reference = referenceOf(request)
    if (request.transactionReference.type !== 'CREDIT_RESERVE' || !request.userId)
      throw new CreditServiceError('INVALID_REQUEST', 'Invalid credit reservation reference.', 400)
    if (!Number.isFinite(request.amount) || request.amount < 0) {
      throw new CreditServiceError(
        'INVALID_CREDIT_AMOUNT',
        'Credit amount must be a nonnegative number.',
        422,
      )
    }
    const amount = new Prisma.Decimal(request.amount)

    try {
      return await prisma.$transaction(async (tx) => {
        await this.lockReference(tx, request.transactionReference)
        await this.lockUsers(tx, request.userId)
        const prior = await tx.transactionRecord.findFirst({
          where: {
            reference: {
              in: [
                reference,
                referenceWithType(request.transactionReference, 'CREDIT_RELEASE'),
                referenceWithType(request.transactionReference, 'CREDIT_TRANSFER'),
              ],
            },
          },
        })
        if (prior) {
          throw new CreditServiceError(
            'TRANSACTION_CONFLICT',
            'Transaction reference has already been used.',
            409,
          )
        }
        const updated = await tx.creditBalance.updateMany({
          where: {
            userId: request.userId,
            status: 'ACTIVE',
            availableCredit: { gte: amount },
          },
          data: { availableCredit: { decrement: amount }, reserveCredit: { increment: amount } },
        })
        if (updated.count !== 1) {
          const balance = await tx.creditBalance.findUnique({ where: { userId: request.userId } })
          if (!balance || balance.status === 'CLOSED')
            throw new CreditServiceError(
              'USER_NOT_FOUND',
              'The user has no credit balance record.',
              404,
            )
          throw new CreditServiceError(
            'INSUFFICIENT_CREDITS',
            'The available credit balance is too low.',
            422,
          )
        }
        await tx.transactionRecord.create({
          data: {
            reference,
            senderId: request.userId,
            receiverId: request.userId,
            type: 'CREDIT_RESERVE',
            amount,
          },
        })
        const balance = await tx.creditBalance.findUniqueOrThrow({
          where: { userId: request.userId },
        })
        return {
          userId: balance.userId,
          availableCredit: balance.availableCredit.toNumber(),
          reserveCredit: balance.reserveCredit.toNumber(),
          lastUpdated: balance.lastUpdated,
          status: 'RESERVE_SUCCESS' as const,
        }
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new CreditServiceError(
          'TRANSACTION_CONFLICT',
          'Transaction reference has already been used.',
          409,
        )
      }
      throw error
    }
  }
  // All operations for one external reference share this lock, including the HTTP reserve.
  private async lockReference(tx: Prisma.TransactionClient, ref: ReferenceIdentity): Promise<void> {
    const key = `${ref.service}:${ref.id}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`
  }

  private async lockUsers(tx: Prisma.TransactionClient, ...userIds: string[]): Promise<void> {
    for (const userId of [...new Set(userIds)].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credit-user:${userId}`})::bigint)`
    }
  }

  async closeUnreservedCredit(ref: TransactionReference, userId: string): Promise<void> {
    if (!userId || ref.type !== 'CREDIT_RELEASE') throw new Error('Invalid transaction reference.')
    const reserveReference = referenceWithType(ref, 'CREDIT_RESERVE')
    const releaseReference = referenceWithType(ref, 'CREDIT_RELEASE')
    const transferReference = referenceWithType(ref, 'CREDIT_TRANSFER')
    await prisma.$transaction(async (tx) => {
      await this.lockReference(tx, ref)
      await this.lockUsers(tx, userId)
      const reservation = await tx.transactionRecord.findUnique({
        where: { reference: reserveReference },
      })
      if (reservation && reservation.senderId !== userId)
        throw new Error('Reservation requester mismatch.')
      if (await tx.transactionRecord.findUnique({ where: { reference: transferReference } }))
        throw new Error('Cannot release credit after transfer.')
      if (await tx.transactionRecord.findUnique({ where: { reference: releaseReference } })) return

      if (!reservation) {
        // Tombstone a failure that arrived before the HTTP reservation; no balance row is touched.
        await tx.transactionRecord.createMany({
          data: [
            {
              reference: reserveReference,
              senderId: userId,
              receiverId: userId,
              type: 'CREDIT_RESERVE',
              amount: 0,
            },
            {
              reference: releaseReference,
              senderId: userId,
              receiverId: userId,
              type: 'CREDIT_RELEASE',
              amount: 0,
            },
          ],
        })
        return
      }

      const amount = reservation.amount
      const updated = await tx.creditBalance.updateMany({
        where: { userId, reserveCredit: { gte: amount } },
        data: { reserveCredit: { decrement: amount }, availableCredit: { increment: amount } },
      })
      if (updated.count !== 1) throw new Error('Insufficient reserved credit for release.')
      await tx.transactionRecord.create({
        data: {
          reference: releaseReference,
          senderId: userId,
          receiverId: userId,
          type: 'CREDIT_RELEASE',
          amount,
        },
      })
    })
  }

  async releaseCredit(command: ReleaseCreditCommand): Promise<void> {
    const reference = referenceOf(command)
    if (command.transactionReference.type !== 'CREDIT_RELEASE' || !command.userId)
      throw new Error('Invalid release credit command.')
    const amount = nonnegativeAmount(command.amount)
    await prisma.$transaction(async (tx) => {
      await this.lockReference(tx, command.transactionReference)
      await this.lockUsers(tx, command.userId)
      const reservation = await tx.transactionRecord.findUnique({
        where: { reference: referenceWithType(command.transactionReference, 'CREDIT_RESERVE') },
      })
      if (!reservation) throw new Error('No prior credit reservation exists.')
      if (reservation.senderId !== command.userId || !reservation.amount.equals(amount))
        throw new Error('Credit release does not match the reservation.')
      const conflicting = await tx.transactionRecord.findUnique({
        where: { reference: referenceWithType(command.transactionReference, 'CREDIT_TRANSFER') },
      })
      if (conflicting) throw new Error('Cannot release credit after transfer.')
      if (await tx.transactionRecord.findUnique({ where: { reference } })) return
      const updated = await tx.creditBalance.updateMany({
        where: { userId: command.userId, reserveCredit: { gte: amount } },
        data: { reserveCredit: { decrement: amount }, availableCredit: { increment: amount } },
      })
      if (updated.count !== 1) throw new Error('Insufficient reserved credit for release.')
      await tx.transactionRecord.create({
        data: {
          reference,
          senderId: command.userId,
          receiverId: command.userId,
          type: 'CREDIT_RELEASE',
          amount,
        },
      })
    })
  }

  async transferCredit(command: TransferCreditCommand): Promise<void> {
    const reference = referenceOf(command)
    if (
      command.transactionReference.type !== 'CREDIT_TRANSFER' ||
      !command.senderId ||
      !command.receiverId ||
      command.senderId === command.receiverId
    )
      throw new Error('Invalid transfer credit command.')
    const amount = nonnegativeAmount(command.amount)
    await prisma.$transaction(async (tx) => {
      await this.lockReference(tx, command.transactionReference)
      await this.lockUsers(tx, command.senderId, command.receiverId)
      const reservation = await tx.transactionRecord.findUnique({
        where: { reference: referenceWithType(command.transactionReference, 'CREDIT_RESERVE') },
      })
      if (!reservation) throw new Error('No prior credit reservation exists.')
      if (reservation.senderId !== command.senderId || !reservation.amount.equals(amount))
        throw new Error('Credit transfer does not match the reservation.')
      const conflicting = await tx.transactionRecord.findUnique({
        where: { reference: referenceWithType(command.transactionReference, 'CREDIT_RELEASE') },
      })
      if (conflicting) throw new Error('Cannot transfer credit after release.')
      const existing = await tx.transactionRecord.findUnique({ where: { reference } })
      if (existing) {
        if (existing.receiverId !== command.receiverId)
          throw new Error('Cannot transfer credit to a different recipient.')
        return
      }
      const debited = await tx.creditBalance.updateMany({
        where: { userId: command.senderId, reserveCredit: { gte: amount } },
        data: { reserveCredit: { decrement: amount } },
      })
      if (debited.count !== 1) throw new Error('Insufficient reserved credit for transfer.')
      const receiver = await tx.creditBalance.findUnique({ where: { userId: command.receiverId } })
      if (!receiver) throw new Error('Credit transfer receiver does not exist.')

      const settlementStatus = receiver.status === 'ACTIVE' ? 'CREDITED' : 'PENDING'
      if (receiver.status === 'ACTIVE') {
        await tx.creditBalance.update({
          where: { userId: command.receiverId },
          data: { availableCredit: { increment: amount } },
        })
      }
      await tx.transactionRecord.create({
        data: {
          reference,
          senderId: command.senderId,
          receiverId: command.receiverId,
          type: 'CREDIT_TRANSFER',
          amount,
        },
      })
      await tx.creditSettlement.create({
        data: {
          reference,
          senderId: command.senderId,
          receiverId: command.receiverId,
          amount,
          status: settlementStatus,
        },
      })
    })
  }

  async deleteUserCredit(command: DeleteUserCreditCommand): Promise<UserCreditEventOutcome> {
    const reference = referenceOf(command)
    if (
      command.transactionReference.type !== 'USER_DELETION' ||
      command.transactionReference.id !== command.userId
    )
      throw new Error('Invalid user deletion command.')
    try {
      return await prisma.$transaction(async (tx) => {
        await this.lockUsers(tx, command.userId)
        if (await tx.transactionRecord.findUnique({ where: { reference } }))
          return 'duplicate' as const
        const balance = await tx.creditBalance.findUnique({ where: { userId: command.userId } })
        await tx.transactionRecord.create({
          data: {
            reference,
            senderId: command.userId,
            receiverId: 'SYSTEM',
            type: 'USER_DELETION',
            amount: balance
              ? balance.availableCredit.plus(balance.reserveCredit)
              : new Prisma.Decimal(0),
          },
        })
        if (balance) {
          await tx.creditBalance.update({
            where: { userId: command.userId },
            data: { status: 'CLOSED' },
          })
          await tx.creditSettlement.updateMany({
            where: { receiverId: command.userId, status: 'CREDITED' },
            data: { status: 'PENDING' },
          })
        }
        return 'processed' as const
      })
    } catch (error) {
      if (
        (error as { code?: string }).code === 'P2002' &&
        (await prisma.transactionRecord.findUnique({ where: { reference } }))
      )
        return 'duplicate'
      throw error
    }
  }

  async checkTables(): Promise<void> {
    await prisma.$transaction([
      prisma.creditBalance.findFirst(),
      prisma.transactionRecord.findFirst(),
      prisma.creditSettlement.findFirst(),
    ])
  }
}
