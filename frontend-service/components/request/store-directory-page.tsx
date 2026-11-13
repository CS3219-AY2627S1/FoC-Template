'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { PageContainer } from '@/components/page-header';
import { StoreDirectory } from '@/components/request/store-directory';
import type { Category, Supplier, SupplierPage } from '@/lib/supplier-service';

export type StoreDirectoryData =
  | { ok: true; categories: Category[]; areas: string[]; page: SupplierPage }
  | { ok: false; message: string };

export function StoreDirectoryPage({ data }: { data: StoreDirectoryData }) {
  const router = useRouter();

  function selectStore(supplier: Supplier) {
    router.push(`/request?store=${supplier.id}`);
  }

  return (
    <PageContainer className='flex min-h-dvh flex-col md:min-h-0'>
      <header className='sticky top-0 z-30 flex items-center gap-2 border-b bg-white/95 px-4 py-3 backdrop-blur md:static md:border-none md:bg-transparent md:px-0 md:pt-8 md:pb-4 md:backdrop-blur-none'>
        <button
          type='button'
          aria-label='Back to request form'
          onClick={() => router.back()}
          className='grid size-10 shrink-0 place-items-center rounded-full text-slate-700 hover:bg-slate-100'
        >
          <ArrowLeft className='size-5' />
        </button>
        <h1 className='text-xl font-bold text-slate-900 md:text-2xl'>
          Campus Store Directory
        </h1>
      </header>

      {data.ok ? (
        <StoreDirectory
          categories={data.categories}
          areas={data.areas}
          initialPage={data.page}
          onSelect={selectStore}
          className='min-h-0 flex-1 px-4 pt-4 pb-4 md:px-0'
        />
      ) : (
        <p
          role='alert'
          className='mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 md:mx-0'
        >
          {data.message}
        </p>
      )}
    </PageContainer>
  );
}
