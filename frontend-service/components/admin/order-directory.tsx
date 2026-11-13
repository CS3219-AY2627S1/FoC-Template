'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Ban, ChevronRight, Search } from 'lucide-react';

import {
  OrderActivityChart,
  SeriesKey,
} from '@/components/admin/order-activity-chart';
import { ErrorBanner, LoadMoreButton } from '@/components/list-controls';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePagedList } from '@/components/use-paged-list';
import type { ActionResult, PageResult } from '@/lib/action-result';
import { cancelOrderAsAdmin, loadAllOrders } from '@/lib/admin-actions';
import {
  ACTIVITY_LABELS,
  ACTIVITY_SERIES,
  ORDER_FILTERS,
  type OrderFilterKey,
  activityTotals,
  ordersHref,
} from '@/lib/admin-orders';
import { formatDateTime } from '@/lib/format';
import type { OrderActivity } from '@/lib/order-service';
import {
  type OrderView,
  STATUS_LABELS,
  STATUS_STYLES,
  orderStoreName,
} from '@/lib/orders';
import { cn } from '@/lib/utils';

function ActivityPanel({
  result,
}: {
  result: ActionResult<{ activity: OrderActivity }>;
}) {
  if (!result.ok) {
    return (
      <ErrorBanner>Order activity is unavailable: {result.message}</ErrorBanner>
    );
  }
  const { buckets } = result.activity;
  const pastHour = activityTotals(buckets.slice(-1));
  const pastDay = activityTotals(buckets);

  return (
    <section className='space-y-4 rounded-2xl border bg-white p-5 shadow-sm'>
      <div>
        <h2 className='text-base font-bold text-slate-900'>Order activity</h2>
        <p className='mt-1 text-sm text-slate-500'>
          Orders created, accepted and completed in each hour of the past day.
        </p>
      </div>

      <dl className='grid grid-cols-3 gap-3'>
        {ACTIVITY_SERIES.map((series) => (
          <div key={series} className='rounded-xl border p-3'>
            <dt className='flex items-center gap-1.5 text-xs font-medium text-slate-500'>
              <SeriesKey series={series} />
              {ACTIVITY_LABELS[series]}
            </dt>
            <dd className='mt-1 text-2xl font-bold text-slate-900'>
              {pastHour[series]}
              <span className='ml-1 text-xs font-medium text-slate-500'>
                past hour
              </span>
            </dd>
            <dd className='text-xs text-slate-500'>
              {pastDay[series]} in 24 h
            </dd>
          </div>
        ))}
      </dl>

      <OrderActivityChart buckets={buckets} />
    </section>
  );
}

/** Cancel for an order the courier has picked up but not delivered. */
function CancelPickedUp({
  order,
  onCancelled,
}: {
  order: OrderView;
  onCancelled: (order: OrderView) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isConfirming) {
    return (
      <Button
        variant='outline'
        size='sm'
        onClick={() => {
          setError(null);
          setIsConfirming(true);
        }}
        className='rounded-lg border-red-200 font-semibold text-red-600 hover:bg-red-50 hover:text-red-700'
      >
        <Ban aria-hidden />
        Cancel
      </Button>
    );
  }

  return (
    <div className='flex flex-col items-end gap-2 text-right'>
      <p className='max-w-60 text-xs text-slate-600'>
        Close this order? The courier is paid the {order.credit_amount} cr
        reward from the requester&apos;s held credit.
      </p>
      {error && (
        <p role='alert' className='max-w-60 text-xs text-red-600'>
          {error}
        </p>
      )}
      <div className='flex gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={isPending}
          onClick={() => setIsConfirming(false)}
          className='rounded-lg'
        >
          Keep
        </Button>
        <Button
          size='sm'
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelOrderAsAdmin(order.id).catch(
                () => null,
              );
              if (result?.ok) {
                setIsConfirming(false);
                onCancelled(result.order);
              } else {
                setError(result?.message ?? 'Something went wrong. Try again.');
              }
            })
          }
          className='rounded-lg bg-red-600 font-semibold text-white hover:bg-red-700'
        >
          {isPending ? 'Cancelling…' : 'Cancel order'}
        </Button>
      </div>
    </div>
  );
}

export function OrderDirectory({
  filter,
  initial,
  activity,
  invalidId,
}: {
  filter: OrderFilterKey;
  initial: PageResult<OrderView>;
  activity: ActionResult<{ activity: OrderActivity }>;
  /** The ID from a lookup that wasn't a valid order ID. */
  invalidId: string | null;
}) {
  const list = usePagedList(initial, (window) => loadAllOrders(filter, window));
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <PageContainer>
      <PageHeader title='Orders'>
        <form method='get' className='flex gap-2'>
          <div className='relative flex-1'>
            <Search
              className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400'
              aria-hidden
            />
            <Input
              name='id'
              aria-label='Order ID'
              placeholder='Open an order by ID'
              defaultValue={invalidId ?? ''}
              autoComplete='off'
              spellCheck={false}
              className='h-11 rounded-xl bg-white pl-10 font-mono text-sm'
            />
          </div>
          <Button
            type='submit'
            className='bg-courier hover:bg-courier/90 h-11 rounded-xl px-5 font-bold text-white'
          >
            Open
          </Button>
        </form>
        {invalidId && (
          <ErrorBanner className='mt-2'>
            That isn&apos;t a valid order ID.
          </ErrorBanner>
        )}
      </PageHeader>

      <div className='space-y-4 px-4 pt-4 pb-6 md:px-0'>
        <ActivityPanel result={activity} />

        <nav
          aria-label='Filter by status'
          className='-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0'
        >
          {ORDER_FILTERS.map(({ key, label }) => (
            <Link
              key={key}
              href={ordersHref(key)}
              aria-current={filter === key ? 'page' : undefined}
              className={cn(
                'flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-colors',
                filter === key
                  ? 'border-courier bg-courier text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {list.error && <ErrorBanner>{list.error}</ErrorBanner>}
        {notice && (
          <p
            role='status'
            className='rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
          >
            {notice}
          </p>
        )}

        {(!list.error || list.items.length > 0) && (
          <>
            <p className='text-sm text-slate-500'>
              {list.total} {list.total === 1 ? 'order' : 'orders'}
            </p>
            <ul className='divide-y rounded-2xl border bg-white'>
              {list.items.map((order) => (
                <li
                  key={order.id}
                  className='flex items-center gap-3 px-4 py-3 hover:bg-slate-50'
                >
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className='min-w-0 flex-1'
                  >
                    <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900'>
                      <span className='truncate'>{order.item_description}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          STATUS_STYLES[order.status],
                        )}
                      >
                        {STATUS_LABELS[order.status]}
                      </span>
                    </p>
                    <p className='truncate text-xs text-slate-500'>
                      {orderStoreName(order)} → {order.delivery_label} ·{' '}
                      {order.credit_amount} cr
                    </p>
                    <p className='text-xs text-slate-400'>
                      Created {formatDateTime(order.created_at)}
                      {order.picked_up_at &&
                        ` · picked up ${formatDateTime(order.picked_up_at)}`}
                    </p>
                  </Link>
                  {order.status === 'PICKED_UP' && (
                    <CancelPickedUp
                      order={order}
                      onCancelled={(next) => {
                        list.replace(next);
                        setNotice('Order cancelled and the courier paid.');
                      }}
                    />
                  )}
                  <Link
                    href={`/admin/orders/${order.id}`}
                    aria-label='Open order'
                    className='shrink-0 text-slate-400 hover:text-slate-600'
                  >
                    <ChevronRight className='size-4' aria-hidden />
                  </Link>
                </li>
              ))}
              {list.items.length === 0 && (
                <li className='px-4 py-10 text-center text-sm text-slate-500'>
                  No orders here.
                </li>
              )}
            </ul>
          </>
        )}

        {list.hasMore && (
          <LoadMoreButton onClick={list.loadMore} loading={list.isLoading} />
        )}
      </div>
    </PageContainer>
  );
}
