/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope: ECS Fargate migration - checks PHOTO_STORE_REGION reaches the S3 client, per George's ECS
 *        Fargate plan, Phase 1 item 6. No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - checks when the S3
 *        client gets explicit keys, per George's task role decision of 2026-11-06. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const constructed = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    constructor(options: Record<string, unknown>) {
      constructed.push(options);
    }
  },
}));

const { createConfiguredPhotoStorage } = await import('../../src/storage/s3PhotoStorage.js');

const settings = {
  endpoint: 'https://s3.ap-southeast-1.amazonaws.com',
  bucket: 'photos',
  accessKey: 'key',
  secretKey: 'secret',
};

describe('photo store region', () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  it('falls back to us-east-1, which MinIO ignores', () => {
    createConfiguredPhotoStorage(settings);
    expect(constructed[0]).toMatchObject({ region: 'us-east-1', forcePathStyle: true });
  });

  it('uses the configured region and keeps path-style addressing', () => {
    createConfiguredPhotoStorage({ ...settings, region: 'ap-southeast-1' });
    expect(constructed[0]).toMatchObject({ region: 'ap-southeast-1', forcePathStyle: true });
  });
});

describe('photo store credentials', () => {
  const png = { buffer: Buffer.from('x'), mimeType: 'image/png' as const };
  const noKeys = { endpoint: settings.endpoint, bucket: settings.bucket };

  beforeEach(() => {
    constructed.length = 0;
  });

  it('passes both keys to the client when they are set', () => {
    createConfiguredPhotoStorage(settings);
    expect(constructed[0]?.credentials).toEqual({ accessKeyId: 'key', secretAccessKey: 'secret' });
  });

  it('leaves credentials to the SDK when neither key is set', () => {
    createConfiguredPhotoStorage(noKeys);
    expect(constructed).toHaveLength(1);
    expect(constructed[0]).not.toHaveProperty('credentials');
  });

  it.each([
    ['access key', { accessKey: 'key' }],
    ['secret key', { secretKey: 'secret' }],
  ])('counts a lone %s as not configured', async (_name, key) => {
    const storage = createConfiguredPhotoStorage({ ...noKeys, ...key });
    expect(constructed).toHaveLength(0);
    await expect(storage.upload(png)).rejects.toThrow('Photo storage is not configured');
  });
});
