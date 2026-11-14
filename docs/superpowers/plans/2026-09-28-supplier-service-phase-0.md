# Supplier Service — Phase 0 (Foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Supplier Service's project scaffold, MySQL schema, and cross-cutting middleware (auth verification, role guard, error envelope, rate limiting) so Phase 1 (`docs: supplier-service/SupplierServiceSpec.md`, "Phase 1 — Supplier Read APIs") can build supplier routes on top of working infrastructure, with no routes of its own.

**Architecture:** This plan implements only what is already decided in `supplier-service/SupplierServiceArchitecture.md` (§2–§5, §6.4, §7 intro, §7.1, §7.5, §3) and `supplier-service/SupplierServiceSpec.md` ("Phase 0 — Foundations"). It does not add any supplier-domain route, schema change, or API contract — those begin in Phase 1.

**Tech Stack:** TypeScript, Node.js, Express.js, MySQL, Redis — the fixed stack recorded in [`supplier-service/AGENTS.md`](../../../supplier-service/AGENTS.md) ("Tech stack"). Within that stack: ESM modules, MySQL via `mysql2`, Redis via `ioredis`, Zod for env validation, Vitest + Supertest for tests — mirroring the existing `user-service` project's conventions (see `user-service/package.json`, `user-service/tsconfig.json`, `user-service/eslint.config.js`).

---

## Library choices requiring team confirmation (per AGENTS.md §2.1)

`supplier-service/AGENTS.md` fixes the stack as TypeScript/Node.js/Express.js/MySQL/Redis, but does not name specific Node.js *client libraries* for MySQL/Redis — that narrower gap still has to be filled to write any code. This plan uses the de-facto-standard Node client for each already-chosen engine, exactly analogous to `user-service` already using `pg` for its already-chosen Postgres engine:

- **`mysql2`** — MySQL client (the standard promise-based MySQL driver for Node; there is no architectural alternative being weighed here, only the choice of *a* driver for the already-decided engine).
- **`ioredis`** — Redis client (the standard full-featured Redis client for Node).

No design pattern, framework, or architectural alternative is being selected — these are the only viable low-level clients for the already-chosen engines. Flagging per AGENTS.md §2.1 rather than deciding silently. If the team wants different packages, swap them before running Task 3 / Task 4 below; nothing downstream depends on the package name.

This plan also assigns **`PORT=3002`** for the Supplier Service (the next free port after `user-service`'s `3001`) purely as a local/dev default in `.env.example` — override it in your own `.env` or the team's `docker-compose.yml` if a different port has already been agreed elsewhere.

---

## File Structure

```
supplier-service/
├── .dockerignore                  # new
├── .env.example                   # new
├── .gitignore                     # new
├── Dockerfile                     # new (currently an empty placeholder file)
├── README.md                      # new (currently an empty placeholder file)
├── eslint.config.js               # new
├── package.json                   # new
├── tsconfig.json                  # new
└── src/
    ├── app.ts                     # Express app: middleware chain, /api/v1 mount point, no routes yet
    ├── config.ts                  # Zod-validated env config
    ├── db/
    │   ├── init.sql               # Full §6.4 DDL, verbatim
    │   ├── migrate.ts             # Applies init.sql to MySQL
    │   └── pool.ts                # mysql2 connection pool
    ├── redis/
    │   └── client.ts              # ioredis client (unused until Phase 4, scaffolded now)
    ├── middleware/
    │   ├── authenticate.ts        # Calls User Service GET /auth/verify
    │   ├── authenticate.test.ts
    │   ├── requireRole.ts         # Per-endpoint role guard
    │   ├── requireRole.test.ts
    │   ├── rateLimit.ts           # 30 req/min/IP in-memory limiter
    │   ├── rateLimit.test.ts
    │   ├── errorHandler.ts        # §7.1 error envelope
    │   └── errorHandler.test.ts
    ├── utils/
    │   ├── AppError.ts            # Typed error carrying status/error/message/details
    │   ├── asyncHandler.ts        # Wraps async route handlers for Express error propagation
    │   └── time.ts                # SGT (+08:00) timestamp formatter for the error envelope
    └── app.integration.test.ts    # Supertest check of the full middleware chain (no domain routes)
```

Each file follows one responsibility, mirroring the existing `user-service/src` layout so the two services stay easy to cross-reference.

---

## Task 1: Project scaffold

**Files:**
- Create: `supplier-service/package.json`
- Create: `supplier-service/tsconfig.json`
- Create: `supplier-service/eslint.config.js`
- Create: `supplier-service/.gitignore`
- Create: `supplier-service/.dockerignore`
- Create: `supplier-service/Dockerfile`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "supplier-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/app.ts",
    "dev": "nodemon -L --watch src --ext ts,json --exec tsx src/app.ts",
    "build": "tsc",
    "test": "vitest",
    "migrate": "tsx src/db/migrate.ts",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "dependencies": {
    "express": "^4.21.2",
    "ioredis": "^5.4.1",
    "mysql2": "^3.11.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.17.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.17.0",
    "nodemon": "^3.1.9",
    "prettier": "^3.4.2",
    "supertest": "^7.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.19.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`** (identical to `user-service/tsconfig.json`, kept consistent across services)

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,

    "rootDir": "./src",
    "outDir": "./dist",
    "sourceMap": true,

    "allowJs": true,
    "resolveJsonModule": true,
    "moduleDetection": "force",
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `eslint.config.js`** (identical pattern to `user-service/eslint.config.js`)

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 5: Write `.dockerignore`**

```
node_modules
dist
.env
.git
```

- [ ] **Step 6: Write `Dockerfile`** (mirrors `user-service/Dockerfile`, own port)

```dockerfile
# AI Assistance Disclosure:
# Tool: Tool name (model: ), date: 2026-09-28
# Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
#        No requirements, architecture, schema, or API decisions were made by the AI tool.
# Author review: Congchen

FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3002

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS prod
RUN npm run build
CMD ["node", "dist/app.js"]
```

- [ ] **Step 7: Install dependencies**

Run: `cd supplier-service && npm install`
Expected: `package-lock.json` is generated, install completes with no errors.

- [ ] **Step 8: Commit**

```bash
git add supplier-service/package.json supplier-service/package-lock.json supplier-service/tsconfig.json supplier-service/eslint.config.js supplier-service/.gitignore supplier-service/.dockerignore supplier-service/Dockerfile
git commit -m "chore(supplier-service): add Phase 0 project scaffold"
```

---

## Task 2: Config loader

**Files:**
- Create: `supplier-service/.env.example`
- Create: `supplier-service/src/config.ts`

- [ ] **Step 1: Write `.env.example`**

```
# AI Assistance Disclosure:
# Tool: Tool name (model: ), date: 2026-09-28
# Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
#        No requirements, architecture, schema, or API decisions were made by the AI tool.
# Author review: Congchen

# Server
PORT=3002
NODE_ENV=development

# MySQL
DB_HOST=supplier-db
DB_PORT=3306
DB_NAME=supplier_service
DB_USER=root
DB_PASSWORD=supplier_root_password

# Redis
REDIS_HOST=supplier-redis
REDIS_PORT=6379

# User Service (auth verification contract, SupplierServiceArchitecture.md §7 intro)
USER_SERVICE_URL=http://user-service:3001
```

- [ ] **Step 2: Write `src/config.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive(),
  NODE_ENV: z.enum(['development', 'production', 'test']),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive(),

  USER_SERVICE_URL: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid or missing environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  server: {
    port: env.PORT,
  },
  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    name: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  },
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  },
  userServiceUrl: env.USER_SERVICE_URL,
} as const;
```

- [ ] **Step 3: Verify it loads**

Run (from `supplier-service/`, with a `.env` copied from `.env.example` and exported into the shell, or via `dotenv-safe`-free manual export): 
```bash
cp .env.example .env
node --env-file=.env -e "process.env.NODE_ENV='development'; import('./src/config.ts')" 2>&1 | head -5
```
This is a smoke check only; `config.ts` is exercised indirectly by every test in later tasks that imports it, since none of those tests mock it out — if the schema were wrong, every subsequent task's tests would fail at import time.

- [ ] **Step 4: Commit**

```bash
git add supplier-service/.env.example supplier-service/src/config.ts
git commit -m "feat(supplier-service): add Zod-validated environment config"
```

---

## Task 3: MySQL pool and schema migration

**Files:**
- Create: `supplier-service/src/db/init.sql`
- Create: `supplier-service/src/db/pool.ts`
- Create: `supplier-service/src/db/migrate.ts`

- [ ] **Step 1: Write `src/db/init.sql`** (the full §6.4 DDL, copied verbatim from `SupplierServiceArchitecture.md` — no schema decision made here, only transcription)

```sql
-- AI Assistance Disclosure:
-- Tool: Tool name (model: ), date: 2026-09-28
-- Scope: Transcribed the already-decided MySQL schema from SupplierServiceArchitecture.md §6.4 into
--        a runnable migration file. No schema decisions were made by the AI tool.
-- Author review: Congchen

CREATE TABLE IF NOT EXISTS faculties (
    faculty_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    faculty VARCHAR(255) NOT NULL,
    PRIMARY KEY (faculty_id),
    UNIQUE KEY uq_faculties_faculty (faculty)
);

CREATE TABLE IF NOT EXISTS supplier_locations (
    location_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    location VARCHAR(255) NOT NULL,
    faculty_id BIGINT UNSIGNED NOT NULL,
    level INT NOT NULL,
    PRIMARY KEY (location_id),
    UNIQUE KEY uq_supplier_locations (location, faculty_id, level),
    CONSTRAINT fk_supplier_locations_faculty
        FOREIGN KEY (faculty_id) REFERENCES faculties (faculty_id)
);

CREATE TABLE IF NOT EXISTS supplier (
    supplier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    supplier_name VARCHAR(255) NOT NULL,
    supplier_type ENUM('Store', 'Facility') NOT NULL,
    supplier_desc TEXT NULL,
    location_id BIGINT UNSIGNED NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255) NOT NULL,
    updated_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (supplier_id),
    UNIQUE KEY uq_supplier_name_type_location (supplier_name, supplier_type, location_id),
    KEY idx_supplier_location (location_id),
    KEY idx_supplier_visibility (is_active, is_deleted),
    CONSTRAINT fk_supplier_location
        FOREIGN KEY (location_id) REFERENCES supplier_locations (location_id)
);

CREATE TABLE IF NOT EXISTS supplier_categories (
    category_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_type VARCHAR(100) NOT NULL,
    PRIMARY KEY (category_id),
    UNIQUE KEY uq_supplier_categories_type (category_type)
);

CREATE TABLE IF NOT EXISTS supplier_category_map (
    supplier_id BIGINT UNSIGNED NOT NULL,
    category_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (supplier_id, category_id),
    CONSTRAINT fk_supplier_category_map_supplier
        FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id),
    CONSTRAINT fk_supplier_category_map_category
        FOREIGN KEY (category_id) REFERENCES supplier_categories (category_id)
);

CREATE TABLE IF NOT EXISTS supplier_hours (
    entry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    supplier_id BIGINT UNSIGNED NOT NULL,
    day_of_week TINYINT UNSIGNED NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    PRIMARY KEY (entry_id),
    UNIQUE KEY uq_supplier_hours_day (supplier_id, day_of_week),
    CONSTRAINT chk_supplier_hours_day CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT fk_supplier_hours_supplier
        FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id)
);

CREATE TABLE IF NOT EXISTS supplier_photos (
    photo_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    supplier_id BIGINT UNSIGNED NOT NULL,
    photo_location VARCHAR(2048) NOT NULL,
    display_order INT UNSIGNED NOT NULL,
    PRIMARY KEY (photo_id),
    UNIQUE KEY uq_supplier_photos_order (supplier_id, display_order),
    CONSTRAINT fk_supplier_photos_supplier
        FOREIGN KEY (supplier_id) REFERENCES supplier (supplier_id)
);

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id VARCHAR(255) NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    payload JSON NOT NULL,
    error_trace TEXT NOT NULL,
    failed_at DATETIME NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'UNRESOLVED',
    PRIMARY KEY (id),
    KEY idx_dead_letter_jobs_status (status)
);
```

- [ ] **Step 2: Write `src/db/pool.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import mysql from 'mysql2/promise';
import { config } from '../config.js';

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
});

export default pool;
```

- [ ] **Step 3: Write `src/db/migrate.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pool from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const sql = readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith('--'));

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log(`Applied ${statements.length} statement(s) from init.sql`);
  await pool.end();
}

migrate().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Run the migration against a real MySQL instance**

This step needs a running MySQL server matching `.env`'s `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` (e.g. `docker run -d --name supplier-db -e MYSQL_ROOT_PASSWORD=supplier_root_password -e MYSQL_DATABASE=supplier_service -p 3306:3306 mysql:8`, then point `.env`'s `DB_HOST` at `127.0.0.1`). Once it's reachable:

Run: `npm run migrate`
Expected output: `Applied 8 statement(s) from init.sql` with no errors.

Verify the tables landed correctly:
```bash
docker exec -it supplier-db mysql -uroot -psupplier_root_password supplier_service -e "SHOW TABLES;"
```
Expected: `faculties`, `supplier_locations`, `supplier`, `supplier_categories`, `supplier_category_map`, `supplier_hours`, `supplier_photos`, `dead_letter_jobs` all listed. This satisfies Phase 0's first acceptance criterion ("All tables in §6.4 exist with the documented constraints").

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/db/init.sql supplier-service/src/db/pool.ts supplier-service/src/db/migrate.ts
git commit -m "feat(supplier-service): add MySQL pool and §6.4 schema migration"
```

---

## Task 4: Redis client scaffold

**Files:**
- Create: `supplier-service/src/redis/client.ts`

- [ ] **Step 1: Write `src/redis/client.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Scaffolds the Redis client only; job processing, the Idempotency-Key cache, and the
//        dead-letter workflow are wired up in later phases (Phase 4) per the spec. No requirements,
//        architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import Redis from 'ioredis';
import { config } from '../config.js';

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

export default redis;
```

- [ ] **Step 2: Verify it connects**

With a Redis instance running (`docker run -d --name supplier-redis -p 6379:6379 redis:7-alpine`, `.env`'s `REDIS_HOST=127.0.0.1`):
```bash
node --env-file=.env -e "import('./src/redis/client.js').then(m => m.default.ping()).then(console.log).then(() => process.exit(0))"
```
Expected: prints `PONG`.

- [ ] **Step 3: Commit**

```bash
git add supplier-service/src/redis/client.ts
git commit -m "feat(supplier-service): add Redis client scaffold"
```

---

## Task 5: Error utilities (`AppError`, `asyncHandler`, SGT timestamp)

**Files:**
- Create: `supplier-service/src/utils/AppError.ts`
- Create: `supplier-service/src/utils/asyncHandler.ts`
- Create: `supplier-service/src/utils/time.ts`
- Test: `supplier-service/src/utils/time.test.ts`

- [ ] **Step 1: Write `src/utils/AppError.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Implements the fixed error envelope shape from SupplierServiceArchitecture.md §7.1. No
//        requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

export interface AppErrorDetail {
  field: string;
  location: string;
  message: string;
}

export class AppError extends Error {
  statusCode: number;
  error: string;
  details?: AppErrorDetail[];
  retryAfterSeconds?: number;

  constructor(
    statusCode: number,
    error: string,
    message: string,
    options?: { details?: AppErrorDetail[]; retryAfterSeconds?: number },
  ) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    if (options?.details !== undefined) {
      this.details = options.details;
    }
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}
```

- [ ] **Step 2: Write `src/utils/asyncHandler.ts`** (identical pattern to `user-service/src/utils/asyncHandler.ts`)

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

- [ ] **Step 3: Write the failing test for `src/utils/time.ts`**

```ts
// supplier-service/src/utils/time.test.ts
import { describe, expect, it } from 'vitest';
import { sgtTimestamp } from './time.js';

describe('sgtTimestamp', () => {
  it('formats a known UTC instant as SGT with a +08:00 offset', () => {
    const utcDate = new Date('2026-09-27T02:00:00.000Z');
    expect(sgtTimestamp(utcDate)).toBe('2026-09-27T10:00:00+08:00');
  });

  it('rolls over to the next day when SGT crosses midnight', () => {
    const utcDate = new Date('2026-09-27T17:30:00.000Z');
    expect(sgtTimestamp(utcDate)).toBe('2026-09-28T01:30:00+08:00');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/utils/time.test.ts`
Expected: FAIL with `Cannot find module './time.js'` (or similar) — `time.ts` doesn't exist yet.

- [ ] **Step 5: Write `src/utils/time.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Implements the SGT (+08:00) timestamp format shown in SupplierServiceArchitecture.md §7.1's
//        error envelope example. No requirements, architecture, schema, or API decisions were made
//        by the AI tool.
// Author review: Congchen

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function sgtTimestamp(date: Date = new Date()): string {
  const sgt = new Date(date.getTime() + SGT_OFFSET_MS);
  const iso = sgt.toISOString(); // e.g. "2026-09-27T10:00:00.000Z"
  return `${iso.slice(0, 19)}+08:00`;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/utils/time.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add supplier-service/src/utils/AppError.ts supplier-service/src/utils/asyncHandler.ts supplier-service/src/utils/time.ts supplier-service/src/utils/time.test.ts
git commit -m "feat(supplier-service): add AppError, asyncHandler, and SGT timestamp utilities"
```

---

## Task 6: Error-handler middleware (§7.1 envelope)

**Files:**
- Create: `supplier-service/src/middleware/errorHandler.ts`
- Test: `supplier-service/src/middleware/errorHandler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supplier-service/src/middleware/errorHandler.test.ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppError } from '../utils/AppError.js';
import { errorHandler } from './errorHandler.js';

function buildApp(routeHandler: express.RequestHandler): express.Express {
  const app = express();
  app.get('/boom', routeHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('serializes an AppError into the §7.1 envelope', async () => {
    const app = buildApp((_req, _res, next) => {
      next(
        new AppError(422, 'Unprocessable Entity', 'One or more supplier fields failed validation.', {
          details: [{ field: 'supplier_name', location: 'body', message: 'Supplier name is required.' }],
        }),
      );
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      status_code: 422,
      error: 'Unprocessable Entity',
      message: 'One or more supplier fields failed validation.',
      details: [{ field: 'supplier_name', location: 'body', message: 'Supplier name is required.' }],
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('omits "details" when the AppError carries none', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new AppError(401, 'Unauthorized', 'Bearer token is missing or invalid.'));
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(401);
    expect(res.body.details).toBeUndefined();
  });

  it('maps an unrecognized error to 500 without leaking internals', async () => {
    const app = buildApp((_req, _res, next) => {
      next(new Error('unexpected failure'));
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      status_code: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
  });

  it('sets Retry-After when the AppError carries retryAfterSeconds', async () => {
    const app = buildApp((_req, _res, next) => {
      next(
        new AppError(429, 'Too Many Requests', 'Rate limit exceeded.', { retryAfterSeconds: 42 }),
      );
    });

    const res = await request(app).get('/boom');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('42');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/errorHandler.test.ts`
Expected: FAIL — `./errorHandler.js` does not exist.

- [ ] **Step 3: Write `src/middleware/errorHandler.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Implements the fixed error envelope and status-code set from SupplierServiceArchitecture.md
//        §7.1. No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { sgtTimestamp } from '../utils/time.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.retryAfterSeconds !== undefined) {
      res.set('Retry-After', String(err.retryAfterSeconds));
    }
    res.status(err.statusCode).json({
      status_code: err.statusCode,
      error: err.error,
      message: err.message,
      timestamp: sgtTimestamp(),
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    status_code: 500,
    error: 'Internal Server Error',
    message: 'Internal server error',
    timestamp: sgtTimestamp(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/errorHandler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/middleware/errorHandler.ts supplier-service/src/middleware/errorHandler.test.ts
git commit -m "feat(supplier-service): add §7.1 error envelope middleware"
```

---

## Task 7: Rate-limit middleware (30 req/min/IP → 429)

**Files:**
- Create: `supplier-service/src/middleware/rateLimit.ts`
- Test: `supplier-service/src/middleware/rateLimit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supplier-service/src/middleware/rateLimit.test.ts
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { createRateLimiter } from './rateLimit.js';

function buildApp(): express.Express {
  const app = express();
  app.use(createRateLimiter());
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('rateLimit', () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
  });

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 30; i++) {
      const res = await request(app).get('/ping');
      expect(res.status).toBe(200);
    }
  });

  it('rejects the 31st request within the same window with 429', async () => {
    for (let i = 0; i < 30; i++) {
      await request(app).get('/ping');
    }

    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      status_code: 429,
      error: 'Too Many Requests',
    });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('tracks separate IPs independently', async () => {
    for (let i = 0; i < 30; i++) {
      await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.1');
    }
    const blocked = await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.1');
    const otherIp = await request(app).get('/ping').set('X-Forwarded-For', '10.0.0.2');

    expect(blocked.status).toBe(429);
    expect(otherIp.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/rateLimit.test.ts`
Expected: FAIL — `./rateLimit.js` does not exist.

- [ ] **Step 3: Write `src/middleware/rateLimit.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Implements the fixed 30-requests-per-minute-per-IP limit from SupplierServiceArchitecture.md
//        §7.5 as an in-memory counter (no new library dependency introduced for this). No
//        requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

interface WindowState {
  count: number;
  windowStart: number;
}

export function createRateLimiter() {
  const hits = new Map<string, WindowState>();

  return function rateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const state = hits.get(key);

    if (state === undefined || now - state.windowStart >= WINDOW_MS) {
      hits.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    if (state.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfterSeconds = Math.ceil((state.windowStart + WINDOW_MS - now) / 1000);
      next(
        new AppError(429, 'Too Many Requests', 'Rate limit exceeded. Try again later.', {
          retryAfterSeconds,
        }),
      );
      return;
    }

    state.count += 1;
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/rateLimit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/middleware/rateLimit.ts supplier-service/src/middleware/rateLimit.test.ts
git commit -m "feat(supplier-service): add 30 req/min/IP rate limiter"
```

---

## Task 8: Auth middleware (verifies against User Service `GET /auth/verify`)

**Files:**
- Create: `supplier-service/src/types/express.d.ts`
- Create: `supplier-service/src/middleware/authenticate.ts`
- Test: `supplier-service/src/middleware/authenticate.test.ts`

- [ ] **Step 1: Write `src/types/express.d.ts`** (identical shape to `user-service/src/types/express.d.ts`, since both services share the User Service's `{ user_id, role }` identity)

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations"). No
//        requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

declare global {
  namespace Express {
    interface Request {
      user?: { user_id: string; role: string };
    }
  }
}

export {};
```

- [ ] **Step 2: Write the failing test**

```ts
// supplier-service/src/middleware/authenticate.test.ts
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { authenticate } from './authenticate.js';

function buildApp(): express.Express {
  const app = express();
  app.use(authenticate);
  app.get('/whoami', (req, res) => res.json({ user: req.user }));
  app.use(errorHandler);
  return app;
}

describe('authenticate', () => {
  const app = buildApp();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/whoami');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a request whose header is not a Bearer token', async () => {
    const res = await request(app).get('/whoami').set('Authorization', 'Basic abc123');

    expect(res.status).toBe(401);
  });

  it('rejects when the User Service reports the token invalid', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    const res = await request(app).get('/whoami').set('Authorization', 'Bearer bad-token');

    expect(res.status).toBe(401);
  });

  it('attaches the resolved identity when the User Service confirms the token', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user_id: 'u-1', role: 'admin' }), { status: 200 }),
    );

    const res = await request(app).get('/whoami').set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ user_id: 'u-1', role: 'admin' });
  });

  it('maps a network failure reaching the User Service to 500', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).get('/whoami').set('Authorization', 'Bearer good-token');

    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/middleware/authenticate.test.ts`
Expected: FAIL — `./authenticate.js` does not exist.

- [ ] **Step 4: Write `src/middleware/authenticate.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Implements the User Service authentication contract from SupplierServiceArchitecture.md
//        §7 intro: verifies the bearer token by calling the User Service's GET /auth/verify and
//        attaches the resolved { user_id, role } identity to the request. A missing header, a
//        non-2xx response from that endpoint, or a malformed body all map to 401 per §7.1's
//        acceptance criterion; an unreachable User Service maps to 500 per §7.1's "unhandled
//        service failure" row rather than being reported as a client auth failure. No requirements,
//        architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { AppError } from '../utils/AppError.js';

function unauthorized(): AppError {
  return new AppError(401, 'Unauthorized', 'Bearer token is missing or invalid.');
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(`${config.userServiceUrl}/auth/verify`, {
      headers: { Authorization: authHeader },
    });
  } catch (err) {
    next(new AppError(500, 'Internal Server Error', 'Failed to reach the User Service.'));
    return;
  }

  if (!verifyResponse.ok) {
    next(unauthorized());
    return;
  }

  try {
    const identity = (await verifyResponse.json()) as { user_id?: unknown; role?: unknown };
    if (typeof identity.user_id !== 'string' || typeof identity.role !== 'string') {
      next(unauthorized());
      return;
    }
    req.user = { user_id: identity.user_id, role: identity.role };
    next();
  } catch {
    next(unauthorized());
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/middleware/authenticate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add supplier-service/src/types/express.d.ts supplier-service/src/middleware/authenticate.ts supplier-service/src/middleware/authenticate.test.ts
git commit -m "feat(supplier-service): add auth middleware backed by User Service /auth/verify"
```

---

## Task 9: Role-guard middleware

**Files:**
- Create: `supplier-service/src/middleware/requireRole.ts`
- Test: `supplier-service/src/middleware/requireRole.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// supplier-service/src/middleware/requireRole.test.ts
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler.js';
import { requireRole } from './requireRole.js';

function buildApp(userRole: string | undefined, ...allowed: string[]): express.Express {
  const app = express();
  app.use((req, _res, next) => {
    if (userRole !== undefined) {
      req.user = { user_id: 'u-1', role: userRole };
    }
    next();
  });
  app.get('/admin-only', requireRole(...allowed), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe('requireRole', () => {
  it('allows a role in the allowed list', async () => {
    const app = buildApp('admin', 'admin', 'super admin');
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(200);
  });

  it('rejects a role not in the allowed list with 403', async () => {
    const app = buildApp('user', 'admin', 'super admin');
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('rejects an unauthenticated request with 403', async () => {
    const app = buildApp(undefined, 'admin', 'super admin');
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/requireRole.test.ts`
Expected: FAIL — `./requireRole.js` does not exist.

- [ ] **Step 3: Write `src/middleware/requireRole.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations").
//        Implements the per-endpoint role column from SupplierServiceArchitecture.md §7 (user,
//        admin, super admin). No requirements, architecture, schema, or API decisions were made by
//        the AI tool.
// Author review: Congchen

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

export function requireRole(...allowedRoles: string[]) {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    if (req.user === undefined || !allowedRoles.includes(req.user.role)) {
      next(new AppError(403, 'Forbidden', 'You do not have permission to perform this operation.'));
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/requireRole.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supplier-service/src/middleware/requireRole.ts supplier-service/src/middleware/requireRole.test.ts
git commit -m "feat(supplier-service): add per-endpoint role-guard middleware"
```

---

## Task 10: App wiring and integration test

**Files:**
- Create: `supplier-service/src/app.ts`
- Test: `supplier-service/src/app.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

This test mounts a temporary probe route under `/api/v1` purely to exercise the already-wired middleware chain end-to-end; it is not a real Supplier Service endpoint (Phase 0 adds none — Phase 1 adds the real routes on top of this same `app`).

```ts
// supplier-service/src/app.integration.test.ts
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from './app.js';

describe('app (Phase 0 middleware chain)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an unauthenticated request to any /api/v1 route with 401', async () => {
    const res = await request(app).get('/api/v1/__probe');
    expect(res.status).toBe(401);
    expect(res.body.status_code).toBe(401);
  });

  it('returns 404 for an unknown route once authenticated', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ user_id: 'u-1', role: 'user' }), { status: 200 }),
    );

    const res = await request(app).get('/api/v1/__probe').set('Authorization', 'Bearer good-token');
    expect(res.status).toBe(404);
  });

  it('does not set any CORS headers (single-origin API gateway, §3)', async () => {
    const res = await request(app).get('/api/v1/__probe');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.integration.test.ts`
Expected: FAIL — `./app.js` does not exist.

- [ ] **Step 3: Write `src/app.ts`**

```ts
// AI Assistance Disclosure:
// Tool: Tool name (model: ), date: 2026-09-28
// Scope: Generated Phase 0 project scaffold (SupplierServiceSpec.md, "Phase 0 — Foundations"). Wires
//        the rate limiter, auth middleware, and error handler under the /api/v1 prefix (§7 intro).
//        No CORS middleware is added: a single API gateway fronts all FoC services, so the SPA and
//        this service share an origin (§3). No health-check route is added (§7.5: explicitly
//        deferred). No supplier-domain routes are added in this phase. No requirements,
//        architecture, schema, or API decisions were made by the AI tool.
// Author review: Congchen

import express from 'express';
import { config } from './config.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';

const app = express();

app.set('trust proxy', true);
app.use(express.json());
app.use(createRateLimiter());

const apiV1 = express.Router();
apiV1.use(authenticate);
// Phase 1+ mounts supplier routes on `apiV1` here.
app.use('/api/v1', apiV1);

app.use(errorHandler);

if (config.env !== 'test') {
  app.listen(config.server.port, () => {
    console.log(`supplier-service listening on port ${config.server.port}`);
  });
}

export default app;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app.integration.test.ts`
Expected: PASS (3 tests). This satisfies Phase 0's remaining acceptance criteria: unauthenticated requests are rejected with `401` under the standard envelope, and no CORS headers are emitted.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: All test files pass (`time`, `errorHandler`, `rateLimit`, `authenticate`, `requireRole`, `app.integration`).

- [ ] **Step 6: Commit**

```bash
git add supplier-service/src/app.ts supplier-service/src/app.integration.test.ts
git commit -m "feat(supplier-service): wire Phase 0 middleware chain under /api/v1"
```

---

## Task 11: Documentation and AI-usage disclosure

**Files:**
- Modify: `supplier-service/README.md` (currently empty)
- Modify: `ai/usage-log.md`
- Modify: `README.md` (root)

- [ ] **Step 1: Write `supplier-service/README.md`**

```markdown
<!--
AI Assistance Disclosure:
Tool: Tool name (model: ), date: 2026-09-28
Scope: Documented the Phase 0 scaffold's setup/run instructions (SupplierServiceSpec.md, "Phase 0 —
       Foundations"). No requirements, architecture, schema, or API decisions were made by the AI
       tool.
Author review: Congchen
-->

# Supplier Service

See [SupplierServiceArchitecture.md](./SupplierServiceArchitecture.md) for the decided architecture
and [SupplierServiceSpec.md](./SupplierServiceSpec.md) for the phased implementation plan.

## Setup

```bash
npm install
cp .env.example .env   # fill in DB/Redis/User Service values for your environment
npm run migrate        # applies src/db/init.sql (§6.4 schema)
npm run dev
```

## Environment variables

See `.env.example` for the full list: server port, MySQL connection, Redis connection, and
`USER_SERVICE_URL` (used by the auth middleware to call the User Service's `GET /auth/verify`).

## Tests

```bash
npm test
```
```

- [ ] **Step 2: Append to `ai/usage-log.md`** (append at the true end of the file — re-read the file first and confirm the anchor is the actual last line, per the append-only rule)

```markdown
## 2026-09-28 — Supplier Service: Phase 0 Foundations Implementation Plan

**Tool:** Tool name (model: )
**Mode:** generate | docs
**Scope:** Implementation code | Boilerplate | Refactor/Docs
**Governing decision:** `supplier-service/SupplierServiceArchitecture.md` (§2–§5, §6.4, §7 intro,
§7.1, §7.5, §3), `supplier-service/SupplierServiceSpec.md` ("Phase 0 — Foundations"), and
`supplier-service/AGENTS.md` ("Tech stack").

**Prompts (exact):**
> with /superpowers:writing-plans  , write an implementation plan for phase 0

**Key responses:**
Wrote `docs/superpowers/plans/2026-09-28-supplier-service-phase-0.md`, a task-by-task plan
implementing Phase 0 exactly as scoped in the spec: project scaffold, the full §6.4 MySQL schema as
a migration, a Redis client scaffold, and the cross-cutting middleware chain (auth verification
against the User Service's `GET /auth/verify`, per-endpoint role guard, the fixed §7.1 error
envelope, and the 30 req/min/IP rate limiter) — with no supplier-domain routes, since Phase 1 owns
those. Flagged two library choices the architecture doesn't name a Node client for (`mysql2` for the
already-chosen MySQL engine, `ioredis` for the already-chosen Redis engine) as a deviation for the
team to confirm rather than deciding them silently, and used a default `PORT=3002` dev value. No
other requirements, architecture, schema, or API decisions were made.

**Files:**
- `docs/superpowers/plans/2026-09-28-supplier-service-phase-0.md` (created)
- `supplier-service/README.md` (modified)
- `ai/usage-log.md` (modified)
- `README.md` (modified)

**Deviations / questions raised for the team:**
`mysql2` and `ioredis` were selected as the Node client libraries for the already-decided MySQL and
Redis engines (no architectural alternative was weighed, only the client for each already-chosen
engine) — flagged for confirmation before Task 3/Task 4 of the plan execute. `PORT=3002` is an
arbitrary local dev default, not a coordinated port assignment.

**What I kept/changed/rejected:**

**Author review:**
```

- [ ] **Step 3: Add the matching README "Log index" row**

Append this row to the root `README.md`'s "Log index" table (after the existing last row):

```markdown
| 2026-09-28 | supplier-service | Supplier Service: Phase 0 Foundations Implementation Plan | Wrote the Phase 0 (scaffold, schema, auth/error/rate-limit middleware) implementation plan; no domain routes added |
```

- [ ] **Step 4: Commit**

```bash
git add supplier-service/README.md ai/usage-log.md README.md
git commit -m "docs(supplier-service): document Phase 0 setup and log AI-assisted plan"
```

---

## Self-review notes

- **Spec coverage:** every Phase 0 scope bullet in `SupplierServiceSpec.md` is covered — project
  scaffold (Task 1–2), full §6.4 DDL as migrations (Task 3), auth middleware against
  `GET /auth/verify` (Task 8), role guard (Task 9), global error handler with the §7.1 envelope
  (Task 6), rate limiting (Task 7), same-origin/no-CORS confirmation (Task 10), and persistence
  scaffolding via the pooled MySQL client that Phase 1's business logic will depend on instead of
  raw connections (Task 3). Deferred items (Redis job processing, health checks) are explicitly left
  out per the spec's own "Out of scope / deferred" list, with a comment in `app.ts` marking where
  Phase 1 continues.
- **No routes added:** confirmed against the spec's own acceptance criteria, which state Phase 0 has
  no user-facing routes and is verified indirectly through Phase 1 — Task 10's test uses a
  throwaway `__probe` path precisely so no real endpoint is invented here.
- **Type consistency:** `req.user` is `{ user_id: string; role: string }` everywhere it's touched
  (Task 8's `express.d.ts`, `authenticate.ts`, `requireRole.ts`, and their tests) — matches the User
  Service's existing `verifyAccessToken` return shape 1:1.
- **AGENTS.md compliance:** every created file carries the required disclosure header; the top-level
  stack (TypeScript/Node.js/Express.js/MySQL/Redis) is now recorded in `supplier-service/AGENTS.md`,
  so this plan implements that stack rather than proposing it. The two client-library picks needed
  to write any code at all (`mysql2`, `ioredis`) are narrower than that and are still surfaced as an
  explicit, named deviation rather than silently decided, both in the plan header and in the
  `ai/usage-log.md` entry in Task 11.
- **Role literal corrected:** Task 9's role-guard test and comment used `super_admin` (underscore),
  matching `SupplierServiceArchitecture.md`'s original wording. After merging `main` into
  `supplier-service`, the merged user-service code turned out to use the literal `super admin`
  (with a space) in its `role_enum` and its `GET /auth/verify` response
  (`user-service/src/db/init.sql`, `user-service/src/controllers/auth.controller.ts`). The team
  resolved the mismatch by adopting the User Service's existing string; `SupplierServiceArchitecture.md`,
  `SupplierServiceSpec.md`, and this plan's Task 9 were all updated to `super admin` accordingly —
  Task 8's tests were already using a role string (`'admin'`) unaffected by this change.
