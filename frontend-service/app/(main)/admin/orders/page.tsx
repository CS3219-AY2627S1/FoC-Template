import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OrderDirectory } from '@/components/admin/order-directory';
import { loadAllOrders, loadOrderActivity } from '@/lib/admin-actions';
import { parseOrderFilter } from '@/lib/admin-orders';
import { isUuid } from '@/lib/admin-users';
import { requireAdminView } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Orders · Admin · Friend on Campus',
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string | string[];
    filter?: string | string[];
  }>;
}) {
  const [, params] = await Promise.all([requireAdminView(), searchParams]);

  // The "Open an order by ID" form submits here as `?id=`.
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const id = rawId?.trim() ?? '';
  if (isUuid(id)) redirect(`/admin/orders/${id.toLowerCase()}`);

  const filter = parseOrderFilter(params.filter);
  const [initial, activity] = await Promise.all([
    loadAllOrders(filter),
    loadOrderActivity(),
  ]);

  return (
    // A new filter remounts the list so paging starts over.
    <OrderDirectory
      key={filter}
      filter={filter}
      initial={initial}
      activity={activity}
      invalidId={id || null}
    />
  );
}
