/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the supplier creation workflow (upload, transaction, cleanup) from the Phase 2 plan (Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): reactivation now delegates to the update service's edit cycle (reactivation mode); insert-only create path (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { NewSupplier, SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import type { PhotoFile, PhotoStorage } from '../storage/photoStorage.js';
import { AppError } from '../utils/AppError.js';
import { sgtDatetime } from '../utils/time.js';
import type { CreateSupplierInput } from '../validation/supplierInput.js';
import type { UpdateSupplierInput } from '../validation/supplierUpdateInput.js';

export interface CreationResult {
  statusCode: 200 | 201;
  body: unknown;
}

interface Dependencies {
  repo: SupplierWriteRepository;
  storage: PhotoStorage;
  reader: { getAdminSupplier(supplierId: number): Promise<unknown> };
  /** The Phase 3 edit cycle; in reactivation mode it also restores the flags in its transaction. */
  update: {
    updateSupplier(
      supplierId: number,
      input: UpdateSupplierInput,
      files: PhotoFile[],
      options?: { reactivate?: boolean },
    ): Promise<{ statusCode: 200; body: unknown }>;
  };
  clock?: () => Date;
}

function invalid(field: string, message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, { details: [{ field, location: 'body', message }] });
}

export function createSupplierCreationService({
  repo,
  storage,
  reader,
  update,
  clock = () => new Date(),
}: Dependencies) {
  async function removeUploaded(locations: string[]): Promise<void> {
    // Best effort: a failed cleanup must not mask the original error.
    await Promise.allSettled(locations.map((location) => storage.delete(location)));
  }

  async function reactivate(supplierId: number, input: CreateSupplierInput, photos: PhotoFile[]): Promise<CreationResult> {
    const current = await repo.findCurrent(supplierId);
    if (current === null) throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');

    // The submitted details and photos go through the ordinary edit cycle, attempted before anything
    // is committed; the flag restore rides in the edit's own transaction (team decision 2026-09-30).
    // New photos replace the existing ones entirely: one placeholder per file, none retained, so the
    // edit cycle writes cleanup outbox rows for every old photo. No photos submitted leaves them untouched.
    const placeholders = photos.map((_, index) => `photo-${index}`);
    const edit: UpdateSupplierInput = {
      version: current.version,
      name: input.name,
      type: input.type,
      desc: input.desc,
      locationId: input.locationId,
      categoryIds: input.categoryIds,
      openingHours: JSON.stringify(input.hours.map(({ day, open, close }) => ({ day, open, close }))),
      is24h: input.hours.some((hour) => hour.is24h),
      isPhotoDirty: photos.length > 0,
      ...(photos.length > 0 ? { photoIds: placeholders, placeholderIds: placeholders } : {}),
    };
    const result = await update.updateSupplier(supplierId, edit, photos, { reactivate: true });
    return { statusCode: 200, body: result.body };
  }

  return {
    async createSupplier(
      input: CreateSupplierInput,
      photos: PhotoFile[],
      actor: { userId: string },
    ): Promise<CreationResult> {
      if (!(await repo.locationExists(input.locationId))) {
        throw invalid('location_id', 'The selected location does not exist.');
      }
      const missing = await repo.findMissingCategoryIds(input.categoryIds);
      if (missing.length > 0) {
        throw invalid('category_id', `Unknown category id(s): ${missing.join(', ')}.`);
      }

      const existing = await repo.findByIdentity(input.name, input.type, input.locationId);
      if (existing !== null && !existing.isDeleted) {
        throw invalid('name', 'A supplier with the same name, type and location already exists.');
      }
      if (existing !== null) return reactivate(existing.supplierId, input, photos);

      // Step 2: upload first; a failure aborts the save (Arch §8.2).
      const uploaded: string[] = [];
      try {
        for (const photo of photos) {
          uploaded.push(await storage.upload(photo));
        }
      } catch {
        await removeUploaded(uploaded);
        throw new AppError(500, 'Internal Server Error', 'Photo upload failed.');
      }

      const record: NewSupplier = {
        ...input,
        photoLocations: uploaded,
        createdBy: actor.userId,
        now: sgtDatetime(clock()),
      };

      // Steps 3-4: one transaction; on failure remove the new cloud objects.
      let supplierId: number;
      try {
        supplierId = await repo.insertSupplier(record);
      } catch (error) {
        await removeUploaded(uploaded);
        if (error instanceof AppError) throw error;
        throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');
      }

      return { statusCode: 201, body: await reader.getAdminSupplier(supplierId) };
    },
  };
}

export type SupplierCreationService = ReturnType<typeof createSupplierCreationService>;
