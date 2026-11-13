import Link from 'next/link';

import { STATUS_LABELS, USER_STATUSES, usersHref } from '@/lib/admin-users';
import type { UserStatus } from '@/lib/user-service';
import { cn } from '@/lib/utils';

export type AccountCounts = Record<UserStatus | 'all', number | null>;

const ACCENTS: Record<UserStatus | 'all', string> = {
  all: 'text-slate-900',
  active: 'text-emerald-700',
  suspended: 'text-red-600',
  deactivated: 'text-slate-500',
};

/**
 * Account totals by status. Each tile filters the list to that status; the
 * totals ignore the search, so following a tile clears it. A null count could
 * not be read and shows as a dash.
 */
export function AccountSummary({
  counts,
  selected,
}: {
  counts: AccountCounts;
  selected?: UserStatus;
}) {
  return (
    <section
      aria-label='Accounts by status'
      className='grid grid-cols-2 gap-3 lg:grid-cols-4'
    >
      {(['all', ...USER_STATUSES] as const).map((key) => {
        const status = key === 'all' ? undefined : key;
        const isSelected = selected === status;
        return (
          <Link
            key={key}
            href={usersHref({ status })}
            aria-current={isSelected ? 'page' : undefined}
            className={cn(
              'rounded-2xl border bg-white p-4 shadow-sm transition-colors hover:border-slate-300',
              isSelected && 'border-courier ring-courier/20 ring-2',
            )}
          >
            <p className='text-xs font-medium text-slate-500'>
              {key === 'all' ? 'All accounts' : STATUS_LABELS[key]}
            </p>
            <p className={cn('mt-1 text-2xl font-bold', ACCENTS[key])}>
              {counts[key] ?? '–'}
            </p>
          </Link>
        );
      })}
    </section>
  );
}
