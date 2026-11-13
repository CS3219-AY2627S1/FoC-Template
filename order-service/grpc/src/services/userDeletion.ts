// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Human-confirmed active-order preservation and safe-history scrubbing.
// Author review: Pending; see ../../../usage-log.md.
import { Prisma, type PrismaClient } from '../generated/prisma';
import { findDeletionBlockingOrders } from './deletionEligibility';

const placeholder = 'DeletedUser';
type Participants = { requester: boolean; courier: boolean };
const operationalStrings = new Set(['orderId', 'requesterId', 'courierId', 'supplierId', 'expiryTime', 'type', 'state', 'status', 'pickupStore', 'pickupLocation']);

// Preserve financial/identity keys needed for audit. Scrub free text even when
// nested in a durable edit's request/target or another JSON copy.
export function scrubDeletionJson(value: Prisma.JsonValue | undefined, participants: Participants, key = ''): Prisma.InputJsonValue | null {
  if (value === undefined) return null;
  if (key === 'destinationLocationId') return null;
  if (typeof value === 'string') {
    if (key === 'requesterName' && !participants.requester) return value;
    if (key === 'courierName' && !participants.courier) return value;
    return operationalStrings.has(key) ? value : placeholder;
  }
  if (Array.isArray(value)) return value.map(item => scrubDeletionJson(item, participants, key));
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([childKey, child]) => [childKey, scrubDeletionJson(child, participants, childKey)]),
  );
  return value;
}

function storedJson(value: Prisma.JsonValue, participants: Participants) {
  return scrubDeletionJson(value, participants) ?? Prisma.JsonNull;
}

async function scrubStoredCopies(tx: Prisma.TransactionClient, orderId: string, participants: Participants) {
  const creation = await tx.orderCreation.findUniqueOrThrow({ where: { orderId } });
  await tx.orderCreation.update({ where: { orderId }, data: { payload: storedJson(creation.payload, participants) } });
  const edits = await tx.orderEditOperation.findMany({ where: { orderId } });
  for (const edit of edits) await tx.orderEditOperation.update({ where: { id: edit.id }, data: {
    proposedChanges: storedJson(edit.proposedChanges, participants), ...(edit.lastError ? { lastError: placeholder } : {}),
  } });
  const credits = await tx.creditOperation.findMany({ where: { orderId } });
  for (const credit of credits) await tx.creditOperation.update({ where: { id: credit.id }, data: {
    payload: storedJson(credit.payload, participants), ...(credit.lastError ? { lastError: placeholder } : {}),
  } });
}

export async function processUserDeletion(db: PrismaClient, eventId: string) {
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "eventId" FROM "UserDeletionEvent" WHERE "eventId" = ${eventId} FOR UPDATE`;
    const event = await tx.userDeletionEvent.findUniqueOrThrow({ where: { eventId } });
    if (event.state !== 'RECEIVED') return { changed: false, event };
    // Use the same row lock as lifecycle commands. This does not create a
    // distributed deletion fence: new activity must be coordinated with User.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE "requesterId" = ${event.userId}
      OR "courierId" = ${event.userId} ORDER BY id FOR UPDATE`;
    const blockers = await findDeletionBlockingOrders(tx, event.userId);
    const blocked = new Set(blockers.map(order => order.id));
    const orders = await tx.order.findMany({ where: { OR: [{ requesterId: event.userId }, { courierId: event.userId }] } });
    for (const order of orders) {
      if (blocked.has(order.id)) continue;
      // Fail closed on unexpected states: only confirmed terminal financial
      // outcomes are safe to scrub. No credit calls or state transitions here.
      if (!(order.status === 'DELIVERED' && order.creditState === 'SETTLED')
        && !(order.status === 'CANCELLED' && order.creditState === 'REFUNDED')) {
        blocked.add(order.id); continue;
      }
      const participants = { requester: order.requesterId === event.userId, courier: order.courierId === event.userId };
      await tx.order.update({ where: { id: order.id }, data: {
        ...(participants.requester ? { requesterName: placeholder } : {}),
        ...(participants.courier ? { courierName: placeholder } : {}),
        destination: placeholder, destinationLocationId: null, requestDetails: placeholder,
      } });
      await scrubStoredCopies(tx, order.id, participants);
    }
    const failedCreations = await tx.orderCreation.findMany({ where: { requesterId: event.userId, state: 'FAILED', order: null } });
    for (const creation of failedCreations) {
      if (!blocked.has(creation.orderId)) await scrubStoredCopies(tx, creation.orderId, { requester: true, courier: false });
    }
    const blockingOrderIds = [...blocked].sort();
    const processed = await tx.userDeletionEvent.update({ where: { eventId }, data: {
      state: blockingOrderIds.length ? 'MANUAL_REVIEW_REQUIRED' : 'PROCESSED',
      blockingOrderIds, lastError: blockingOrderIds.length ? 'active-or-unresolved-orders-after-user-deletion' : null,
      processedAt: new Date(),
    } });
    return { changed: true, event: processed };
  }, { timeout: 15_000 });
  if (result.changed && result.event.state === 'MANUAL_REVIEW_REQUIRED') {
    console.error('User deletion consistency failure: manual review required', {
      eventId, userId: result.event.userId, blockingOrderIds: result.event.blockingOrderIds,
    });
  }
  return result.event;
}

export async function processReceivedUserDeletions(db: PrismaClient) {
  for (;;) {
    const events = await db.userDeletionEvent.findMany({ where: { state: 'RECEIVED' }, orderBy: [{ receivedAt: 'asc' }, { eventId: 'asc' }], take: 100 });
    if (!events.length) return;
    for (const event of events) await processUserDeletion(db, event.eventId);
  }
}
