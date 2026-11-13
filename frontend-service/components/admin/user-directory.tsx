'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';

import { UserBadges } from '@/components/admin/user-badges';
import { ErrorBanner, LoadMoreButton } from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePagedList } from '@/components/use-paged-list';
import type { PageResult } from '@/lib/action-result';
import { loadUsers } from '@/lib/admin-actions';
import {
  MAX_SEARCH_LENGTH,
  STATUS_LABELS,
  USER_STATUSES,
  type UserFilters,
  usersHref,
} from '@/lib/admin-users';
import { formatDateTime } from '@/lib/format';
import type { User } from '@/lib/user-service';
import { cn } from '@/lib/utils';

const STATUS_TABS = [
  { status: undefined, label: 'All' },
  ...USER_STATUSES.map((status) => ({ status, label: STATUS_LABELS[status] })),
];

export function UserDirectory({
  filters,
  initial,
  summary,
}: {
  filters: UserFilters;
  initial: PageResult<User>;
  /** Account totals shown above the list. */
  summary: React.ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(filters.q ?? '');
  const list = usePagedList(initial, (window) => loadUsers(filters, window));

  return (
    <PageContainer>
      <PageHeader title='Users'>
        <form
          role='search'
          className='flex gap-2'
          onSubmit={(e) => {
            e.preventDefault();
            router.push(usersHref({ ...filters, q: query.trim() }));
          }}
        >
          <div className='relative flex-1'>
            <Search
              className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400'
              aria-hidden
            />
            <Input
              type='search'
              aria-label='Search users'
              placeholder='Name, student number or email'
              maxLength={MAX_SEARCH_LENGTH}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className='h-11 rounded-xl bg-white pl-10'
            />
          </div>
          <Button
            type='submit'
            className='bg-courier hover:bg-courier/90 h-11 rounded-xl px-5 font-bold text-white'
          >
            Search
          </Button>
        </form>

        <nav
          aria-label='Filter by status'
          className='-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0'
        >
          {STATUS_TABS.map(({ status, label }) => {
            const selected = filters.status === status;
            return (
              <Link
                key={label}
                href={usersHref({ q: filters.q, status })}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
                  selected
                    ? 'border-courier bg-courier text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </PageHeader>

      <div className='space-y-4 px-4 pt-4 pb-6 md:px-0'>
        {summary}

        {list.error && <ErrorBanner>{list.error}</ErrorBanner>}

        {!list.error || list.items.length > 0 ? (
          <>
            <p className='text-sm text-slate-500'>
              {list.total} {list.total === 1 ? 'account' : 'accounts'}
              {filters.q && <> matching &ldquo;{filters.q}&rdquo;</>}
            </p>
            <ul className='divide-y rounded-2xl border bg-white'>
              {list.items.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className='flex items-center gap-3 px-4 py-3 hover:bg-slate-50'
                  >
                    <span className='bg-brand-tint text-brand-strong grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold'>
                      {user.display_name.charAt(0).toUpperCase()}
                    </span>
                    <div className='min-w-0 flex-1'>
                      <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900'>
                        <span className='truncate'>{user.display_name}</span>
                        <UserBadges role={user.role} status={user.status} />
                      </p>
                      <p className='truncate text-xs text-slate-500'>
                        {user.nus_student_number} · {user.email}
                      </p>
                      <p className='text-xs text-slate-400'>
                        Joined {formatDateTime(user.created_at)}
                      </p>
                    </div>
                    <ChevronRight
                      className='size-4 shrink-0 text-slate-400'
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
              {list.items.length === 0 && (
                <li className='px-4 py-10 text-center text-sm text-slate-500'>
                  No accounts match these filters.
                </li>
              )}
            </ul>
          </>
        ) : null}

        {list.hasMore && (
          <LoadMoreButton onClick={list.loadMore} loading={list.isLoading} />
        )}
      </div>
    </PageContainer>
  );
}
