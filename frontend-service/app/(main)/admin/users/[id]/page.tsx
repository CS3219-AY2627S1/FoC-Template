import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { UserReview } from '@/components/admin/user-review';
import { ErrorBanner } from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import {
  loadUser,
  loadUserBalance,
  loadUserTransactions,
} from '@/lib/admin-actions';
import { requireAdminView } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Review account · Admin · Friend on Campus',
};

export default async function AdminUserReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [admin, { id }] = await Promise.all([requireAdminView(), params]);
  const [user, credit, transactions] = await Promise.all([
    loadUser(id),
    loadUserBalance(id),
    loadUserTransactions(id),
  ]);

  if (!user.ok) {
    if (user.status === 404) notFound();
    return (
      <PageContainer>
        <PageHeader title='Review account' />
        <ErrorBanner className='mx-4 mt-4 md:mx-0'>{user.message}</ErrorBanner>
      </PageContainer>
    );
  }

  return (
    <UserReview
      initialUser={user.user}
      actorId={admin.id}
      credit={credit}
      initialTransactions={transactions}
    />
  );
}
