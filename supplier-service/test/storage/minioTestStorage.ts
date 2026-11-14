/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the MinIO test helper from the Phase 2 plan (Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/storage/minioTestStorage.ts to test/storage/minioTestStorage.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { createS3PhotoStorage } from '../../src/storage/s3PhotoStorage.js';

export const minioSettings = {
  endpoint: process.env.PHOTO_STORE_ENDPOINT ?? 'http://localhost:9000',
  bucket: process.env.PHOTO_STORE_BUCKET ?? 'supplier-photos',
  accessKey: process.env.PHOTO_STORE_ACCESS_KEY ?? 'photostoredev',
  secretKey: process.env.PHOTO_STORE_SECRET_KEY ?? 'photostoredev-secret',
};

export const createMinioTestStorage = () => createS3PhotoStorage(minioSettings);
