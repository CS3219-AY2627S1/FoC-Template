/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Updated test fixtures for precise delivery details.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issues #6/#59 - unit tests for the order-change -> event/rooms mapping.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - pending -> failed publishes order:failed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Codex (model: GPT-6), date: 2026-11-06
 * Scope: Updated the acceptance event assertion for the user-specified courierId field.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import type { OrderRequest } from '../generated/prisma/client.js';
import {
  eventsForEdit,
  eventsForTransition,
  publishSafely,
} from './order-events.js';

const ID = '0192f0c4-0000-7000-8000-000000000001';
const R = '0192f0c4-0000-7000-8000-00000000000a';
const C = '0192f0c4-0000-7000-8000-00000000000b';
const AT = new Date('2026-10-20T12:00:00.000Z');

const order = (
  status: OrderRequest['status'],
  courierId: string | null = null,
) =>
  ({
    id: ID,
    requesterId: R,
    courierId,
    supplierId: 9,
    description: 'kopi',
    deliveryLocationId: 7,
    deliveryDetails: 'Nil',
    credits: 3,
    completeBy: null,
    additionalDetails: null,
    status,
    version: 5,
    createdAt: AT,
    updatedAt: AT,
  }) as OrderRequest;

const thin = (status: string) => ({
  orderId: ID,
  status,
  version: 5,
  occurredAt: AT.toISOString(),
});

describe('eventsForTransition', () => {
  it('pending -> open: order:created to the requester and the feed, with the listing card', () => {
    expect(eventsForTransition(order('open'), 'pending')).toEqual([
      {
        name: 'order:created',
        rooms: [`user:${R}`, 'listing'],
        payload: {
          ...thin('open'),
          order: {
            id: ID,
            requesterId: R,
            supplierId: 9,
            description: 'kopi',
            deliveryLocationId: 7,
            deliveryDetails: 'Nil',
            credits: 3,
            completeBy: null,
            additionalDetails: null,
            createdAt: AT.toISOString(),
          },
        },
        joins: [{ userId: R, orderId: ID }],
      },
    ]);
  });

  it('pending -> failed: order:failed to the requester only, with the reason', () => {
    expect(
      eventsForTransition(
        order('failed'),
        'pending',
        'INSUFFICIENT_UNRESERVED_CREDITS',
      ),
    ).toEqual([
      {
        name: 'order:failed',
        rooms: [`user:${R}`],
        payload: {
          ...thin('failed'),
          reason: 'INSUFFICIENT_UNRESERVED_CREDITS',
        },
      },
    ]);
  });

  it('open -> accepted: requester, courier, viewers and the feed; courier joins the order room', () => {
    expect(eventsForTransition(order('accepted', C), 'open')).toEqual([
      {
        name: 'order:accepted',
        rooms: [`user:${R}`, `user:${C}`, `order:${ID}`, 'listing'],
        payload: { ...thin('accepted'), courierId: C },
        joins: [{ userId: C, orderId: ID }],
      },
    ]);
  });

  it.each([
    ['picked_up', 'accepted', 'order:pickedUp'],
    ['delivered', 'picked_up', 'order:delivered'],
  ] as const)('%s: viewers of the order only', (status, from, name) => {
    expect(eventsForTransition(order(status, C), from)).toEqual([
      { name, rooms: [`order:${ID}`], payload: thin(status) },
    ]);
  });

  it('completed: viewers, then the order room is closed', () => {
    expect(eventsForTransition(order('completed', C), 'delivered')).toEqual([
      {
        name: 'order:completed',
        rooms: [`order:${ID}`],
        payload: thin('completed'),
        closeOrderRoom: ID,
      },
    ]);
  });

  it('expired: requester (F16.1.2), viewers and the feed, then closed', () => {
    expect(eventsForTransition(order('expired'), 'open')).toEqual([
      {
        name: 'order:expired',
        rooms: [`user:${R}`, `order:${ID}`, 'listing'],
        payload: thin('expired'),
        closeOrderRoom: ID,
      },
    ]);
  });

  it('cancelling an open order also updates the feed; an ongoing one does not', () => {
    expect(eventsForTransition(order('cancelled'), 'open')[0]!.rooms).toEqual([
      `order:${ID}`,
      'listing',
    ]);
    expect(
      eventsForTransition(order('cancelled', C), 'accepted')[0]!.rooms,
    ).toEqual([`order:${ID}`]);
  });
});

describe('eventsForEdit', () => {
  it('goes to viewers and the feed', () => {
    expect(eventsForEdit(order('open'))).toEqual([
      {
        name: 'order:edited',
        rooms: [`order:${ID}`, 'listing'],
        payload: thin('open'),
      },
    ]);
  });
});

describe('publishSafely', () => {
  it('swallows and logs a publish failure (pushes are hints)', async () => {
    const log = vi.fn();
    await publishSafely(
      {
        publish: async () => {
          throw new Error('redis down');
        },
      },
      eventsForEdit(order('open')),
      log,
    );
    expect(log).toHaveBeenCalledWith('Order event publish failed: redis down');
  });
});
