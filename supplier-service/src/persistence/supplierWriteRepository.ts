/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the SupplierWriteRepository interface from the Phase 2 plan (Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added CurrentSupplier, PhotoWrite, SupplierChange and the findCurrent/updateSupplier methods (Phase 3 Task 5).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added the softDelete method (Phase 4 plan Task 4).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added SupplierChange.onPhotosRemoved (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): removed reactivateSupplier; added SupplierChange.reactivate (Phase 4 plan Task 8).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-11, Claude Code, model: claude-sonnet-5-5): added CurrentSupplier.isActive and
 *        SupplierChange.extraTasks so setting a supplier inactive queues the suspension task in the same
 *        transaction (team decision given in chat, 2026-11-11). No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review:
 */
import type { CurrentPhoto } from '../business/photoPlan.js';
import type { OutboxTask } from '../queue/tasks.js';
import type { HourInput } from '../validation/supplierInput.js';

export interface NewSupplier {
  name: string;
  type: 'Store' | 'Facility';
  desc: string | null;
  locationId: number;
  categoryIds: number[];
  hours: HourInput[];
  /** Locations returned by the photo store, in display order (index = display_order, from 0). */
  photoLocations: string[];
  createdBy: string;
  /** Singapore wall-clock 'YYYY-MM-DD HH:MM:SS' written to created_on / updated_on (Arch §6.2). */
  now: string;
}

export interface ExistingSupplier {
  supplierId: number;
  isDeleted: boolean;
}

export interface CurrentSupplier {
  supplierId: number;
  name: string;
  type: 'Store' | 'Facility';
  locationId: number;
  isDeleted: boolean;
  isActive: boolean;
  version: number;
  /** In display order. */
  photos: CurrentPhoto[];
}

export type PhotoWrite = { kind: 'existing'; photoId: number } | { kind: 'new'; location: string };

/** Only the keys present are written (Phase 3: partial update). */
export interface SupplierChange {
  version: number;
  /** Singapore wall-clock 'YYYY-MM-DD HH:MM:SS' (Arch §6.2). */
  now: string;
  name?: string;
  type?: 'Store' | 'Facility';
  desc?: string | null;
  locationId?: number;
  isActive?: boolean;
  categoryIds?: number[];
  hours?: HourInput[];
  /** Final ordered photo list (index = display_order); omitted = photos untouched. */
  photos?: PhotoWrite[];
  /**
   * Called inside the update transaction with the photo rows the edit deleted; the tasks it returns
   * are written to the outbox in that same transaction (Arch §8.2; team answer 2026-09-30).
   */
  onPhotosRemoved?: (removed: CurrentPhoto[]) => OutboxTask[];
  /**
   * Reactivation (Arch §6.2): the row must be soft-deleted; the same UPDATE sets is_deleted false
   * and is_active true, so the flags commit only if the whole edit transaction succeeds.
   */
  reactivate?: boolean;
  /** Written to the outbox in the update transaction, stamped with the new version. */
  extraTasks?: OutboxTask[];
}

export interface SupplierWriteRepository {
  findCurrent(supplierId: number): Promise<CurrentSupplier | null>;
  /**
   * One transaction (Arch §8.2 step 3): matches supplier_id + version, applies the sent fields,
   * replaces categories/hours if sent, deletes excluded photo rows, appends new ones and reorders,
   * bumps updated_on and version, and writes the tasks returned by `change.onPhotosRemoved` for the
   * excluded photos to the outbox, stamped with the new supplier version. No matching row → AppError
   * 409; duplicate identity → AppError 422. The excluded photos are also returned.
   */
  updateSupplier(supplierId: number, change: SupplierChange): Promise<{ removedPhotos: CurrentPhoto[] }>;
  findByIdentity(name: string, type: 'Store' | 'Facility', locationId: number): Promise<ExistingSupplier | null>;
  locationExists(locationId: number): Promise<boolean>;
  /** Returns the ids from the input that do not exist. */
  findMissingCategoryIds(categoryIds: number[]): Promise<number[]>;
  /** One transaction: supplier, category map, hours and photos. Duplicate race → AppError 422. */
  insertSupplier(input: NewSupplier): Promise<number>;
  /**
   * Soft delete (Arch §6.2, §8.1), in one transaction: sets is_deleted, updated_on and version on a
   * row that is not already deleted (is_active untouched) and writes `tasks` to the outbox, stamped
   * with the new supplier version, before committing. Returns false, writing nothing, when no live
   * row matched (unknown or already soft-deleted).
   */
  softDelete(supplierId: number, now: string, tasks: OutboxTask[]): Promise<boolean>;
}
