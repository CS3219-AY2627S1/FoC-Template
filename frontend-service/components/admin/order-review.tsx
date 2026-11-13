'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, TriangleAlert } from 'lucide-react';

import { UserBadges } from '@/components/admin/user-badges';
import { Notice } from '@/components/auth/auth-layout';
import { PageContainer, PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { cancelOrderAsAdmin } from '@/lib/admin-actions';
import { formatDateTime } from '@/lib/format';
import {
  type OrderView,
  STATUS_LABELS,
  STATUS_STYLES,
  formatRejectionReason,
  isClosed,
  orderPickupLocation,
  orderStoreName,
} from '@/lib/orders';
import type { User } from '@/lib/user-service';
import { cn } from '@/lib/utils';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className='rounded-2xl border bg-white p-5 shadow-sm'>
      <h2 className='text-base font-bold text-slate-900'>{title}</h2>
      {description && (
        <p className='mt-1 text-sm text-slate-500'>{description}</p>
      )}
      <div className='mt-4'>{children}</div>
    </section>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-xs font-medium text-slate-500'>{label}</dt>
      <dd className='mt-0.5 text-sm break-words text-slate-900'>{children}</dd>
    </div>
  );
}

function Participant({
  label,
  userId,
  user,
}: {
  label: string;
  userId: string | null;
  user: User | null;
}) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border p-3'>
      <div className='min-w-0'>
        <p className='text-xs font-medium text-slate-500'>{label}</p>
        {userId ? (
          <Link
            href={`/admin/users/${userId}`}
            className='text-courier block truncate text-sm font-semibold hover:underline'
          >
            {user ? user.display_name : userId}
          </Link>
        ) : (
          <p className='text-sm text-slate-500'>No courier yet</p>
        )}
        {user && (
          <p className='truncate text-xs text-slate-500'>
            {user.nus_student_number}
          </p>
        )}
      </div>
      {user && <UserBadges role={user.role} status={user.status} />}
    </div>
  );
}

/** Who cancelled, in terms of the order's participants. */
function cancelledByLabel(order: OrderView) {
  if (!order.cancelled_by) return null;
  if (order.cancelled_by === order.requester_id) return 'the requester';
  if (order.cancelled_by === order.courier_id) return 'the courier';
  return 'an administrator';
}

/** What happens to the held reward, which depends on how far the order got. */
function cancellationEffect(order: OrderView) {
  return order.status === 'PICKED_UP'
    ? `The courier has already picked up the items, so cancelling pays them the ${order.credit_amount} cr reward from the requester's held credit.`
    : `The requester's ${order.credit_amount} cr held for this order is returned to them.`;
}

function CancelOrder({
  order,
  onChange,
}: {
  order: OrderView;
  onChange: (order: OrderView) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const noticeBanner = notice && (
    <Notice tone={notice.ok ? 'info' : 'error'}>{notice.text}</Notice>
  );

  if (isClosed(order)) {
    return (
      <div className='space-y-3'>
        {noticeBanner}
        <p className='text-sm text-slate-600'>
          This order is {STATUS_LABELS[order.status].toLowerCase()} and can no
          longer change.
        </p>
      </div>
    );
  }

  const afterPickup = order.status === 'PICKED_UP';

  function run() {
    startTransition(async () => {
      const result = await cancelOrderAsAdmin(order.id).catch(() => null);
      setIsConfirming(false);
      if (result?.ok) {
        onChange(result.order);
        setNotice({ ok: true, text: 'Order cancelled.' });
      } else {
        setNotice({
          ok: false,
          text: result?.message ?? 'Something went wrong. Try again.',
        });
      }
    });
  }

  return (
    <div className='space-y-3'>
      {noticeBanner}
      {afterPickup && (
        <p className='flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>
          <TriangleAlert className='mt-0.5 size-4 shrink-0' aria-hidden />
          Only an administrator can cancel an order after pickup.
        </p>
      )}
      {isConfirming ? (
        <>
          <p className='text-sm text-slate-700'>
            {cancellationEffect(order)} This cannot be undone.
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={isPending}
              onClick={run}
              className='h-11 rounded-xl bg-red-600 px-5 font-bold text-white hover:bg-red-700'
            >
              {isPending ? 'Cancelling…' : 'Yes, cancel order'}
            </Button>
            <Button
              variant='outline'
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
              className='h-11 rounded-xl px-5'
            >
              Keep order
            </Button>
          </div>
        </>
      ) : (
        <Button
          onClick={() => {
            setNotice(null);
            setIsConfirming(true);
          }}
          className='h-11 rounded-xl bg-red-600 px-5 font-bold text-white hover:bg-red-700'
        >
          <Ban aria-hidden />
          Cancel order
        </Button>
      )}
    </div>
  );
}

export function OrderReview({
  initialOrder,
  requester,
  courier,
}: {
  initialOrder: OrderView;
  requester: User | null;
  courier: User | null;
}) {
  const [order, setOrder] = useState(initialOrder);
  const cancelledBy = cancelledByLabel(order);

  const timeline: [string, string | null][] = [
    ['Created', order.created_at],
    ['Accepted', order.accepted_at],
    ['Picked up', order.picked_up_at],
    ['Completed', order.completed_at],
    [
      cancelledBy ? `Cancelled by ${cancelledBy}` : 'Cancelled',
      order.cancelled_at,
    ],
    ['Expired', order.expired_at],
  ];

  return (
    <PageContainer>
      <PageHeader
        title='Order'
        actions={
          <Button variant='outline' asChild className='h-10 rounded-xl'>
            <Link href='/admin/orders'>
              <ArrowLeft aria-hidden />
              All orders
            </Link>
          </Button>
        }
      />

      <div className='mx-auto max-w-3xl space-y-4 px-4 pt-4 pb-6 md:px-0'>
        <section className='rounded-2xl border bg-white p-5 shadow-sm'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-lg font-bold break-words text-slate-900'>
                {order.item_description}
              </p>
              <p className='text-sm text-slate-500'>
                {orderStoreName(order)} · {order.credit_amount} cr reward
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                STATUS_STYLES[order.status],
              )}
            >
              {STATUS_LABELS[order.status]}
            </span>
          </div>

          <dl className='mt-5 grid gap-4 sm:grid-cols-2'>
            <Detail label='Pickup'>{orderPickupLocation(order)}</Detail>
            <Detail label='Drop-off'>
              {order.delivery_label}
              {order.delivery_details && (
                <span className='block text-slate-500'>
                  {order.delivery_details}
                </span>
              )}
            </Detail>
            {order.status === 'REJECTED' && (
              <Detail label='Rejected because'>
                {formatRejectionReason(order.rejection_reason)}
              </Detail>
            )}
            <Detail label='Order ID'>
              <span className='font-mono text-xs break-all'>{order.id}</span>
            </Detail>
          </dl>
        </section>

        <Section title='People'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Participant
              label='Requester'
              userId={order.requester_id}
              user={requester}
            />
            <Participant
              label='Courier'
              userId={order.courier_id}
              user={courier}
            />
          </div>
        </Section>

        <Section title='Timeline'>
          <ol className='space-y-2'>
            {timeline
              .filter((entry): entry is [string, string] => entry[1] !== null)
              .map(([label, at]) => (
                <li key={label} className='flex justify-between gap-3 text-sm'>
                  <span className='text-slate-700'>{label}</span>
                  <span className='text-slate-500'>{formatDateTime(at)}</span>
                </li>
              ))}
            {(order.status === 'PENDING_CREDIT' || order.status === 'OPEN') && (
              <li className='flex justify-between gap-3 text-sm'>
                <span className='text-slate-700'>Expires if unaccepted</span>
                <span className='text-slate-500'>
                  {formatDateTime(order.expires_at)}
                </span>
              </li>
            )}
          </ol>
        </Section>

        <Section
          title='Cancel order'
          description='Administrators can cancel any order that has not closed, including after pickup.'
        >
          <CancelOrder order={order} onChange={setOrder} />
        </Section>
      </div>
    </PageContainer>
  );
}
