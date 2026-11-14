/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Supplier update workflow (validate, upload, transaction, cleanup, enqueue) from the Phase 3
 *        plan Task 6; SupplierServiceArchitecture.md §6.2, §7.5, §8.2. No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): the update saga no longer enqueues jobs; excluded-photo cleanup tasks go to the outbox in the update transaction (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added the reactivation mode option (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): setting a supplier inactive (active -> inactive) queues the suspension task in the same transaction (team decision in chat).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { PhotoWrite, SupplierChange, SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import { buildPhotoCleanupTask, buildSuspensionTask } from '../queue/tasks.js';
import type { PhotoFile, PhotoStorage } from '../storage/photoStorage.js';
import { AppError } from '../utils/AppError.js';
import { sgtDatetime } from '../utils/time.js';
import { resolveHours } from '../validation/supplierInput.js';
import type { UpdateSupplierInput } from '../validation/supplierUpdateInput.js';
import { buildPhotoPlan } from './photoPlan.js';

export interface UpdateResult {
  statusCode: 200;
  body: unknown;
}

interface Dependencies {
  repo: SupplierWriteRepository;
  storage: PhotoStorage;
  reader: { getAdminSupplier(supplierId: number): Promise<unknown> };
  clock?: () => Date;
}

function invalid(field: string, message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, { details: [{ field, location: 'body', message }] });
}

export function createSupplierUpdateService({ repo, storage, reader, clock = () => new Date() }: Dependencies) {
  async function removeUploaded(locations: string[]): Promise<void> {
    // Best effort: a failed cleanup must not mask the original error.
    await Promise.allSettled(locations.map((location) => storage.delete(location)));
  }

  return {
    async updateSupplier(
      supplierId: number,
      input: UpdateSupplierInput,
      files: PhotoFile[],
      options: { reactivate?: boolean } = {},
    ): Promise<UpdateResult> {
      const current = await repo.findCurrent(supplierId);
      if (current === null) throw new AppError(404, 'Not Found', 'Supplier not found.');
      if (options.reactivate === true) {
        // Reactivation edits a soft-deleted row; a live row means someone else got there first.
        if (!current.isDeleted) throw invalid('name', 'A supplier with the same name, type and location already exists.');
      } else if (current.isDeleted) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      if (input.version !== current.version) {
        throw new AppError(409, 'Conflict', 'The supplier was modified by someone else. Re-fetch it and retry.');
      }

      const type = input.type ?? current.type;
      const locationId = input.locationId ?? current.locationId;
      const name = input.name ?? current.name;

      if (input.locationId !== undefined && !(await repo.locationExists(input.locationId))) {
        throw invalid('location_id', 'The selected location does not exist.');
      }
      if (input.categoryIds !== undefined) {
        const missing = await repo.findMissingCategoryIds(input.categoryIds);
        if (missing.length > 0) throw invalid('category_id', `Unknown category id(s): ${missing.join(', ')}.`);
      }
      const clash = await repo.findByIdentity(name, type, locationId);
      if (clash !== null && clash.supplierId !== supplierId) {
        throw invalid('name', 'A supplier with the same name, type and location already exists.');
      }

      const change: SupplierChange = { version: input.version, now: sgtDatetime(clock()) };
      if (options.reactivate === true) change.reactivate = true;
      if (input.name !== undefined) change.name = input.name;
      if (input.type !== undefined) change.type = input.type;
      if (input.desc !== undefined) change.desc = input.desc;
      if (input.locationId !== undefined) change.locationId = input.locationId;
      if (input.isActive !== undefined) change.isActive = input.isActive;
      if (input.categoryIds !== undefined) change.categoryIds = input.categoryIds;

      // Going inactive cancels uncollected requests just as a soft delete does (team decision, 2026-11-11).
      if (options.reactivate !== true && input.isActive === false && current.isActive) {
        change.extraTasks = [buildSuspensionTask(supplierId)];
      }

      const hoursSent = input.openingHours !== undefined || input.is24h !== undefined;
      if (hoursSent || (input.type !== undefined && input.type !== current.type)) {
        change.hours = resolveHours(type, input.openingHours, input.is24h ?? false);
      }

      const plan = input.isPhotoDirty
        ? buildPhotoPlan(current.photos, input.photoIds ?? [], input.placeholderIds ?? [], files.length)
        : null;
      if (plan === null && files.length > 0) {
        throw invalid('photos', 'Photos were uploaded but isPhotoDirty is not true.');
      }

      // Step 2: upload first; a failure aborts the save (Arch §8.2).
      const uploaded: string[] = [];
      try {
        for (const file of files) uploaded.push(await storage.upload(file));
      } catch {
        await removeUploaded(uploaded);
        throw new AppError(500, 'Internal Server Error', 'Photo upload failed.');
      }
      if (plan !== null) {
        change.photos = plan.entries.map(
          (entry): PhotoWrite =>
            entry.kind === 'existing'
              ? { kind: 'existing', photoId: entry.photoId }
              : { kind: 'new', location: uploaded[entry.fileIndex] as string },
        );
        change.onPhotosRemoved = (removed) => removed.map(buildPhotoCleanupTask);
      }

      // Steps 3-4: one transaction (edit + outbox rows); on failure remove the new cloud objects.
      try {
        await repo.updateSupplier(supplierId, change);
      } catch (error) {
        await removeUploaded(uploaded);
        if (error instanceof AppError) throw error;
        throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');
      }

      return { statusCode: 200, body: await reader.getAdminSupplier(supplierId) };
    },
  };
}

export type SupplierUpdateService = ReturnType<typeof createSupplierUpdateService>;
