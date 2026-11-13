import type { OrderActivityBucket, OrderStatus } from '@/lib/order-service';

export type OrderFilterKey =
  | 'all'
  | 'open'
  | 'accepted'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'rejected';

/** Tabs on the admin order list, each matching the listed order statuses. */
export const ORDER_FILTERS: readonly {
  key: OrderFilterKey;
  label: string;
  statuses: readonly OrderStatus[];
}[] = [
  { key: 'all', label: 'All', statuses: [] },
  { key: 'open', label: 'Open', statuses: ['OPEN'] },
  { key: 'accepted', label: 'Accepted', statuses: ['ACCEPTED'] },
  { key: 'completed', label: 'Completed', statuses: ['COMPLETED'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
  { key: 'expired', label: 'Expired', statuses: ['EXPIRED'] },
  { key: 'rejected', label: 'Rejected', statuses: ['REJECTED'] },
];

/** A filter key from the URL or a Server Action; anything unknown is "all". */
export function parseOrderFilter(value: unknown): OrderFilterKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return ORDER_FILTERS.find((f) => f.key === raw)?.key ?? 'all';
}

export function orderFilterStatuses(key: OrderFilterKey) {
  return ORDER_FILTERS.find((f) => f.key === key)?.statuses ?? [];
}

export function ordersHref(key: OrderFilterKey) {
  return key === 'all' ? '/admin/orders' : `/admin/orders?filter=${key}`;
}

export const ACTIVITY_SERIES = ['created', 'accepted', 'completed'] as const;
export type ActivitySeries = (typeof ACTIVITY_SERIES)[number];

export const ACTIVITY_LABELS: Record<ActivitySeries, string> = {
  created: 'Created',
  accepted: 'Accepted',
  completed: 'Completed',
};

/** Totals per series across the given buckets. */
export function activityTotals(buckets: readonly OrderActivityBucket[]) {
  const totals: Record<ActivitySeries, number> = {
    created: 0,
    accepted: 0,
    completed: 0,
  };
  for (const bucket of buckets) {
    for (const series of ACTIVITY_SERIES) totals[series] += bucket[series];
  }
  return totals;
}

/**
 * The y-axis top and its integer tick values. Counts are whole orders, so the
 * axis steps by whole numbers and never collapses to zero height.
 */
export function countAxis(max: number, tickCount = 4) {
  const step = Math.max(1, Math.ceil(max / tickCount));
  const top = Math.max(step * tickCount, tickCount);
  const ticks = Array.from(
    { length: Math.floor(top / step) + 1 },
    (_, i) => i * step,
  );
  return { top, ticks };
}
