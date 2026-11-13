// ChatGPT (Codex), 2026-11-02: Include unresolved intents/edits and pending creations; review pending; see ../../../usage-log.md.
// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Implemented the team's account-deletion blocking-order predicate.
// Author review: Pending; see ../../../usage-log.md.
import type { Prisma } from '../generated/prisma';
type Database = Pick<Prisma.TransactionClient, 'order' | 'orderCreation'>;

export function deletionBlockingOrdersWhere(userId: string): Prisma.OrderWhereInput {
  if (!userId.trim()) throw new Error('userId must not be blank');
  return {
    AND: [
      { OR: [{ requesterId: userId }, { courierId: userId }] },
      { OR: [
        { status: { in: ['UNASSIGNED', 'ASSIGNED', 'PICKED_UP'] } },
        { creditState: { in: ['RESERVED', 'SETTLEMENT_PENDING', 'REFUND_PENDING'] } },
        { status: 'DELIVERED', creditState: { not: 'SETTLED' } },
        { status: 'CANCELLED', creditState: { not: 'REFUNDED' } },
        { creation: { state: { not: 'SUCCEEDED' } } },
        { creation: { creditOperations: { some: { state: { not: 'SUCCEEDED' } } } } },
        { editOperations: { some: { state: { in: ['PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED'] } } } },
      ] },
    ],
  };
}

// This is a point-in-time check, not a cross-service deletion lock.
// User deletion and Order's asynchronous deletion handler must also handle races.
export async function findDeletionBlockingOrders(db: Database, userId: string) {
  const orders = await db.order.findMany({
    where: deletionBlockingOrdersWhere(userId),
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  // A durable creation may already hold funds before its Order row exists.
  const creations = await db.orderCreation.findMany({
    where: { requesterId: userId, order: null, OR: [
      { state: { in: ['PENDING', 'COMPENSATING'] } },
      { creditOperations: { some: { type: 'REFUND', state: { not: 'SUCCEEDED' } } } },
      { creditOperations: { some: { type: 'RESERVE', state: { in: ['PENDING', 'PROCESSING'] } } } },
    ] }, select: { orderId: true },
  });
  return [...new Set([...orders.map(order => order.id), ...creations.map(creation => creation.orderId)])]
    .sort().map(id => ({ id }));
}
