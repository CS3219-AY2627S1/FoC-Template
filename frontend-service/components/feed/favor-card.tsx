import Link from 'next/link';
import { ArrowRight, Check, Clock, MapPin } from 'lucide-react';

import { CreditBadge } from '@/components/credit-badge';
import { OrderStoreThumbnail } from '@/components/orders/order-store';
import { Button } from '@/components/ui/button';
import { deliveryDetailsOf } from '@/lib/drop-off';
import { minutesSince } from '@/lib/format';
import {
  type OrderView,
  isNearExpiry,
  orderPickupLocation,
  orderStoreName,
} from '@/lib/orders';
import { cn } from '@/lib/utils';

export type AcceptState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'accepted' }
  | { kind: 'failed'; message: string };

type FavorCardProps = {
  order: OrderView;
  state: AcceptState;
  now: number;
  onAccept: (id: string) => void;
};

export function FavorCard({ order, state, now, onAccept }: FavorCardProps) {
  const minutesAgo = minutesSince(order.created_at, now);
  // Visual hint only, not a lifecycle state (FR13.5.1).
  const stale = isNearExpiry(order, now);
  const details = deliveryDetailsOf(
    order.delivery_label,
    order.delivery_details,
  );

  return (
    <article className='flex flex-col rounded-2xl border bg-white p-4 shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <OrderStoreThumbnail order={order} />
          <div className='min-w-0'>
            <p className='truncate font-bold text-slate-900'>
              {orderStoreName(order)}
            </p>
            <p className='truncate text-xs text-slate-500'>
              {order.supplier?.area ?? 'Campus errand'}
            </p>
          </div>
        </div>
        <CreditBadge credits={order.credit_amount} />
      </div>

      <dl className='mt-4 space-y-2 text-sm'>
        <div className='flex items-start gap-2'>
          <MapPin
            className='text-brand-strong mt-0.5 size-4 shrink-0'
            aria-hidden
          />
          <dt className='font-semibold text-slate-900'>Pickup:</dt>
          <dd className='text-slate-600'>{orderPickupLocation(order)}</dd>
        </div>
        <div className='flex items-start gap-2'>
          <ArrowRight
            className='text-courier mt-0.5 size-4 shrink-0'
            aria-hidden
          />
          <dt className='font-semibold text-slate-900'>Deliver:</dt>
          <dd className='min-w-0 text-slate-600'>
            {order.delivery_label}
            {details && (
              <span className='block text-xs break-words text-slate-500'>
                {details}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <p className='border-brand-soft bg-brand-tint text-brand-strong mt-4 rounded-lg border px-3 py-2.5 text-sm font-medium break-words whitespace-pre-line'>
        {order.item_description}
      </p>

      {state.kind === 'failed' && (
        <p role='alert' className='mt-3 text-sm text-red-600'>
          {state.message}
        </p>
      )}

      <div className='mt-auto flex items-center justify-between gap-3 pt-4'>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold',
            stale ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          <Clock className='size-3.5' aria-hidden />
          {minutesAgo} mins ago
        </span>
        {state.kind === 'accepted' ? (
          <Button
            asChild
            className='h-10 rounded-lg bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-700'
          >
            <Link href='/orders?role=courier'>
              <Check aria-hidden /> Accepted
            </Link>
          </Button>
        ) : (
          <Button
            onClick={() => onAccept(order.id)}
            disabled={state.kind === 'pending'}
            className='bg-courier hover:bg-courier/90 h-10 rounded-lg px-5 font-semibold text-white'
          >
            {state.kind === 'pending' ? 'Accepting…' : 'Accept Favor'}
          </Button>
        )}
      </div>
    </article>
  );
}
