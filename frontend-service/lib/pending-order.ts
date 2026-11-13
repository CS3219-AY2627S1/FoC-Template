/**
 * An errand submission whose outcome is unknown: it was sent, but no answer
 * said whether Order Service created it. Its idempotency key must be reused
 * for the same request, or a retry could post the errand twice. It is kept in
 * `sessionStorage` so a refresh doesn't lose it; that storage is per tab, so
 * two tabs never share a key.
 */

import type { OrderCreate } from '@/lib/order-service';

export type PendingOrder<Form> = {
  key: string;
  request: OrderCreate;
  /** The form as it was submitted, to restore after a refresh. */
  form: Form;
};

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'foc:pending-order';

/**
 * Whether a failed attempt may still have created the order. Order Service
 * checks the request before inserting, so a 4xx means nothing was posted
 * under the key; a 5xx, including the 503 for a timeout, says nothing.
 */
export function isUncertainFailure(status: number) {
  return status >= 500;
}

/** Whether two requests would hash the same in Order Service. */
export function sameRequest(a: OrderCreate, b: OrderCreate) {
  return (
    a.pickup_supplier_id === b.pickup_supplier_id &&
    a.item_description === b.item_description &&
    a.credit_amount === b.credit_amount &&
    a.delivery.label === b.delivery.label &&
    a.delivery.latitude === b.delivery.latitude &&
    a.delivery.longitude === b.delivery.longitude &&
    a.delivery.details === b.delivery.details
  );
}

/** `sessionStorage`, or null where the browser blocks it. */
function sessionStore(): KeyValueStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadPendingOrder<Form>(
  store: KeyValueStore | null = sessionStore(),
): PendingOrder<Form> | null {
  try {
    const saved = JSON.parse(store?.getItem(STORAGE_KEY) ?? 'null');
    if (
      typeof saved?.key === 'string' &&
      typeof saved.request?.pickup_supplier_id === 'string' &&
      typeof saved.request.delivery === 'object' &&
      saved.form
    ) {
      return saved;
    }
  } catch {
    // Unreadable or corrupt: treat it as nothing pending.
  }
  return null;
}

export function savePendingOrder<Form>(
  pending: PendingOrder<Form>,
  store: KeyValueStore | null = sessionStore(),
) {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Storage full or blocked: the key still lives in memory until a refresh.
  }
}

export function clearPendingOrder(
  store: KeyValueStore | null = sessionStore(),
) {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
