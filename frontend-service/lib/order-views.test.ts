import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Order } from '@/lib/order-service';
import { withSuppliers } from '@/lib/order-views';
import { supplierService } from '@/lib/supplier-service';

// Next's data cache only exists inside a running server; call straight through.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

function order(id: string, supplierId: string) {
  return { id, pickup_supplier_id: supplierId } as Order;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withSuppliers', () => {
  it('looks up each store once and tells deleted stores from outages', async () => {
    const getSupplier = vi
      .spyOn(supplierService, 'getSupplier')
      .mockImplementation(async (id) => {
        if (id === 'down') throw new Error('unavailable');
        if (id === 'gone') return null;
        return { id, name: 'Cafe' } as never;
      });

    const [a, b, gone, down] = await withSuppliers([
      order('1', 'cafe'),
      order('2', 'cafe'),
      order('3', 'gone'),
      order('4', 'down'),
    ]);

    expect(getSupplier).toHaveBeenCalledTimes(3);
    expect(a.supplier?.name).toBe('Cafe');
    expect(b.supplier).toBe(a.supplier);
    expect(gone).toMatchObject({ supplier: null, supplierUnavailable: false });
    expect(down).toMatchObject({ supplier: null, supplierUnavailable: true });
  });
});
