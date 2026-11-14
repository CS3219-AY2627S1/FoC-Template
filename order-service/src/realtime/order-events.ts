/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Issues #6/#59 - which Socket.IO event each order change produces and which rooms
 *        it goes to, per George's decisions (2026-10-19/20): events `order:<pastTenseVerb>`
 *        with thin payloads { orderId, status, version, occurredAt }; order:created also
 *        carries the listing card fields; failures carry a reason; rooms user:{id},
 *        order:{id} (server-joined, authorised from the DB) and listing (opt-in); pushes
 *        are hints, REST is the source of truth. The per-event room mapping, the
 *        camelCase event names for multi-word statuses (order:pickedUp), joining order
 *        rooms when someone becomes a participant and leaving them at terminal states are
 *        derived by convention from those room purposes and flagged for review.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - a failed reservation publishes `order:failed` with
 *        its reason to the requester (George, 2026-10-20: "add the new event"), replacing
 *        order:cancelled from pending.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Codex (model: GPT-6), date: 2026-11-06
 * Scope: Added courierId to order:accepted per the user's explicit contract decision.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import type {
  OrderRequest,
  RequestStatus,
} from '../generated/prisma/client.js';

export type OrderEventName =
  | 'order:created'
  | 'order:accepted'
  | 'order:pickedUp'
  | 'order:delivered'
  | 'order:completed'
  | 'order:cancelled'
  | 'order:expired'
  | 'order:failed'
  | 'order:edited';

/** The fields a listing card shows (order:created only). Ids are plain JSON numbers. */
export interface ListingCard {
  id: string;
  requesterId: string;
  supplierId: number;
  description: string;
  deliveryLocationId: number;
  deliveryDetails: string;
  credits: number;
  completeBy: string | null;
  additionalDetails: string | null;
  createdAt: string;
}

export interface OrderEventPayload {
  orderId: string;
  /** order:accepted only; the assigned courier from the committed order. */
  courierId?: string | null;
  status: RequestStatus;
  version: number;
  occurredAt: string;
  /** Why a reservation failed (credit-service's code, or RESERVE_RETRIES_EXHAUSTED). */
  reason?: string;
  /** order:created only. */
  order?: ListingCard;
}

/** One emit, plus the room membership changes that go with it. */
export interface OrderEvent {
  name: OrderEventName;
  rooms: string[];
  payload: OrderEventPayload;
  /** Put every socket of `userId` into `order:{orderId}` before emitting. */
  joins?: { userId: string; orderId: string }[];
  /** Empty `order:{id}` after emitting (the order reached a terminal state). */
  closeOrderRoom?: string;
}

export interface OrderEventPublisher {
  publish(events: OrderEvent[]): Promise<void>;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const orderRoom = (orderId: string) => `order:${orderId}`;
export const LISTING_ROOM = 'listing';

function listingCard(o: OrderRequest): ListingCard {
  return {
    id: o.id,
    requesterId: o.requesterId,
    supplierId: o.supplierId,
    description: o.description,
    deliveryLocationId: o.deliveryLocationId,
    deliveryDetails: o.deliveryDetails,
    credits: o.credits,
    completeBy: o.completeBy?.toISOString() ?? null,
    additionalDetails: o.additionalDetails,
    createdAt: o.createdAt.toISOString(),
  };
}

function payloadOf(o: OrderRequest, extra: Partial<OrderEventPayload> = {}) {
  return {
    orderId: o.id,
    status: o.status,
    version: o.version,
    occurredAt: o.updatedAt.toISOString(),
    ...extra,
  };
}

/**
 * Events for `order` having just moved from `from` to its current status.
 * `order` is the row as committed.
 */
export function eventsForTransition(
  order: OrderRequest,
  from: RequestStatus,
  reason?: string,
): OrderEvent[] {
  const id = order.id;
  const requester = userRoom(order.requesterId);
  const room = orderRoom(id);

  switch (order.status) {
    case 'open': // pending -> open: credits reserved, the order goes live
      return [
        {
          name: 'order:created',
          rooms: [requester, LISTING_ROOM],
          payload: payloadOf(order, { order: listingCard(order) }),
          joins: [{ userId: order.requesterId, orderId: id }],
        },
      ];
    case 'accepted': {
      const courier = order.courierId;
      return [
        {
          name: 'order:accepted',
          // Requester ("your order was accepted"), courier (F12.1.2), viewers (F12.1.5),
          // and the feed, which drops the order (NFR5.1).
          rooms: [
            requester,
            ...(courier ? [userRoom(courier)] : []),
            room,
            LISTING_ROOM,
          ],
          payload: payloadOf(order, { courierId: courier }),
          joins: courier ? [{ userId: courier, orderId: id }] : [],
        },
      ];
    }
    case 'picked_up':
      return [
        { name: 'order:pickedUp', rooms: [room], payload: payloadOf(order) },
      ];
    case 'delivered':
      return [
        { name: 'order:delivered', rooms: [room], payload: payloadOf(order) },
      ];
    case 'completed':
      return [
        {
          name: 'order:completed',
          rooms: [room],
          payload: payloadOf(order),
          closeOrderRoom: id,
        },
      ];
    case 'expired':
      return [
        {
          name: 'order:expired',
          rooms: [requester, room, LISTING_ROOM], // F16.1.2 notifies the requester
          payload: payloadOf(order),
          closeOrderRoom: id,
        },
      ];
    case 'failed':
      // Reservation failed: only the requester ever saw this order.
      return [
        {
          name: 'order:failed',
          rooms: [requester],
          payload: payloadOf(order, reason ? { reason } : {}),
        },
      ];
    case 'cancelled':
      return [
        {
          name: 'order:cancelled',
          rooms: from === 'open' ? [room, LISTING_ROOM] : [room],
          payload: payloadOf(order, reason ? { reason } : {}),
          closeOrderRoom: id,
        },
      ];
    default:
      return [];
  }
}

/** An open order was edited (F18): viewers and the feed refresh it. */
export function eventsForEdit(order: OrderRequest): OrderEvent[] {
  return [
    {
      name: 'order:edited',
      rooms: [orderRoom(order.id), LISTING_ROOM],
      payload: payloadOf(order),
    },
  ];
}

/** Publishing is best-effort: a failed push never fails the write that caused it. */
export async function publishSafely(
  events: OrderEventPublisher | undefined,
  batch: OrderEvent[],
  log: (message: string) => void = console.error,
): Promise<void> {
  if (!events || batch.length === 0) return;
  try {
    await events.publish(batch);
  } catch (err) {
    log(
      `Order event publish failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
