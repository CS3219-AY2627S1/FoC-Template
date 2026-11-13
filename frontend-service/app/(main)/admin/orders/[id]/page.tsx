import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OrderReview } from '@/components/admin/order-review';
import { ErrorBanner } from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import { loadOrderAsAdmin, loadUser } from '@/lib/admin-actions';
import { requireAdminView } from '@/lib/session';
import type { User } from '@/lib/user-service';

export const metadata: Metadata = {
  title: 'Order · Admin · Friend on Campus',
};

/** The participant's account, or null if it can't be read right now. */
async function participant(userId: string | null): Promise<User | null> {
  if (!userId) return null;
  const result = await loadUser(userId);
  return result.ok ? result.user : null;
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [, { id }] = await Promise.all([requireAdminView(), params]);
  const result = await loadOrderAsAdmin(id);

  if (!result.ok) {
    if (result.status === 404) notFound();
    return (
      <PageContainer>
        <PageHeader title='Order' />
        <ErrorBanner className='mx-4 mt-4 md:mx-0'>
          {result.message}
        </ErrorBanner>
      </PageContainer>
    );
  }

  const [requester, courier] = await Promise.all([
    participant(result.order.requester_id),
    participant(result.order.courier_id),
  ]);

  return (
    <OrderReview
      initialOrder={result.order}
      requester={requester}
      courier={courier}
    />
  );
}
