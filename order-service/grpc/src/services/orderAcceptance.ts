// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-requested courier eligibility and first-lock-wins acceptance.
// Author review: Pending; see ../../usage-log.md.
import type { Order, PrismaClient } from '../generated/prisma';
import type { CommandResult } from './orderCreation';

type Actor = { id: string; roles: string[] };
type AcceptanceOrder = Pick<Order, 'requesterId' | 'courierId' | 'status' | 'expiryTime' | 'creditState'>;

export function acceptanceFailure(order: AcceptanceOrder, actor: Actor, now: Date) {
  if (!actor.roles.includes('USER') || actor.id === order.requesterId) {
    return { status: 403, error: 'forbidden' };
  }
  if (order.status !== 'UNASSIGNED' || order.courierId !== null || order.creditState !== 'RESERVED') {
    return { status: 409, error: 'invalid-transition' };
  }
  if (order.expiryTime <= now) return { status: 409, error: 'expired' };
  return undefined;
}

export function createOrderAcceptance(db: PrismaClient) {
  async function accept(orderId: string, actor: Actor): Promise<CommandResult> {
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return { status: 404, error: 'not-found' };
      // Sample database time after waiting for the order lock.
      const time = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
      const failure = acceptanceFailure(order, actor, time);
      if (failure) return failure;
      const editing = await tx.orderEditOperation.findFirst({ where: {
        orderId, state: { in: ['PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED'] },
      }, select: { id: true } });
      if (editing) return { status: 409, error: 'conflict' };
      const assigned = await tx.order.update({ where: { id: orderId }, data: {
        status: 'ASSIGNED', courierId: actor.id, courierName: null, acceptedAt: time,
      } });
      return { status: 200, order: assigned };
    });
  }
  return { accept };
}
