/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Tests for the admin.case.resolved handler and the fault-aware rule.
 * Reviewed by Ngooi Jun Sen
 */

import { describe, expect, it } from 'vitest';
import { handleAdminEvent } from '../src/messaging/adminEvents.js';
import { rolesCounted } from '../src/messaging/counting.js';
import { handleOrderEvent } from '../src/messaging/orderEvents.js';
import { badgeState, countedOrder, db, disputedOrder, metricsOf, orderMessage, resolvedMessage } from './helpers.js';

const sendOrder = (message: Record<string, unknown>) => handleOrderEvent(JSON.stringify(message));
const sendAdmin = (message: Record<string, unknown>) => handleAdminEvent(JSON.stringify(message));

// A delivered order, counted, then escalated: both parties uncounted.
async function disputed() {
  const message = orderMessage();
  await sendOrder(message);
  await sendOrder({ ...message, eventId: 'esc', fromStatus: 'DELIVERED', toStatus: 'ESCALATED' });
  return { orderId: message.orderId, requesterId: message.requesterId as string, courierId: message.courierId as string };
}

describe('rolesCounted', () => {
  it('counts whoever was not at fault, and no one before the verdict', () => {
    expect(rolesCounted('requester')).toEqual(['COURIER']);
    expect(rolesCounted('courier')).toEqual(['REQUESTER']);
    expect(rolesCounted('no-fault')).toEqual(['COURIER', 'REQUESTER']);
    expect(rolesCounted(null)).toEqual([]);
  });
});

describe('handleAdminEvent', () => {
  it("gives the courier their delivery back when the requester was at fault, and restores the badge", async () => {
    const { orderId, requesterId, courierId } = await disputed();
    expect(await badgeState(courierId, 'first_delivery')).toBe('revoked');

    expect(await sendAdmin(resolvedMessage({ orderId, faultParty: 'requester' }))).toBe('restored');

    expect(await metricsOf(courierId)).toMatchObject({ completedDeliveries: 1 });
    expect(await metricsOf(requesterId)).toMatchObject({ completedOrders: 0 });
    expect(await badgeState(courierId, 'first_delivery')).toBe('earned');
    expect(await badgeState(requesterId, 'first_order')).toBe('revoked');
  });

  it("gives the requester their order back when the courier was at fault", async () => {
    const { orderId, requesterId, courierId } = await disputed();
    expect(await sendAdmin(resolvedMessage({ orderId, faultParty: 'courier' }))).toBe('restored');
    expect(await metricsOf(courierId)).toMatchObject({ completedDeliveries: 0 });
    expect(await metricsOf(requesterId)).toMatchObject({ completedOrders: 1 });
  });

  it('counts the order for both when no one was at fault', async () => {
    const { orderId, requesterId, courierId } = await disputed();
    expect(await sendAdmin(resolvedMessage({ orderId, faultParty: 'no-fault' }))).toBe('restored');
    expect(await metricsOf(courierId)).toMatchObject({ completedDeliveries: 1 });
    expect(await metricsOf(requesterId)).toMatchObject({ completedOrders: 1 });
  });

  it('keeps the first verdict and treats a redelivery as a duplicate', async () => {
    const { orderId, courierId } = await disputed();
    const message = resolvedMessage({ orderId, faultParty: 'requester' });
    await sendAdmin(message);

    expect(await sendAdmin(message)).toBe('duplicate');
    expect(await sendAdmin({ ...message, eventId: 'other', faultParty: 'courier' })).toBe('duplicate');
    expect(await metricsOf(courierId)).toMatchObject({ completedDeliveries: 1 });
    expect(await db.select().from(countedOrder)).toHaveLength(1);
  });

  it('stores a verdict for an order whose escalation has not arrived yet', async () => {
    const message = resolvedMessage({ faultParty: 'no-fault' });
    expect(await sendAdmin(message)).toBe('resolved');
    const [row] = await db.select().from(disputedOrder);
    expect(row).toMatchObject({ orderId: message.orderId, faultParty: 'no-fault', requesterId: null });
    expect(row?.resolvedAt).not.toBeNull();
  });

  it('counts no courier delivery when the order had no courier', async () => {
    const message = orderMessage({ courierId: null, toStatus: 'ESCALATED' });
    await sendOrder(message);
    expect(await sendAdmin(resolvedMessage({ orderId: message.orderId, faultParty: 'requester' }))).toBe('resolved');
    expect(await db.select().from(countedOrder)).toHaveLength(0);
  });

  it('ignores other admin events and JSON that is not an object', async () => {
    expect(await sendAdmin(resolvedMessage({ eventType: 'admin.review.started' }))).toBe('ignored');
    expect(await handleAdminEvent('null')).toBe('ignored');
  });

  it.each([
    ['non-JSON', 'not json'],
    ['an unknown faultParty', JSON.stringify(resolvedMessage({ faultParty: 'both' }))],
    ['a missing faultParty', JSON.stringify(resolvedMessage({ faultParty: undefined }))],
    ['a non-UUID orderId', JSON.stringify(resolvedMessage({ orderId: 'order-1' }))],
  ])('rejects %s as invalid', async (_label, raw) => {
    expect(await handleAdminEvent(raw)).toBe('invalid');
    expect(await db.select().from(disputedOrder)).toHaveLength(0);
  });
});
