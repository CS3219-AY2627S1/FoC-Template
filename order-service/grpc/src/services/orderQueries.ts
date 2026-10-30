// AI Assistance Disclosure: ChatGPT (Codex), 2026-10-22.
// Scope: Implemented author-approved administrator and authenticated relationship-based order listings.
// Author review: Pending; see ../../usage-log.md.
import { prisma } from '../db';

const publicOrderFields = {
  id: true, requesterId: true, courierId: true, supplierId: true,
  pickupStore: true, pickupLocation: true, requesterName: true, courierName: true,
  destination: true, requestDetails: true, credits: true, expiryTime: true,
  status: true, cancellationReason: true, creditState: true,
  createdAt: true, updatedAt: true, acceptedAt: true, pickedUpAt: true,
  deliveredAt: true, cancelledAt: true,
} as const;

export function listAllOrders() {
  return prisma.order.findMany({
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
