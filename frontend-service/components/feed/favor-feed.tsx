'use client';

import { useEffect, useMemo, useState } from 'react';

import { type AcceptState, FavorCard } from '@/components/feed/favor-card';
import {
  CardGrid,
  ErrorBanner,
  LoadMoreButton,
  RefreshButton,
} from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import { usePagedList } from '@/components/use-paged-list';
import type { PageResult } from '@/lib/action-result';
import { acceptOrder, loadOpenOrders } from '@/lib/order-actions';
import type { OrderView } from '@/lib/orders';
import { cn } from '@/lib/utils';

type SortKey = 'newest' | 'reward';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest First' },
  { key: 'reward', label: 'Highest Reward' },
];

const IDLE: AcceptState = { kind: 'idle' };

/**
 * Open errands from Order Service, which already excludes the caller's own
 * orders and anything that is no longer OPEN (FR12.1.2, FR13.5.1).
 */
export function FavorFeed({ initial }: { initial: PageResult<OrderView> }) {
  const list = usePagedList(initial, loadOpenOrders);
  const [sort, setSort] = useState<SortKey>('newest');
  const [accepts, setAccepts] = useState<Record<string, AcceptState>>({});
  // Ticks after hydration, so the first render still matches the server's.
  const [clock, setClock] = useState(0);
  const now = Math.max(list.loadedAt, clock);

  // Order Service returns newest first, so that order needs no re-sort.
  const sorted = useMemo(
    () =>
      sort === 'reward'
        ? [...list.items].sort((a, b) => b.credit_amount - a.credit_amount)
        : list.items,
    [list.items, sort],
  );

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function refresh() {
    setAccepts({});
    list.refresh();
  }

  async function accept(id: string) {
    setAccepts((prev) => ({ ...prev, [id]: { kind: 'pending' } }));
    let next: AcceptState;
    try {
      const result = await acceptOrder(id);
      next = result.ok
        ? { kind: 'accepted' }
        : { kind: 'failed', message: result.message };
    } catch {
      next = { kind: 'failed', message: 'Could not reach the server.' };
    }
    setAccepts((prev) => ({ ...prev, [id]: next }));
  }

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            <span className='text-brand'>FoC Feed</span>
            <span className='border-brand/50 bg-brand-soft text-brand-strong rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase md:text-xs'>
              Courier view
            </span>
          </>
        }
        actions={
          <RefreshButton
            label='Refresh feed'
            onClick={refresh}
            loading={list.isLoading}
          />
        }
      >
        <div
          role='tablist'
          aria-label='Sort favors'
          className='-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0'
        >
          {SORTS.map(({ key, label }) => (
            <button
              key={key}
              type='button'
              role='tab'
              aria-selected={sort === key}
              onClick={() => setSort(key)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors',
                sort === key
                  ? 'border-courier bg-courier text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {label}
              {key === 'newest' && ` (${list.total})`}
            </button>
          ))}
        </div>
      </PageHeader>

      {list.error && (
        <ErrorBanner className='mx-4 mt-4 md:mx-0'>{list.error}</ErrorBanner>
      )}

      <CardGrid
        empty={
          !list.error &&
          list.items.length === 0 &&
          'No open errands right now. Check back soon!'
        }
      >
        {sorted.map((order) => (
          <FavorCard
            key={order.id}
            order={order}
            state={accepts[order.id] ?? IDLE}
            now={now}
            onAccept={accept}
          />
        ))}
      </CardGrid>

      {list.hasMore && (
        <LoadMoreButton
          onClick={list.loadMore}
          loading={list.isLoading}
          className='px-4 pt-6 md:px-0'
        />
      )}
    </PageContainer>
  );
}
