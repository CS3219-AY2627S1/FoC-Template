<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5), date: 2026-09-29
Scope: Implementation plan for SupplierServiceSpec.md "Phase 2 — Admin Visibility, Lookup Management,
       and Supplier Creation", transcribing decisions the team already recorded in
       SupplierServiceArchitecture.md (§6.2, §6.4, §7, §7.1.1, §7.5, §8.2, §9 items 21). It records
       the few implementation choices the plan itself makes so the team can confirm or change them.
       No requirements, architecture, schema, or API decisions were made by the AI tool.
       The code in this plan has not been compiled or run.
Author review: Congchen
Scope (2026-09-29 update): recorded the team's decision that MinIO is used for tests of real
       cloud-connection logic (`*.minio.test.ts`, `npm run test:minio`); pure business logic keeps an
       in-memory storage double. No decisions were made by the AI tool.
Author review: Congchen
-->

# Supplier Service Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver F8.1 and F8.2: admin supplier list/detail, lookup-table management, and supplier creation with photos, idempotency and the soft-deleted-supplier reactivation path.

**Architecture:** Same layers as Phase 1 (controller → business service → persistence interface → MySQL). New ports: `PhotoStorage` (upload/update/delete/view; S3 client adapter for local MinIO, spec §8.2), `SupplierWriteRepository`, `LookupRepository`, `IdempotencyStore` (Redis). Business logic is tested against fakes; the S3 adapter has one optional test against a running MinIO.

**Tech Stack:** TypeScript, Express 4, MySQL (`mysql2`), Redis (`ioredis`), `zod`, `multer` (team decision), `@aws-sdk/client-s3` (team decision), Vitest, Supertest.

**Every task also requires** (root `AGENTS.md` §4, §5, §7): the AI disclosure header on each created or edited file (edited files get an appended dated `Scope`/`Author review` pair; never write the author's name), and one log entry plus one README "Log index" row when the phase is finished (Task 10). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Run everything from `supplier-service/`.

---

## Decisions this plan implements (all already written down)

| Decision | Where recorded |
| --- | --- |
| Admin list/detail: Phase 1 shapes plus `isActive`, `isDeleted` (list) and `createdOn`, `createdBy`, `updatedOn`, `version` (detail); no visibility filter; same filters as Phase 1 | Arch §7, §7.3; Spec Phase 2 |
| Lookup `POST`/`PUT`/`DELETE` for faculties, locations, categories; admin and super admin only; hard delete only when unreferenced (`ON DELETE RESTRICT`, soft-deleted suppliers still count); delete `200`, unknown id `404`, FK/`UNIQUE` violation `422` | Arch §6.2, §7, §9 item 21 (c), (i) |
| `POST /api/v1/admin/suppliers`: `multipart/form-data` via `multer`, 0–10 JPEG/PNG photos ≤ 5 MB, response photos are `photoId`/`photoLocation` only, `201` on create | Arch §7, §8.2, §9 item 21 (b), (d) |
| `Idempotency-Key` mandatory (`400` if absent), Redis, keyed per user and key, 60 s in-flight TTL, 24 h response TTL, in-flight replay `409`, completed replay returns cached response | Arch §7.5, §9 item 21 (f) |
| Duplicate check: app pre-check plus DB `UNIQUE`; active match `422`; soft-deleted match reactivates: `200`, `is_active` true, stored fields and photos replaced, `updated_on` and `version` change | Arch §6.2, §9 item 21 (e) |
| Facility hours server-filled as a single day-8 entry; 24/7 Store is a single day-8 entry (client sends `is24h` plus that entry); Store 24-hour days are plain `00:00`–`23:59` rows; equal open/close `422` | Arch §6.2, §7, §9 item 21 (g), (j), (l) |
| `display_order` follows the order of the uploaded files and starts at 0 | Arch §8.2, §9 item 21 (h) |
| Storage stores the location MinIO returns in `supplier_photos.photo_location`; the service returns it as stored | Arch §6.3, §8.2, §9 item 21 (a) |

## Choices this plan makes (team to confirm or change; none are in the architecture)

1. **Timestamps.** `created_on`/`updated_on` are written by the app as Singapore wall-clock (`sgtDatetime`) and read back formatted with `+08:00`, because the DB `CURRENT_TIMESTAMP` uses the container's time zone (Arch §6.2 requires SGT only).
2. **Lookup delete response body** (§7 only says "Deletion response"): `{ "deleted": true, "id": <id> }`.
3. **Idempotency details not in the architecture:** the key must be a UUID; only successful (2xx) responses are cached; a failed request deletes its in-flight marker so the client can retry.
4. **Categories** on create are optional (an empty list is allowed); `category_id` is a JSON array string as in Arch §7.4.
5. **Facility** creation ignores any `openingHours`/`is24h` the client sends and always stores the single day-8 entry.
6. **Reactivation replaces photos entirely**, including when zero photos are submitted. The old cloud objects are **not** deleted in this phase (the Redis worker is Phase 4); `reactivateSupplier` returns their locations so Phase 4 can enqueue them.
7. **Photo field name:** `photos` or `photos[]`; photo type is checked by MIME type only.
8. **Where MinIO is used in tests (confirmed by the team):** pure business logic (validation, the creation workflow's branching) is tested against a small in-memory test double of the `PhotoStorage` port. Anything that tests real cloud-connection logic uses the local MinIO: the S3 adapter's upload/update/delete/view behavior and the creation workflow's upload-then-cleanup path. Those tests are named `*.minio.test.ts`, are excluded from `npm test`, and run with `npm run test:minio` against a started photo store, so a missing MinIO fails loudly instead of being silently skipped.
9. **`view(location)`** returns the stored location unchanged (Arch §6.3: signed URLs are unconfirmed until the provider is chosen). The MinIO bucket gets anonymous read in the dev compose file so a returned location is fetchable locally.
10. **`redis/client.ts`** gets `lazyConnect: true` so importing the app in tests does not open a Redis connection.
11. **Storage config** (`PHOTO_STORE_*`) is optional in `config.ts`; if unset, photo operations fail with `500` instead of the service refusing to start.
12. **Lookup create status:** `201 Created` for `POST` on the three lookup tables (Arch §7.1 only names `201` for supplier creation); lookup `PUT` returns `200`.

## File structure

| File | Responsibility |
| --- | --- |
| `src/config.ts` (modify), `.env.example` (modify) | `PHOTO_STORE_*` settings |
| `src/redis/client.ts` (modify) | `lazyConnect` |
| `src/storage/photoStorage.ts` | `PhotoFile`, `PhotoStorage` port |
| `src/storage/s3PhotoStorage.ts` (+ `.test.ts`, `.minio.test.ts`) | S3-client adapter (MinIO locally), `createConfiguredPhotoStorage` |
| `src/storage/minioTestStorage.ts`, `vitest.config.ts`, `vitest.minio.config.ts`, `package.json` | MinIO test helper, default suite excludes MinIO tests, `npm run test:minio` |
| `src/storage/inMemoryPhotoStorage.ts` | test double of the port |
| `compose.photo-store.yaml` (modify) | anonymous read on the dev bucket |
| `src/types/supplier.ts` (modify) | admin response types, `Paginated<T>` |
| `src/persistence/supplierRepository.ts`, `mysqlSupplierRepository.ts` (modify) | admin reads |
| `src/business/supplierService.ts` (modify) | admin list/detail |
| `src/controllers/adminSupplier.controller.ts`, `src/routes/adminSupplier.routes.ts` | admin endpoints |
| `src/persistence/lookupRepository.ts`, `mysqlLookupRepository.ts` | lookup writes and DB-error mapping |
| `src/business/lookupService.ts`, `src/validation/lookupInput.ts` | lookup workflows and validation |
| `src/controllers/lookup.controller.ts`, `src/routes/lookup.routes.ts` | lookup endpoints |
| `src/utils/time.ts` (modify) | `sgtDatetime` |
| `src/validation/supplierInput.ts` | create-request parsing and hours rules |
| `src/idempotency/idempotencyStore.ts`, `src/middleware/requireIdempotencyKey.ts` | idempotency |
| `src/persistence/supplierWriteRepository.ts`, `mysqlSupplierWriteRepository.ts` | create / reactivate transactions |
| `src/business/supplierCreationService.ts` | upload → transaction → cleanup workflow |
| `src/middleware/uploadPhotos.ts` | `multer` config and error mapping |
| `src/app.ts` (modify) | wiring |

---

### Task 1: Dependencies and configuration

**Files:** Modify `package.json` (no header possible; list it in the log), `src/config.ts`, `src/redis/client.ts`, `.env.example`.

- [ ] **Step 1: Install**

```bash
npm install multer @aws-sdk/client-s3
npm install -D @types/multer
```

- [ ] **Step 2: `src/config.ts`** — add to `envSchema` after `USER_SERVICE_URL`:

```ts
  PHOTO_STORE_ENDPOINT: z.string().min(1).optional(),
  PHOTO_STORE_BUCKET: z.string().min(1).optional(),
  PHOTO_STORE_ACCESS_KEY: z.string().min(1).optional(),
  PHOTO_STORE_SECRET_KEY: z.string().min(1).optional(),
```

and add to the frozen `config` object after `userServiceUrl`:

```ts
  photoStore: Object.freeze({
    endpoint: values.PHOTO_STORE_ENDPOINT,
    bucket: values.PHOTO_STORE_BUCKET,
    accessKey: values.PHOTO_STORE_ACCESS_KEY,
    secretKey: values.PHOTO_STORE_SECRET_KEY,
  }),
```

- [ ] **Step 3: `src/redis/client.ts`** — change the constructor call to:

```ts
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
});
```

- [ ] **Step 4: `.env.example`** — append (matches `compose.photo-store.yaml` defaults):

```
PHOTO_STORE_ENDPOINT=http://localhost:9000
PHOTO_STORE_BUCKET=supplier-photos
PHOTO_STORE_ACCESS_KEY=photostoredev
PHOTO_STORE_SECRET_KEY=photostoredev-secret
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run` — Expected: typecheck clean, existing tests pass (107).

```bash
git add package.json package-lock.json src/config.ts src/redis/client.ts .env.example
git commit -m "chore(supplier-service): add multer, S3 client and photo store config"
```

---

### Task 2: Photo storage port and S3-client adapter

**Files:** Create `src/storage/photoStorage.ts`, `src/storage/s3PhotoStorage.ts`, `src/storage/inMemoryPhotoStorage.ts`, `src/storage/s3PhotoStorage.test.ts`, `src/storage/minioTestStorage.ts`, `src/storage/s3PhotoStorage.minio.test.ts`, `vitest.minio.config.ts`. Modify `compose.photo-store.yaml`, `vitest.config.ts`, `package.json`.

- [ ] **Step 1: Port — `src/storage/photoStorage.ts`**

```ts
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
```

- [ ] **Step 2: Test double — `src/storage/inMemoryPhotoStorage.ts`**

```ts
import type { PhotoFile, PhotoStorage } from './photoStorage.js';

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
```

- [ ] **Step 3: Failing adapter test — `src/storage/s3PhotoStorage.test.ts`** (pure logic only: command shape, key/location mapping, unconfigured error; real cloud-connection behavior is tested against MinIO in Step 7)

```ts
import { DeleteObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredPhotoStorage, createS3PhotoStorage } from './s3PhotoStorage.js';

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
```

- [ ] **Step 4: Run — expect FAIL** (`Cannot find module './s3PhotoStorage.js'`)

Run: `npx vitest run src/storage/s3PhotoStorage.test.ts`

- [ ] **Step 5: Adapter — `src/storage/s3PhotoStorage.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PhotoFile, PhotoStorage } from './photoStorage.js';

export interface S3PhotoStorageOptions {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

export function createS3PhotoStorage(
  options: S3PhotoStorageOptions,
  client: S3Client = new S3Client({
    endpoint: options.endpoint,
    region: 'us-east-1', // required by the SDK; ignored by MinIO
    forcePathStyle: true,
    credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
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
}): PhotoStorage {
  const { endpoint, bucket, accessKey, secretKey } = settings;
  if (endpoint && bucket && accessKey && secretKey) {
    return createS3PhotoStorage({ endpoint, bucket, accessKey, secretKey });
  }
  const unavailable = async (): Promise<never> => {
    throw new Error('Photo storage is not configured (set the PHOTO_STORE_* variables).');
  };
  return { upload: unavailable, update: unavailable, delete: unavailable, view: unavailable };
}
```

- [ ] **Step 6: Run — expect PASS.** `npx vitest run src/storage/s3PhotoStorage.test.ts`

- [ ] **Step 7: MinIO tests (real cloud-connection logic)**

`vitest.config.ts` — exclude them from the default suite (merge with the existing `defineConfig`):

```ts
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.minio.test.ts'],
    env: {
      // ... existing env block unchanged ...
    },
  },
});
```

`vitest.minio.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

// Tests that need the local photo store (compose.photo-store.yaml) to be running.
export default defineConfig({
  test: { include: ['src/**/*.minio.test.ts'], testTimeout: 15_000 },
});
```

`package.json` scripts — add `"test:minio": "vitest run --config vitest.minio.config.ts",`.

`src/storage/minioTestStorage.ts` (defaults match `compose.photo-store.yaml`; override with `PHOTO_STORE_*`):

```ts
import { createS3PhotoStorage } from './s3PhotoStorage.js';

export const minioSettings = {
  endpoint: process.env.PHOTO_STORE_ENDPOINT ?? 'http://localhost:9000',
  bucket: process.env.PHOTO_STORE_BUCKET ?? 'supplier-photos',
  accessKey: process.env.PHOTO_STORE_ACCESS_KEY ?? 'photostoredev',
  secretKey: process.env.PHOTO_STORE_SECRET_KEY ?? 'photostoredev-secret',
};

export const createMinioTestStorage = () => createS3PhotoStorage(minioSettings);
```

`src/storage/s3PhotoStorage.minio.test.ts`:

```ts
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

  it('fails when the store is unreachable', async () => {
    const { createS3PhotoStorage } = await import('./s3PhotoStorage.js');
    const storage = createS3PhotoStorage({
      endpoint: 'http://localhost:1',
      bucket: 'supplier-photos',
      accessKey: 'x',
      secretKey: 'y',
    });
    await expect(storage.upload(png)).rejects.toThrow();
  });
});
```

- [ ] **Step 8: Anonymous read on the dev bucket** — in `compose.photo-store.yaml`, change the `photo-store-init` shell command to:

```yaml
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://photo-store:9000 $${MINIO_ROOT_USER} $${MINIO_ROOT_PASSWORD} &&
      mc mb --ignore-existing local/supplier-photos &&
      mc anonymous set download local/supplier-photos
      "
```

- [ ] **Step 9: Verify against MinIO, then commit**

```bash
docker compose -f compose.photo-store.yaml up -d
docker compose -f compose.photo-store.yaml ps   # wait until photo-store is healthy and photo-store-init has exited 0
npm run test:minio
npm test
```

Expected: `npm run test:minio` runs the six MinIO tests and they PASS; `npm test` runs everything else without Docker and PASSES. (`delete` of a missing object succeeds because S3 deletes are idempotent; if the run shows otherwise, the adapter is at fault, not the test.)

```bash
git add src/storage vitest.config.ts vitest.minio.config.ts package.json compose.photo-store.yaml
git commit -m "feat(supplier-service): add photo storage port with S3-client adapter and MinIO tests"
```

---

### Task 3: Admin list and detail (F8.1)

**Files:** Modify `src/types/supplier.ts`, `src/persistence/supplierRepository.ts`, `src/persistence/mysqlSupplierRepository.ts`, `src/business/supplierService.ts`, `src/business/supplierService.test.ts`, `src/persistence/mysqlSupplierRepository.test.ts`. Create `src/controllers/adminSupplier.controller.ts`, `src/routes/adminSupplier.routes.ts`, `src/routes/adminSupplier.routes.test.ts`.

- [ ] **Step 1: Types — append to `src/types/supplier.ts`** and change `PaginatedSuppliers`

Replace the existing `PaginatedSuppliers` interface with:

```ts
export interface Paginated<T> {
  metadata: {
    totalRecords: number;
    currPage: number;
    limit: number;
    totalPages: number;
  };
  data: T[];
}

export type PaginatedSuppliers = Paginated<SupplierSummary>;

export interface AdminSupplierSummary extends SupplierSummary {
  isActive: boolean;
  isDeleted: boolean;
}

export interface AdminSupplierDetail extends SupplierDetail {
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
  version: number;
}
```

- [ ] **Step 2: Repository interface — `src/persistence/supplierRepository.ts`**

Add after `SupplierRow`:

```ts
export interface AdminSupplierRow extends SupplierRow {
  isActive: boolean;
  isDeleted: boolean;
  createdOn: string; // 'YYYY-MM-DDTHH:MM:SS+08:00'
  createdBy: string;
  updatedOn: string;
  version: number;
}
```

and add to `SupplierRepository`:

```ts
  /** Admin reads: no visibility filter (Arch §7). */
  findAdminPage(filter: ListFilter): Promise<{ rows: AdminSupplierRow[]; total: number }>;
  findAllAdmin(criteria: ListCriteria): Promise<AdminSupplierRow[]>;
  findAdminById(supplierId: number): Promise<AdminSupplierRow | null>;
```

- [ ] **Step 3: Failing repository tests — append to `src/persistence/mysqlSupplierRepository.test.ts`**

```ts
describe('admin reads', () => {
  const adminRow = {
    supplier_id: 9,
    supplier_name: 'Old Kiosk',
    supplier_type: 'Store',
    supplier_desc: null,
    location: 'Central Library',
    faculty: 'Computing',
    level: 1,
    is_active: 0,
    is_deleted: 1,
    created_on: '2026-09-01T09:00:00+08:00',
    created_by: 'u-1',
    updated_on: '2026-09-02T10:30:00+08:00',
    version: 3,
  };

  it('findAdminPage applies no visibility filter and maps status fields', async () => {
    const { pool, query } = fakePool([{ total: 1 }], [adminRow]);
    const result = await createMysqlSupplierRepository(pool).findAdminPage({ ...baseFilter });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      supplierId: 9,
      isActive: false,
      isDeleted: true,
      createdOn: '2026-09-01T09:00:00+08:00',
      createdBy: 'u-1',
      updatedOn: '2026-09-02T10:30:00+08:00',
      version: 3,
    });
    for (const call of query.mock.calls) {
      expect(call[0]).not.toContain('is_deleted = FALSE');
      expect(call[0]).not.toContain('is_active = TRUE');
    }
  });

  it('findAdminById returns a deleted or inactive supplier, and null when missing', async () => {
    const found = fakePool([adminRow]);
    expect(await createMysqlSupplierRepository(found.pool).findAdminById(9)).toMatchObject({ isDeleted: true });
    expect(found.query.mock.calls[0]?.[0]).not.toContain('is_deleted = FALSE');

    const missing = fakePool([]);
    expect(await createMysqlSupplierRepository(missing.pool).findAdminById(9)).toBeNull();
  });

  it('findAllAdmin returns every matching row without paging', async () => {
    const { pool, query } = fakePool([adminRow]);
    const rows = await createMysqlSupplierRepository(pool).findAllAdmin({ sortOrder: 'Z-A' });
    expect(rows).toHaveLength(1);
    expect(String(query.mock.calls[0]?.[0])).not.toContain('LIMIT');
  });
});
```

- [ ] **Step 4: Run — expect FAIL** (`findAdminPage is not a function`). `npx vitest run src/persistence/mysqlSupplierRepository.test.ts`

- [ ] **Step 5: Implement — edit `src/persistence/mysqlSupplierRepository.ts`**

Add the admin import names and constants, make `buildWhere` take `visibleOnly`, and add the three methods.

(a) In the import list add `AdminSupplierRow`.

(b) After `SUPPLIER_FROM` add:

```ts
interface AdminDbRow extends SupplierDbRow {
  is_active: number;
  is_deleted: number;
  created_on: string;
  created_by: string;
  updated_on: string;
  version: number;
}

// created_on / updated_on are stored as Singapore wall-clock time (Arch §6.2).
const ADMIN_COLUMNS = `${SUPPLIER_COLUMNS},
  s.is_active, s.is_deleted, s.created_by, s.version,
  DATE_FORMAT(s.created_on, '%Y-%m-%dT%H:%i:%s+08:00') AS created_on,
  DATE_FORMAT(s.updated_on, '%Y-%m-%dT%H:%i:%s+08:00') AS updated_on`;
```

(c) Change `buildWhere`'s signature and first line:

```ts
function buildWhere(
  filter: Pick<ListFilter, 'search' | 'locationId' | 'categoryId'>,
  visibleOnly = true,
): { where: string; params: Array<string | number> } {
  const conditions = visibleOnly ? [VISIBLE] : ['1 = 1'];
```

(d) After `toSupplierRow` add:

```ts
function toAdminRow(row: AdminDbRow): AdminSupplierRow {
  return {
    ...toSupplierRow(row),
    isActive: Boolean(row.is_active),
    isDeleted: Boolean(row.is_deleted),
    createdOn: row.created_on,
    createdBy: row.created_by,
    updatedOn: row.updated_on,
    version: Number(row.version),
  };
}
```

(e) Inside the returned object, after `findVisibleById`, add:

```ts
    async findAdminPage(filter) {
      const { where, params } = buildWhere(filter, false);
      const direction = filter.sortOrder === 'Z-A' ? 'DESC' : 'ASC';
      const countPromise = pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${SUPPLIER_FROM} WHERE ${where}`,
        params,
      );
      const pagePromise = pool.query<AdminDbRow[]>(
        `SELECT ${ADMIN_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC
         LIMIT ? OFFSET ?`,
        [...params, filter.limit, filter.offset],
      );
      const [[countRows], [pageRows]] = await Promise.all([countPromise, pagePromise]);
      return { rows: pageRows.map(toAdminRow), total: Number(countRows[0]?.total ?? 0) };
    },

    async findAllAdmin(criteria) {
      const { where, params } = buildWhere(criteria, false);
      const direction = criteria.sortOrder === 'Z-A' ? 'DESC' : 'ASC';
      const [rows] = await pool.query<AdminDbRow[]>(
        `SELECT ${ADMIN_COLUMNS} ${SUPPLIER_FROM} WHERE ${where}
         ORDER BY s.supplier_name ${direction}, s.supplier_id ASC`,
        params,
      );
      return rows.map(toAdminRow);
    },

    async findAdminById(supplierId) {
      const [rows] = await pool.query<AdminDbRow[]>(
        `SELECT ${ADMIN_COLUMNS} ${SUPPLIER_FROM} WHERE s.supplier_id = ?`,
        [supplierId],
      );
      const row = rows[0];
      return row === undefined ? null : toAdminRow(row);
    },
```

- [ ] **Step 6: Run — expect PASS** (all repository tests, old and new). `npx vitest run src/persistence`

- [ ] **Step 7: Failing service tests — append to `src/business/supplierService.test.ts`**, and add three `vi.fn()` entries to `fakeRepo`

In `fakeRepo`'s returned object add:

```ts
    findAdminPage: vi.fn().mockResolvedValue({ rows: [adminStore], total: 1 }),
    findAllAdmin: vi.fn().mockResolvedValue([adminStore, adminFacility]),
    findAdminById: vi.fn().mockResolvedValue(adminStore),
```

and define, next to the other fixtures (`store`, `facility`), plus import `AdminSupplierRow`:

```ts
const adminStore: AdminSupplierRow = {
  ...store,
  isActive: false,
  isDeleted: true,
  createdOn: '2026-09-01T09:00:00+08:00',
  createdBy: 'u-1',
  updatedOn: '2026-09-02T10:30:00+08:00',
  version: 3,
};
const adminFacility: AdminSupplierRow = { ...facility, isActive: true, isDeleted: false, createdOn: '2026-09-01T09:00:00+08:00', createdBy: 'u-1', updatedOn: '2026-09-01T09:00:00+08:00', version: 0 };
```

Tests:

```ts
describe('admin reads', () => {
  it('lists with status fields and no visibility filtering', async () => {
    const repo = fakeRepo();
    const service = createSupplierService(repo, () => MONDAY_10AM_SGT);
    const result = await service.listAdminSuppliers({ page: 1, sortOrder: 'A-Z' });

    expect(repo.findAdminPage).toHaveBeenCalledWith({ sortOrder: 'A-Z', limit: 50, offset: 0 });
    expect(result.data[0]).toMatchObject({ id: 1, isActive: false, isDeleted: true });
    expect(result.metadata).toEqual({ totalRecords: 1, currPage: 1, limit: 50, totalPages: 1 });
  });

  it('applies the isOpen filter over all admin rows before paging', async () => {
    const repo = fakeRepo();
    const service = createSupplierService(repo, () => MONDAY_10AM_SGT);
    const result = await service.listAdminSuppliers({ page: 1, isOpen: true, sortOrder: 'A-Z' });

    expect(repo.findAllAdmin).toHaveBeenCalled();
    expect(result.data.every((item) => item.isOpen)).toBe(true);
  });

  it('returns the admin detail with audit fields and version', async () => {
    const service = createSupplierService(fakeRepo(), () => MONDAY_10AM_SGT);
    const detail = await service.getAdminSupplier(1);

    expect(detail).toMatchObject({
      id: 1,
      desc: 'A campus convenience store.',
      isActive: false,
      isDeleted: true,
      createdOn: '2026-09-01T09:00:00+08:00',
      createdBy: 'u-1',
      updatedOn: '2026-09-02T10:30:00+08:00',
      version: 3,
    });
    expect(detail.openingHours.length).toBeGreaterThan(0);
  });

  it('throws 404 for an unknown admin id', async () => {
    const repo = fakeRepo({ findAdminById: vi.fn().mockResolvedValue(null) });
    await expect(createSupplierService(repo).getAdminSupplier(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

(`MONDAY_10AM_SGT` and the default hours fixture already give supplier 1 a Monday entry; supplier 2 has a `00:00`–`23:59` Monday entry so it is open.)

- [ ] **Step 8: Run — expect FAIL** (`listAdminSuppliers is not a function`). `npx vitest run src/business/supplierService.test.ts`

- [ ] **Step 9: Implement — replace `src/business/supplierService.ts`** (keep the existing file header and append the new dated Scope pair)

```ts
import type {
  AdminSupplierRow,
  CategoryLinkRow,
  HourRow,
  ListCriteria,
  ListFilter,
  PhotoRow,
  SupplierRepository,
  SupplierRow,
} from '../persistence/supplierRepository.js';
import type {
  AdminSupplierDetail,
  AdminSupplierSummary,
  CategoryOption,
  LocationOption,
  Paginated,
  PaginatedSuppliers,
  SupplierDetail,
  SupplierSummary,
} from '../types/supplier.js';
import { AppError } from '../utils/AppError.js';
import { computeIsOpen } from './isOpen.js';

const PAGE_SIZE = 50;

export interface ListParams {
  page: number;
  search?: string;
  locationId?: number;
  categoryId?: number;
  isOpen?: boolean;
  sortOrder: 'A-Z' | 'Z-A';
}

interface Assembled<R extends SupplierRow> {
  row: R;
  summary: SupplierSummary;
  hours: HourRow[];
}

interface PageSource<R extends SupplierRow> {
  page(filter: ListFilter): Promise<{ rows: R[]; total: number }>;
  all(criteria: ListCriteria): Promise<R[]>;
}

function envelope<T>(page: number, total: number, data: T[]): Paginated<T> {
  return {
    metadata: {
      totalRecords: total,
      currPage: page,
      limit: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
    },
    data,
  };
}

export function createSupplierService(
  repo: SupplierRepository,
  clock: () => Date = () => new Date(),
) {
  async function assemble<R extends SupplierRow>(rows: R[]): Promise<Assembled<R>[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.supplierId);
    const [categoryLinks, hours, photos]: [CategoryLinkRow[], HourRow[], PhotoRow[]] =
      await Promise.all([repo.findCategoryLinks(ids), repo.findHours(ids), repo.findPhotos(ids)]);
    const now = clock();

    return rows.map((row) => {
      const ownHours = hours.filter((hour) => hour.supplierId === row.supplierId);
      return {
        row,
        hours: ownHours,
        summary: {
          id: row.supplierId,
          name: row.name,
          type: row.type,
          location: row.location,
          faculty: row.faculty,
          level: row.level,
          categories: categoryLinks
            .filter((link) => link.supplierId === row.supplierId)
            .map((link) => link.category),
          photos: photos
            .filter((photo) => photo.supplierId === row.supplierId)
            .map((photo) => ({
              photoId: photo.photoId,
              photoLocation: photo.photoLocation,
              displayOrder: photo.displayOrder,
            })),
          isOpen: computeIsOpen(ownHours, now),
        },
      };
    });
  }

  async function listPage<R extends SupplierRow, S>(
    params: ListParams,
    source: PageSource<R>,
    decorate: (item: Assembled<R>) => S,
  ): Promise<Paginated<S>> {
    const criteria = {
      search: params.search,
      locationId: params.locationId,
      categoryId: params.categoryId,
      sortOrder: params.sortOrder,
    };
    const offset = (params.page - 1) * PAGE_SIZE;

    if (params.isOpen === undefined) {
      const { rows, total } = await source.page({ ...criteria, limit: PAGE_SIZE, offset });
      const assembled = await assemble(rows);
      return envelope(params.page, total, assembled.map(decorate));
    }

    // isOpen is computed, not stored, so filter the whole matching set before cutting the page.
    const all = await assemble(await source.all(criteria));
    const matching = all.filter((item) => item.summary.isOpen === params.isOpen);
    return envelope(params.page, matching.length, matching.slice(offset, offset + PAGE_SIZE).map(decorate));
  }

  function toDetail(item: Assembled<SupplierRow>): SupplierDetail {
    return {
      ...item.summary,
      desc: item.row.desc,
      openingHours: item.hours
        .map((hour) => ({ day: hour.dayOfWeek, open: hour.open, close: hour.close }))
        .sort((a, b) => a.day - b.day),
    };
  }

  return {
    listSuppliers(params: ListParams): Promise<PaginatedSuppliers> {
      return listPage(
        params,
        {
          page: (filter) => repo.findVisiblePage(filter),
          all: (criteria) => repo.findAllVisible(criteria),
        },
        (item) => item.summary,
      );
    },

    async getSupplier(supplierId: number): Promise<SupplierDetail> {
      const row = await repo.findVisibleById(supplierId);
      if (row === null) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      const [assembled] = await assemble([row]);
      if (assembled === undefined) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      return toDetail(assembled);
    },

    listAdminSuppliers(params: ListParams): Promise<Paginated<AdminSupplierSummary>> {
      return listPage<AdminSupplierRow, AdminSupplierSummary>(
        params,
        {
          page: (filter) => repo.findAdminPage(filter),
          all: (criteria) => repo.findAllAdmin(criteria),
        },
        (item) => ({ ...item.summary, isActive: item.row.isActive, isDeleted: item.row.isDeleted }),
      );
    },

    async getAdminSupplier(supplierId: number): Promise<AdminSupplierDetail> {
      const row = await repo.findAdminById(supplierId);
      if (row === null) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      const [assembled] = await assemble([row]);
      if (assembled === undefined) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      return {
        ...toDetail(assembled),
        isActive: row.isActive,
        isDeleted: row.isDeleted,
        createdOn: row.createdOn,
        createdBy: row.createdBy,
        updatedOn: row.updatedOn,
        version: row.version,
      };
    },

    async listLocations(): Promise<{ locations: LocationOption[] }> {
      const rows = await repo.listLocations();
      return {
        locations: rows.map((row) => ({
          location_id: row.locationId,
          location: row.location,
          faculty_id: row.facultyId,
          faculty: row.faculty,
        })),
      };
    },

    async listCategories(): Promise<{ categories: CategoryOption[] }> {
      const rows = await repo.listCategories();
      return {
        categories: rows.map((row) => ({ category_id: row.categoryId, category: row.category })),
      };
    },
  };
}

export type SupplierService = ReturnType<typeof createSupplierService>;
```

- [ ] **Step 10: Run — expect PASS** (all existing service tests plus the new ones). `npx vitest run src/business`

- [ ] **Step 11: Controller — `src/controllers/adminSupplier.controller.ts`** (create is added in Task 8)

```ts
import type { SupplierService } from '../business/supplierService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from '../validation/supplierQuery.js';

export function createAdminSupplierController(reader: SupplierService) {
  return {
    list: asyncHandler(async (req, res) => {
      const query = parseOrThrow(listQuerySchema, req.query, 'query');
      res.status(200).json(
        await reader.listAdminSuppliers({
          page: query.page,
          search: query.search === '' ? undefined : query.search,
          locationId: query.location_id,
          categoryId: query.category_id,
          isOpen: query.isOpen,
          sortOrder: query.sortOrder,
        }),
      );
    }),

    detail: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      res.status(200).json(await reader.getAdminSupplier(id));
    }),
  };
}
```

- [ ] **Step 12: Router — `src/routes/adminSupplier.routes.ts`** (Task 8 adds the `POST`)

```ts
import { Router } from 'express';
import type { SupplierService } from '../business/supplierService.js';
import { createAdminSupplierController } from '../controllers/adminSupplier.controller.js';
import { requireRole } from '../middleware/requireRole.js';

export function createAdminSupplierRouter(reader: SupplierService): Router {
  const controller = createAdminSupplierController(reader);
  const router = Router();

  router.use(requireRole('admin', 'super admin'));
  router.get('/', controller.list);
  router.get('/:id', controller.detail);

  return router;
}
```

- [ ] **Step 13: Route tests — `src/routes/adminSupplier.routes.test.ts`**

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { SupplierService } from '../business/supplierService.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { createAdminSupplierRouter } from './adminSupplier.routes.js';

function buildApp(overrides: Record<string, unknown> = {}) {
  const service = {
    listAdminSuppliers: vi.fn().mockResolvedValue({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    }),
    getAdminSupplier: vi.fn().mockResolvedValue({ id: 101, version: 2 }),
    ...overrides,
  };
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') req.user = { user_id: 'u-1', role };
    next();
  });
  app.use('/api/v1/admin/suppliers', createAdminSupplierRouter(service as unknown as SupplierService));
  app.use(errorHandler);
  return { app, service };
}

describe.each(['admin', 'super admin'])('role %s', (role) => {
  it('may list and read admin suppliers', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/api/v1/admin/suppliers').set('x-test-role', role)).status).toBe(200);
    expect((await request(app).get('/api/v1/admin/suppliers/101').set('x-test-role', role)).status).toBe(200);
  });
});

describe('access control', () => {
  it('rejects the user role with 403 and never reaches the service', async () => {
    const { app, service } = buildApp();
    const res = await request(app).get('/api/v1/admin/suppliers').set('x-test-role', 'user');
    expect(res.status).toBe(403);
    expect(service.listAdminSuppliers).not.toHaveBeenCalled();
  });

  it('rejects a request with no identity with 403', async () => {
    const { app } = buildApp();
    expect((await request(app).get('/api/v1/admin/suppliers/101')).status).toBe(403);
  });
});

describe('list validation and filters', () => {
  it('passes the same filters as the user list', async () => {
    const { app, service } = buildApp();
    await request(app)
      .get('/api/v1/admin/suppliers?search=store&location_id=4&category_id=2&isOpen=true&sortOrder=Z-A&page=2')
      .set('x-test-role', 'admin');

    expect(service.listAdminSuppliers).toHaveBeenCalledWith({
      page: 2,
      search: 'store',
      locationId: 4,
      categoryId: 2,
      isOpen: true,
      sortOrder: 'Z-A',
    });
  });

  it('rejects a limit other than 50 with 422', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v1/admin/suppliers?limit=10').set('x-test-role', 'admin');
    expect(res.status).toBe(422);
  });

  it('maps an unknown id to 404', async () => {
    const { app } = buildApp({
      getAdminSupplier: vi.fn().mockRejectedValue(new AppError(404, 'Not Found', 'Supplier not found.')),
    });
    const res = await request(app).get('/api/v1/admin/suppliers/999').set('x-test-role', 'admin');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 14: Run — expect PASS**, then wire into `src/app.ts`

Run: `npx vitest run src/routes/adminSupplier.routes.test.ts`

In `src/app.ts` replace the supplier mounting block with the following (later tasks add more mounts at the marked line):

```ts
const supplierService = createSupplierService(createMysqlSupplierRepository(pool));

const apiV1 = express.Router();
apiV1.use(authenticate);
apiV1.use('/suppliers', createSupplierRouter(supplierService));
apiV1.use('/admin/suppliers', createAdminSupplierRouter(supplierService));
// Task 4 mounts /admin/reference; Task 8 extends /admin/suppliers with POST.
app.use('/api/v1', apiV1);
```

and add `import { createAdminSupplierRouter } from './routes/adminSupplier.routes.js';`.

- [ ] **Step 15: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run lint` — Expected: all pass.

```bash
git add src
git commit -m "feat(supplier-service): add admin supplier list and detail"
```

---

### Task 4: Lookup-table management

**Files:** Create `src/persistence/lookupRepository.ts`, `src/persistence/mysqlLookupRepository.ts`, `src/persistence/mysqlLookupRepository.test.ts`, `src/business/lookupService.ts`, `src/business/lookupService.test.ts`, `src/validation/lookupInput.ts`, `src/validation/lookupInput.test.ts`, `src/controllers/lookup.controller.ts`, `src/routes/lookup.routes.ts`, `src/routes/lookup.routes.test.ts`. Modify `src/validation/supplierQuery.ts` (allow `'body'`), `src/app.ts`.

- [ ] **Step 1: Let `parseOrThrow` report body errors** — in `src/validation/supplierQuery.ts` change the parameter type `location: 'query' | 'path'` to `location: 'query' | 'path' | 'body'`.

- [ ] **Step 2: Persistence interface — `src/persistence/lookupRepository.ts`**

```ts
export interface FacultyRecord {
  faculty_id: number;
  faculty: string;
}
export interface LocationRecord {
  location_id: number;
  location: string;
  faculty_id: number;
  level: number;
}
export interface CategoryRecord {
  category_id: number;
  category_type: string;
}
export interface LocationPatch {
  location?: string;
  facultyId?: number;
  level?: number;
}

/**
 * Writes to the three lookup tables (Arch §6.4, §7). Foreign-key and UNIQUE violations surface as
 * AppError 422; update returns null and delete returns false when the id does not exist.
 */
export interface LookupRepository {
  createFaculty(faculty: string): Promise<FacultyRecord>;
  updateFaculty(id: number, faculty: string): Promise<FacultyRecord | null>;
  deleteFaculty(id: number): Promise<boolean>;
  createLocation(input: { location: string; facultyId: number; level: number }): Promise<LocationRecord>;
  updateLocation(id: number, patch: LocationPatch): Promise<LocationRecord | null>;
  deleteLocation(id: number): Promise<boolean>;
  createCategory(categoryType: string): Promise<CategoryRecord>;
  updateCategory(id: number, categoryType: string): Promise<CategoryRecord | null>;
  deleteCategory(id: number): Promise<boolean>;
}
```

- [ ] **Step 3: Failing MySQL tests — `src/persistence/mysqlLookupRepository.test.ts`**

```ts
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/AppError.js';
import { createMysqlLookupRepository } from './mysqlLookupRepository.js';

function fakePool(...steps: Array<unknown | Error>) {
  const query = vi.fn();
  for (const step of steps) {
    if (step instanceof Error) query.mockRejectedValueOnce(step);
    else query.mockResolvedValueOnce([step, []]);
  }
  return { pool: { query } as unknown as Pool, query };
}
const dbError = (code: string) => Object.assign(new Error(code), { code });

describe('faculties', () => {
  it('creates and returns the new row', async () => {
    const { pool, query } = fakePool({ insertId: 5 });
    const created = await createMysqlLookupRepository(pool).createFaculty('Computing');
    expect(created).toEqual({ faculty_id: 5, faculty: 'Computing' });
    expect(query.mock.calls[0]).toEqual(['INSERT INTO faculties (faculty) VALUES (?)', ['Computing']]);
  });

  it('maps a duplicate to 422', async () => {
    const { pool } = fakePool(dbError('ER_DUP_ENTRY'));
    await expect(createMysqlLookupRepository(pool).createFaculty('Computing')).rejects.toMatchObject({
      statusCode: 422,
    });
  });

  it('updates then reads back, and returns null for an unknown id', async () => {
    const found = fakePool({}, [{ faculty_id: 5, faculty: 'Science' }]);
    expect(await createMysqlLookupRepository(found.pool).updateFaculty(5, 'Science')).toEqual({
      faculty_id: 5,
      faculty: 'Science',
    });

    const missing = fakePool({}, []);
    expect(await createMysqlLookupRepository(missing.pool).updateFaculty(9, 'X')).toBeNull();
  });

  it('deletes: true when a row was removed, false when none, 422 when still referenced', async () => {
    expect(await createMysqlLookupRepository(fakePool({ affectedRows: 1 }).pool).deleteFaculty(5)).toBe(true);
    expect(await createMysqlLookupRepository(fakePool({ affectedRows: 0 }).pool).deleteFaculty(5)).toBe(false);

    const referenced = fakePool(dbError('ER_ROW_IS_REFERENCED_2'));
    await expect(createMysqlLookupRepository(referenced.pool).deleteFaculty(5)).rejects.toBeInstanceOf(AppError);
    await expect(
      createMysqlLookupRepository(fakePool(dbError('ER_ROW_IS_REFERENCED_2')).pool).deleteFaculty(5),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('locations', () => {
  it('creates a location and maps a missing faculty to 422', async () => {
    const ok = fakePool({ insertId: 7 });
    expect(
      await createMysqlLookupRepository(ok.pool).createLocation({ location: 'Library', facultyId: 2, level: 1 }),
    ).toEqual({ location_id: 7, location: 'Library', faculty_id: 2, level: 1 });

    const bad = fakePool(dbError('ER_NO_REFERENCED_ROW_2'));
    await expect(
      createMysqlLookupRepository(bad.pool).createLocation({ location: 'Library', facultyId: 99, level: 1 }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('builds the UPDATE from only the supplied fields', async () => {
    const { pool, query } = fakePool({}, [{ location_id: 7, location: 'Library', faculty_id: 2, level: 3 }]);
    await createMysqlLookupRepository(pool).updateLocation(7, { level: 3 });
    expect(query.mock.calls[0]).toEqual(['UPDATE supplier_locations SET level = ? WHERE location_id = ?', [3, 7]]);
  });
});

describe('categories', () => {
  it('creates, updates and deletes', async () => {
    expect(
      await createMysqlLookupRepository(fakePool({ insertId: 3 }).pool).createCategory('Food'),
    ).toEqual({ category_id: 3, category_type: 'Food' });
    expect(
      await createMysqlLookupRepository(fakePool({}, [{ category_id: 3, category_type: 'Drinks' }]).pool).updateCategory(3, 'Drinks'),
    ).toEqual({ category_id: 3, category_type: 'Drinks' });
    expect(await createMysqlLookupRepository(fakePool({ affectedRows: 1 }).pool).deleteCategory(3)).toBe(true);
  });
});
```

- [ ] **Step 4: Run — expect FAIL** (`Cannot find module './mysqlLookupRepository.js'`). `npx vitest run src/persistence/mysqlLookupRepository.test.ts`

- [ ] **Step 5: Implement — `src/persistence/mysqlLookupRepository.ts`**

```ts
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../utils/AppError.js';
import type {
  CategoryRecord,
  FacultyRecord,
  LocationPatch,
  LocationRecord,
  LookupRepository,
} from './lookupRepository.js';

function violation(field: string, message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field, location: 'body', message }],
  });
}

function mapDbError(error: unknown, subject: string): never {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ER_DUP_ENTRY') {
    throw violation(subject, `This ${subject} already exists.`);
  }
  if (code === 'ER_ROW_IS_REFERENCED_2') {
    throw violation(subject, `This ${subject} is still referenced and cannot be deleted.`);
  }
  if (code === 'ER_NO_REFERENCED_ROW_2') {
    throw violation('faculty_id', 'The referenced faculty does not exist.');
  }
  throw error;
}

export function createMysqlLookupRepository(pool: Pool): LookupRepository {
  async function insert(sql: string, params: unknown[], subject: string): Promise<number> {
    try {
      const [result] = await pool.query<ResultSetHeader>(sql, params);
      return Number(result.insertId);
    } catch (error) {
      return mapDbError(error, subject);
    }
  }

  async function remove(sql: string, id: number, subject: string): Promise<boolean> {
    try {
      const [result] = await pool.query<ResultSetHeader>(sql, [id]);
      return result.affectedRows > 0;
    } catch (error) {
      return mapDbError(error, subject);
    }
  }

  async function update(sql: string, params: unknown[], subject: string): Promise<void> {
    try {
      await pool.query(sql, params);
    } catch (error) {
      mapDbError(error, subject);
    }
  }

  async function readOne<T>(sql: string, id: number): Promise<T | null> {
    const [rows] = await pool.query<RowDataPacket[]>(sql, [id]);
    return rows[0] === undefined ? null : (rows[0] as unknown as T);
  }

  return {
    async createFaculty(faculty) {
      const id = await insert('INSERT INTO faculties (faculty) VALUES (?)', [faculty], 'faculty');
      return { faculty_id: id, faculty };
    },
    async updateFaculty(id, faculty) {
      await update('UPDATE faculties SET faculty = ? WHERE faculty_id = ?', [faculty, id], 'faculty');
      const row = await readOne<FacultyRecord>('SELECT faculty_id, faculty FROM faculties WHERE faculty_id = ?', id);
      return row === null ? null : { faculty_id: Number(row.faculty_id), faculty: row.faculty };
    },
    deleteFaculty: (id) => remove('DELETE FROM faculties WHERE faculty_id = ?', id, 'faculty'),

    async createLocation({ location, facultyId, level }) {
      const id = await insert(
        'INSERT INTO supplier_locations (location, faculty_id, level) VALUES (?, ?, ?)',
        [location, facultyId, level],
        'location',
      );
      return { location_id: id, location, faculty_id: facultyId, level };
    },
    async updateLocation(id, patch: LocationPatch) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.location !== undefined) {
        sets.push('location = ?');
        params.push(patch.location);
      }
      if (patch.facultyId !== undefined) {
        sets.push('faculty_id = ?');
        params.push(patch.facultyId);
      }
      if (patch.level !== undefined) {
        sets.push('level = ?');
        params.push(patch.level);
      }
      if (sets.length > 0) {
        await update(
          `UPDATE supplier_locations SET ${sets.join(', ')} WHERE location_id = ?`,
          [...params, id],
          'location',
        );
      }
      const row = await readOne<LocationRecord>(
        'SELECT location_id, location, faculty_id, level FROM supplier_locations WHERE location_id = ?',
        id,
      );
      return row === null
        ? null
        : {
            location_id: Number(row.location_id),
            location: row.location,
            faculty_id: Number(row.faculty_id),
            level: Number(row.level),
          };
    },
    deleteLocation: (id) => remove('DELETE FROM supplier_locations WHERE location_id = ?', id, 'location'),

    async createCategory(categoryType) {
      const id = await insert(
        'INSERT INTO supplier_categories (category_type) VALUES (?)',
        [categoryType],
        'category_type',
      );
      return { category_id: id, category_type: categoryType };
    },
    async updateCategory(id, categoryType) {
      await update(
        'UPDATE supplier_categories SET category_type = ? WHERE category_id = ?',
        [categoryType, id],
        'category_type',
      );
      const row = await readOne<CategoryRecord>(
        'SELECT category_id, category_type FROM supplier_categories WHERE category_id = ?',
        id,
      );
      return row === null ? null : { category_id: Number(row.category_id), category_type: row.category_type };
    },
    deleteCategory: (id) => remove('DELETE FROM supplier_categories WHERE category_id = ?', id, 'category'),
  };
}
```

- [ ] **Step 6: Run — expect PASS.** `npx vitest run src/persistence/mysqlLookupRepository.test.ts`

- [ ] **Step 7: Validation — failing test then implementation**

`src/validation/lookupInput.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categoryBody, facultyBody, locationCreateBody, locationUpdateBody } from './lookupInput.js';

describe('lookup bodies', () => {
  it('trims and requires the faculty name', () => {
    expect(facultyBody.parse({ faculty: '  Computing ' })).toEqual({ faculty: 'Computing' });
    expect(facultyBody.safeParse({ faculty: '   ' }).success).toBe(false);
    expect(facultyBody.safeParse({}).success).toBe(false);
  });

  it('requires location, faculty_id and level on create', () => {
    expect(locationCreateBody.parse({ location: 'Library', faculty_id: '2', level: '1' })).toEqual({
      location: 'Library',
      faculty_id: 2,
      level: 1,
    });
    expect(locationCreateBody.safeParse({ location: 'Library', level: 1 }).success).toBe(false);
  });

  it('accepts any subset on update but not an empty body', () => {
    expect(locationUpdateBody.parse({ level: 3 })).toEqual({ level: 3 });
    expect(locationUpdateBody.safeParse({}).success).toBe(false);
  });

  it('requires category_type', () => {
    expect(categoryBody.parse({ category_type: 'Food' })).toEqual({ category_type: 'Food' });
    expect(categoryBody.safeParse({ category_type: '' }).success).toBe(false);
  });
});
```

Run (expect FAIL, module missing): `npx vitest run src/validation/lookupInput.test.ts`. Then create `src/validation/lookupInput.ts`:

```ts
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

export const facultyBody = z.object({ faculty: z.string().trim().min(1).max(255) });

export const locationCreateBody = z.object({
  location: z.string().trim().min(1).max(255),
  faculty_id: positiveInt,
  level: z.coerce.number().int(),
});

export const locationUpdateBody = locationCreateBody
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required.' });

export const categoryBody = z.object({ category_type: z.string().trim().min(1).max(100) });
```

Run again — expect PASS.

- [ ] **Step 8: Service tests — `src/business/lookupService.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { LookupRepository } from '../persistence/lookupRepository.js';
import { createLookupService } from './lookupService.js';

function fakeRepo(overrides: Partial<LookupRepository> = {}): LookupRepository {
  return {
    createFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Computing' }),
    updateFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Science' }),
    deleteFaculty: vi.fn().mockResolvedValue(true),
    createLocation: vi.fn().mockResolvedValue({ location_id: 1, location: 'L', faculty_id: 1, level: 1 }),
    updateLocation: vi.fn().mockResolvedValue({ location_id: 1, location: 'L', faculty_id: 1, level: 2 }),
    deleteLocation: vi.fn().mockResolvedValue(true),
    createCategory: vi.fn().mockResolvedValue({ category_id: 1, category_type: 'Food' }),
    updateCategory: vi.fn().mockResolvedValue({ category_id: 1, category_type: 'Drinks' }),
    deleteCategory: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('lookup service', () => {
  it('passes creates and updates through', async () => {
    const service = createLookupService(fakeRepo());
    expect(await service.createFaculty('Computing')).toEqual({ faculty_id: 1, faculty: 'Computing' });
    expect(await service.updateCategory(1, 'Drinks')).toEqual({ category_id: 1, category_type: 'Drinks' });
  });

  it('returns 200 body { deleted: true, id } on delete', async () => {
    expect(await createLookupService(fakeRepo()).deleteLocation(4)).toEqual({ deleted: true, id: 4 });
  });

  it.each([
    ['updateFaculty', (s: ReturnType<typeof createLookupService>) => s.updateFaculty(9, 'X')],
    ['updateLocation', (s: ReturnType<typeof createLookupService>) => s.updateLocation(9, { level: 1 })],
    ['updateCategory', (s: ReturnType<typeof createLookupService>) => s.updateCategory(9, 'X')],
  ])('%s throws 404 for an unknown id', async (name, call) => {
    const service = createLookupService(fakeRepo({ [name]: vi.fn().mockResolvedValue(null) }));
    await expect(call(service)).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['deleteFaculty', (s: ReturnType<typeof createLookupService>) => s.deleteFaculty(9)],
    ['deleteLocation', (s: ReturnType<typeof createLookupService>) => s.deleteLocation(9)],
    ['deleteCategory', (s: ReturnType<typeof createLookupService>) => s.deleteCategory(9)],
  ])('%s throws 404 for an unknown id', async (name, call) => {
    const service = createLookupService(fakeRepo({ [name]: vi.fn().mockResolvedValue(false) }));
    await expect(call(service)).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

Run (expect FAIL): `npx vitest run src/business/lookupService.test.ts`. Implement `src/business/lookupService.ts`:

```ts
import type { LocationPatch, LookupRepository } from '../persistence/lookupRepository.js';
import { AppError } from '../utils/AppError.js';

function notFound(subject: string): AppError {
  return new AppError(404, 'Not Found', `${subject} not found.`);
}

export function createLookupService(repo: LookupRepository) {
  async function updated<T>(result: Promise<T | null>, subject: string): Promise<T> {
    const value = await result;
    if (value === null) throw notFound(subject);
    return value;
  }

  async function deleted(result: Promise<boolean>, id: number, subject: string) {
    if (!(await result)) throw notFound(subject);
    return { deleted: true as const, id };
  }

  return {
    createFaculty: (faculty: string) => repo.createFaculty(faculty),
    updateFaculty: (id: number, faculty: string) => updated(repo.updateFaculty(id, faculty), 'Faculty'),
    deleteFaculty: (id: number) => deleted(repo.deleteFaculty(id), id, 'Faculty'),

    createLocation: (input: { location: string; facultyId: number; level: number }) =>
      repo.createLocation(input),
    updateLocation: (id: number, patch: LocationPatch) => updated(repo.updateLocation(id, patch), 'Location'),
    deleteLocation: (id: number) => deleted(repo.deleteLocation(id), id, 'Location'),

    createCategory: (categoryType: string) => repo.createCategory(categoryType),
    updateCategory: (id: number, categoryType: string) =>
      updated(repo.updateCategory(id, categoryType), 'Category'),
    deleteCategory: (id: number) => deleted(repo.deleteCategory(id), id, 'Category'),
  };
}

export type LookupService = ReturnType<typeof createLookupService>;
```

Run again — expect PASS.

- [ ] **Step 9: Controller — `src/controllers/lookup.controller.ts`**

```ts
import type { LookupService } from '../business/lookupService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { categoryBody, facultyBody, locationCreateBody, locationUpdateBody } from '../validation/lookupInput.js';
import { idParamSchema, parseOrThrow } from '../validation/supplierQuery.js';

export function createLookupController(service: LookupService) {
  const id = (params: unknown) => parseOrThrow(idParamSchema, params, 'path').id;

  return {
    createFaculty: asyncHandler(async (req, res) => {
      const body = parseOrThrow(facultyBody, req.body, 'body');
      res.status(201).json(await service.createFaculty(body.faculty));
    }),
    updateFaculty: asyncHandler(async (req, res) => {
      const body = parseOrThrow(facultyBody, req.body, 'body');
      res.status(200).json(await service.updateFaculty(id(req.params), body.faculty));
    }),
    deleteFaculty: asyncHandler(async (req, res) => {
      res.status(200).json(await service.deleteFaculty(id(req.params)));
    }),

    createLocation: asyncHandler(async (req, res) => {
      const body = parseOrThrow(locationCreateBody, req.body, 'body');
      res.status(201).json(
        await service.createLocation({ location: body.location, facultyId: body.faculty_id, level: body.level }),
      );
    }),
    updateLocation: asyncHandler(async (req, res) => {
      const body = parseOrThrow(locationUpdateBody, req.body, 'body');
      res.status(200).json(
        await service.updateLocation(id(req.params), {
          location: body.location,
          facultyId: body.faculty_id,
          level: body.level,
        }),
      );
    }),
    deleteLocation: asyncHandler(async (req, res) => {
      res.status(200).json(await service.deleteLocation(id(req.params)));
    }),

    createCategory: asyncHandler(async (req, res) => {
      const body = parseOrThrow(categoryBody, req.body, 'body');
      res.status(201).json(await service.createCategory(body.category_type));
    }),
    updateCategory: asyncHandler(async (req, res) => {
      const body = parseOrThrow(categoryBody, req.body, 'body');
      res.status(200).json(await service.updateCategory(id(req.params), body.category_type));
    }),
    deleteCategory: asyncHandler(async (req, res) => {
      res.status(200).json(await service.deleteCategory(id(req.params)));
    }),
  };
}
```

(`201` for creates follows §7.1 "201 Created — successful supplier creation"; the architecture does not say the lookup create status, so this is added to the "Choices" list in the log entry for the team to confirm.)

- [ ] **Step 10: Router — `src/routes/lookup.routes.ts`**

```ts
import { Router } from 'express';
import type { LookupService } from '../business/lookupService.js';
import { createLookupController } from '../controllers/lookup.controller.js';
import { requireRole } from '../middleware/requireRole.js';

export function createLookupRouter(service: LookupService): Router {
  const c = createLookupController(service);
  const router = Router();

  router.use(requireRole('admin', 'super admin'));

  router.post('/faculties', c.createFaculty);
  router.put('/faculties/:id', c.updateFaculty);
  router.delete('/faculties/:id', c.deleteFaculty);

  router.post('/locations', c.createLocation);
  router.put('/locations/:id', c.updateLocation);
  router.delete('/locations/:id', c.deleteLocation);

  router.post('/categories', c.createCategory);
  router.put('/categories/:id', c.updateCategory);
  router.delete('/categories/:id', c.deleteCategory);

  return router;
}
```

- [ ] **Step 11: Route tests — `src/routes/lookup.routes.test.ts`**

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { LookupService } from '../business/lookupService.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { createLookupRouter } from './lookup.routes.js';

function buildApp() {
  const service = {
    createFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Computing' }),
    updateFaculty: vi.fn().mockResolvedValue({ faculty_id: 1, faculty: 'Science' }),
    deleteFaculty: vi.fn().mockResolvedValue({ deleted: true, id: 1 }),
    createLocation: vi.fn().mockResolvedValue({ location_id: 2, location: 'L', faculty_id: 1, level: 1 }),
    updateLocation: vi.fn().mockResolvedValue({ location_id: 2, location: 'L', faculty_id: 1, level: 2 }),
    deleteLocation: vi.fn().mockResolvedValue({ deleted: true, id: 2 }),
    createCategory: vi.fn().mockResolvedValue({ category_id: 3, category_type: 'Food' }),
    updateCategory: vi.fn().mockResolvedValue({ category_id: 3, category_type: 'Drinks' }),
    deleteCategory: vi.fn().mockResolvedValue({ deleted: true, id: 3 }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') req.user = { user_id: 'u-1', role };
    next();
  });
  app.use('/api/v1/admin/reference', createLookupRouter(service as unknown as LookupService));
  app.use(errorHandler);
  return { app, service };
}

describe('lookup routes', () => {
  it('creates a faculty (201) and passes the trimmed name', async () => {
    const { app, service } = buildApp();
    const res = await request(app)
      .post('/api/v1/admin/reference/faculties')
      .set('x-test-role', 'admin')
      .send({ faculty: ' Computing ' });
    expect(res.status).toBe(201);
    expect(service.createFaculty).toHaveBeenCalledWith('Computing');
  });

  it('maps location_id-style body fields to the service input', async () => {
    const { app, service } = buildApp();
    await request(app)
      .post('/api/v1/admin/reference/locations')
      .set('x-test-role', 'super admin')
      .send({ location: 'Library', faculty_id: 1, level: 2 });
    expect(service.createLocation).toHaveBeenCalledWith({ location: 'Library', facultyId: 1, level: 2 });
  });

  it('updates a category and deletes a faculty with 200', async () => {
    const { app } = buildApp();
    expect(
      (await request(app).put('/api/v1/admin/reference/categories/3').set('x-test-role', 'admin').send({ category_type: 'Drinks' })).status,
    ).toBe(200);
    const del = await request(app).delete('/api/v1/admin/reference/faculties/1').set('x-test-role', 'admin');
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true, id: 1 });
  });

  it('rejects a bad body with 422 and a bad id with 422', async () => {
    const { app } = buildApp();
    expect(
      (await request(app).post('/api/v1/admin/reference/faculties').set('x-test-role', 'admin').send({})).status,
    ).toBe(422);
    expect((await request(app).delete('/api/v1/admin/reference/faculties/abc').set('x-test-role', 'admin')).status).toBe(422);
  });

  it('rejects the user role with 403 on every verb', async () => {
    const { app, service } = buildApp();
    expect((await request(app).post('/api/v1/admin/reference/faculties').set('x-test-role', 'user').send({ faculty: 'X' })).status).toBe(403);
    expect((await request(app).delete('/api/v1/admin/reference/faculties/1').set('x-test-role', 'user')).status).toBe(403);
    expect(service.createFaculty).not.toHaveBeenCalled();
    expect(service.deleteFaculty).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/routes/lookup.routes.test.ts` — expect PASS.

- [ ] **Step 12: Wire into `src/app.ts`** — add imports (`createLookupService`, `createMysqlLookupRepository`, `createLookupRouter`) and, at the "Task 4" comment line:

```ts
apiV1.use('/admin/reference', createLookupRouter(createLookupService(createMysqlLookupRepository(pool))));
```

- [ ] **Step 13: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run lint` — Expected: all pass.

```bash
git add src
git commit -m "feat(supplier-service): add faculty, location and category management endpoints"
```

---

### Task 5: SGT datetime helper and create-request parsing

**Files:** Modify `src/utils/time.ts`, `src/utils/time.test.ts`. Create `src/validation/supplierInput.ts`, `src/validation/supplierInput.test.ts`.

- [ ] **Step 1: Failing test — append to `src/utils/time.test.ts`**

```ts
import { sgtDatetime } from './time.js';

describe('sgtDatetime', () => {
  it('formats a Date as Singapore wall-clock time for MySQL DATETIME', () => {
    expect(sgtDatetime(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-29 10:00:00');
    expect(sgtDatetime(new Date('2026-09-29T17:30:15Z'))).toBe('2026-09-30 01:30:15');
  });
});
```

(If the file already imports from `./time.js`, merge the import.) Run — expect FAIL. Add to `src/utils/time.ts`:

```ts
/** Singapore wall-clock time in MySQL DATETIME form, e.g. '2026-09-29 10:00:00' (Arch §6.2). */
export function sgtDatetime(date = new Date()): string {
  const shiftedDate = new Date(date.getTime() + SGT_OFFSET_MS);
  return shiftedDate.toISOString().slice(0, 19).replace('T', ' ');
}
```

Run — expect PASS.

- [ ] **Step 2: Failing tests — `src/validation/supplierInput.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { parseCreateSupplier } from './supplierInput.js';

const store = {
  name: '  Campus Store ',
  type: 'Store',
  location_id: '4',
  category_id: '[2, 3, 3]',
  desc: 'A campus convenience store.',
  openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
};
const day8 = { day: 8, open: '00:00', close: '23:59', is24h: true };

describe('parseCreateSupplier — Store', () => {
  it('parses the documented example (Arch §7.4)', () => {
    expect(parseCreateSupplier(store)).toEqual({
      name: 'Campus Store',
      type: 'Store',
      desc: 'A campus convenience store.',
      locationId: 4,
      categoryIds: [2, 3],
      hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }],
    });
  });

  it('allows Store days that are 00:00-23:59 without the 24/7 flag', () => {
    const result = parseCreateSupplier({
      ...store,
      openingHours: '[{"day":1,"open":"00:00","close":"23:59"},{"day":2,"open":"09:00","close":"18:00"}]',
    });
    expect(result.hours.map((h) => h.is24h)).toEqual([false, false]);
  });

  it('treats a 24/7 Store as a single day-8 entry', () => {
    const result = parseCreateSupplier({
      ...store,
      is24h: 'true',
      openingHours: '[{"day":8,"open":"00:00","close":"23:59"}]',
    });
    expect(result.hours).toEqual([day8]);
  });

  it('rejects is24h without exactly the day-8 entry', () => {
    expect(() => parseCreateSupplier({ ...store, is24h: 'true' })).toThrowError(/24\/7/);
  });

  it('rejects a day-8 entry without is24h', () => {
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":8,"open":"00:00","close":"23:59"}]' }),
    ).toThrowError(/reserved/);
  });

  it('requires operating hours for a Store', () => {
    expect(() => parseCreateSupplier({ ...store, openingHours: '[]' })).toThrowError(/required/);
    expect(() => parseCreateSupplier({ ...store, openingHours: undefined })).toThrowError(/required/);
  });

  it('rejects equal open and close with the 00:00-23:59 hint', () => {
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":1,"open":"09:00","close":"09:00"}]' }),
    ).toThrowError(/00:00–23:59/);
  });

  it('rejects duplicate days, bad days and bad times', () => {
    const dup = '[{"day":1,"open":"09:00","close":"10:00"},{"day":1,"open":"11:00","close":"12:00"}]';
    expect(() => parseCreateSupplier({ ...store, openingHours: dup })).toThrowError(/once/);
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":0,"open":"09:00","close":"10:00"}]' }),
    ).toThrow();
    expect(() =>
      parseCreateSupplier({ ...store, openingHours: '[{"day":1,"open":"9am","close":"10:00"}]' }),
    ).toThrow();
  });

  it('allows an overnight interval', () => {
    const result = parseCreateSupplier({
      ...store,
      openingHours: '[{"day":5,"open":"22:00","close":"02:00"}]',
    });
    expect(result.hours[0]).toMatchObject({ day: 5, open: '22:00', close: '02:00' });
  });
});

describe('parseCreateSupplier — Facility', () => {
  it('ignores client hours and stores the single day-8 entry', () => {
    const result = parseCreateSupplier({ ...store, type: 'Facility' });
    expect(result.hours).toEqual([day8]);
  });

  it('does not need hours at all', () => {
    const result = parseCreateSupplier({ ...store, type: 'Facility', openingHours: undefined });
    expect(result.hours).toEqual([day8]);
  });
});

describe('parseCreateSupplier — fields', () => {
  it('requires name, type and location', () => {
    const error = (() => {
      try {
        parseCreateSupplier({});
      } catch (e) {
        return e as { statusCode: number; details: Array<{ field: string }> };
      }
      throw new Error('expected a throw');
    })();
    expect(error.statusCode).toBe(422);
    expect(error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['name', 'type', 'location_id']));
  });

  it('defaults desc to null and categories to none', () => {
    const result = parseCreateSupplier({ name: 'X', type: 'Facility', location_id: '1' });
    expect(result.desc).toBeNull();
    expect(result.categoryIds).toEqual([]);
  });

  it('answers 400 for malformed JSON in openingHours or category_id', () => {
    expect(() => parseCreateSupplier({ ...store, openingHours: '[{' })).toThrowError(/valid JSON/);
    try {
      parseCreateSupplier({ ...store, category_id: 'nope' });
    } catch (e) {
      expect((e as { statusCode: number }).statusCode).toBe(400);
    }
  });

  it('accepts a single category id', () => {
    expect(parseCreateSupplier({ ...store, category_id: '2' }).categoryIds).toEqual([2]);
  });
});
```

Run — expect FAIL (module missing). `npx vitest run src/validation/supplierInput.test.ts`

- [ ] **Step 3: Implement — `src/validation/supplierInput.ts`**

```ts
import { z } from 'zod';
import { AppError, type AppErrorDetail } from '../utils/AppError.js';

const ALWAYS_OPEN_DAY = 8;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface HourInput {
  day: number; // 1 = Monday .. 7 = Sunday; 8 = open 24/7 (Arch §6.2)
  open: string;
  close: string;
  is24h: boolean; // true only on the day-8 entry
}

export interface CreateSupplierInput {
  name: string;
  type: 'Store' | 'Facility';
  desc: string | null;
  locationId: number;
  categoryIds: number[];
  hours: HourInput[];
}

const ALWAYS_OPEN: HourInput = { day: ALWAYS_OPEN_DAY, open: '00:00', close: '23:59', is24h: true };

const fieldsSchema = z.object({
  name: z.string({ required_error: 'Supplier name is required.' }).trim().min(1, 'Supplier name is required.').max(255),
  type: z.enum(['Store', 'Facility'], {
    errorMap: () => ({ message: 'Type must be Store or Facility.' }),
  }),
  desc: z.string().optional(),
  location_id: z.coerce
    .number({ invalid_type_error: 'Location is required.' })
    .int()
    .positive('Location is required.'),
  is24h: z.enum(['true', 'false']).optional(),
});

const hourSchema = z.object({
  day: z.number().int().min(1).max(8),
  open: z.string().regex(TIME, 'Time must be HH:MM.'),
  close: z.string().regex(TIME, 'Time must be HH:MM.'),
});

const idListSchema = z.array(z.number().int().positive());

function invalid(details: AppErrorDetail[]): AppError {
  return new AppError(422, 'Unprocessable Entity', 'One or more supplier fields failed validation.', { details });
}

function fail(field: string, message: string): never {
  throw invalid([{ field, location: 'body', message }]);
}

function parseJson(field: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(400, 'Bad Request', `${field} must be valid JSON.`, {
      details: [{ field, location: 'body', message: `${field} must be valid JSON.` }],
    });
  }
}

function parseCategoryIds(raw: unknown): number[] {
  if (raw === undefined || raw === '') return [];
  const parsed = parseJson('category_id', String(raw));
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const result = idListSchema.safeParse(list);
  if (!result.success) fail('category_id', 'category_id must be a list of category ids.');
  return [...new Set(result.data)];
}

function parseStoreHours(raw: unknown, is24h: boolean): HourInput[] {
  const parsed = raw === undefined || raw === '' ? [] : parseJson('openingHours', String(raw));
  const list = z.array(hourSchema).safeParse(parsed);
  if (!list.success) {
    throw invalid(
      list.error.issues.map((issue) => ({
        field: 'openingHours',
        location: 'body',
        message: issue.message,
      })),
    );
  }
  const entries = list.data;

  if (is24h) {
    const [only] = entries;
    const valid =
      entries.length === 1 &&
      only !== undefined &&
      only.day === ALWAYS_OPEN_DAY &&
      only.open === ALWAYS_OPEN.open &&
      only.close === ALWAYS_OPEN.close;
    if (!valid) {
      fail('openingHours', 'A 24/7 Store must send a single entry {"day": 8, "open": "00:00", "close": "23:59"}.');
    }
    return [{ ...ALWAYS_OPEN }];
  }

  if (entries.length === 0) {
    fail('openingHours', 'Operating hours are required for a Store.');
  }

  const seen = new Set<number>();
  for (const entry of entries) {
    if (entry.day === ALWAYS_OPEN_DAY) {
      fail('openingHours', 'Day 8 is reserved for 24/7 suppliers; set is24h instead.');
    }
    if (entry.open === entry.close) {
      fail('openingHours', 'A 24-hour schedule must be entered as 00:00–23:59.');
    }
    if (seen.has(entry.day)) {
      fail('openingHours', 'Each day may appear only once.');
    }
    seen.add(entry.day);
  }
  return entries.map((entry) => ({ ...entry, is24h: false }));
}

/** Parses the multipart text fields of POST /api/v1/admin/suppliers (Arch §7.3, §7.4). */
export function parseCreateSupplier(body: Record<string, unknown>): CreateSupplierInput {
  const fields = fieldsSchema.safeParse(body);
  if (!fields.success) {
    throw invalid(
      fields.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        location: 'body',
        message: issue.message,
      })),
    );
  }
  const data = fields.data;
  const categoryIds = parseCategoryIds(body.category_id);

  // A Facility is always 24/7: the server fills in the single day-8 entry (Arch §7, §9 item 21 (g)).
  const hours =
    data.type === 'Facility'
      ? [{ ...ALWAYS_OPEN }]
      : parseStoreHours(body.openingHours, data.is24h === 'true');

  return {
    name: data.name,
    type: data.type,
    desc: data.desc === undefined || data.desc.trim() === '' ? null : data.desc.trim(),
    locationId: data.location_id,
    categoryIds,
    hours,
  };
}
```

- [ ] **Step 4: Run — expect PASS.** `npx vitest run src/validation src/utils`

- [ ] **Step 5: Commit**

```bash
git add src/utils src/validation
git commit -m "feat(supplier-service): parse and validate supplier create requests"
```

---

### Task 6: Idempotency store

**Files:** Create `src/idempotency/idempotencyStore.ts`, `src/idempotency/idempotencyStore.test.ts`, `src/middleware/requireIdempotencyKey.ts`, `src/middleware/requireIdempotencyKey.test.ts`.

- [ ] **Step 1: Failing tests — `src/idempotency/idempotencyStore.test.ts`**

```ts
import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { createRedisIdempotencyStore } from './idempotencyStore.js';

function fakeRedis() {
  const data = new Map<string, { value: string; ttl: number }>();
  const redis = {
    async set(key: string, value: string, _ex: 'EX', ttl: number, nx?: 'NX') {
      if (nx === 'NX' && data.has(key)) return null;
      data.set(key, { value, ttl });
      return 'OK';
    },
    async get(key: string) {
      return data.get(key)?.value ?? null;
    },
    async del(key: string) {
      return data.delete(key) ? 1 : 0;
    },
  };
  return { redis: redis as unknown as Redis, data };
}

const KEY = '9b2f5a80-4c1e-4f70-9d7e-2f3a1c6b8e11';

describe('idempotency store', () => {
  it('starts a new request and marks it in flight for 60 s, per user and key', async () => {
    const { redis, data } = fakeRedis();
    const store = createRedisIdempotencyStore(redis);

    expect(await store.begin('u-1', KEY)).toBe('started');
    expect(data.get(`idempotency:u-1:${KEY}`)?.ttl).toBe(60);
  });

  it('reports an in-flight replay', async () => {
    const store = createRedisIdempotencyStore(fakeRedis().redis);
    await store.begin('u-1', KEY);
    expect(await store.begin('u-1', KEY)).toBe('in_flight');
  });

  it('caches the completed response for 24 h and replays it', async () => {
    const { redis, data } = fakeRedis();
    const store = createRedisIdempotencyStore(redis);
    await store.begin('u-1', KEY);
    await store.complete('u-1', KEY, { statusCode: 201, body: { id: 7 } });

    expect(data.get(`idempotency:u-1:${KEY}`)?.ttl).toBe(86_400);
    expect(await store.begin('u-1', KEY)).toEqual({ statusCode: 201, body: { id: 7 } });
  });

  it('keeps different users independent even with the same key', async () => {
    const store = createRedisIdempotencyStore(fakeRedis().redis);
    await store.begin('u-1', KEY);
    expect(await store.begin('u-2', KEY)).toBe('started');
  });

  it('abandon frees the key so the client can retry', async () => {
    const store = createRedisIdempotencyStore(fakeRedis().redis);
    await store.begin('u-1', KEY);
    await store.abandon('u-1', KEY);
    expect(await store.begin('u-1', KEY)).toBe('started');
  });
});
```

Run — expect FAIL. Implement `src/idempotency/idempotencyStore.ts`:

```ts
import type { Redis } from 'ioredis';

const IN_FLIGHT_TTL_SECONDS = 60;
const COMPLETED_TTL_SECONDS = 24 * 60 * 60;

export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export type BeginResult = 'started' | 'in_flight' | CachedResponse;

export interface IdempotencyStore {
  begin(userId: string, key: string): Promise<BeginResult>;
  complete(userId: string, key: string, response: CachedResponse): Promise<void>;
  abandon(userId: string, key: string): Promise<void>;
}

/** Redis-backed store, keyed per user and per key (Arch §7.5, §9 item 21 (f)). */
export function createRedisIdempotencyStore(redis: Redis): IdempotencyStore {
  const redisKey = (userId: string, key: string) => `idempotency:${userId}:${key}`;

  return {
    async begin(userId, key) {
      const name = redisKey(userId, key);
      const started = await redis.set(name, JSON.stringify({ status: 'in_flight' }), 'EX', IN_FLIGHT_TTL_SECONDS, 'NX');
      if (started === 'OK') return 'started';

      const existing = await redis.get(name);
      if (existing === null) {
        // Expired between the two calls: treat as a fresh request.
        return this.begin(userId, key);
      }
      const state = JSON.parse(existing) as { status: 'in_flight' } | { status: 'completed'; response: CachedResponse };
      return state.status === 'completed' ? state.response : 'in_flight';
    },

    async complete(userId, key, response) {
      await redis.set(redisKey(userId, key), JSON.stringify({ status: 'completed', response }), 'EX', COMPLETED_TTL_SECONDS);
    },

    async abandon(userId, key) {
      await redis.del(redisKey(userId, key));
    },
  };
}
```

Run — expect PASS. `npx vitest run src/idempotency`

- [ ] **Step 2: Header middleware tests — `src/middleware/requireIdempotencyKey.test.ts`**

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { requireIdempotencyKey } from './requireIdempotencyKey.js';

const app = express();
app.post('/x', requireIdempotencyKey, (_req, res) => res.status(204).end());
app.use(errorHandler);

describe('requireIdempotencyKey', () => {
  it('rejects a missing header with 400', async () => {
    const res = await request(app).post('/x');
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'Idempotency-Key', location: 'header' });
  });

  it('rejects a header that is not a UUID with 400', async () => {
    expect((await request(app).post('/x').set('Idempotency-Key', 'abc')).status).toBe(400);
  });

  it('accepts a UUID', async () => {
    const res = await request(app).post('/x').set('Idempotency-Key', '9b2f5a80-4c1e-4f70-9d7e-2f3a1c6b8e11');
    expect(res.status).toBe(204);
  });
});
```

Run — expect FAIL. Implement `src/middleware/requireIdempotencyKey.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/v1/admin/suppliers requires an Idempotency-Key UUID header (Arch §7.5). */
export function requireIdempotencyKey(req: Request, _res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (key === undefined || !UUID.test(key)) {
    next(
      new AppError(400, 'Bad Request', 'A valid Idempotency-Key header (UUID) is required.', {
        details: [{ field: 'Idempotency-Key', location: 'header', message: 'Send a UUID in the Idempotency-Key header.' }],
      }),
    );
    return;
  }
  next();
}
```

Run — expect PASS. `npx vitest run src/middleware`

- [ ] **Step 3: Commit**

```bash
git add src/idempotency src/middleware
git commit -m "feat(supplier-service): add Redis idempotency store and header check"
```

---

### Task 7: Create and reactivate — write repository and creation service

**Files:** Create `src/persistence/supplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.test.ts`, `src/business/supplierCreationService.ts`, `src/business/supplierCreationService.test.ts`.

- [ ] **Step 1: Interface — `src/persistence/supplierWriteRepository.ts`**

```ts
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

export interface SupplierWriteRepository {
  findByIdentity(name: string, type: 'Store' | 'Facility', locationId: number): Promise<ExistingSupplier | null>;
  locationExists(locationId: number): Promise<boolean>;
  /** Returns the ids from the input that do not exist. */
  findMissingCategoryIds(categoryIds: number[]): Promise<number[]>;
  /** One transaction: supplier, category map, hours and photos. Duplicate race → AppError 422. */
  insertSupplier(input: NewSupplier): Promise<number>;
  /**
   * One transaction (Arch §6.2): reverses the soft delete, sets is_active true, replaces desc,
   * categories, hours and photo rows with the submitted ones, sets updated_on and increments
   * version. Returns the replaced photo locations so the cloud objects can be cleaned up later.
   */
  reactivateSupplier(supplierId: number, input: NewSupplier): Promise<{ replacedPhotoLocations: string[] }>;
}
```

- [ ] **Step 2: Failing repository tests — `src/persistence/mysqlSupplierWriteRepository.test.ts`**

```ts
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlSupplierWriteRepository } from './mysqlSupplierWriteRepository.js';
import type { NewSupplier } from './supplierWriteRepository.js';

const input: NewSupplier = {
  name: 'Campus Store',
  type: 'Store',
  desc: 'desc',
  locationId: 4,
  categoryIds: [2, 3],
  hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }],
  photoLocations: ['loc-a', 'loc-b'],
  createdBy: 'u-1',
  now: '2026-09-29 10:00:00',
};

function fakePool(steps: Array<unknown | Error>) {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(),
  };
  for (const step of steps) {
    if (step instanceof Error) conn.query.mockRejectedValueOnce(step);
    else conn.query.mockResolvedValueOnce([step, []]);
  }
  const pool = { getConnection: vi.fn().mockResolvedValue(conn), query: vi.fn() };
  return { pool: pool as unknown as Pool, conn, poolQuery: pool.query };
}

const sqls = (conn: { query: { mock: { calls: unknown[][] } } }) =>
  conn.query.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' ').trim());

describe('insertSupplier', () => {
  it('inserts supplier, categories, hours and 0-based photos in one transaction', async () => {
    const { pool, conn } = fakePool([{ insertId: 11 }, {}, {}, {}]);
    const id = await createMysqlSupplierWriteRepository(pool).insertSupplier(input);

    expect(id).toBe(11);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['Campus Store', 'Store', 'desc', 4, '2026-09-29 10:00:00', 'u-1', '2026-09-29 10:00:00']);
    expect(conn.query.mock.calls[1]?.[1]).toEqual([[[11, 2], [11, 3]]]);
    expect(conn.query.mock.calls[2]?.[1]).toEqual([[[11, 1, '09:00', '18:00', 0]]]);
    expect(conn.query.mock.calls[3]?.[1]).toEqual([[[11, 'loc-a', 0], [11, 'loc-b', 1]]]);
  });

  it('skips empty child inserts', async () => {
    const { pool, conn } = fakePool([{ insertId: 5 }, {}]);
    await createMysqlSupplierWriteRepository(pool).insertSupplier({ ...input, categoryIds: [], photoLocations: [] });
    expect(sqls(conn)).toHaveLength(2); // supplier + hours
  });

  it('rolls back and maps a duplicate-key race to 422', async () => {
    const dup = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    const { pool, conn } = fakePool([dup]);

    await expect(createMysqlSupplierWriteRepository(pool).insertSupplier(input)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('rolls back on any other failure and rethrows it', async () => {
    const { pool, conn } = fakePool([{ insertId: 5 }, new Error('boom')]);
    await expect(createMysqlSupplierWriteRepository(pool).insertSupplier(input)).rejects.toThrow('boom');
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe('reactivateSupplier', () => {
  it('locks the row, clears the soft delete, bumps version and replaces children', async () => {
    const { pool, conn } = fakePool([
      [{ is_deleted: 1 }], // SELECT ... FOR UPDATE
      [{ photo_location: 'old-1' }, { photo_location: 'old-2' }], // old photos
      {}, // UPDATE supplier
      {}, {}, {}, // DELETE map, hours, photos
      {}, {}, {}, // INSERT map, hours, photos
    ]);

    const result = await createMysqlSupplierWriteRepository(pool).reactivateSupplier(11, input);

    expect(result).toEqual({ replacedPhotoLocations: ['old-1', 'old-2'] });
    const statements = sqls(conn);
    expect(statements[0]).toContain('FOR UPDATE');
    expect(statements[2]).toContain('is_active = TRUE');
    expect(statements[2]).toContain('is_deleted = FALSE');
    expect(statements[2]).toContain('version = version + 1');
    expect(conn.query.mock.calls[2]?.[1]).toEqual(['desc', '2026-09-29 10:00:00', 11]);
    expect(statements.slice(3, 6).every((s) => s.startsWith('DELETE FROM'))).toBe(true);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('rejects with 422 when the supplier is no longer soft-deleted', async () => {
    const { pool, conn } = fakePool([[{ is_deleted: 0 }]]);
    await expect(createMysqlSupplierWriteRepository(pool).reactivateSupplier(11, input)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(conn.rollback).toHaveBeenCalled();
  });
});

describe('lookups', () => {
  it('findByIdentity maps the row', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery.mockResolvedValueOnce([[{ supplier_id: 3, is_deleted: 1 }], []]);
    expect(await createMysqlSupplierWriteRepository(pool).findByIdentity('A', 'Store', 4)).toEqual({
      supplierId: 3,
      isDeleted: true,
    });
  });

  it('findMissingCategoryIds returns only the ids that were not found', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery.mockResolvedValueOnce([[{ category_id: 2 }], []]);
    expect(await createMysqlSupplierWriteRepository(pool).findMissingCategoryIds([2, 9])).toEqual([9]);
  });

  it('locationExists is true only when a row is found', async () => {
    const { pool, poolQuery } = fakePool([]);
    poolQuery.mockResolvedValueOnce([[{ location_id: 4 }], []]).mockResolvedValueOnce([[], []]);
    const repo = createMysqlSupplierWriteRepository(pool);
    expect(await repo.locationExists(4)).toBe(true);
    expect(await repo.locationExists(5)).toBe(false);
  });
});
```

Run — expect FAIL (module missing). `npx vitest run src/persistence/mysqlSupplierWriteRepository.test.ts`

- [ ] **Step 3: Implement — `src/persistence/mysqlSupplierWriteRepository.ts`**

```ts
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppError } from '../utils/AppError.js';
import type { NewSupplier, SupplierWriteRepository } from './supplierWriteRepository.js';

function duplicate(): AppError {
  const message = 'A supplier with the same name, type and location already exists.';
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field: 'name', location: 'body', message }],
  });
}

export function createMysqlSupplierWriteRepository(pool: Pool): SupplierWriteRepository {
  async function inTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async function insertChildren(conn: PoolConnection, supplierId: number, input: NewSupplier): Promise<void> {
    if (input.categoryIds.length > 0) {
      await conn.query('INSERT INTO supplier_category_map (supplier_id, category_id) VALUES ?', [
        input.categoryIds.map((categoryId) => [supplierId, categoryId]),
      ]);
    }
    if (input.hours.length > 0) {
      await conn.query(
        'INSERT INTO supplier_hours (supplier_id, day_of_week, open_time, close_time, is_24h) VALUES ?',
        [input.hours.map((hour) => [supplierId, hour.day, hour.open, hour.close, hour.is24h ? 1 : 0])],
      );
    }
    if (input.photoLocations.length > 0) {
      await conn.query('INSERT INTO supplier_photos (supplier_id, photo_location, display_order) VALUES ?', [
        input.photoLocations.map((location, index) => [supplierId, location, index]),
      ]);
    }
  }

  return {
    async findByIdentity(name, type, locationId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT supplier_id, is_deleted FROM supplier
         WHERE supplier_name = ? AND supplier_type = ? AND location_id = ?`,
        [name, type, locationId],
      );
      const row = rows[0];
      return row === undefined ? null : { supplierId: Number(row.supplier_id), isDeleted: Boolean(row.is_deleted) };
    },

    async locationExists(locationId) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT location_id FROM supplier_locations WHERE location_id = ?',
        [locationId],
      );
      return rows.length > 0;
    },

    async findMissingCategoryIds(categoryIds) {
      if (categoryIds.length === 0) return [];
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT category_id FROM supplier_categories WHERE category_id IN (?)',
        [categoryIds],
      );
      const found = new Set(rows.map((row) => Number(row.category_id)));
      return categoryIds.filter((id) => !found.has(id));
    },

    async insertSupplier(input) {
      try {
        return await inTransaction(async (conn) => {
          const [result] = await conn.query<ResultSetHeader>(
            `INSERT INTO supplier
               (supplier_name, supplier_type, supplier_desc, location_id, created_on, created_by, updated_on)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [input.name, input.type, input.desc, input.locationId, input.now, input.createdBy, input.now],
          );
          const supplierId = Number(result.insertId);
          await insertChildren(conn, supplierId, input);
          return supplierId;
        });
      } catch (error) {
        if ((error as { code?: string } | null)?.code === 'ER_DUP_ENTRY') throw duplicate();
        throw error;
      }
    },

    async reactivateSupplier(supplierId, input) {
      return inTransaction(async (conn) => {
        const [current] = await conn.query<RowDataPacket[]>(
          'SELECT is_deleted FROM supplier WHERE supplier_id = ? FOR UPDATE',
          [supplierId],
        );
        if (current[0] === undefined || !current[0].is_deleted) {
          throw duplicate();
        }

        const [oldPhotos] = await conn.query<RowDataPacket[]>(
          'SELECT photo_location FROM supplier_photos WHERE supplier_id = ? ORDER BY display_order',
          [supplierId],
        );

        await conn.query(
          `UPDATE supplier
           SET supplier_desc = ?, is_active = TRUE, is_deleted = FALSE, updated_on = ?, version = version + 1
           WHERE supplier_id = ?`,
          [input.desc, input.now, supplierId],
        );
        await conn.query('DELETE FROM supplier_category_map WHERE supplier_id = ?', [supplierId]);
        await conn.query('DELETE FROM supplier_hours WHERE supplier_id = ?', [supplierId]);
        await conn.query('DELETE FROM supplier_photos WHERE supplier_id = ?', [supplierId]);
        await insertChildren(conn, supplierId, input);

        return { replacedPhotoLocations: oldPhotos.map((row) => String(row.photo_location)) };
      });
    },
  };
}
```

Run — expect PASS. `npx vitest run src/persistence/mysqlSupplierWriteRepository.test.ts`

- [ ] **Step 4: Failing service tests — `src/business/supplierCreationService.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import { createInMemoryPhotoStorage } from '../storage/inMemoryPhotoStorage.js';
import { AppError } from '../utils/AppError.js';
import type { CreateSupplierInput } from '../validation/supplierInput.js';
import { createSupplierCreationService } from './supplierCreationService.js';

const NOW = new Date('2026-09-29T02:00:00Z');
const input: CreateSupplierInput = {
  name: 'Campus Store',
  type: 'Store',
  desc: null,
  locationId: 4,
  categoryIds: [2],
  hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }],
};
const png = { buffer: Buffer.from('p'), mimeType: 'image/png' as const };
const jpg = { buffer: Buffer.from('j'), mimeType: 'image/jpeg' as const };
const actor = { userId: 'u-1' };

function setup(overrides: Partial<SupplierWriteRepository> = {}) {
  const repo: SupplierWriteRepository = {
    findByIdentity: vi.fn().mockResolvedValue(null),
    locationExists: vi.fn().mockResolvedValue(true),
    findMissingCategoryIds: vi.fn().mockResolvedValue([]),
    insertSupplier: vi.fn().mockResolvedValue(101),
    reactivateSupplier: vi.fn().mockResolvedValue({ replacedPhotoLocations: [] }),
    ...overrides,
  };
  const storage = createInMemoryPhotoStorage();
  const reader = { getAdminSupplier: vi.fn().mockResolvedValue({ id: 101, version: 0 }) };
  const service = createSupplierCreationService({ repo, storage, reader, clock: () => NOW });
  return { repo, storage, reader, service };
}

describe('create', () => {
  it('uploads photos in order, inserts, and returns 201 with the admin detail', async () => {
    const { service, repo, storage, reader } = setup();
    const result = await service.createSupplier(input, [png, jpg], actor);

    expect(result).toEqual({ statusCode: 201, body: { id: 101, version: 0 } });
    expect(repo.insertSupplier).toHaveBeenCalledWith({
      ...input,
      photoLocations: ['memory://photos/1', 'memory://photos/2'],
      createdBy: 'u-1',
      now: '2026-09-29 10:00:00',
    });
    expect(storage.objects.size).toBe(2);
    expect(reader.getAdminSupplier).toHaveBeenCalledWith(101);
  });

  it('creates with no photos', async () => {
    const { service, repo } = setup();
    await service.createSupplier(input, [], actor);
    expect(repo.insertSupplier).toHaveBeenCalledWith(expect.objectContaining({ photoLocations: [] }));
  });

  it('rejects an unknown location with 422 before uploading anything', async () => {
    const { service, storage } = setup({ locationExists: vi.fn().mockResolvedValue(false) });
    await expect(service.createSupplier(input, [png], actor)).rejects.toMatchObject({ statusCode: 422 });
    expect(storage.objects.size).toBe(0);
  });

  it('rejects unknown categories with 422', async () => {
    const { service } = setup({ findMissingCategoryIds: vi.fn().mockResolvedValue([9]) });
    await expect(service.createSupplier(input, [], actor)).rejects.toMatchObject({ statusCode: 422 });
  });

  it('rejects a duplicate of an active supplier with 422 and uploads nothing', async () => {
    const { service, storage, repo } = setup({
      findByIdentity: vi.fn().mockResolvedValue({ supplierId: 7, isDeleted: false }),
    });
    await expect(service.createSupplier(input, [png], actor)).rejects.toMatchObject({ statusCode: 422 });
    expect(storage.objects.size).toBe(0);
    expect(repo.insertSupplier).not.toHaveBeenCalled();
  });
});

describe('reactivation', () => {
  it('reactivates a soft-deleted match, returns 200, and keeps its supplier_id', async () => {
    const { service, repo, reader } = setup({
      findByIdentity: vi.fn().mockResolvedValue({ supplierId: 7, isDeleted: true }),
    });
    const result = await service.createSupplier(input, [png], actor);

    expect(result.statusCode).toBe(200);
    expect(repo.insertSupplier).not.toHaveBeenCalled();
    expect(repo.reactivateSupplier).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ photoLocations: ['memory://photos/1'], now: '2026-09-29 10:00:00' }),
    );
    expect(reader.getAdminSupplier).toHaveBeenCalledWith(7);
  });
});

describe('failure handling (Arch §8.2 steps 2 and 4)', () => {
  it('returns 500 and removes earlier uploads when a later upload fails', async () => {
    const { service, storage, repo } = setup();
    const upload = storage.upload.bind(storage);
    let calls = 0;
    storage.upload = async (file) => {
      calls += 1;
      if (calls === 2) throw new Error('storage down');
      return upload(file);
    };

    await expect(service.createSupplier(input, [png, jpg], actor)).rejects.toMatchObject({ statusCode: 500 });
    expect(storage.objects.size).toBe(0);
    expect(repo.insertSupplier).not.toHaveBeenCalled();
  });

  it('removes uploaded photos and returns 500 when the transaction fails', async () => {
    const { service, storage } = setup({ insertSupplier: vi.fn().mockRejectedValue(new Error('db down')) });
    await expect(service.createSupplier(input, [png], actor)).rejects.toMatchObject({ statusCode: 500 });
    expect(storage.objects.size).toBe(0);
  });

  it('removes uploaded photos and keeps the 422 when the DB reports a duplicate race', async () => {
    const race = new AppError(422, 'Unprocessable Entity', 'duplicate');
    const { service, storage } = setup({ insertSupplier: vi.fn().mockRejectedValue(race) });
    await expect(service.createSupplier(input, [png], actor)).rejects.toBe(race);
    expect(storage.objects.size).toBe(0);
  });
});
```

Run — expect FAIL. Implement `src/business/supplierCreationService.ts`:

```ts
import type { NewSupplier, SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import type { PhotoFile, PhotoStorage } from '../storage/photoStorage.js';
import { AppError } from '../utils/AppError.js';
import { sgtDatetime } from '../utils/time.js';
import type { CreateSupplierInput } from '../validation/supplierInput.js';

export interface CreationResult {
  statusCode: 200 | 201;
  body: unknown;
}

interface Dependencies {
  repo: SupplierWriteRepository;
  storage: PhotoStorage;
  reader: { getAdminSupplier(supplierId: number): Promise<unknown> };
  clock?: () => Date;
}

function invalid(field: string, message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, { details: [{ field, location: 'body', message }] });
}

export function createSupplierCreationService({ repo, storage, reader, clock = () => new Date() }: Dependencies) {
  async function removeUploaded(locations: string[]): Promise<void> {
    // Best effort: a failed cleanup must not mask the original error.
    await Promise.allSettled(locations.map((location) => storage.delete(location)));
  }

  return {
    async createSupplier(
      input: CreateSupplierInput,
      photos: PhotoFile[],
      actor: { userId: string },
    ): Promise<CreationResult> {
      if (!(await repo.locationExists(input.locationId))) {
        throw invalid('location_id', 'The selected location does not exist.');
      }
      const missing = await repo.findMissingCategoryIds(input.categoryIds);
      if (missing.length > 0) {
        throw invalid('category_id', `Unknown category id(s): ${missing.join(', ')}.`);
      }

      const existing = await repo.findByIdentity(input.name, input.type, input.locationId);
      if (existing !== null && !existing.isDeleted) {
        throw invalid('name', 'A supplier with the same name, type and location already exists.');
      }

      // Step 2: upload first; a failure aborts the save (Arch §8.2).
      const uploaded: string[] = [];
      try {
        for (const photo of photos) {
          uploaded.push(await storage.upload(photo));
        }
      } catch {
        await removeUploaded(uploaded);
        throw new AppError(500, 'Internal Server Error', 'Photo upload failed.');
      }

      const record: NewSupplier = {
        ...input,
        photoLocations: uploaded,
        createdBy: actor.userId,
        now: sgtDatetime(clock()),
      };

      // Steps 3-4: one transaction; on failure remove the new cloud objects.
      let supplierId: number;
      try {
        if (existing === null) {
          supplierId = await repo.insertSupplier(record);
        } else {
          await repo.reactivateSupplier(existing.supplierId, record);
          supplierId = existing.supplierId;
        }
      } catch (error) {
        await removeUploaded(uploaded);
        if (error instanceof AppError) throw error;
        throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');
      }

      return { statusCode: existing === null ? 201 : 200, body: await reader.getAdminSupplier(supplierId) };
    },
  };
}

export type SupplierCreationService = ReturnType<typeof createSupplierCreationService>;
```

Run — expect PASS. `npx vitest run src/business/supplierCreationService.test.ts`

- [ ] **Step 5: MinIO-backed test of the upload/cleanup path — `src/business/supplierCreation.minio.test.ts`**

This exercises the real cloud-connection logic (Arch §8.2 steps 2 and 4) that the in-memory double only simulates.

```ts
import { describe, expect, it, vi } from 'vitest';
import type { SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import { createMinioTestStorage } from '../storage/minioTestStorage.js';
import type { CreateSupplierInput } from '../validation/supplierInput.js';
import { createSupplierCreationService } from './supplierCreationService.js';

const input: CreateSupplierInput = {
  name: 'Minio Facility',
  type: 'Facility',
  desc: null,
  locationId: 1,
  categoryIds: [],
  hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }],
};
const photos = [
  { buffer: Buffer.from('one'), mimeType: 'image/png' as const },
  { buffer: Buffer.from('two'), mimeType: 'image/jpeg' as const },
];

function repo(overrides: Partial<SupplierWriteRepository> = {}): SupplierWriteRepository {
  return {
    findByIdentity: vi.fn().mockResolvedValue(null),
    locationExists: vi.fn().mockResolvedValue(true),
    findMissingCategoryIds: vi.fn().mockResolvedValue([]),
    insertSupplier: vi.fn().mockResolvedValue(1),
    reactivateSupplier: vi.fn().mockResolvedValue({ replacedPhotoLocations: [] }),
    ...overrides,
  };
}

describe('creation workflow against the local MinIO', () => {
  it('stores each photo, hands the returned locations to the repository in order, and keeps them', async () => {
    const write = repo();
    const service = createSupplierCreationService({
      repo: write,
      storage: createMinioTestStorage(),
      reader: { getAdminSupplier: vi.fn().mockResolvedValue({ id: 1 }) },
    });
    await service.createSupplier(input, photos, { userId: 'u-1' });

    const record = vi.mocked(write.insertSupplier).mock.calls[0]?.[0];
    const locations = record?.photoLocations ?? [];
    expect(locations).toHaveLength(2);
    try {
      expect(await (await fetch(locations[0] ?? '')).text()).toBe('one');
      expect(await (await fetch(locations[1] ?? '')).text()).toBe('two');
    } finally {
      const storage = createMinioTestStorage();
      await Promise.all(locations.map((location) => storage.delete(location)));
    }
  });

  it('removes the uploaded objects from MinIO when the database transaction fails', async () => {
    const write = repo({ insertSupplier: vi.fn().mockRejectedValue(new Error('db down')) });
    const service = createSupplierCreationService({
      repo: write,
      storage: createMinioTestStorage(),
      reader: { getAdminSupplier: vi.fn() },
    });

    await expect(service.createSupplier(input, photos, { userId: 'u-1' })).rejects.toMatchObject({ statusCode: 500 });

    // insertSupplier rejected, so recover the locations from the call it received.
    const locations = vi.mocked(write.insertSupplier).mock.calls[0]?.[0].photoLocations ?? [];
    expect(locations).toHaveLength(2);
    for (const location of locations) {
      expect((await fetch(location)).status).toBe(404);
    }
  });
});
```

Run: `npm run test:minio` — Expected: PASS (both files, eight tests) with the photo store running.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`

```bash
git add src
git commit -m "feat(supplier-service): add supplier create and reactivate workflow"
```

---

### Task 8: HTTP layer — multipart upload, create endpoint, wiring

**Files:** Create `src/middleware/uploadPhotos.ts`, `src/middleware/uploadPhotos.test.ts`. Modify `src/controllers/adminSupplier.controller.ts`, `src/routes/adminSupplier.routes.ts`, `src/routes/adminSupplier.routes.test.ts`, `src/app.ts`, `src/app.integration.test.ts`.

- [ ] **Step 1: Failing tests — `src/middleware/uploadPhotos.test.ts`**

```ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { uploadPhotos } from './uploadPhotos.js';

const app = express();
app.post('/x', uploadPhotos, (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  res.json({ fields: req.body, names: files.map((f) => f.originalname), types: files.map((f) => f.mimetype) });
});
app.use(errorHandler);

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe('uploadPhotos', () => {
  it('parses text fields and keeps photos in request order', async () => {
    const res = await request(app)
      .post('/x')
      .field('name', 'Campus Store')
      .attach('photos', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos[]', png, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.fields.name).toBe('Campus Store');
    expect(res.body.names).toEqual(['a.png', 'b.jpg']);
  });

  it('rejects a non JPEG/PNG file with 422', async () => {
    const res = await request(app).post('/x').attach('photos', png, { filename: 'a.gif', contentType: 'image/gif' });
    expect(res.status).toBe(422);
    expect(res.body.details[0].field).toBe('photos');
  });

  it('rejects a photo over 5 MB with 422', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await request(app).post('/x').attach('photos', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
  });

  it('rejects more than 10 photos with 422', async () => {
    let req = request(app).post('/x');
    for (let i = 0; i < 11; i += 1) {
      req = req.attach('photos', png, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    expect((await req).status).toBe(422);
  });

  it('accepts exactly 10 photos', async () => {
    let req = request(app).post('/x');
    for (let i = 0; i < 10; i += 1) {
      req = req.attach('photos', png, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    expect((await req).status).toBe(200);
  });

  it('answers 400 for a malformed multipart body', async () => {
    const res = await request(app)
      .post('/x')
      .set('Content-Type', 'multipart/form-data; boundary=abc')
      .send('--abc\r\nContent-Disposition: form-data; name="a"\r\n\r\nbroken');
    expect(res.status).toBe(400);
  });
});
```

Run — expect FAIL. Implement `src/middleware/uploadPhotos.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 10;
const ALLOWED_FIELDS = ['photos', 'photos[]'];
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

function invalidPhotos(message: string): AppError {
  return new AppError(422, 'Unprocessable Entity', message, {
    details: [{ field: 'photos', location: 'body', message }],
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_FIELDS.includes(file.fieldname)) {
      cb(invalidPhotos('Photos must be sent in the photos field.'));
      return;
    }
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(invalidPhotos('Photos must be JPEG or PNG.'));
      return;
    }
    cb(null, true);
  },
}).any();

/** Parses multipart/form-data with multer (Arch §7, §8.2): 0-10 JPEG/PNG photos, at most 5 MB each. */
export function uploadPhotos(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error === undefined || error === null) {
      next();
      return;
    }
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Each photo must be at most 5 MB.'
          : error.code === 'LIMIT_FILE_COUNT'
            ? 'At most 10 photos are allowed.'
            : 'Photos could not be accepted.';
      next(invalidPhotos(message));
      return;
    }
    next(new AppError(400, 'Bad Request', 'The multipart/form-data request is malformed.'));
  });
}
```

Run — expect PASS. `npx vitest run src/middleware/uploadPhotos.test.ts`

- [ ] **Step 2: Extend the controller — `src/controllers/adminSupplier.controller.ts`**

Change the factory signature and add `create`:

```ts
import type { SupplierCreationService } from '../business/supplierCreationService.js';
import type { SupplierService } from '../business/supplierService.js';
import type { IdempotencyStore } from '../idempotency/idempotencyStore.js';
import type { PhotoFile } from '../storage/photoStorage.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseCreateSupplier } from '../validation/supplierInput.js';
import { idParamSchema, listQuerySchema, parseOrThrow } from '../validation/supplierQuery.js';

export interface AdminSupplierDependencies {
  reader: SupplierService;
  creation: SupplierCreationService;
  idempotency: IdempotencyStore;
}

export function createAdminSupplierController({ reader, creation, idempotency }: AdminSupplierDependencies) {
  return {
    // list and detail: unchanged from Task 3

    create: asyncHandler(async (req, res) => {
      const userId = req.user?.user_id ?? '';
      const key = req.header('Idempotency-Key') ?? '';

      const state = await idempotency.begin(userId, key);
      if (state === 'in_flight') {
        throw new AppError(409, 'Conflict', 'A request with this Idempotency-Key is still being processed.');
      }
      if (state !== 'started') {
        res.status(state.statusCode).json(state.body); // replay of a completed request
        return;
      }

      try {
        const input = parseCreateSupplier((req.body ?? {}) as Record<string, unknown>);
        const files = ((req.files as Express.Multer.File[] | undefined) ?? []).map(
          (file): PhotoFile => ({ buffer: file.buffer, mimeType: file.mimetype as PhotoFile['mimeType'] }),
        );
        const result = await creation.createSupplier(input, files, { userId });
        await idempotency.complete(userId, key, result);
        res.status(result.statusCode).json(result.body);
      } catch (error) {
        await idempotency.abandon(userId, key);
        throw error;
      }
    }),
  };
}
```

(Keep the `list` and `detail` handlers from Task 3 exactly as written, inside the same returned object.)

- [ ] **Step 3: Extend the router — `src/routes/adminSupplier.routes.ts`**

```ts
import { Router } from 'express';
import {
  type AdminSupplierDependencies,
  createAdminSupplierController,
} from '../controllers/adminSupplier.controller.js';
import { requireIdempotencyKey } from '../middleware/requireIdempotencyKey.js';
import { requireRole } from '../middleware/requireRole.js';
import { uploadPhotos } from '../middleware/uploadPhotos.js';

export function createAdminSupplierRouter(dependencies: AdminSupplierDependencies): Router {
  const controller = createAdminSupplierController(dependencies);
  const router = Router();

  router.use(requireRole('admin', 'super admin'));
  router.get('/', controller.list);
  router.get('/:id', controller.detail);
  // Header check first so an invalid request is rejected before the body is buffered.
  router.post('/', requireIdempotencyKey, uploadPhotos, controller.create);

  return router;
}
```

- [ ] **Step 4: Update `adminSupplier.routes.test.ts`** — change `buildApp` to the new dependency shape and add the create tests

Replace `buildApp` with:

```ts
import type { SupplierCreationService } from '../business/supplierCreationService.js';
import type { BeginResult, IdempotencyStore } from '../idempotency/idempotencyStore.js';

function buildApp(overrides: Record<string, unknown> = {}, begin: BeginResult = 'started') {
  const reader = {
    listAdminSuppliers: vi.fn().mockResolvedValue({
      metadata: { totalRecords: 0, currPage: 1, limit: 50, totalPages: 0 },
      data: [],
    }),
    getAdminSupplier: vi.fn().mockResolvedValue({ id: 101, version: 2 }),
    ...overrides,
  };
  const creation = {
    createSupplier: vi.fn().mockResolvedValue({ statusCode: 201, body: { id: 101, photos: [] } }),
  };
  const idempotency = {
    begin: vi.fn().mockResolvedValue(begin),
    complete: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
  };
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'];
    if (typeof role === 'string') req.user = { user_id: 'u-1', role };
    next();
  });
  app.use(
    '/api/v1/admin/suppliers',
    createAdminSupplierRouter({
      reader: reader as unknown as SupplierService,
      creation: creation as unknown as SupplierCreationService,
      idempotency: idempotency as unknown as IdempotencyStore,
    }),
  );
  app.use(errorHandler);
  return { app, service: reader, creation, idempotency };
}
```

(The Task 3 tests keep using `service` as before.) Append:

```ts
const KEY = '9b2f5a80-4c1e-4f70-9d7e-2f3a1c6b8e11';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const post = (app: express.Express, role = 'admin') =>
  request(app)
    .post('/api/v1/admin/suppliers')
    .set('x-test-role', role)
    .set('Idempotency-Key', KEY)
    .field('name', 'Campus Store')
    .field('type', 'Facility')
    .field('location_id', '4');

describe('POST create', () => {
  it('creates, passes the parsed input and photos in order, and caches the response', async () => {
    const { app, creation, idempotency } = buildApp();
    const res = await post(app)
      .attach('photos', png, { filename: 'a.png', contentType: 'image/png' })
      .attach('photos', png, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(idempotency.begin).toHaveBeenCalledWith('u-1', KEY);
    const [input, files, actor] = creation.createSupplier.mock.calls[0] as [{ name: string; type: string }, Array<{ mimeType: string }>, { userId: string }];
    expect(input).toMatchObject({ name: 'Campus Store', type: 'Facility', locationId: 4 });
    expect(files.map((f) => f.mimeType)).toEqual(['image/png', 'image/jpeg']);
    expect(actor).toEqual({ userId: 'u-1' });
    expect(idempotency.complete).toHaveBeenCalledWith('u-1', KEY, { statusCode: 201, body: { id: 101, photos: [] } });
  });

  it('returns the reactivation status from the service', async () => {
    const { app, creation } = buildApp();
    creation.createSupplier.mockResolvedValueOnce({ statusCode: 200, body: { id: 7 } });
    expect((await post(app)).status).toBe(200);
  });

  it('returns 400 without an Idempotency-Key and never calls the service', async () => {
    const { app, creation } = buildApp();
    const res = await request(app).post('/api/v1/admin/suppliers').set('x-test-role', 'admin').field('name', 'X');
    expect(res.status).toBe(400);
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });

  it('returns 409 for a replay while the first request is in flight', async () => {
    const { app, creation } = buildApp({}, 'in_flight');
    const res = await post(app);
    expect(res.status).toBe(409);
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });

  it('replays the cached response without calling the service again', async () => {
    const { app, creation } = buildApp({}, { statusCode: 201, body: { id: 55 } });
    const res = await post(app);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 55 });
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });

  it('abandons the key when validation fails so the client can retry', async () => {
    const { app, idempotency } = buildApp();
    const res = await request(app)
      .post('/api/v1/admin/suppliers')
      .set('x-test-role', 'admin')
      .set('Idempotency-Key', KEY)
      .field('type', 'Store');
    expect(res.status).toBe(422);
    expect(idempotency.abandon).toHaveBeenCalledWith('u-1', KEY);
    expect(idempotency.complete).not.toHaveBeenCalled();
  });

  it('rejects the user role with 403 and touches neither the store nor the service', async () => {
    const { app, creation, idempotency } = buildApp();
    const res = await post(app, 'user');
    expect(res.status).toBe(403);
    expect(idempotency.begin).not.toHaveBeenCalled();
    expect(creation.createSupplier).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/routes/adminSupplier.routes.test.ts` — expect PASS.

- [ ] **Step 5: Wire everything — `src/app.ts`**

Add imports:

```ts
import { createSupplierCreationService } from './business/supplierCreationService.js';
import { createRedisIdempotencyStore } from './idempotency/idempotencyStore.js';
import { createMysqlSupplierWriteRepository } from './persistence/mysqlSupplierWriteRepository.js';
import redis from './redis/client.js';
import { createConfiguredPhotoStorage } from './storage/s3PhotoStorage.js';
```

Replace the admin mount and its comment with:

```ts
const supplierCreation = createSupplierCreationService({
  repo: createMysqlSupplierWriteRepository(pool),
  storage: createConfiguredPhotoStorage(config.photoStore),
  reader: supplierService,
});
apiV1.use(
  '/admin/suppliers',
  createAdminSupplierRouter({
    reader: supplierService,
    creation: supplierCreation,
    idempotency: createRedisIdempotencyStore(redis),
  }),
);
```

Update the header scope of `src/app.ts` (append a dated pair mentioning the Phase 2 mounts).

- [ ] **Step 6: Integration tests — append to `src/app.integration.test.ts`** (these need no MySQL/Redis/MinIO; each is rejected before any I/O)

```ts
describe('Phase 2 routes', () => {
  const asRole = (role: string) =>
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ user_id: 'u-1', role }), { status: 200 }));

  it('rejects unauthenticated admin requests with 401', async () => {
    expect((await request(app).get('/api/v1/admin/suppliers')).status).toBe(401);
    expect((await request(app).post('/api/v1/admin/suppliers')).status).toBe(401);
    expect((await request(app).delete('/api/v1/admin/reference/faculties/1')).status).toBe(401);
  });

  it('rejects the user role with 403 on every Phase 2 route', async () => {
    asRole('user');
    const auth = { Authorization: 'Bearer t' };
    expect((await request(app).get('/api/v1/admin/suppliers').set(auth)).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/suppliers/1').set(auth)).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/suppliers').set(auth)).status).toBe(403);
    expect((await request(app).post('/api/v1/admin/reference/faculties').set(auth).send({ faculty: 'X' })).status).toBe(403);
    expect((await request(app).put('/api/v1/admin/reference/locations/1').set(auth).send({ level: 1 })).status).toBe(403);
    expect((await request(app).delete('/api/v1/admin/reference/categories/1').set(auth)).status).toBe(403);
  });

  it('returns 400 for an admin create without an Idempotency-Key', async () => {
    asRole('admin');
    const res = await request(app).post('/api/v1/admin/suppliers').set('Authorization', 'Bearer t');
    expect(res.status).toBe(400);
  });

  it('returns 422 for an admin list with a bad limit', async () => {
    asRole('super admin');
    const res = await request(app).get('/api/v1/admin/suppliers?limit=10').set('Authorization', 'Bearer t');
    expect(res.status).toBe(422);
  });
});
```

Run: `npx vitest run` — Expected: everything passes.

- [ ] **Step 7: Verify and commit** (run `npm run test:minio` too if the photo store is up)

Run: `npx tsc --noEmit && npx vitest run && npm run lint`

```bash
git add src
git commit -m "feat(supplier-service): add admin supplier create endpoint with multipart photos"
```

---

### Task 9: Manual verification against real MySQL, Redis and MinIO

No code. Report the true result in the log (never claim it passed if it was not run).

- [ ] **Step 1: Start dependencies and migrate**

```bash
docker compose -f compose.photo-store.yaml up -d
npm run migrate:phase2      # upgrades an existing database (safe to re-run)
npm run dev
```

(The main stack's `supplier-db` and `supplier-redis` must be running; set the `PHOTO_STORE_*` variables from `.env.example` in the service's environment.)

- [ ] **Step 2: Mint an admin token from the User Service, then run each call and check the status**

```bash
TOKEN=<admin access token>
API=http://localhost:3004/api/v1
curl -s -H "Authorization: Bearer $TOKEN" "$API/admin/suppliers"                                   # 200, includes isActive/isDeleted
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"faculty":"Test Faculty"}' "$API/admin/reference/faculties"                                   # 201
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$API/admin/reference/faculties/<id>"          # 200, then 404 on repeat
KEY=$(uuidgen)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" \
  -F name='Manual Facility' -F type=Facility -F location_id=1 -F 'photos=@a.png;type=image/png' "$API/admin/suppliers"   # 201, photo location on MinIO
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $KEY" \
  -F name='Manual Facility' -F type=Facility -F location_id=1 "$API/admin/suppliers"                # same cached 201, no new row
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: $(uuidgen)" \
  -F name='Manual Facility' -F type=Facility -F location_id=1 "$API/admin/suppliers"                # 422 duplicate
```

- [ ] **Step 3: Reactivation** — soft-delete the row directly (`UPDATE supplier SET is_deleted = TRUE WHERE supplier_name = 'Manual Facility'`), repeat the create with a new key and one photo; expect `200`, `isActive` true, `version` incremented, one photo row, and the previous MinIO object still present (Phase 4 cleans it up). Confirm a request with the `user` token gets `403` on every admin route.

---

### Task 10: Docs, disclosure and logging

**Files:** Modify `README.md` (supplier-service), `ai/usage-log.md`, root `README.md`, `SupplierServiceSpec.md`.

- [ ] **Step 1:** In `supplier-service/README.md` add an "API (Phase 2 — admin mode)" section listing: `GET /api/v1/admin/suppliers`, `GET /api/v1/admin/suppliers/:id`, the nine `/api/v1/admin/reference/{faculties,locations,categories}` routes, and `POST /api/v1/admin/suppliers` (multipart, `Idempotency-Key` header required), plus the `npm run migrate:phase2` note and the `PHOTO_STORE_*` variables. Append a dated `Scope`/`Author review` pair to its header.
- [ ] **Step 2:** Confirm every created or edited source file has its header (`grep -L "AI Assistance Disclosure" $(git diff --name-only main -- 'src/**/*.ts')` should list nothing; `package.json`/lockfile are listed in the log instead).
- [ ] **Step 3:** Append one entry to `ai/usage-log.md` in the §5.2 format (verbatim prompts, files list including `package.json`/`package-lock.json`, the verification results from Tasks 8–9, and the "Choices this plan makes" list as questions raised) and add one row to the root `README.md` "Log index" table.
- [ ] **Step 4:** Note the deferred items in the spec's Phase 2 section: cloud-object cleanup for the photos replaced on reactivation (Phase 4 worker), and the lookup-create `201` status.
- [ ] **Step 5: Final verification and commit**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`

```bash
git add -A
git commit -m "docs(supplier-service): document Phase 2 endpoints and log the implementation"
```

Remind the team which log entries and file headers still need author review and signature.

---

## Self-review

**Spec coverage** (`SupplierServiceSpec.md` Phase 2): admin list/detail → Task 3; F8.1.1 (all suppliers incl. inactive/soft-deleted) → `findAdminPage` without visibility; F8.1.2 (filters) → Task 3 route test; lookup management incl. hard-delete-if-unreferenced, `200`/`404`/`422` → Task 4; multipart create with 0–10 JPEG/PNG ≤5 MB → Task 8 `uploadPhotos`; `Idempotency-Key` (mandatory, per user, 60 s/24 h, `409`) → Tasks 6, 8; `version` initialised server-side → DB default `0` in `insertSupplier` (no client value accepted); F8.2.1 (mandatory fields, Store hours) → Task 5; F8.2.2 (pre-check + `UNIQUE` backstop, `422`, reactivation `200`, photos replaced, `updated_on` and `version` change, `is_active` true) → Task 7; day-8/`is24h` rules → Task 5; `display_order` from 0 → Task 7 `insertChildren`; storage interface + S3 client + MinIO → Task 2; migration and `init.sql` → already done before this plan (`npm run migrate:phase2`).

**Placeholder scan:** no TBD/TODO; every code step has code. Choices the plan itself makes are listed in one place for the team.

**Type consistency:** `PhotoFile`/`PhotoStorage` (Task 2) are used unchanged in Tasks 7–8; `HourInput` (Task 5) feeds `NewSupplier` (Task 7); `IdempotencyStore`/`BeginResult` (Task 6) match the controller (Task 8); `SupplierService.getAdminSupplier` (Task 3) is the `reader` used by `createSupplierCreationService`; `AdminSupplierDependencies` (Task 8) matches the router and the app wiring; `LookupRepository`/`createLookupService` method names match the controller.

**Known limits:** the code above was not compiled or run. Not covered by this plan: cloud-object deletion for replaced/edited photos and the Redis worker (Phases 3–4), `PUT` edit, and soft delete.
