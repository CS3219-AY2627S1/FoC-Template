/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-09
 * Scope: Tests for the UserDeleted handler and for ignoring deleted users' later events.
 * Reviewed by Ngooi Jun Sen
 */

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { handleAdminEvent } from '../src/messaging/adminEvents.js';
import { handleOrderEvent } from '../src/messaging/orderEvents.js';
import { handleRatingEvent } from '../src/messaging/ratingEvents.js';
import { handleUserEvent } from '../src/messaging/userEvents.js';
import {
  badgeState,
  countedOrder,
  db,
  deletedUser,
  metricsOf,
  orderMessage,
  ratingMessage,
  resolvedMessage,
  userBadge,
  userDeletedMessage,
} from './helpers.js';

const send = (handler: (raw: string) => Promise<string>, message: unknown) => handler(JSON.stringify(message));

describe('handleUserEvent', () => {
  it("removes a deleted user's metrics, badges and counted orders, and leaves the other party's", async () => {
    const order = orderMessage();
    const courierId = order.courierId as string;
    const requesterId = order.requesterId as string;
    await send(handleOrderEvent, order);
    expect(await badgeState(courierId, 'first_delivery')).toBe('earned');

    expect(await send(handleUserEvent, userDeletedMessage(courierId))).toBe('deleted');

    expect(await metricsOf(courierId)).toBeUndefined();
    expect(await db.select().from(userBadge).where(eq(userBadge.userId, courierId))).toHaveLength(0);
    expect(await db.select().from(countedOrder).where(eq(countedOrder.userId, courierId))).toHaveLength(0);
    expect(await db.select().from(deletedUser)).toEqual([expect.objectContaining({ userId: courierId })]);
    expect(await metricsOf(requesterId)).toMatchObject({ completedOrders: 1 });
    expect(await badgeState(requesterId, 'first_order')).toBe('earned');
  });

  it('treats a repeated deletion as a duplicate', async () => {
    const message = userDeletedMessage('11111111-1111-4111-8111-111111111111');
    await send(handleUserEvent, message);
    expect(await send(handleUserEvent, message)).toBe('duplicate');
    expect(await db.select().from(deletedUser)).toHaveLength(1);
  });

  it('ignores other user events and JSON that is not an object', async () => {
    expect(await send(handleUserEvent, { eventId: 'e', type: 'UserVerified', occurredAt: 'now', data: {} })).toBe(
      'ignored',
    );
    expect(await handleUserEvent('null')).toBe('ignored');
  });

  it.each([
    ['non-JSON', 'not json'],
    ['a non-UUID userId', JSON.stringify(userDeletedMessage('alice'))],
    ['no data', JSON.stringify(userDeletedMessage('11111111-1111-4111-8111-111111111111', { data: undefined }))],
  ])('rejects %s as invalid', async (_label, raw) => {
    expect(await handleUserEvent(raw)).toBe('invalid');
    expect(await db.select().from(deletedUser)).toHaveLength(0);
  });
});

describe('events after a deletion', () => {
  it('counts a later order only for the party who still has an account', async () => {
    const order = orderMessage();
    await send(handleUserEvent, userDeletedMessage(order.courierId as string));

    expect(await send(handleOrderEvent, order)).toBe('counted');
    expect(await metricsOf(order.courierId as string)).toBeUndefined();
    expect(await metricsOf(order.requesterId as string)).toMatchObject({ completedOrders: 1 });
  });

  it('counts nothing when both parties are deleted', async () => {
    const order = orderMessage();
    await send(handleUserEvent, userDeletedMessage(order.courierId as string));
    await send(handleUserEvent, userDeletedMessage(order.requesterId as string));

    expect(await send(handleOrderEvent, order)).toBe('deleted');
    expect(await db.select().from(countedOrder)).toHaveLength(0);
  });

  it("ignores a deleted user's rating", async () => {
    const message = ratingMessage();
    await send(handleUserEvent, userDeletedMessage(message.userId as string));
    expect(await send(handleRatingEvent, message)).toBe('deleted');
    expect(await metricsOf(message.userId as string)).toBeUndefined();
  });

  it('still applies a verdict to the other party when one party was deleted', async () => {
    const order = orderMessage();
    const courierId = order.courierId as string;
    await send(handleOrderEvent, order);
    await send(handleOrderEvent, { ...order, eventId: 'esc', fromStatus: 'DELIVERED', toStatus: 'ESCALATED' });
    await send(handleUserEvent, userDeletedMessage(order.requesterId as string));

    expect(await send(handleAdminEvent, resolvedMessage({ orderId: order.orderId, faultParty: 'no-fault' }))).toBe(
      'restored',
    );
    expect(await metricsOf(courierId)).toMatchObject({ completedDeliveries: 1 });
    expect(await metricsOf(order.requesterId as string)).toBeUndefined();
  });

  it('uncounts an escalated order for the remaining party after the other was deleted', async () => {
    const order = orderMessage();
    await send(handleOrderEvent, order);
    await send(handleUserEvent, userDeletedMessage(order.requesterId as string));

    expect(await send(handleOrderEvent, { ...order, eventId: 'esc', fromStatus: 'DELIVERED', toStatus: 'ESCALATED' })).toBe(
      'uncounted',
    );
    expect(await metricsOf(order.courierId as string)).toMatchObject({ completedDeliveries: 0 });
  });
});
