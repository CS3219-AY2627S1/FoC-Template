/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the PhotoStorage port from the Phase 2 plan (Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
export interface PhotoFile {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
}

/** Provider-agnostic photo storage (SupplierServiceArchitecture.md §8.2). Locations are opaque strings. */
export interface PhotoStorage {
  /** Stores a new photo and returns its location (stored in supplier_photos.photo_location). */
  upload(file: PhotoFile): Promise<string>;
  /** Replaces the bytes at an existing location and returns the (unchanged) location. */
  update(location: string, file: PhotoFile): Promise<string>;
  delete(location: string): Promise<void>;
  /** Returns a location a client can fetch. Currently the stored location as-is (§6.3). */
  view(location: string): Promise<string>;
}
