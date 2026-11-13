## Database Stack Overview

- PostgreSQL 17 (`postgres:17` official image)
- Drizzle ORM + `pg` pool
- Testcontainers (`@testcontainers/postgresql`) for `npm test`

Schema and seed live in `db/init/` and are applied by the image on first start
(`/docker-entrypoint-initdb.d`):

- `01_schema.sql` / `02_opening_hours.sql` — tables and indexes
- `03_seed.sql` — three test fixtures (two active, one soft-deleted)
- `04_import_campus.sh` — parses `data/campus_suppliers.json` (idempotent)

Tests copy **01–03 only**. Do not add `04` to Testcontainers or
`reset-database.ts`, or list/radius tests will break.

### Schema

- `Supplier_Database` — suppliers; soft delete via `deleted_at`
- `supplier_opening_hours` — one row per supplier per day (`day_of_week` 0–6)
- `fts` — generated `tsvector` (name A, building/description B) + GIN index
- `unique_active_supplier_name` — unique `"Name"` where `deleted_at IS NULL`
- `idx_supplier_earth` — GiST on `ll_to_earth(lat, lng)` for radius search
  (`cube` + `earthdistance`). There is no btree on `deleted_at`.

### Local database

From `supplier-service/`:

```bash
cp .env.example .env
docker compose up -d --build
```

Postgres is on `127.0.0.1:54332`. Changing `db/init/` after the volume exists
does nothing until:

```bash
docker compose down -v
docker compose up -d --build
```

Add a new numbered file in `db/init/` for the next schema change. Do not run
`npx supabase`.

Managed Postgres (RDS, Cloud SQL, Neon, and so on) never runs
`docker-entrypoint-initdb.d`. Apply campus rows once from the JSON:

```bash
CAMPUS_SUPPLIERS_JSON=data/campus_suppliers.json \
  DATABASE_URL="$DATABASE_URL" \
  sh db/init/04_import_campus.sh
```

The script skips names that already exist, so a second apply is a no-op.
Replace `data/campus_suppliers.json` and re-run to load a new scrape.

### Tests

```bash
npm install   # repo root
npm test      # supplier-service/
```

Testcontainers uses `postgres:16` and copies `01`–`03` from `db/init/`.
Fixture changes in `03_seed.sql` require matching test updates.

This repo tests against `03_seed.sql` only (two active suppliers, one
soft-deleted).
