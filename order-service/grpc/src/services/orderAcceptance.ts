// ChatGPT (Codex), 2026-11-06: Complete lifecycle snapshots and UI contract handling; review pending; see order-service/usage-log.md.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-requested courier eligibility and first-lock-wins acceptance.
// Author review: Pending; see ../../usage-log.md.
// ChatGPT (Codex), 2026-11-02: Verify courier existence through shared User gRPC; review pending.
import { status as rpcStatus } from '@grpc/grpc-js';
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

type UserLookup = { getPublicProfile: (request: { userId: string }) => Promise<{ userId: string; firstName: string; lastName: string; username: string }> };

export function createOrderAcceptance(db: PrismaClient, users: UserLookup) {
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
      let courierName: string;
      try {
        const profile = await users.getPublicProfile({ userId: actor.id });
        if (profile.userId !== actor.id) return { status: 503, error: 'dependency-unavailable' };
        courierName = [profile.firstName, profile.lastName].map(name => name.trim()).filter(Boolean).join(' ') || profile.username.trim();
        if (!courierName) return { status: 503, error: 'dependency-unavailable' };
      } catch (error) {
        if ((error as { code?: number } | null)?.code === rpcStatus.NOT_FOUND) {
          return { status: 403, error: 'forbidden' };
        }
        return { status: 503, error: 'dependency-unavailable' };
      }
      // User lookup can take time; an order must still be unexpired at assignment.
      const acceptedAt = (await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
      if (order.expiryTime <= acceptedAt) return { status: 409, error: 'expired' };
      const assigned = await tx.order.update({ where: { id: orderId }, data: {
        status: 'ASSIGNED', courierId: actor.id, courierName, acceptedAt,
      } });
      return { status: 200, order: assigned };
    });
  }
  return { accept };
}
