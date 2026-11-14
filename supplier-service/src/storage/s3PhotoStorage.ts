/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
 * Scope: Implemented the S3-client photo storage adapter from the Phase 2 plan (Task 2).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - configurable region,
 *        per George's ECS Fargate plan, Phase 1 item 6. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - made the access key
 *        and secret optional so the SDK can use the ECS task role, per George's decision of 2026-11-06
 *        (ECS Fargate plan, "Found while carrying this out"). No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PhotoFile, PhotoStorage } from './photoStorage.js';

export interface S3PhotoStorageOptions {
  endpoint: string;
  bucket: string;
  // Set both for MinIO. Leave both out on ECS, where the SDK uses the task role's credentials.
  accessKey?: string | undefined;
  secretKey?: string | undefined;
  region?: string | undefined;
}

export function createS3PhotoStorage(
  options: S3PhotoStorageOptions,
  client: S3Client = new S3Client({
    endpoint: options.endpoint,
    region: options.region ?? 'us-east-1', // required by the SDK; ignored by MinIO
    forcePathStyle: true,
    ...(options.accessKey && options.secretKey
      ? { credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey } }
      : {}),
  }),
): PhotoStorage {
  const base = `${options.endpoint.replace(/\/+$/, '')}/${options.bucket}/`;

  function keyOf(location: string): string {
    if (!location.startsWith(base)) {
      throw new Error(`Not a photo in this bucket: ${location}`);
    }
    return location.slice(base.length);
  }

  async function put(key: string, file: PhotoFile): Promise<string> {
    await client.send(
      new PutObjectCommand({
        Bucket: options.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimeType,
      }),
    );
    return `${base}${key}`;
  }

  return {
    upload: (file) => put(randomUUID(), file),
    update: (location, file) => put(keyOf(location), file),
    async delete(location) {
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: keyOf(location) }));
    },
    async view(location) {
      return location;
    },
  };
}

export function createConfiguredPhotoStorage(settings: {
  endpoint?: string | undefined;
  bucket?: string | undefined;
  accessKey?: string | undefined;
  secretKey?: string | undefined;
  region?: string | undefined;
}): PhotoStorage {
  const { endpoint, bucket, accessKey, secretKey, region } = settings;
  // One key without the other is a mistake, so it counts as not configured rather than using the task role.
  const keysMatch = Boolean(accessKey) === Boolean(secretKey);
  if (endpoint && bucket && keysMatch) {
    return createS3PhotoStorage({ endpoint, bucket, accessKey, secretKey, region });
  }
  const unavailable = async (): Promise<never> => {
    throw new Error('Photo storage is not configured (set the PHOTO_STORE_* variables).');
  };
  return { upload: unavailable, update: unavailable, delete: unavailable, view: unavailable };
}
