/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Wrote unit tests for the S3 photo storage adapter from the Phase 2 plan (Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5): moved from src/storage/s3PhotoStorage.test.ts to test/storage/s3PhotoStorage.test.ts and updated
 *        the relative imports; no test logic changed. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 */
import { DeleteObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredPhotoStorage, createS3PhotoStorage } from '../../src/storage/s3PhotoStorage.js';

const options = {
  endpoint: 'http://localhost:9000/',
  bucket: 'supplier-photos',
  accessKey: 'key',
  secretKey: 'secret',
};
const png = { buffer: Buffer.from('png-bytes'), mimeType: 'image/png' as const };

function fakeClient() {
  const send = vi.fn().mockResolvedValue({});
  return { client: { send } as unknown as S3Client, send };
}

describe('createS3PhotoStorage', () => {
  it('uploads under a fresh key and returns the object location', async () => {
    const { client, send } = fakeClient();
    const location = await createS3PhotoStorage(options, client).upload(png);

    expect(location).toMatch(/^http:\/\/localhost:9000\/supplier-photos\/[0-9a-f-]{36}$/);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'supplier-photos',
      ContentType: 'image/png',
      Key: location.split('/').pop(),
    });
  });

  it('update writes to the same key and returns the same location', async () => {
    const { client, send } = fakeClient();
    const storage = createS3PhotoStorage(options, client);
    const location = 'http://localhost:9000/supplier-photos/abc';

    expect(await storage.update(location, png)).toBe(location);
    expect((send.mock.calls[0]?.[0] as PutObjectCommand).input.Key).toBe('abc');
  });

  it('delete removes the object by key', async () => {
    const { client, send } = fakeClient();
    await createS3PhotoStorage(options, client).delete('http://localhost:9000/supplier-photos/abc');

    const command = send.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Bucket: 'supplier-photos', Key: 'abc' });
  });

  it('rejects a location that is not in the configured bucket', async () => {
    const { client } = fakeClient();
    await expect(
      createS3PhotoStorage(options, client).delete('http://elsewhere/x/abc'),
    ).rejects.toThrow('Not a photo in this bucket');
  });

  it('view returns the stored location unchanged', async () => {
    const { client } = fakeClient();
    const location = 'http://localhost:9000/supplier-photos/abc';
    expect(await createS3PhotoStorage(options, client).view(location)).toBe(location);
  });
});

describe('createConfiguredPhotoStorage', () => {
  it('fails clearly when the photo store is not configured', async () => {
    const storage = createConfiguredPhotoStorage({});
    await expect(storage.upload(png)).rejects.toThrow('Photo storage is not configured');
  });
});
