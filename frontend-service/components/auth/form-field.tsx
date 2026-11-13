import type { LucideIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FormFieldProps = React.ComponentProps<'input'> & {
  id: string;
  label: string;
  icon: LucideIcon;
  error?: string;
  hint?: string;
};

/** Labelled input with a leading icon and an inline error or hint. */
export function FormField({
  id,
  label,
  icon: Icon,
  error,
  hint,
  className,
  ...props
}: FormFieldProps) {
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='relative'>
        <Icon
          className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400'
          aria-hidden
        />
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn('h-12 rounded-xl pl-10', className)}
          {...props}
        />
      </div>
      {message && (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-red-600' : 'text-slate-500')}
        >
          {message}
        </p>
      )}
    </div>
  );
}
