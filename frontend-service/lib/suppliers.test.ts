import { afterEach, expect, it, vi } from 'vitest';

import type { Supplier } from '@/lib/supplier-service';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  'http://localhost:8090',
  'http://localhost:8090/',
  'https://images.example.com/suppliers///',
])('joins a configured base URL consistently: %s', async (base) => {
  vi.stubEnv('NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL', base);
  vi.resetModules();
  const { supplierImageSrc } = await import('@/lib/suppliers');
  expect(supplierImageSrc({ image_key: 'ANNA.jpeg' } as Supplier)).toBe(
    `${base.replace(/\/+$/, '')}/ANNA.jpeg`,
  );
  expect(supplierImageSrc({ image_key: null } as Supplier)).toBeNull();
});

it('retains the GitHub default without configuration', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL', undefined);
  vi.resetModules();
  const { supplierImageSrc } = await import('@/lib/suppliers');
  expect(supplierImageSrc({ image_key: 'ANNA.jpeg' } as Supplier)).toBe(
    'https://raw.githubusercontent.com/CS3219-AY2627S1/FoC-Template/main/data/images/ANNA.jpeg',
  );
});
