/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the in-memory PhotoStorage test double from the Phase 2 plan (Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/storage/inMemoryPhotoStorage.ts to test/storage/inMemoryPhotoStorage.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import type { PhotoFile, PhotoStorage } from '../../src/storage/photoStorage.js';

export type InMemoryPhotoStorage = PhotoStorage & { objects: Map<string, PhotoFile> };

/** Test double of the port; used by business-layer tests so they need no MinIO. */
export function createInMemoryPhotoStorage(): InMemoryPhotoStorage {
  const objects = new Map<string, PhotoFile>();
  let counter = 0;
  return {
    objects,
    async upload(file) {
      counter += 1;
      const location = `memory://photos/${counter}`;
      objects.set(location, file);
      return location;
    },
    async update(location, file) {
      objects.set(location, file);
      return location;
    },
    async delete(location) {
      objects.delete(location);
    },
    async view(location) {
      return location;
    },
  };
}
