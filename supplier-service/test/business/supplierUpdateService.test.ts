/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the supplier update saga (Phase 3 plan Task 6).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added softDelete: vi.fn() to the repository fake so it still satisfies the interface (Phase 4 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): removed the queue dependency and the enqueue tests; added tests for the onPhotosRemoved outbox-task builder (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added reactivation-mode tests; the fake loses reactivateSupplier (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added a reactivation-plus-photo-edit test; the reactivation builder accepts existing photos and an upload stub.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): CurrentSupplier fake gains isActive; tests for queueing the suspension task when a supplier is set inactive.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import type { CurrentSupplier, SupplierWriteRepository } from '../../src/persistence/supplierWriteRepository.js';
import { createInMemoryPhotoStorage } from '../storage/inMemoryPhotoStorage.js';
import { buildPhotoCleanupTask, buildSuspensionTask } from '../../src/queue/tasks.js';
import { AppError } from '../../src/utils/AppError.js';
import type { UpdateSupplierInput } from '../../src/validation/supplierUpdateInput.js';
import { createSupplierUpdateService } from '../../src/business/supplierUpdateService.js';

const NOW = new Date('2026-09-29T02:00:00Z');
const current: CurrentSupplier = {
  supplierId: 101, name: 'Campus Store', type: 'Store', locationId: 4, isDeleted: false, isActive: true, version: 3,
  photos: [{ photoId: 1, location: 'loc-a' }, { photoId: 2, location: 'loc-b' }],
};
const png = { buffer: Buffer.from('p'), mimeType: 'image/png' as const };
const base: UpdateSupplierInput = { version: 3, isPhotoDirty: false };

function setup(overrides: Partial<SupplierWriteRepository> = {}) {
  const repo: SupplierWriteRepository = {
    findByIdentity: vi.fn().mockResolvedValue(null),
    locationExists: vi.fn().mockResolvedValue(true),
    findMissingCategoryIds: vi.fn().mockResolvedValue([]),
    insertSupplier: vi.fn(),
    findCurrent: vi.fn().mockResolvedValue(current),
    updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: [] }),
    softDelete: vi.fn(),
    ...overrides,
  };
  const storage = createInMemoryPhotoStorage();
  const reader = { getAdminSupplier: vi.fn().mockResolvedValue({ id: 101, version: 4 }) };
  const service = createSupplierUpdateService({ repo, storage, reader, clock: () => NOW });
  return { repo, storage, reader, service };
}

describe('updateSupplier', () => {
  it('404s an unknown or soft-deleted supplier', async () => {
    const missing = setup({ findCurrent: vi.fn().mockResolvedValue(null) });
    await expect(missing.service.updateSupplier(101, base, [])).rejects.toMatchObject({ statusCode: 404 });
    const deleted = setup({ findCurrent: vi.fn().mockResolvedValue({ ...current, isDeleted: true }) });
    await expect(deleted.service.updateSupplier(101, base, [])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('409s a stale version before uploading anything', async () => {
    const { service, storage, repo } = setup();
    await expect(service.updateSupplier(101, { ...base, version: 2 }, [png])).rejects.toMatchObject({ statusCode: 409 });
    expect(storage.objects.size).toBe(0);
    expect(repo.updateSupplier).not.toHaveBeenCalled();
  });

  it('writes only the sent fields and returns 200 with the admin detail', async () => {
    const { service, repo, reader } = setup();
    const result = await service.updateSupplier(101, { ...base, name: 'New Name', isActive: false }, []);

    expect(result).toEqual({ statusCode: 200, body: { id: 101, version: 4 } });
    expect(repo.updateSupplier).toHaveBeenCalledWith(101, {
      version: 3, now: '2026-09-29 10:00:00', name: 'New Name', isActive: false,
      extraTasks: [buildSuspensionTask(101)],
    });
    expect(reader.getAdminSupplier).toHaveBeenCalledWith(101);
  });

  it('queues no suspension task when isActive stays true or the supplier was already inactive', async () => {
    const stays = setup();
    await stays.service.updateSupplier(101, { ...base, isActive: true }, []);
    expect(stays.repo.updateSupplier).toHaveBeenCalledWith(101, expect.not.objectContaining({ extraTasks: expect.anything() }));

    const already = setup({ findCurrent: vi.fn().mockResolvedValue({ ...current, isActive: false }) });
    await already.service.updateSupplier(101, { ...base, isActive: false }, []);
    expect(already.repo.updateSupplier).toHaveBeenCalledWith(101, expect.not.objectContaining({ extraTasks: expect.anything() }));
  });

  it('422s a collision with another supplier but allows the supplier itself', async () => {
    const other = setup({ findByIdentity: vi.fn().mockResolvedValue({ supplierId: 7, isDeleted: false }) });
    await expect(other.service.updateSupplier(101, { ...base, name: 'Dup' }, [])).rejects.toMatchObject({ statusCode: 422 });
    const same = setup({ findByIdentity: vi.fn().mockResolvedValue({ supplierId: 101, isDeleted: false }) });
    await expect(same.service.updateSupplier(101, { ...base, name: 'campus store' }, [])).resolves.toMatchObject({ statusCode: 200 });
  });

  it('422s an unknown location and unknown categories', async () => {
    const loc = setup({ locationExists: vi.fn().mockResolvedValue(false) });
    await expect(loc.service.updateSupplier(101, { ...base, locationId: 9 }, [])).rejects.toMatchObject({ statusCode: 422 });
    const cat = setup({ findMissingCategoryIds: vi.fn().mockResolvedValue([9]) });
    await expect(cat.service.updateSupplier(101, { ...base, categoryIds: [9] }, [])).rejects.toMatchObject({ statusCode: 422 });
  });

  it('re-derives hours when the type changes to Facility, and requires hours when it changes to Store', async () => {
    const toFacility = setup();
    await toFacility.service.updateSupplier(101, { ...base, type: 'Facility' }, []);
    expect(toFacility.repo.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ type: 'Facility', hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }] }),
    );
    const toStore = setup({ findCurrent: vi.fn().mockResolvedValue({ ...current, type: 'Facility' }) });
    await expect(toStore.service.updateSupplier(101, { ...base, type: 'Store' }, [])).rejects.toMatchObject({ statusCode: 422 });
  });

  it('parses sent Store hours into the change', async () => {
    const { service, repo } = setup();
    await service.updateSupplier(101, { ...base, openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]' }, []);
    expect(repo.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }] }),
    );
  });

  it('uploads new photos and writes the resolved order', async () => {
    const { service, repo, storage } = setup();
    await service.updateSupplier(
      101,
      { ...base, isPhotoDirty: true, photoIds: [2, 'ph-1'], placeholderIds: ['ph-1'] },
      [png],
    );

    expect(storage.objects.size).toBe(1);
    expect(repo.updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ photos: [{ kind: 'existing', photoId: 2 }, { kind: 'new', location: 'memory://photos/1' }] }),
    );
  });

  it('422s uploaded files while isPhotoDirty is false, uploading nothing', async () => {
    const { service, storage } = setup();
    await expect(service.updateSupplier(101, base, [png])).rejects.toMatchObject({ statusCode: 422 });
    expect(storage.objects.size).toBe(0);
  });

  it('500s and saves nothing when an upload fails, cleaning up earlier uploads', async () => {
    const { service, storage, repo } = setup();
    const original = storage.upload.bind(storage);
    let calls = 0;
    storage.upload = async (file) => {
      calls += 1;
      if (calls === 2) throw new Error('boom');
      return original(file);
    };
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: ['a', 'b'], placeholderIds: ['a', 'b'] }, [png, png]),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(repo.updateSupplier).not.toHaveBeenCalled();
    expect(storage.objects.size).toBe(0);
  });

  it('cleans up new uploads and 500s when the transaction fails', async () => {
    const { service, storage } = setup({ updateSupplier: vi.fn().mockRejectedValue(new Error('db')) });
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: ['a'], placeholderIds: ['a'] }, [png]),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(storage.objects.size).toBe(0);
  });

  it('cleans up and rethrows the 409 raised inside the transaction', async () => {
    const conflict = new AppError(409, 'Conflict', 'stale');
    const { service, storage } = setup({ updateSupplier: vi.fn().mockRejectedValue(conflict) });
    await expect(
      service.updateSupplier(101, { ...base, isPhotoDirty: true, photoIds: ['a'], placeholderIds: ['a'] }, [png]),
    ).rejects.toBe(conflict);
    expect(storage.objects.size).toBe(0);
  });

  it('hands the repository a builder of image_cleanup outbox tasks when the photo set is edited', async () => {
    const { service, repo } = setup();
    // isPhotoDirty true with photo_ids [] and no files: every current photo is excluded
    await service.updateSupplier(101, { version: 3, isPhotoDirty: true, photoIds: [], placeholderIds: [] }, []);
    const change = vi.mocked(repo.updateSupplier).mock.calls[0]?.[1] as {
      onPhotosRemoved?: (p: Array<{ photoId: number; location: string }>) => unknown;
    };
    expect(change.onPhotosRemoved?.([{ photoId: 7, location: 'loc-7' }])).toEqual([
      { taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'loc-7' } },
    ]);
  });

  it('does not ask for outbox tasks when the photos are not edited', async () => {
    const { service, repo } = setup();
    await service.updateSupplier(101, { version: 3, name: 'New name', isPhotoDirty: false }, []);
    expect(vi.mocked(repo.updateSupplier).mock.calls[0]?.[1]).not.toHaveProperty('onPhotosRemoved');
  });
});

describe('reactivation mode', () => {
  const edit = {
    version: 3,
    name: 'Campus Store',
    type: 'Store' as const,
    locationId: 4,
    openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
    is24h: false,
    isPhotoDirty: false,
  };

  function build(isDeleted: boolean, photos: CurrentSupplier['photos'] = [], upload = vi.fn()) {
    const repo = {
      findCurrent: vi.fn().mockResolvedValue({
        supplierId: 5,
        name: 'Old',
        type: 'Store',
        locationId: 4,
        isDeleted,
        version: 3,
        photos,
      }),
      locationExists: vi.fn().mockResolvedValue(true),
      findMissingCategoryIds: vi.fn().mockResolvedValue([]),
      findByIdentity: vi.fn().mockResolvedValue({ supplierId: 5, isDeleted }),
      updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: [] }),
    };
    const storage = { upload, update: vi.fn(), delete: vi.fn(), view: vi.fn() };
    const service = createSupplierUpdateService({
      repo: repo as unknown as SupplierWriteRepository,
      storage,
      reader: { getAdminSupplier: vi.fn().mockResolvedValue({ id: 5 }) },
      clock: () => new Date('2026-09-30T02:00:00Z'),
    });
    return { service, repo };
  }

  it('edits a soft-deleted supplier and asks the repository to restore the flags in the same transaction', async () => {
    const { service, repo } = build(true);
    const result = await service.updateSupplier(5, edit, [], { reactivate: true });
    expect(repo.updateSupplier).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ version: 3, name: 'Campus Store', reactivate: true }),
    );
    expect(result).toEqual({ statusCode: 200, body: { id: 5 } });
  });

  it('reactivates together with a photo edit: new photo saved and old photo queued for cleanup', async () => {
    const upload = vi.fn().mockResolvedValue('loc-new');
    const { service, repo } = build(true, [{ photoId: 1, location: 'loc-old' }], upload);
    const file = { buffer: Buffer.from('p'), mimeType: 'image/png' as const };
    await service.updateSupplier(
      5,
      { ...edit, isPhotoDirty: true, photoIds: ['p0'], placeholderIds: ['p0'] },
      [file],
      { reactivate: true },
    );
    const change = repo.updateSupplier.mock.calls[0]?.[1] as {
      reactivate?: boolean;
      photos?: unknown;
      onPhotosRemoved?: (p: Array<{ photoId: number; location: string }>) => unknown;
    };
    expect(change.reactivate).toBe(true);
    expect(change.photos).toEqual([{ kind: 'new', location: 'loc-new' }]);
    expect(typeof change.onPhotosRemoved).toBe('function');
    const old = { photoId: 1, location: 'loc-old' };
    expect(change.onPhotosRemoved?.([old])).toEqual([buildPhotoCleanupTask(old)]);
  });

  it('answers 422 when the supplier is no longer soft-deleted, and writes nothing', async () => {
    const { service, repo } = build(false);
    await expect(service.updateSupplier(5, edit, [], { reactivate: true })).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.updateSupplier).not.toHaveBeenCalled();
  });

  it('an ordinary update of a soft-deleted supplier is still 404', async () => {
    const { service, repo } = build(true);
    await expect(service.updateSupplier(5, edit, [])).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.updateSupplier).not.toHaveBeenCalled();
  });

  it('an ordinary update does not ask for reactivation', async () => {
    const { service, repo } = build(false);
    await service.updateSupplier(5, edit, []);
    expect(repo.updateSupplier.mock.calls[0]?.[1]).not.toHaveProperty('reactivate');
  });

  it('answers 500 when the transaction fails, having changed nothing', async () => {
    const { service, repo } = build(true);
    repo.updateSupplier.mockRejectedValueOnce(new Error('db down'));
    await expect(service.updateSupplier(5, edit, [], { reactivate: true })).rejects.toMatchObject({ statusCode: 500 });
  });
});
