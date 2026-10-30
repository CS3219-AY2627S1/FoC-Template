// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-approved durable creation, same-key replay, recovery and compensation.
// Author review: Pending; see ../../usage-log.md.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient, Prisma, Order } from '../generated/prisma';
import { createOrderSchema, isAllowedExpiry } from '../api/dto/orderInput';
import type { createCreditClient, RpcOptions } from '@foc/grpc';
import type { createDirectories } from '../dependencies/directories';
import { classifyCreditError, validateReservation, validateBalance } from '../dependencies/creditValidation';
import { status as rpcStatus } from '@grpc/grpc-js';

export type CommandResult = { status: number; order?: Order; creationId?: string; error?: string; state?: string };
const delays = [5, 15, 45, 135, 135];
async function now(tx: Prisma.TransactionClient) {
  return (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
}
function canonical(input: z.infer<typeof createOrderSchema>) {
  return { supplierId: input.supplierId, destination: input.destination, requestDetails: input.requestDetails,
    credits: input.credits, expiryTime: input.expiryTime.toISOString() };
}
function fingerprint(input: z.infer<typeof createOrderSchema>) {
  return createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}
function rpcCode(error: unknown) { return (error as { code?: number } | null)?.code; }

export function createOrderCreation(db: PrismaClient, credit: ReturnType<typeof createCreditClient>, directories: ReturnType<typeof createDirectories>, creditOptions: RpcOptions = {}) {
  async function result(id: string): Promise<CommandResult> {
    const creation = await db.orderCreation.findUniqueOrThrow({ where: { orderId: id }, include: { order: true } });
    if (creation.order) return { status: 200, order: creation.order };
    if (creation.state === 'FAILED') return { status: 409, error: 'dependency-rejected', creationId: id };
    return { status: 202, creationId: id, state: 'PENDING' };
  }

  async function submit(requesterId: string, key: string, input: z.infer<typeof createOrderSchema>): Promise<CommandResult> {
    const hash = fingerprint(input);
    let creation = await db.orderCreation.findUnique({ where: { requesterId_idempotencyKey: { requesterId, idempotencyKey: key } } });
    let created = false;
    if (!creation) {
      let profile, supplier, opening;
      try {
        [profile, supplier, opening] = await Promise.all([
          directories.getRequester(requesterId), directories.getSupplier(input.supplierId), directories.isSupplierOpen(input.supplierId),
        ]);
      } catch (error) {
        return { status: rpcCode(error) === rpcStatus.NOT_FOUND || rpcCode(error) === rpcStatus.INVALID_ARGUMENT ? 409 : 503,
          error: rpcCode(error) === rpcStatus.NOT_FOUND || rpcCode(error) === rpcStatus.INVALID_ARGUMENT ? 'dependency-rejected' : 'dependency-unavailable' };
      }
      if (profile.userId !== requesterId || supplier.supplierId !== input.supplierId || !opening.isOpen
        || !supplier.name.trim()) return { status: 409, error: 'dependency-rejected' };
      const requesterName = [profile.firstName, profile.lastName].filter((s) => s.trim()).join(' ') || profile.username;
      if (!requesterName.trim()) return { status: 409, error: 'dependency-rejected' };
      try {
        creation = await db.$transaction(async (tx) => {
          if (!isAllowedExpiry(input.expiryTime, await now(tx))) return null;
          const row = await tx.orderCreation.create({ data: { orderId: randomUUID(), requesterId, idempotencyKey: key,
            requestFingerprint: hash, payload: { ...canonical(input), requesterName, pickupStore: supplier.name,
              pickupLocation: supplier.locationDescription } } });
          await tx.creditOperation.create({ data: { orderId: row.orderId, type: 'RESERVE', payload: { requesterId, amount: input.credits } } });
          return row;
        });
        if (!creation) return { status: 400, error: 'invalid-input' };
        created = true;
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        creation = await db.orderCreation.findUniqueOrThrow({ where: { requesterId_idempotencyKey: { requesterId, idempotencyKey: key } } });
      }
    }
    if (creation.requestFingerprint !== hash) return { status: 409, error: 'conflict' };
    if (creation.state === 'PENDING' || creation.state === 'COMPENSATING') {
      try { await recoverOne(creation.orderId); } catch { return { status: 202, creationId: creation.orderId, state: 'PENDING' }; }
    }
    const response = await result(creation.orderId);
    return { ...response, status: created && response.order ? 201 : response.status };
  }

  async function recoverOne(id: string) {
    const work = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "orderId" FROM "OrderCreation" WHERE "orderId" = ${id}::uuid FOR UPDATE`;
      const row = await tx.orderCreation.findUnique({ where: { orderId: id } });
      if (!row || !['PENDING', 'COMPENSATING'].includes(row.state)) return null;
      const reserve = await tx.creditOperation.findUniqueOrThrow({ where: { orderId_type: { orderId: id, type: 'RESERVE' } } });
      const operation = row.state === 'COMPENSATING' ? await tx.creditOperation.upsert({
        where: { orderId_type: { orderId: id, type: 'REFUND' } }, create: { orderId: id, type: 'REFUND', payload: {} }, update: {},
      }) : reserve;
      const time = await now(tx);
      if (operation.attempts >= 6 || operation.state === 'PERMANENTLY_FAILED' || operation.state === 'SUCCEEDED') return null;
      if (operation.state === 'PROCESSING' && operation.leaseExpiresAt && operation.leaseExpiresAt > time) return null;
      if (operation.nextRetryAt > time && operation.state !== 'PROCESSING') return null;
      const leased = await tx.creditOperation.update({ where: { id: operation.id }, data: {
        attempts: { increment: 1 }, state: 'PROCESSING', leaseExpiresAt: new Date(+time + 30_000),
      } });
      return { row, operation: leased, reserveAttempts: reserve.attempts };
    });
    if (!work) return;
    const data = work.row.payload as Record<string, string | number>;
    const input = createOrderSchema.parse({ supplierId: data.supplierId, destination: data.destination,
      requestDetails: data.requestDetails, credits: data.credits, expiryTime: data.expiryTime });
    let failure: 'rejected' | 'uncertain' | 'unavailable' | undefined;
    let confirmed = false;
    let compensated = false;
    let expiry = false;
    let supplierRejected = false;
    try {
      let receipt;
      try { receipt = validateReservation(await credit.getReservation({ orderId: id }, creditOptions)); }
      catch (error) { if (rpcCode(error) !== rpcStatus.NOT_FOUND) throw error; }
      expiry = input.expiryTime <= await now(db);
      if (!expiry && work.row.state !== 'COMPENSATING') {
        try { supplierRejected = !(await directories.isSupplierOpen(input.supplierId)).isOpen; }
        catch (error) {
          if (rpcCode(error) === rpcStatus.NOT_FOUND || rpcCode(error) === rpcStatus.INVALID_ARGUMENT) supplierRejected = true;
          else throw error;
        }
      }
      if (expiry || supplierRejected || work.row.state === 'COMPENSATING') {
        if (!receipt && work.reserveAttempts === 0) { compensated = true; }
        else if (receipt) {
          if (receipt.orderId !== id || receipt.requesterId !== work.row.requesterId || receipt.amount !== input.credits) throw new Error('Reservation mismatch');
          const ownsCompensation = await db.$transaction(async tx => {
            await tx.$queryRaw`SELECT "orderId" FROM "OrderCreation" WHERE "orderId" = ${id}::uuid FOR UPDATE`;
            const current = await tx.creditOperation.findUniqueOrThrow({ where: { id: work.operation.id } });
            const creation = await tx.orderCreation.findUniqueOrThrow({ where: { orderId: id } });
            if (!['PENDING', 'COMPENSATING'].includes(creation.state) || current.state !== 'PROCESSING'
              || current.attempts !== work.operation.attempts || current.leaseExpiresAt?.getTime() !== work.operation.leaseExpiresAt?.getTime()) return false;
            await tx.orderCreation.update({ where: { orderId: id }, data: { state: 'COMPENSATING' } });
            await tx.creditOperation.upsert({ where: { orderId_type: { orderId: id, type: 'REFUND' } },
              create: { orderId: id, type: 'REFUND', payload: {} }, update: {} });
            return true;
          });
          if (!ownsCompensation) return;
          if (receipt.status === 'RESERVED') validateReservation(await credit.releaseCredits({ orderId: id }, creditOptions));
          const current = validateReservation(await credit.getReservation({ orderId: id }, creditOptions));
          compensated = current.orderId === id && current.requesterId === work.row.requesterId && current.amount === input.credits && current.status === 'RELEASED';
          if (!compensated) throw new Error('Release unconfirmed');
        } else throw new Error('Expired reservation outcome uncertain');
      } else {
        if (!receipt) {
          // Only the first attempt uses the advisory balance precheck. Recovery
          // must not reject funds already held by an earlier uncertain call.
          if (work.operation.attempts === 1) {
            const balance = validateBalance(await credit.getBalance({ userId: work.row.requesterId }, creditOptions));
            if (balance.userId !== work.row.requesterId) throw new Error('Balance identity mismatch');
            if (balance.availableCredits < input.credits) { failure = 'rejected'; }
          }
          if (!failure) {
            validateReservation(await credit.reserveCredits({ orderId: id, requesterId: work.row.requesterId, amount: input.credits }, creditOptions));
            receipt = validateReservation(await credit.getReservation({ orderId: id }, creditOptions));
          }
        }
        if (!failure) {
          if (!receipt || receipt.orderId !== id || receipt.requesterId !== work.row.requesterId || receipt.amount !== input.credits) throw new Error('Reservation mismatch');
          if (receipt.status === 'RELEASED') failure = 'rejected';
          else if (receipt.status !== 'RESERVED') throw new Error('Unexpected reservation state');
          else {
            confirmed = (await directories.isSupplierOpen(input.supplierId)).isOpen;
            supplierRejected = !confirmed;
          }
        }
      }
    } catch (error) {
      failure = expiry || supplierRejected || work.row.state === 'COMPENSATING' ? 'uncertain' : classifyCreditError(error);
    }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "orderId" FROM "OrderCreation" WHERE "orderId" = ${id}::uuid FOR UPDATE`;
      const currentOp = await tx.creditOperation.findUniqueOrThrow({ where: { id: work.operation.id } });
      if (currentOp.attempts !== work.operation.attempts || currentOp.leaseExpiresAt?.getTime() !== work.operation.leaseExpiresAt?.getTime() || currentOp.state !== 'PROCESSING') return;
      const creationState = (await tx.orderCreation.findUniqueOrThrow({ where: { orderId: id } })).state;
      if (!['PENDING', 'COMPENSATING'].includes(creationState)) return;
      const time = await now(tx);
      if (confirmed && creationState === 'PENDING' && input.expiryTime > time) {
        await tx.order.create({ data: { id, requesterId: work.row.requesterId, supplierId: BigInt(input.supplierId),
          requesterName: String(data.requesterName), pickupStore: String(data.pickupStore), pickupLocation: String(data.pickupLocation),
          destination: input.destination, requestDetails: input.requestDetails, credits: input.credits, expiryTime: input.expiryTime,
          status: 'UNASSIGNED', creditState: 'RESERVED' } });
        await tx.orderCreation.update({ where: { orderId: id }, data: { state: 'SUCCEEDED' } });
        await tx.creditOperation.update({ where: { id: currentOp.id }, data: { state: 'SUCCEEDED', leaseExpiresAt: null, lastError: null } });
      } else if (compensated || failure === 'rejected') {
        await tx.orderCreation.update({ where: { orderId: id }, data: { state: 'FAILED' } });
        await tx.creditOperation.update({ where: { id: currentOp.id }, data: { state: compensated ? 'SUCCEEDED' : 'PERMANENTLY_FAILED', leaseExpiresAt: null, lastError: compensated ? 'expired' : 'dependency-rejected' } });
        if (compensated) await tx.creditOperation.updateMany({ where: { orderId: id, type: 'REFUND' }, data: { state: 'SUCCEEDED' } });
      } else {
        await tx.orderCreation.update({ where: { orderId: id }, data: { state: input.expiryTime <= time || supplierRejected || creationState === 'COMPENSATING' ? 'COMPENSATING' : 'PENDING' } });
        if (input.expiryTime <= time || supplierRejected || creationState === 'COMPENSATING') await tx.creditOperation.upsert({ where: { orderId_type: { orderId: id, type: 'REFUND' } },
          create: { orderId: id, type: 'REFUND', payload: {} }, update: {} });
        await tx.creditOperation.update({ where: { id: currentOp.id }, data: {
          state: currentOp.attempts >= 6 ? 'PERMANENTLY_FAILED' : 'PENDING', leaseExpiresAt: null,
          nextRetryAt: new Date(+time + delays[Math.min(currentOp.attempts - 1, 4)] * 1000),
          lastError: currentOp.attempts >= 6 ? 'retry-exhausted' : 'outcome-uncertain',
        } });
      }
    });
  }

  async function recoverBatch(limit = 100) {
    const time = await now(db);
    // Expiry compensation has its own refund operation/retry budget, including
    // when reservation recovery previously exhausted its attempts.
    const pending = await db.$queryRaw<{ orderId: string; payload: Prisma.JsonValue }[]>`
      SELECT "orderId", payload FROM "OrderCreation" WHERE state = 'PENDING'
      AND (payload->>'expiryTime')::timestamptz <= clock_timestamp()
      ORDER BY "createdAt" LIMIT ${limit}`;
    for (const row of pending) {
      const input = row.payload as { expiryTime?: string };
      if (input.expiryTime && new Date(input.expiryTime) <= time) await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "orderId" FROM "OrderCreation" WHERE "orderId" = ${row.orderId}::uuid FOR UPDATE`;
        const changed = await tx.orderCreation.updateMany({ where: { orderId: row.orderId, state: 'PENDING' }, data: { state: 'COMPENSATING' } });
        if (changed.count) await tx.creditOperation.upsert({ where: { orderId_type: { orderId: row.orderId, type: 'REFUND' } },
          create: { orderId: row.orderId, type: 'REFUND', payload: {} }, update: {} });
      });
    }
    await db.creditOperation.updateMany({ where: { attempts: { gte: 6 }, state: 'PROCESSING', leaseExpiresAt: { lte: time } },
      data: { state: 'PERMANENTLY_FAILED', leaseExpiresAt: null, lastError: 'retry-exhausted' } });
    const scanTime = await now(db);
    const due = { attempts: { lt: 6 }, OR: [
      { state: 'PENDING' as const, nextRetryAt: { lte: scanTime } },
      { state: 'PROCESSING' as const, leaseExpiresAt: { lte: scanTime } },
    ] };
    const rows = await db.orderCreation.findMany({ where: { OR: [
      { state: 'PENDING', creditOperations: { some: { type: 'RESERVE', ...due } } },
      { state: 'COMPENSATING', creditOperations: { some: { type: 'REFUND', ...due } } },
    ] }, orderBy: { updatedAt: 'asc' }, take: limit });
    for (const row of rows) { try { await recoverOne(row.orderId); } catch { console.error('Creation recovery persistence failed'); } }
  }
  return { submit, recoverOne, recoverBatch };
}
