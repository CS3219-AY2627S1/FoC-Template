import 'server-only';

import { unstable_cache } from 'next/cache';

import type { Order } from '@/lib/order-service';
import type { OrderView } from '@/lib/orders';
import { type Supplier, supplierService } from '@/lib/supplier-service';

/** How long a store looked up for an order card is reused, in seconds. */
export const SUPPLIER_CACHE_SECONDS = 30 * 60;

/**
 * Store details rarely change, and every feed page and order action needs
 * them, so lookups share Next's data cache across requests. A rename or
 * deletion can take up to this long to show on order cards; the store
 * directory and request form still read Supplier Service directly. A thrown
 * error (Supplier Service down) is not cached.
 */
const getCachedSupplier = unstable_cache(
  (id: string) => supplierService.getSupplier(id),
  ['order-view-supplier'],
  { revalidate: SUPPLIER_CACHE_SECONDS },
);

/**
 * Attaches each order's pickup store. Order Service only stores the supplier
 * id, so look up each distinct store once. A missing store does not hide the
 * order: the card falls back to a placeholder.
 */
export async function withSuppliers(orders: Order[]): Promise<OrderView[]> {
  const ids = [...new Set(orders.map((order) => order.pickup_supplier_id))];
  // `getSupplier` returns null for a deleted store and throws when Supplier
  // Service is down; `undefined` marks the second case.
  const suppliers = new Map<string, Supplier | null | undefined>(
    await Promise.all(
      ids.map(
        async (id) =>
          [id, await getCachedSupplier(id).catch(() => undefined)] as const,
      ),
    ),
  );
  return orders.map((order) => {
    const supplier = suppliers.get(order.pickup_supplier_id);
    return {
      ...order,
      supplier: supplier ?? null,
      supplierUnavailable: supplier === undefined,
    };
  });
}
