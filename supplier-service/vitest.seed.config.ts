/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Vitest config for the local seed run (`npm run seed`). It points the service at the compose
 *        `supplier-db` published on the host and at the local MinIO; every value can be overridden by
 *        an environment variable. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - pass DB_SSL and
 *        PHOTO_STORE_REGION through, per George's ECS Fargate plan, Phase 1 item 9. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-06, Claude Code, model: claude-opus-5-5): ECS Fargate migration - stopped filling in the
 *        MinIO dev keys when a task role is available, per George's decision of 2026-11-06. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// The compose file reads SUPPLIER_DB_PASSWORD / SUPPLIER_DB_PORT from the repository-root .env, so the
// seed reads them from there too (they are not printed).
function rootEnv(): Record<string, string> {
  const file = resolve(__dirname, '..', '.env');
  if (!existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

const root = rootEnv();

// ECS sets one of these when a task has a role. The MinIO dev keys would override that role.
const hasTaskRole = Boolean(
  process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ?? process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI,
);
const minioKeys = hasTaskRole
  ? {}
  : {
      PHOTO_STORE_ACCESS_KEY: process.env.PHOTO_STORE_ACCESS_KEY ?? 'photostoredev',
      PHOTO_STORE_SECRET_KEY: process.env.PHOTO_STORE_SECRET_KEY ?? 'photostoredev-secret',
    };

// Seeds the local database and photo store. Run with `npm run seed` while the compose `supplier-db`
// and the photo store (supplier-service/compose.photo-store.yaml) are running.
export default defineConfig({
  test: {
    include: ['test/**/*.seed.test.ts'],
    testTimeout: 60_000,
    env: {
      PORT: '3002',
      NODE_ENV: 'development',
      DB_HOST: process.env.DB_HOST ?? 'localhost',
      DB_PORT: process.env.DB_PORT ?? root.SUPPLIER_DB_PORT ?? '5436',
      DB_NAME: process.env.DB_NAME ?? 'supplier_service',
      DB_USER: process.env.DB_USER ?? 'root',
      DB_PASSWORD: process.env.DB_PASSWORD ?? root.SUPPLIER_DB_PASSWORD ?? 'supplier_root_password',
      DB_SSL: process.env.DB_SSL ?? 'false',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      USER_SERVICE_URL: 'http://localhost:3001',
      // Stored photo locations start with this string, so it must equal the API's and worker's value.
      PHOTO_STORE_ENDPOINT: process.env.PHOTO_STORE_ENDPOINT ?? 'http://host.docker.internal:9000',
      PHOTO_STORE_BUCKET: process.env.PHOTO_STORE_BUCKET ?? 'supplier-photos',
      ...minioKeys,
      PHOTO_STORE_REGION: process.env.PHOTO_STORE_REGION ?? 'us-east-1',
    },
  },
});
