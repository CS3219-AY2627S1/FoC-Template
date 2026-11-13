import { Package } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Centered column with the FoC mark, shared by the login and signup pages. */
export function AuthLayout({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex min-h-dvh flex-col items-center justify-center px-6 py-12'>
      <div className='w-full max-w-sm'>
        <div className='flex flex-col items-center text-center'>
          <span className='bg-brand grid size-16 place-items-center rounded-2xl text-white'>
            <Package className='size-8' aria-hidden />
          </span>
          <h1 className='text-brand mt-4 text-3xl font-extrabold'>FoC</h1>
          <p className='mt-1 text-sm text-slate-500'>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

const NOTICE_STYLES = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  error: 'border-red-200 bg-red-50 text-red-700',
};

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof NOTICE_STYLES;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-xl border px-3 py-2.5 text-sm',
        NOTICE_STYLES[tone],
      )}
    >
      {children}
    </div>
  );
}
