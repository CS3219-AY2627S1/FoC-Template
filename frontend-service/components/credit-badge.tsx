import { Award } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CreditBadge({
  credits,
  className,
}: {
  credits: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'border-brand/40 bg-brand-soft text-brand-strong inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-bold whitespace-nowrap',
        className,
      )}
    >
      <Award className='size-4' aria-hidden />
      {credits} cr
    </span>
  );
}
