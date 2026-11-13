'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CircleCheck, CircleX, Clock, LoaderCircle } from 'lucide-react';

import { useSettledOrder } from '@/components/request/use-settled-order';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { type OrderView, formatRejectionReason } from '@/lib/orders';

export function OrderConfirmation({
  order,
  onReset,
}: {
  order: OrderView;
  onReset: () => void;
}) {
  const router = useRouter();
  const { settled, stalled } = useSettledOrder(order);
  const storeName = settled.supplier?.name ?? 'the store';

  // Refresh the layout so the side nav shows the reserved balance.
  useEffect(() => {
    if (settled.status !== 'PENDING_CREDIT') router.refresh();
  }, [settled.status, router]);

  const content = {
    STALLED: {
      icon: <Clock className='mx-auto size-12 text-slate-400' />,
      title: 'Still reserving credit',
      body: 'This is taking longer than usual. My Errands shows the latest status.',
    },
    PENDING_CREDIT: {
      icon: (
        <LoaderCircle className='mx-auto size-12 animate-spin text-slate-400' />
      ),
      title: 'Reserving credit…',
      body: `Holding ${settled.credit_amount} cr so couriers can see your errand.`,
    },
    OPEN: {
      icon: <CircleCheck className='mx-auto size-12 text-emerald-600' />,
      title: 'Request posted!',
      body: `Couriers can now see your errand from ${storeName}. ${settled.credit_amount} cr is held until it is done, or returned if no courier accepts by ${formatDateTime(settled.expires_at)}.`,
    },
    REJECTED: {
      icon: <CircleX className='mx-auto size-12 text-red-600' />,
      title: 'Request not posted',
      body: formatRejectionReason(settled.rejection_reason),
    },
  }[
    settled.status === 'PENDING_CREDIT'
      ? stalled
        ? 'STALLED'
        : 'PENDING_CREDIT'
      : settled.status === 'REJECTED'
        ? 'REJECTED'
        : 'OPEN'
  ];

  return (
    <div
      aria-live='polite'
      className='rounded-2xl border bg-white p-6 text-center shadow-sm'
    >
      {content.icon}
      <h2 className='mt-3 text-xl font-bold text-slate-900'>{content.title}</h2>
      <p className='mt-1 text-sm text-slate-500'>{content.body}</p>
      <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center'>
        <Button
          asChild
          className='bg-courier hover:bg-courier/90 h-11 rounded-xl px-6 font-semibold text-white'
        >
          <Link href='/orders'>View my errands</Link>
        </Button>
        <Button
          variant='outline'
          onClick={onReset}
          className='h-11 rounded-xl px-6 font-semibold'
        >
          Post another
        </Button>
      </div>
    </div>
  );
}
