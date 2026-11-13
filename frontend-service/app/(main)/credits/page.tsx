import type { Metadata } from 'next';

import { CreditOverview } from '@/components/credits/credit-overview';
import { loadTransactions } from '@/lib/credit-actions';
import { getCreditBalance } from '@/lib/credit-balance';

export const metadata: Metadata = { title: 'Credits · Friend on Campus' };

export default async function CreditsPage() {
  const [credit, transactions] = await Promise.all([
    getCreditBalance(),
    loadTransactions(),
  ]);
  return <CreditOverview credit={credit} initialTransactions={transactions} />;
}
