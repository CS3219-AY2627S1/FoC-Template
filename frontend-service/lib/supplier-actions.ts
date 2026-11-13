'use server';

import {
  type SupplierFilters,
  type SupplierPage,
  SupplierServiceError,
  supplierService,
} from '@/lib/supplier-service';
import { SUPPLIER_PAGE_SIZE } from '@/lib/suppliers';

export type SupplierPageResult =
  | { ok: true; page: SupplierPage }
  | { ok: false; message: string };

/** Lets the store directory filter and paginate without reaching the service. */
export async function loadSuppliers(
  filters: Omit<SupplierFilters, 'limit'>,
): Promise<SupplierPageResult> {
  try {
    const page = await supplierService.listSuppliers({
      ...filters,
      limit: SUPPLIER_PAGE_SIZE,
    });
    return { ok: true, page };
  } catch (error) {
    if (error instanceof SupplierServiceError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
