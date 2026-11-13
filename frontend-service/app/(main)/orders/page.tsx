import type { Metadata } from 'next';

import { ErrandList } from '@/components/orders/errand-list';
import { loadMyOrders } from '@/lib/order-actions';
import { parseErrandStatus } from '@/lib/orders';

export const metadata: Metadata = { title: 'Orders · Friend on Campus' };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string | string[];
    status?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const status = parseErrandStatus(params.status);
  // Both lists load up front so each tab can show its count.
  const [requester, courier] = await Promise.all([
    loadMyOrders('requester', status),
    loadMyOrders('courier', status),
  ]);

  return (
    <ErrandList
      // A new filter brings new first pages, so start the lists afresh.
      key={status ?? 'all'}
      initialRole={params.role === 'courier' ? 'courier' : 'requester'}
      status={status}
      initial={{ requester, courier }}
    />
  );
}
