// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-approved durable edit operations and Credit UpdateReservation reconciliation.
// Author review: Pending; see ../../usage-log.md.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient, Prisma } from '../generated/prisma';
import { createOrderSchema, editOrderSchema, isAllowedExpiry } from '../api/dto/orderInput';
import type { createCreditClient, RpcOptions } from '@foc/grpc';
import type { createDirectories } from '../dependencies/directories';
import { classifyCreditError, validateReservation } from '../dependencies/creditValidation';
import type { CommandResult } from './orderCreation';
const active = ['PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED'] as const;
const delays = [5, 15, 45, 135, 135];
async function now(tx: Prisma.TransactionClient) { return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now; }
function operationId(requester: string, order: string, key: string) {
  const hex = createHash('sha256').update(JSON.stringify([requester, order, key])).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function canonical(patch: z.infer<typeof editOrderSchema>) {
  return Object.fromEntries(Object.keys(patch).sort().map(key => [key,
    key === 'expiryTime' ? patch.expiryTime!.toISOString() : patch[key as keyof typeof patch]]));
}

export function createOrderEdits(db: PrismaClient, credit: ReturnType<typeof createCreditClient>, directories: ReturnType<typeof createDirectories>, creditOptions: RpcOptions = {}) {
  async function edit(orderId: string, requesterId: string, key: string, patch: z.infer<typeof editOrderSchema>): Promise<CommandResult> {
    const id = operationId(requesterId, orderId, key);
    const request = canonical(patch);
    const initial = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return { status: 404, error: 'not-found' };
      if (order.requesterId !== requesterId) return { status: 403, error: 'forbidden' };
      const existing = await tx.orderEditOperation.findUnique({ where: { id } });
      if (existing) {
        const stored = existing.proposedChanges as { request: object };
        if (JSON.stringify(Object.entries(stored.request).sort()) !== JSON.stringify(Object.entries(request).sort())) return { status: 409, error: 'conflict' };
        return null;
      }
      const time = await now(tx);
      if (order.status !== 'UNASSIGNED') return { status: 409, error: 'invalid-transition' };
      if (order.expiryTime <= time) return { status: 409, error: 'expired' };
      if (await tx.orderEditOperation.findFirst({ where: { orderId, state: { in: [...active] } } })) return { status: 409, error: 'conflict' };
      const input = createOrderSchema.parse({ supplierId: order.supplierId.toString(), destination: order.destination,
        requestDetails: order.requestDetails, credits: order.credits, expiryTime: order.expiryTime.toISOString(), ...request });
      if (!isAllowedExpiry(input.expiryTime, time)) return { status: 400, error: 'invalid-input' };
      let supplier, opening, reservation;
      try {
        [supplier, opening, reservation] = await Promise.all([
          directories.getSupplier(input.supplierId), directories.isSupplierOpen(input.supplierId), credit.getReservation({ orderId }, creditOptions).then(validateReservation),
        ]);
      } catch (error) { return classifyCreditError(error) === 'rejected' ? { status: 409, error: 'dependency-rejected' } : { status: 503, error: 'dependency-unavailable' }; }
      if (!opening.isOpen || supplier.supplierId !== input.supplierId || !supplier.name.trim() || !supplier.locationDescription.trim()
        || reservation.orderId !== orderId || reservation.requesterId !== requesterId || reservation.amount !== order.credits || reservation.status !== 'RESERVED') {
        return { status: 409, error: 'dependency-rejected' };
      }
      await tx.orderEditOperation.create({ data: { id, orderId, requesterId, expectedVersion: reservation.version,
        targetCredits: input.credits, proposedChanges: { request, target: { supplierId: input.supplierId,
          destination: input.destination, requestDetails: input.requestDetails, credits: input.credits, expiryTime: input.expiryTime.toISOString(),
          pickupStore: supplier.name, pickupLocation: supplier.locationDescription } } as Prisma.InputJsonValue } });
      return null;
    }, { timeout: 15_000 });
    if (initial) return initial;
    try { await recoverOne(id); } catch { /* Durable operation remains recoverable. */ }
    const operation = await db.orderEditOperation.findUniqueOrThrow({ where: { id } });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    if (operation.state === 'FAILED') return { status: 409, error: 'dependency-rejected' };
    return { status: operation.state === 'SUCCEEDED' ? 200 : 202, order };
  }

  async function recoverOne(id: string) {
    const operation = await db.orderEditOperation.findUniqueOrThrow({ where: { id } });
    const work = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${operation.orderId}::uuid FOR UPDATE`;
      const op = await tx.orderEditOperation.findUniqueOrThrow({ where: { id } });
      const time = await now(tx);
      if (!['PENDING', 'PROCESSING'].includes(op.state) || op.attempts >= 6
        || (op.state === 'PENDING' && op.nextRetryAt > time)
        || (op.state === 'PROCESSING' && op.leaseExpiresAt && op.leaseExpiresAt > time)) return null;
      return tx.orderEditOperation.update({ where: { id }, data: {
        state: 'PROCESSING', attempts: { increment: 1 }, leaseExpiresAt: new Date(+time + 30_000),
      } });
    });
    if (!work) return;
    const data = work.proposedChanges as { target: Record<string, string | number> };
    const input = createOrderSchema.parse({ supplierId: data.target.supplierId, destination: data.target.destination,
      requestDetails: data.target.requestDetails, credits: data.target.credits, expiryTime: data.target.expiryTime });
    let confirmed = false;
    let failed = false;
    try {
      const order = await db.order.findUniqueOrThrow({ where: { id: work.orderId } });
      let reservation = validateReservation(await credit.getReservation({ orderId: work.orderId }, creditOptions));
      if (reservation.orderId !== work.orderId || reservation.requesterId !== work.requesterId) throw new Error('Reservation mismatch');
      const time = await now(db);
      if (order.status !== 'UNASSIGNED' || order.expiryTime <= time || input.expiryTime <= time || reservation.status !== 'RESERVED') {
        failed = true;
      } else {
        if (reservation.version === work.expectedVersion && reservation.amount !== work.targetCredits) {
          validateReservation(await credit.updateReservation({ orderId: work.orderId, amount: work.targetCredits, expectedVersion: work.expectedVersion }, creditOptions));
          reservation = validateReservation(await credit.getReservation({ orderId: work.orderId }, creditOptions));
        }
        confirmed = reservation.orderId === work.orderId && reservation.requesterId === work.requesterId
          && reservation.status === 'RESERVED' && reservation.amount === work.targetCredits
          && (reservation.version === work.expectedVersion || reservation.version === work.expectedVersion + 1);
        if (!confirmed) throw new Error('Update outcome uncertain');
      }
    } catch (error) { failed = classifyCreditError(error) === 'rejected'; }
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${work.orderId}::uuid FOR UPDATE`;
      const op = await tx.orderEditOperation.findUniqueOrThrow({ where: { id } });
      if (op.state !== 'PROCESSING' || op.attempts !== work.attempts || op.leaseExpiresAt?.getTime() !== work.leaseExpiresAt?.getTime()) return;
      const order = await tx.order.findUniqueOrThrow({ where: { id: work.orderId } });
      const time = await now(tx);
      if (confirmed && order.status === 'UNASSIGNED' && order.expiryTime > time && input.expiryTime > time) {
        await tx.order.update({ where: { id: work.orderId }, data: { supplierId: BigInt(input.supplierId), destination: input.destination,
          requestDetails: input.requestDetails, credits: input.credits, expiryTime: input.expiryTime,
          pickupStore: String(data.target.pickupStore), pickupLocation: String(data.target.pickupLocation) } });
        await tx.orderEditOperation.update({ where: { id }, data: { state: 'SUCCEEDED', leaseExpiresAt: null, lastError: null } });
      } else {
        const terminal = failed || order.status !== 'UNASSIGNED' || order.expiryTime <= time || input.expiryTime <= time;
        await tx.orderEditOperation.update({ where: { id }, data: {
          state: terminal ? 'FAILED' : work.attempts >= 6 ? 'RECONCILIATION_REQUIRED' : 'PENDING', leaseExpiresAt: null,
          nextRetryAt: new Date(+time + delays[Math.min(work.attempts - 1, 4)] * 1000),
          lastError: terminal ? 'dependency-rejected-or-expired' : work.attempts >= 6 ? 'retry-exhausted' : 'outcome-uncertain',
        } });
      }
    });
  }

  async function recoverBatch(limit = 100) {
    const time = await now(db);
    await db.orderEditOperation.updateMany({ where: { attempts: { gte: 6 }, state: 'PROCESSING', leaseExpiresAt: { lte: time } },
      data: { state: 'RECONCILIATION_REQUIRED', leaseExpiresAt: null, lastError: 'retry-exhausted' } });
    const rows = await db.orderEditOperation.findMany({ where: { attempts: { lt: 6 }, OR: [
      { state: 'PENDING', nextRetryAt: { lte: time } }, { state: 'PROCESSING', leaseExpiresAt: { lte: time } },
    ] },
      orderBy: { nextRetryAt: 'asc' }, take: limit });
    for (const row of rows) { try { await recoverOne(row.id); } catch { console.error('Edit recovery persistence failed'); } }
  }
  return { edit, recoverOne, recoverBatch };
}
