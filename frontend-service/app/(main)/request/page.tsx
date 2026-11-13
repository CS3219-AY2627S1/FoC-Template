import type { Metadata } from 'next';

import { RequestErrand } from '@/components/request/request-errand';
import { getCreditBalance } from '@/lib/credit-balance';
import { INITIAL_CREDIT_ALLOCATION } from '@/lib/credit-service';
import {
  type Supplier,
  SupplierServiceError,
  supplierService,
} from '@/lib/supplier-service';

export const metadata: Metadata = { title: 'Request · Friend on Campus' };

async function loadStore(storeId: string | string[] | undefined) {
  if (typeof storeId !== 'string') return { store: null, storeError: null };
  try {
    const store: Supplier | null = await supplierService.getSupplier(storeId);
    return {
      store,
      storeError: store ? null : 'That store is no longer available.',
    };
  } catch (error) {
    if (!(error instanceof SupplierServiceError)) throw error;
    return { store: null, storeError: error.message };
  }
}

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string | string[] }>;
}) {
  const { store: storeId } = await searchParams;
  const [{ store, storeError }, credit] = await Promise.all([
    loadStore(storeId),
    getCreditBalance(),
  ]);

  // Keyed so choosing another store remounts the form with it preselected.
  return (
    <RequestErrand
      key={store?.id ?? 'none'}
      initialStore={store}
      storeError={storeError}
      credit={credit}
      initialAllocation={INITIAL_CREDIT_ALLOCATION}
    />
  );
}
