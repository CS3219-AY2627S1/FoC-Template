/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Resolves photo_ids/placeholder_ids into an ordered photo plan (Phase 3 plan Task 4;
 *        SupplierServiceArchitecture.md §8.2). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { AppError } from '../utils/AppError.js';

const MAX_PHOTOS = 10;

export interface CurrentPhoto {
  photoId: number;
  location: string;
}

export type PlanEntry = { kind: 'existing'; photoId: number } | { kind: 'new'; fileIndex: number };

export interface PhotoPlan {
  /** Final photo order (index = display_order). */
  entries: PlanEntry[];
  /** Existing photos not listed in photo_ids; their cloud objects are deleted after commit. */
  removed: CurrentPhoto[];
}

function invalid(message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field: 'photo_ids', location: 'body', message }],
  });
}

/** photo_ids: numbers = existing ids, strings = placeholders; the i-th placeholder maps to the i-th file (Arch §8.2). */
export function buildPhotoPlan(
  current: CurrentPhoto[],
  photoIds: Array<number | string>,
  placeholderIds: string[],
  fileCount: number,
): PhotoPlan {
  if (photoIds.length > MAX_PHOTOS) throw invalid('At most 10 photos are allowed.');
  if (placeholderIds.length !== fileCount) {
    throw invalid('placeholder_ids must match the number of uploaded photos.');
  }

  const owned = new Set(current.map((photo) => photo.photoId));
  const seen = new Set<number | string>();
  const usedPlaceholders = new Set<string>();
  const entries: PlanEntry[] = photoIds.map((id): PlanEntry => {
    if (seen.has(id)) throw invalid('photo_ids must not repeat an id.');
    seen.add(id);
    if (typeof id === 'number') {
      if (!owned.has(id)) throw invalid(`Photo ${id} does not belong to this supplier.`);
      return { kind: 'existing', photoId: id };
    }
    const fileIndex = placeholderIds.indexOf(id);
    if (fileIndex === -1) throw invalid(`Placeholder ${id} is not listed in placeholder_ids.`);
    usedPlaceholders.add(id);
    return { kind: 'new', fileIndex };
  });
  if (usedPlaceholders.size !== placeholderIds.length) {
    throw invalid('Every placeholder in placeholder_ids must appear in photo_ids.');
  }

  const kept = new Set(entries.flatMap((entry) => (entry.kind === 'existing' ? [entry.photoId] : [])));
  return { entries, removed: current.filter((photo) => !kept.has(photo.photoId)) };
}
