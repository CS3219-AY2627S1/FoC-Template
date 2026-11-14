/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote MinIO-backed tests for the S3 photo storage adapter from the Phase 2 plan (Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/storage/s3PhotoStorage.minio.test.ts to test/storage/s3PhotoStorage.minio.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added a double-delete idempotency test
 *        (Phase 4 plan Task 15). No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import { createMinioTestStorage } from './minioTestStorage.js';

const png = { buffer: Buffer.from('first'), mimeType: 'image/png' as const };
const status = async (location: string) => (await fetch(location)).status;

describe('S3 adapter against the local MinIO', () => {
  it('uploads a photo and the returned location serves its bytes', async () => {
    const storage = createMinioTestStorage();
    const location = await storage.upload(png);
    try {
      const response = await fetch(await storage.view(location));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(await response.text()).toBe('first');
    } finally {
      await storage.delete(location);
    }
  });

  it('gives each upload its own location', async () => {
    const storage = createMinioTestStorage();
    const [a, b] = [await storage.upload(png), await storage.upload(png)];
    try {
      expect(a).not.toBe(b);
    } finally {
      await Promise.all([storage.delete(a), storage.delete(b)]);
    }
  });

  it('update replaces the bytes at the same location', async () => {
    const storage = createMinioTestStorage();
    const location = await storage.upload(png);
    try {
      expect(await storage.update(location, { buffer: Buffer.from('second'), mimeType: 'image/png' })).toBe(location);
      expect(await (await fetch(location)).text()).toBe('second');
    } finally {
      await storage.delete(location);
    }
  });

  it('delete removes the object', async () => {
    const storage = createMinioTestStorage();
    const location = await storage.upload(png);
    await storage.delete(location);
    expect(await status(location)).toBe(404);
  });

  it('deleting a missing object does not throw', async () => {
    const storage = createMinioTestStorage();
    const location = await storage.upload(png);
    await storage.delete(location);
    await expect(storage.delete(location)).resolves.toBeUndefined();
  });

  it('deleting the same location twice succeeds both times (safe for a repeated cleanup job)', async () => {
    const storage = createMinioTestStorage();
    const location = await storage.upload(png);
    await expect(storage.delete(location)).resolves.toBeUndefined();
    await expect(storage.delete(location)).resolves.toBeUndefined();
  });

  it('fails when the store is unreachable', async () => {
    const { createS3PhotoStorage } = await import('../../src/storage/s3PhotoStorage.js');
    const storage = createS3PhotoStorage({
      endpoint: 'http://localhost:1',
      bucket: 'supplier-photos',
      accessKey: 'x',
      secretKey: 'y',
    });
    await expect(storage.upload(png)).rejects.toThrow();
  });
});
