import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ErrorBanner({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role='alert'
      className={cn(
        'rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function RefreshButton({
  label,
  onClick,
  loading,
}: {
  label: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      onClick={onClick}
      disabled={loading}
      className='bg-brand-soft text-brand-strong hover:bg-brand/30 grid size-10 place-items-center rounded-full transition-colors disabled:opacity-60'
    >
      <RefreshCw className={cn('size-5', loading && 'animate-spin')} />
    </button>
  );
}

export function LoadMoreButton({
  onClick,
  loading,
  className,
}: {
  onClick: () => void;
  loading: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex justify-center', className)}>
      <Button
        variant='outline'
        onClick={onClick}
        disabled={loading}
        className='h-11 rounded-xl px-6 font-semibold'
      >
        {loading ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}

/** Responsive grid for order cards, with a message when it is empty. */
export function CardGrid({
  children,
  empty,
}: {
  children: React.ReactNode;
  /** Shown instead of the cards; pass null to show nothing. */
  empty: React.ReactNode | null;
}) {
  return (
    <div className='grid gap-4 px-4 pt-4 md:grid-cols-2 md:px-0 xl:grid-cols-3'>
      {children}
      {empty && (
        <p className='col-span-full py-12 text-center text-sm text-slate-500'>
          {empty}
        </p>
      )}
    </div>
  );
}
