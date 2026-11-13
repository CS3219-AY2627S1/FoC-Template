import type { Metadata } from 'next';

import {
  type StoreDirectoryData,
  StoreDirectoryPage,
} from '@/components/request/store-directory-page';
import { SupplierServiceError, supplierService } from '@/lib/supplier-service';
import { SUPPLIER_PAGE_SIZE } from '@/lib/suppliers';

export const metadata: Metadata = {
  title: 'Select Store · Friend on Campus',
};

async function loadDirectory(): Promise<StoreDirectoryData> {
  try {
    const [categories, areas, page] = await Promise.all([
      supplierService.listCategories(),
      supplierService.listAreas(),
      supplierService.listSuppliers({ limit: SUPPLIER_PAGE_SIZE }),
    ]);
    return { ok: true, categories, areas, page };
  } catch (error) {
    if (error instanceof SupplierServiceError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export default async function RequestStorePage() {
  return <StoreDirectoryPage data={await loadDirectory()} />;
}
