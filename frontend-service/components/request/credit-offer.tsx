'use client';

import Link from 'next/link';
import { Award, Minus, Plus } from 'lucide-react';

import type { CreditBalanceResult } from '@/lib/credit-actions';

function BalanceHint({
  credit,
  initialAllocation,
}: {
  credit: CreditBalanceResult;
  initialAllocation: number;
}) {
  let text: string;
  if (!credit.ok) text = 'Balance unavailable';
  else if (!credit.balance)
    text = `Starting credit: ${initialAllocation} cr, added with your first errand`;
  else text = `Available: ${credit.balance.available_balance} cr`;

  return (
    <Link
      href='/credits'
      className='text-brand-strong text-xs font-semibold hover:underline'
    >
      {text}
    </Link>
  );
}

type CreditOfferProps = {
  value: number;
  onChange: (value: number) => void;
  /** Highest offer allowed; below 1 means there is nothing to offer. */
  max: number;
  credit: CreditBalanceResult;
  initialAllocation: number;
};

/** The reward stepper, bounded to 1–`max`. */
export function CreditOffer({
  value,
  onChange,
  max,
  credit,
  initialAllocation,
}: CreditOfferProps) {
  const hasCredit = max >= 1;

  return (
    <div className='rounded-2xl border bg-white p-4 shadow-xs'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='text-sm font-bold text-slate-900'>
          Credit Reward Offer
        </span>
        <BalanceHint credit={credit} initialAllocation={initialAllocation} />
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-4'>
        <div className='border-brand/40 bg-brand-soft flex items-center rounded-xl border'>
          <button
            type='button'
            aria-label='Decrease credits'
            disabled={!hasCredit || value <= 1}
            onClick={() => onChange(Math.max(1, Math.min(value - 1, max)))}
            className='text-brand-strong grid size-11 place-items-center disabled:opacity-40'
          >
            <Minus className='size-4' />
          </button>
          <span
            aria-live='polite'
            className='text-brand-strong flex min-w-16 items-center justify-center gap-1 text-base font-bold'
          >
            <Award className='size-4' aria-hidden />
            {value} cr
          </span>
          <button
            type='button'
            aria-label='Increase credits'
            disabled={!hasCredit || value >= max}
            onClick={() => onChange(Math.min(value + 1, max))}
            className='text-brand-strong grid size-11 place-items-center disabled:opacity-40'
          >
            <Plus className='size-4' />
          </button>
        </div>
        <p className='flex-1 text-xs text-slate-500'>
          Held from your balance until the errand is done, and returned if it is
          cancelled or expires before a courier accepts it.
        </p>
      </div>
      {!hasCredit && (
        <p role='alert' className='mt-2 text-xs text-red-600'>
          You have no available credit to offer.
        </p>
      )}
    </div>
  );
}
