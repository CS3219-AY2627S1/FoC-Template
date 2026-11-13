'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import {
  Check,
  Clock,
  Coffee,
  type LucideIcon,
  MapPin,
  Printer,
  ShoppingBag,
  Store as StoreIcon,
  UtensilsCrossed,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { loadSuppliers } from '@/lib/supplier-actions';
import type { Category, Supplier, SupplierPage } from '@/lib/supplier-service';
import {
  formatOpeningHours,
  formatSupplierLocation,
  supplierImageSrc,
} from '@/lib/suppliers';
import { cn } from '@/lib/utils';

// Categories are a controlled vocabulary, but new ones fall back to StoreIcon.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Food: UtensilsCrossed,
  Coffee: Coffee,
  Shopping: ShoppingBag,
  Printing: Printer,
};

function SupplierThumbnail({ supplier }: { supplier: Supplier }) {
  const src = supplierImageSrc(supplier);
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
        className='size-11 shrink-0 rounded-xl object-cover'
      />
    );
  }
  const Icon =
    supplier.categories
      .map((category) => CATEGORY_ICONS[category.name])
      .find(Boolean) ?? StoreIcon;
  return (
    <span className='bg-courier grid size-11 shrink-0 place-items-center rounded-xl text-white'>
      <Icon className='size-5' aria-hidden />
    </span>
  );
}

const chipClass =
  'h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors';

type Filters = { area: string; categoryIds: string[] };

type StoreDirectoryProps = {
  categories: Category[];
  areas: string[];
  initialPage: SupplierPage;
  selectedId?: string;
  onSelect: (supplier: Supplier) => void;
  className?: string;
};

export function StoreDirectory({
  categories,
  areas,
  initialPage,
  selectedId,
  onSelect,
  className,
}: StoreDirectoryProps) {
  const [filters, setFilters] = useState<Filters>({
    area: '',
    categoryIds: [],
  });
  const [suppliers, setSuppliers] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Only the latest request may update the list when filters change quickly.
  const latestRequest = useRef(0);

  function fetchPage(next: Filters, offset: number) {
    const requestId = ++latestRequest.current;
    startTransition(async () => {
      const result = await loadSuppliers({
        area: next.area || undefined,
        categoryIds: next.categoryIds,
        offset,
      });
      if (requestId !== latestRequest.current) return;
      if (!result.ok) {
        setError(result.message);
        // A failed filter change must not leave results for the old filters
        // on screen; a failed "Load more" keeps the pages that still match.
        if (offset === 0) {
          setSuppliers([]);
          setTotal(0);
        }
        return;
      }
      setError(null);
      setTotal(result.page.total);
      setSuppliers((current) =>
        offset === 0 ? result.page.items : [...current, ...result.page.items],
      );
    });
  }

  function applyFilters(next: Filters) {
    setFilters(next);
    fetchPage(next, 0);
  }

  function toggleCategory(id: string) {
    const { categoryIds } = filters;
    applyFilters({
      ...filters,
      categoryIds: categoryIds.includes(id)
        ? categoryIds.filter((c) => c !== id)
        : [...categoryIds, id],
    });
  }

  const allCategories = filters.categoryIds.length === 0;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className='space-y-3'>
        <label className='block'>
          <span className='sr-only'>Filter by area</span>
          <select
            value={filters.area}
            onChange={(e) => applyFilters({ ...filters, area: e.target.value })}
            className='focus:ring-brand/40 h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2'
          >
            <option value=''>All areas</option>
            {areas.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>

        <div
          role='group'
          aria-label='Filter by category'
          className='flex gap-2 overflow-x-auto pb-1'
        >
          <button
            type='button'
            aria-pressed={allCategories}
            onClick={() => applyFilters({ ...filters, categoryIds: [] })}
            className={cn(
              chipClass,
              allCategories
                ? 'border-brand bg-brand text-white'
                : 'bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            All
          </button>
          {categories.map((category) => {
            const active = filters.categoryIds.includes(category.id);
            return (
              <button
                key={category.id}
                type='button'
                aria-pressed={active}
                onClick={() => toggleCategory(category.id)}
                className={cn(
                  chipClass,
                  active
                    ? 'border-brand bg-brand text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p
          role='alert'
          className='mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'
        >
          {error}
        </p>
      )}

      <ul
        aria-busy={pending}
        className={cn(
          'mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pb-1 transition-opacity',
          pending && 'opacity-60',
        )}
      >
        {suppliers.map((supplier) => {
          const selected = supplier.id === selectedId;
          return (
            <li key={supplier.id}>
              <button
                type='button'
                onClick={() => onSelect(supplier)}
                aria-pressed={selected}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300',
                  selected && 'border-courier ring-courier/20 ring-2',
                )}
              >
                <SupplierThumbnail supplier={supplier} />
                <span className='min-w-0 flex-1'>
                  <span className='flex items-start justify-between gap-2'>
                    <span className='truncate font-bold text-slate-900'>
                      {supplier.name}
                    </span>
                    <span className='flex shrink-0 gap-1'>
                      {supplier.categories.map((category) => (
                        <span
                          key={category.id}
                          className='bg-brand-soft text-brand-strong rounded-md px-2 py-0.5 text-[11px] font-semibold'
                        >
                          {category.name}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className='mt-1 flex items-center gap-1 text-xs text-slate-500'>
                    <MapPin className='size-3.5 shrink-0' aria-hidden />
                    <span className='truncate'>
                      {[formatSupplierLocation(supplier), supplier.area]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className='mt-0.5 flex items-center gap-1 text-xs text-slate-500'>
                    <Clock className='size-3.5 shrink-0' aria-hidden />
                    <span className='truncate'>
                      {formatOpeningHours(supplier)}
                    </span>
                  </span>
                </span>
                {selected && (
                  <Check className='text-courier size-5 shrink-0' aria-hidden />
                )}
              </button>
            </li>
          );
        })}
        {suppliers.length === 0 && !pending && !error && (
          <li className='py-10 text-center text-sm text-slate-500'>
            No stores match these filters.
          </li>
        )}
        {suppliers.length < total && (
          <li className='flex justify-center pt-1'>
            <Button
              type='button'
              variant='outline'
              disabled={pending}
              onClick={() => fetchPage(filters, suppliers.length)}
              className='h-10 rounded-xl px-5 font-semibold'
            >
              Load more stores
            </Button>
          </li>
        )}
      </ul>
    </div>
  );
}
