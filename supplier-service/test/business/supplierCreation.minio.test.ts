/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote the MinIO-backed creation workflow tests from the Phase 2 plan (Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/business/supplierCreation.minio.test.ts to test/business/supplierCreation.minio.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): the repository fake gains findCurrent and updateSupplier so it type-checks (Phase 3 Task 5; file not listed in the plan).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added softDelete: vi.fn() to the repository fake so it still satisfies the interface (Phase 4 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): the service is built with the new update dependency and the fake loses reactivateSupplier (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import type { SupplierWriteRepository } from '../../src/persistence/supplierWriteRepository.js';
import { createMinioTestStorage } from '../storage/minioTestStorage.js';
import type { CreateSupplierInput } from '../../src/validation/supplierInput.js';
import { createSupplierCreationService } from '../../src/business/supplierCreationService.js';

const input: CreateSupplierInput = {
  name: 'Minio Facility',
  type: 'Facility',
  desc: null,
  locationId: 1,
  categoryIds: [],
  hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }],
};
const photos = [
  { buffer: Buffer.from('one'), mimeType: 'image/png' as const },
  { buffer: Buffer.from('two'), mimeType: 'image/jpeg' as const },
];

function repo(overrides: Partial<SupplierWriteRepository> = {}): SupplierWriteRepository {
  return {
    findByIdentity: vi.fn().mockResolvedValue(null),
    locationExists: vi.fn().mockResolvedValue(true),
    findMissingCategoryIds: vi.fn().mockResolvedValue([]),
    insertSupplier: vi.fn().mockResolvedValue(1),
    findCurrent: vi.fn().mockResolvedValue(null),
    updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: [] }),
    softDelete: vi.fn(),
    ...overrides,
  };
}

describe('creation workflow against the local MinIO', () => {
  it('stores each photo, hands the returned locations to the repository in order, and keeps them', async () => {
    const write = repo();
    const service = createSupplierCreationService({
      repo: write,
      storage: createMinioTestStorage(),
      reader: { getAdminSupplier: vi.fn().mockResolvedValue({ id: 1 }) },
      update: { updateSupplier: vi.fn() },
    });
    await service.createSupplier(input, photos, { userId: 'u-1' });

    const record = vi.mocked(write.insertSupplier).mock.calls[0]?.[0];
    const locations = record?.photoLocations ?? [];
    expect(locations).toHaveLength(2);
    try {
      expect(await (await fetch(locations[0] ?? '')).text()).toBe('one');
      expect(await (await fetch(locations[1] ?? '')).text()).toBe('two');
    } finally {
      const storage = createMinioTestStorage();
      await Promise.all(locations.map((location) => storage.delete(location)));
    }
  });

  it('removes the uploaded objects from MinIO when the database transaction fails', async () => {
    const write = repo({ insertSupplier: vi.fn().mockRejectedValue(new Error('db down')) });
    const service = createSupplierCreationService({
      repo: write,
      storage: createMinioTestStorage(),
      reader: { getAdminSupplier: vi.fn() },
      update: { updateSupplier: vi.fn() },
    });

    await expect(service.createSupplier(input, photos, { userId: 'u-1' })).rejects.toMatchObject({ statusCode: 500 });

    // insertSupplier rejected, so recover the locations from the call it received.
    const locations = vi.mocked(write.insertSupplier).mock.calls[0]?.[0].photoLocations ?? [];
    expect(locations).toHaveLength(2);
    for (const location of locations) {
      expect((await fetch(location)).status).toBe(404);
    }
  });
});
