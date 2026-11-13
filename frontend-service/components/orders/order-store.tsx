'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Store } from 'lucide-react';

import type { OrderView } from '@/lib/orders';
import { supplierImageSrc } from '@/lib/suppliers';
import { cn } from '@/lib/utils';

export function OrderStoreThumbnail({
  order,
  className,
}: {
  order: OrderView;
  className?: string;
}) {
  const src = order.supplier && supplierImageSrc(order.supplier);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    return (
      // Unoptimized: the browser fetches the image directly from its host
      // instead of through the Next.js image optimizer.
      <Image
        src={src}
        alt=''
        width={44}
        height={44}
        unoptimized
        onError={() => setFailedSrc(src)}
        className={cn('size-11 shrink-0 rounded-xl object-cover', className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'bg-courier grid size-11 shrink-0 place-items-center rounded-xl text-white',
        className,
      )}
    >
      <Store className='size-5' aria-hidden />
    </span>
  );
}
