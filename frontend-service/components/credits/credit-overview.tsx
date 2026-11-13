'use client';

import { Award } from 'lucide-react';

import { ErrorBanner, LoadMoreButton } from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import { usePagedList } from '@/components/use-paged-list';
import type { PageResult } from '@/lib/action-result';
import {
  type CreditBalanceResult,
  loadTransactions,
} from '@/lib/credit-actions';
import type { CreditTransaction } from '@/lib/credit-service';
import {
  type CreditChangeTone,
  describeTransaction,
  formatCreditChange,
} from '@/lib/credits';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const TONE_CLASSES: Record<CreditChangeTone, string> = {
  gain: 'text-emerald-700',
  loss: 'text-red-600',
  movement: 'text-slate-500',
  none: 'text-slate-400',
};

function BalanceTile({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        emphasis ? 'border-brand-soft bg-brand-tint' : 'bg-white',
      )}
    >
      <p className='text-xs font-medium text-slate-500'>{label}</p>
      <p
        className={cn(
          'mt-1 flex items-center gap-1.5 text-2xl font-bold',
          emphasis ? 'text-brand-strong' : 'text-slate-900',
        )}
      >
        {emphasis && <Award className='size-5' aria-hidden />}
        {value} cr
      </p>
    </div>
  );
}

type CreditOverviewProps = {
  credit: CreditBalanceResult;
  initialTransactions: PageResult<CreditTransaction>;
};

export function CreditOverview({
  credit,
  initialTransactions,
}: CreditOverviewProps) {
  const history = usePagedList(initialTransactions, loadTransactions);

  return (
    <PageContainer>
      <PageHeader title='Credits' />

      <div className='space-y-6 px-4 pt-4 md:px-0'>
        {!credit.ok ? (
          <ErrorBanner>{credit.message}</ErrorBanner>
        ) : credit.balance ? (
          <div className='grid gap-3 sm:grid-cols-3'>
            <BalanceTile
              label='Available'
              value={credit.balance.available_balance}
              emphasis
            />
            <BalanceTile
              label='Held for open errands'
              value={credit.balance.reserved_balance}
            />
            <BalanceTile label='Total' value={credit.balance.total_balance} />
          </div>
        ) : (
          <p className='rounded-2xl border bg-white p-4 text-sm text-slate-600'>
            You don&apos;t have a credit account yet. Your starting credit is
            added when you post or deliver your first errand.
          </p>
        )}

        <section>
          <h2 className='text-lg font-bold text-slate-900'>History</h2>
          {history.error && (
            <p role='alert' className='mt-2 text-sm text-red-600'>
              {history.error}
            </p>
          )}
          <ul className='mt-3 divide-y rounded-2xl border bg-white'>
            {history.items.map((transaction) => {
              const change = formatCreditChange(transaction);
              return (
                <li
                  key={transaction.id}
                  className='flex items-center justify-between gap-3 px-4 py-3'
                >
                  <div className='min-w-0'>
                    <p className='text-sm font-semibold break-words text-slate-900'>
                      {describeTransaction(transaction)}
                    </p>
                    <p className='text-xs text-slate-400'>
                      {formatDateTime(transaction.created_at)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-bold whitespace-nowrap',
                      TONE_CLASSES[change.tone],
                    )}
                  >
                    {change.text}
                  </span>
                </li>
              );
            })}
            {!history.error && history.items.length === 0 && (
              <li className='px-4 py-10 text-center text-sm text-slate-500'>
                No credit activity yet.
              </li>
            )}
          </ul>
          {history.hasMore && (
            <LoadMoreButton
              onClick={history.loadMore}
              loading={history.isLoading}
              className='pt-4'
            />
          )}
        </section>
      </div>
    </PageContainer>
  );
}
