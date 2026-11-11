/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-10-10
 * Scope: Generated the Order Service calls and the order type every order page
 *        shares, mapped from order-service's OrderResponse.
 * Reviewed by Ngooi Jun Sen.
 *
 * Paths and shapes follow order-service as merged (PR #12), under
 * /api/v1/orders. The caller is identified by the X-User-Id header that the
 * gateway (and, locally, frontend/nginx.conf) adds after the User Service
 * authorize check, so nothing here sends a user id.
 */

import { ApiError, api } from './api';
import type { Coordinates } from './useGeolocation';
import type { OrderStatus } from '../components/ui/StatusBadge';

/** order-service's OrderStatus enum. */
type ApiOrderStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'COLLECTED'
  | 'DELIVERED'
  | 'ACKNOWLEDGED'
  | 'UNACKNOWLEDGED'
  | 'ESCALATED'
  | 'UNDER_REVIEW'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'COMPLETED';

const STATUS_LABELS: Record<ApiOrderStatus, OrderStatus> = {
  CREATED: 'Created',
  ACCEPTED: 'Accepted',
  COLLECTED: 'Collected',
  DELIVERED: 'Delivered',
  ACKNOWLEDGED: 'Acknowledged',
  UNACKNOWLEDGED: 'Unacknowledged',
  ESCALATED: 'Escalated',
  UNDER_REVIEW: 'Under review',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

/** order-service's OrderResponse. Times are ISO strings. */
interface OrderResponse {
  id: string;
  requesterId: string;
  requesterTelegramHandle: string | null;
  courierId: string | null;
  courierTelegramHandle: string | null;
  requesterRating: number | null;
  courierRating: number | null;
  itemDescription: string;
  amount: number;
  status: ApiOrderStatus;
  requestTime: string;
  acceptanceExpiry: string;
  deliveryDeadline: string;
  collectionDeadline: string | null;
  acknowledgementDeadline: string | null;
  pickupLocationId: string;
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLocationId: string;
  dropoffName: string;
  dropoffBuilding: string | null;
  dropoffDescription: string | null;
  dropoffLat: number;
  dropoffLng: number;
  collectionPhotoRef: string | null;
  deliveryPhotoRef: string | null;
  disputePhotoRef: string | null;
  disputeText: string | null;
  /** Admin's verdict on an escalated order; null before it, or for orders resolved before Order stored it. */
  faultParty?: FaultParty | null;
}

export type FaultParty = 'requester' | 'courier' | 'no-fault';

/** order-service's PageResponse. */
interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
}

export interface Place {
  /** A Supplier Service id for the pickup, an Order delivery point id for the drop-off. */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** The order keeps its own copy of the drop-off, so later edits to the place do not reach it. */
export interface Dropoff extends Place {
  building: string | null;
  description: string | null;
}

/** One order, as every order page sees it. */
export interface Order {
  id: string;
  /** Short form for headings and breadcrumbs. */
  reference: string;
  item: string;
  credits: number;
  status: OrderStatus;

  requesterId: string;
  requesterTelegramHandle: string | null;
  requesterRating: number | null;
  /** Null until a courier accepts (Order F2.2). */
  courierId: string | null;
  courierTelegramHandle: string | null;
  courierRating: number | null;
  /*
   * TODO(order-service): no names. The response carries user ids and Telegram
   * handles only, and the User Service has no endpoint that looks up another
   * user's name, so every "Aisha R." in the mockups is commented out for now.
   */

  pickup: Place;
  dropoff: Dropoff;

  requestedAt: Date;
  /** Order F1.3: by when a courier must accept. */
  acceptanceExpiry: Date;
  /** Order F1.4: by when it must be delivered. */
  deliveryDeadline: Date;
  /** Order F2.2.6: five minutes from accepting. Set only while Accepted. */
  collectionDeadline: Date | null;
  /** Set at collection to the delivery deadline plus one day. */
  acknowledgementDeadline: Date | null;

  /** True once the order has been escalated: the requester's dispute text, or Admin's verdict. */
  disputed: boolean;
  /** Admin's verdict, which decides where the credits went (Order F2.16). */
  faultParty: FaultParty | null;
}

/** The label for one of order-service's status names; null for one this frontend does not know. */
export function statusLabel(status: string): OrderStatus | null {
  return (STATUS_LABELS as Record<string, OrderStatus | undefined>)[status] ?? null;
}

/** The first block of the order id, e.g. "3f2a9c1e". */
export function orderReference(id: string): string {
  return id.split('-')[0];
}

function toOrder(response: OrderResponse): Order {
  return {
    id: response.id,
    reference: orderReference(response.id),
    item: response.itemDescription,
    credits: response.amount,
    status: STATUS_LABELS[response.status],
    requesterId: response.requesterId,
    requesterTelegramHandle: response.requesterTelegramHandle || null,
    requesterRating: response.requesterRating,
    courierId: response.courierId,
    courierTelegramHandle: response.courierTelegramHandle || null,
    courierRating: response.courierRating,
    pickup: {
      id: response.pickupLocationId,
      name: response.pickupName,
      latitude: response.pickupLat,
      longitude: response.pickupLng,
    },
    dropoff: {
      id: response.dropoffLocationId,
      name: response.dropoffName,
      building: response.dropoffBuilding,
      description: response.dropoffDescription,
      latitude: response.dropoffLat,
      longitude: response.dropoffLng,
    },
    requestedAt: new Date(response.requestTime),
    acceptanceExpiry: new Date(response.acceptanceExpiry),
    deliveryDeadline: new Date(response.deliveryDeadline),
    collectionDeadline: response.collectionDeadline ? new Date(response.collectionDeadline) : null,
    acknowledgementDeadline: response.acknowledgementDeadline
      ? new Date(response.acknowledgementDeadline)
      : null,
    disputed:
      response.disputeText !== null ||
      (response.faultParty ?? null) !== null ||
      response.status === 'ESCALATED' ||
      response.status === 'UNDER_REVIEW',
    faultParty: response.faultParty ?? null,
  };
}

/**
 * What the order meant for this person's credits, for the lists and order
 * pages. A normal order: the requester paid, the courier earned. A disputed
 * one depends on Admin's verdict (Order F2.16): courier at fault refunds the
 * requester and pays the courier nothing; requester at fault or no fault pays
 * the courier as usual. An expired or cancelled request returns the credits.
 * `note` is null for a normal order; `returned` is true when the credits did
 * not change hands for this person, so the amount is shown crossed out.
 */
export function creditOutcome(
  order: Order,
  viewer: 'requester' | 'courier',
): { amount: number | null; note: string | null; returned: boolean } {
  // Nobody accepted it, or it was cancelled before collection: the reserve went back (Order F2.8, F2.10).
  if (order.status === 'Expired' || order.status === 'Cancelled') {
    return { amount: order.credits, note: `Returned · ${order.status.toLowerCase()}`, returned: true };
  }
  if (!order.disputed) return { amount: order.credits, note: null, returned: false };
  if (order.faultParty === null) {
    // Still with Admin, or resolved before Order kept the verdict.
    const open = order.status === 'Escalated' || order.status === 'Under review';
    return {
      amount: open ? order.credits : null,
      note: open ? 'On hold, with admin' : 'Decided by admin',
      returned: false,
    };
  }
  if (order.faultParty === 'courier') {
    return viewer === 'requester'
      ? { amount: order.credits, note: 'Refunded · courier at fault', returned: true }
      : { amount: 0, note: 'Not paid · you were at fault', returned: true };
  }
  const reason = order.faultParty === 'requester' ? 'requester at fault' : 'no one at fault';
  return viewer === 'requester'
    ? {
        amount: order.credits,
        note: `Paid · ${order.faultParty === 'requester' ? 'you were at fault' : reason}`,
        returned: false,
      }
    : { amount: order.credits, note: `Earned · ${reason}`, returned: false };
}

export interface OrderPage {
  orders: Order[];
  total: number;
}

function toPage(response: PageResponse<OrderResponse>): OrderPage {
  return { orders: response.content.map(toOrder), total: response.totalElements };
}

/** Straight-line distance in metres, for the task cards (haversine). */
export function distanceMetres(from: Coordinates, to: Coordinates): number {
  const radius = 6_371_000;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(to.latitude - from.latitude);
  const dLng = rad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

/**
 * Order F4: other users' Created orders. With a location the service ranks by
 * pickup distance then reward (within 5 km); without one, by reward only.
 *
 * TODO(ui): one page of 100 for now; NFR3.2 wants real paging.
 */
export async function fetchPool(location: Coordinates | null): Promise<OrderPage> {
  const params = new URLSearchParams({ page: '0', size: '100' });
  if (location !== null) {
    params.set('latitude', String(location.latitude));
    params.set('longitude', String(location.longitude));
  }
  return toPage(await api.get<PageResponse<OrderResponse>>(`/orders?${params.toString()}`));
}

/** Order F5: the signed-in requester's orders, newest first. */
export async function fetchMyRequests(): Promise<OrderPage> {
  return toPage(await api.get<PageResponse<OrderResponse>>('/orders/mine?page=0&size=100'));
}

/**
 * Order F5 from the courier's side: tasks in progress (Accepted, Collected,
 * Escalated, Under review), newest request first.
 */
export async function fetchActiveDeliveries(): Promise<OrderPage> {
  return toPage(await api.get<PageResponse<OrderResponse>>('/orders/deliveries/active?page=0&size=100'));
}

/**
 * Finished deliveries (Delivered, Acknowledged, Unacknowledged, Completed),
 * newest request first. Delivered is here although the requester has not
 * acknowledged yet: the courier's part is done.
 */
export async function fetchPastDeliveries(): Promise<OrderPage> {
  return toPage(await api.get<PageResponse<OrderResponse>>('/orders/deliveries/past?page=0&size=100'));
}

/** One order; only its requester or assigned courier may read it. */
export async function fetchOrder(orderId: string): Promise<Order> {
  return toOrder(await api.get<OrderResponse>(`/orders/${encodeURIComponent(orderId)}`));
}

export interface NewOrder {
  itemDescription: string;
  credits: number;
  expiryTime: Date;
  deliveryTime: Date;
  /** A Supplier Service id. */
  fromLocation: string;
  dropoff: NewDropoff;
}

/** A known point by id (lib/deliveryPoints), or a new place described in full. */
export type NewDropoff =
  | { deliveryPointId: number }
  | { name: string; building: string; description: string; latitude: number; longitude: number };

/** Order F1. Credits are reserved with the Credit Service before the row exists. */
export async function createOrder(order: NewOrder): Promise<Order> {
  return toOrder(
    await api.post<OrderResponse>('/orders', {
      itemDescription: order.itemDescription,
      credits: order.credits,
      expiryTime: order.expiryTime.toISOString(),
      deliveryTime: order.deliveryTime.toISOString(),
      fromLocation: order.fromLocation,
      ...('deliveryPointId' in order.dropoff
        ? { deliveryPointId: order.dropoff.deliveryPointId }
        : {
            dropoffName: order.dropoff.name,
            dropoffBuilding: order.dropoff.building,
            dropoffDescription: order.dropoff.description,
            dropoffLat: order.dropoff.latitude,
            dropoffLng: order.dropoff.longitude,
          }),
    }),
  );
}

/**
 * Order F2.2 accepts with an atomic compare-and-set, so a second courier
 * loses the race and must be told plainly rather than shown a generic error.
 */
export class AlreadyAcceptedError extends Error {
  constructor() {
    super('Someone already accepted this task');
    this.name = 'AlreadyAcceptedError';
  }
}

export async function acceptOrder(orderId: string): Promise<Order> {
  try {
    return toOrder(await api.post<OrderResponse>(`/orders/${encodeURIComponent(orderId)}/accept`));
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) throw new AlreadyAcceptedError();
    throw error;
  }
}

/** Requester from Created (credits released), or courier from Accepted (back to the pool). */
export async function cancelOrder(orderId: string): Promise<Order> {
  return toOrder(await api.post<OrderResponse>(`/orders/${encodeURIComponent(orderId)}/cancel`));
}

function photoForm(photo: File): FormData {
  const form = new FormData();
  form.append('photo', photo);
  return form;
}

/** Order F2.3: courier only, from Accepted, photo required. */
export async function collectOrder(orderId: string, photo: File): Promise<Order> {
  return toOrder(
    await api.post<OrderResponse>(`/orders/${encodeURIComponent(orderId)}/collect`, photoForm(photo)),
  );
}

/** Order F2.4: courier only, from Collected, photo required. */
export async function deliverOrder(orderId: string, photo: File): Promise<Order> {
  return toOrder(
    await api.post<OrderResponse>(`/orders/${encodeURIComponent(orderId)}/deliver`, photoForm(photo)),
  );
}

/** Order F2.6: requester only, from Collected or Delivered. */
export async function acknowledgeOrder(orderId: string): Promise<Order> {
  return toOrder(
    await api.post<OrderResponse>(`/orders/${encodeURIComponent(orderId)}/acknowledge`),
  );
}

/** Order's limit on the dispute description (EscalateRequest). */
export const DISPUTE_TEXT_MAX_LENGTH = 2000;

/**
 * The requester escalates from Collected or Delivered, before the
 * acknowledgement deadline. Order opens an Admin case with the description
 * and the order's photos, plus this one if given, and the order becomes
 * Escalated. 409 once it is too late or the status no longer allows it.
 */
export async function escalateOrder(orderId: string, disputeText: string, photo: File | null): Promise<Order> {
  const path = `/orders/${encodeURIComponent(orderId)}/escalate`;
  if (photo === null) {
    return toOrder(await api.post<OrderResponse>(path, { disputeText }));
  }
  const form = new FormData();
  form.append('disputeText', disputeText);
  form.append('photo', photo);
  return toOrder(await api.post<OrderResponse>(path, form));
}

/**
 * UI FR9.1.1 partitions the order lists into Active and History. Order F2's
 * lifecycle decides which side a status falls on: anything still capable of
 * changing is active, anything settled is history.
 */
const SETTLED_STATUSES: OrderStatus[] = [
  'Acknowledged',
  'Unacknowledged',
  'Completed',
  'Expired',
  'Cancelled',
];

export function isActiveStatus(status: OrderStatus): boolean {
  return !SETTLED_STATUSES.includes(status);
}

/** Photos are JPEG, PNG or WebP, at most 10 MB (order-service PhotoRules). */
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
