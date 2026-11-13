// ChatGPT (Codex), 2026-11-06: Complete lifecycle snapshots and UI contract handling; review pending; see order-service/usage-log.md.
// ChatGPT (Codex), 2026-11-03: Single-order retrieval with approved visibility rules; review pending; see order-service/usage-log.md.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-approved administrator and authenticated relationship-based order listings.
// Author review: Pending; see ../../usage-log.md.
// ChatGPT (Codex), 2026-10-30: Added user-specified administrator status filters; human review pending.
import { prisma } from '../db';

const publicOrderFields = {
  id: true, requesterId: true, courierId: true, supplierId: true,
  pickupStore: true, pickupLocation: true, requesterName: true, courierName: true,
  destination: true, destinationLocationId: true, requestDetails: true, credits: true, expiryTime: true,
  status: true, cancellationReason: true, creditState: true,
  createdAt: true, updatedAt: true, acceptedAt: true, pickedUpAt: true,
  deliveredAt: true, cancelledAt: true,
} as const;

export type AdminOrderStatus = 'ONGOING' | 'UNASSIGNED' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';

export function listAllOrders(status?: AdminOrderStatus) {
  return prisma.order.findMany({
    ...(status ? { where: { status: status === 'ONGOING'
      ? { in: ['UNASSIGNED', 'ASSIGNED', 'PICKED_UP'] as const }
      : status } } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: publicOrderFields,
  });
}

export type OrderScope = 'open' | 'requested' | 'assigned';

export async function listUserOrders(scope: OrderScope, userId: string) {
  // Database time excludes overdue orders even before the expiry worker runs.
  const now = scope === 'open'
    ? (await prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now
    : undefined;
  return prisma.order.findMany({
    where: scope === 'open'
      ? { status: 'UNASSIGNED', requesterId: { not: userId }, expiryTime: { gt: now } }
      : scope === 'requested' ? { requesterId: userId } : { courierId: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: publicOrderFields,
  });
}


export async function findVisibleOrder(id: string, user: { id: string; roles: string[] }) {
  const order = await prisma.order.findUnique({ where: { id }, select: publicOrderFields });
  if (!order) return { error: 'not-found' as const, status: 404 };
  const participant = order.requesterId === user.id || order.courierId === user.id;
  if (!participant && !user.roles.includes('ADMINISTRATOR')) {
    const now = (await prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
    if (!user.roles.includes('USER') || order.status !== 'UNASSIGNED' || order.expiryTime <= now) {
      return { error: 'forbidden' as const, status: 403 };
    }
  }
  return { order };
}

export function serializeListedOrder<T extends { supplierId: bigint }>(order: T) {
  return { ...order, supplierId: order.supplierId.toString() };
}
