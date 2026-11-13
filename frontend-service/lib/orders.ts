import type { Order, OrderRole, OrderStatus } from '@/lib/order-service';
import type { Supplier } from '@/lib/supplier-service';
import { formatSupplierLocation } from '@/lib/suppliers';

/** An order with its pickup store, which Order Service only references by id. */
export type OrderView = Order & {
  /** Null when the store was deleted or Supplier Service is unavailable. */
  supplier: Supplier | null;
  /** True when the lookup failed, as opposed to the store being deleted. */
  supplierUnavailable: boolean;
};

/** Failure code from `createOrder` when the idempotency key was already used. */
export const DUPLICATE_SUBMISSION = 'DUPLICATE_SUBMISSION';

/** Order Service limits, from `order-service/app/schemas.py`. */
export const MAX_CREDIT_AMOUNT = 1000;
export const MAX_ITEM_DESCRIPTION_LENGTH = 500;
export const MAX_DELIVERY_LABEL_LENGTH = 200;
export const MAX_DELIVERY_DETAILS_LENGTH = 500;

/**
 * Requesters may cancel or move the drop-off until the courier picks up.
 * Mirrors `REQUESTER_CANCELLABLE` and `DESTINATION_MUTABLE` in
 * `order-service/app/services/orders.py`.
 */
export const PRE_PICKUP_STATUSES: readonly OrderStatus[] = [
  'PENDING_CREDIT',
  'OPEN',
  'ACCEPTED',
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CREDIT: 'Reserving credit',
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked Up',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  REJECTED: 'Rejected',
};

/** Badge colours per status, shared by every order view. */
export const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING_CREDIT: 'bg-slate-100 text-slate-600',
  OPEN: 'bg-blue-50 text-blue-700',
  ACCEPTED: 'bg-courier-soft text-courier',
  PICKED_UP: 'bg-sky-50 text-sky-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-600',
  EXPIRED: 'bg-slate-100 text-slate-500',
  REJECTED: 'bg-red-50 text-red-600',
};

/**
 * Statuses a user can narrow their own errand list to. Reserving credit lasts
 * only seconds, so it has no filter of its own; "All" still shows it.
 */
export const ERRAND_STATUS_FILTERS: readonly OrderStatus[] = [
  'OPEN',
  'ACCEPTED',
  'PICKED_UP',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
];

/** A status filter from the URL; anything unknown means every status. */
export function parseErrandStatus(value: unknown): OrderStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return ERRAND_STATUS_FILTERS.find((status) => status === raw);
}

/** The orders page for one role tab and status filter. */
export function errandsHref(role: OrderRole, status: OrderStatus | undefined) {
  const query = new URLSearchParams({ role });
  if (status) query.set('status', status);
  return `/orders?${query}`;
}

/**
 * Statuses that never change again, so nobody can cancel them. Mirrors
 * `TERMINAL_STATUSES` in `order-service/app/services/orders.py`; an admin can
 * cancel any other order, including one that was picked up.
 */
export const CLOSED_STATUSES: readonly OrderStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
];

export function isClosed(order: Pick<Order, 'status'>) {
  return CLOSED_STATUSES.includes(order.status);
}

const REJECTION_REASONS: Record<string, string> = {
  INSUFFICIENT_CREDIT: 'You did not have enough available credit.',
  ACCOUNT_NOT_FOUND: 'Your credit account could not be found.',
};

export function formatRejectionReason(reason: string | null) {
  return (
    (reason && REJECTION_REASONS[reason]) ?? 'Credit could not be reserved.'
  );
}

/**
 * True in the second half of an open errand's lifetime. Uses the order's own
 * `expires_at`, so it follows Order Service if the expiry window changes.
 */
export function isNearExpiry(order: Order, now: number) {
  const created = new Date(order.created_at).getTime();
  const expires = new Date(order.expires_at).getTime();
  return now >= created + (expires - created) / 2;
}

/** Pickup store name, or a placeholder when Supplier Service has no record. */
export function orderStoreName(order: OrderView) {
  if (order.supplier) return order.supplier.name;
  return order.supplierUnavailable
    ? 'Store details unavailable'
    : 'Store no longer listed';
}

export function orderPickupLocation(order: OrderView) {
  return order.supplier
    ? formatSupplierLocation(order.supplier) || order.supplier.area
    : 'Pickup details unavailable';
}
