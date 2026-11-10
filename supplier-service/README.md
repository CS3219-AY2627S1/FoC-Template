# Supplier Service

## Create, update, and deactivate supplier APIs

`POST /api/v1/admin/suppliers` validates a new supplier, asks User Service for
a current `SUPPLIER_CREATE` admin decision, and inserts the supplier and
categories in one PostgreSQL transaction. It returns `201`. The
`PATCH /api/v1/admin/suppliers/{supplier_id}` route checks the current admin role
again, merges supplied fields with the stored record, validates the complete
result, and commits supplier and category changes together. It returns `200`.
`DELETE /api/v1/admin/suppliers/{supplier_id}` retains the supplier and marks
it `INACTIVE`, returning `{"id":"...","outcome":"DEACTIVATED"}`. Suppliers are
never permanently deleted; see
[API.md](API.md#delete-contract-and-errand-references).
Authenticated users can also call `GET /api/v1/categories` to read supported
category codes and display names directly from the lookup table.
`GET /api/v1/suppliers` lists only active suppliers. It accepts `q`, repeated
`category`, `sort`, `page`, and `page_size` query parameters;
the response includes `items`, `page`, `page_size`, and `total`. For example:

```sh
curl -G http://127.0.0.1:8001/api/v1/suppliers \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  --data-urlencode "q=cafe" --data-urlencode "category=FOOD" \
  --data-urlencode "category=COFFEE"
```

`GET /api/v1/suppliers/{supplier_id}` returns the full detail for an active
supplier. An inactive or unknown supplier returns `404` on this normal route.
Admins can call `GET /api/v1/admin/suppliers` with the same list parameters and
an optional `status=ACTIVE` or `status=INACTIVE` filter. Without `status`, it
includes both. Supplier Service asks User Service for a current admin decision
before returning this management list. `GET /api/v1/admin/suppliers/{supplier_id}`
returns full details for either an active or inactive supplier to an Admin or
Super Admin; an unknown ID returns `404`.

This service keeps Supabase CLI `2.117.0` as a development dependency. Run
`npm ci` once after cloning, then use `npx supabase` from this folder for local
database and hosted-project commands. Node.js is not needed in the FastAPI
container.

Use Python 3.13 for local development, matching Docker and CI. The macOS system
`python3` may be older; use `python3.13` explicitly. From `supplier-service/`:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install -e '.[test,dev]'
```

Copy [`.env.example`](.env.example) to an ignored `.env` if you do not already
have one. It points to this service's local Supabase database by default. Set
`SUPPLIER_SERVICE_SHARED_SECRET` to the value configured by the User Service
operator. The FastAPI app reads environment variables, so load the file into
your shell before starting it:

```sh
set -a
source .env
set +a
.venv/bin/uvicorn app.main:app --reload --port 8001
```

Do not commit the populated `.env` file. To use the hosted Supplier Service
database instead, change only `SUPPLIER_DATABASE_URL` to its PostgreSQL
connection string.

API requests borrow connections from one shared pool (`app/database.py`)
instead of opening a new connection per request. The pool keeps 1–10
connections, checks each one before use, and closes when the app shuts down.
It opens in the background, so the API still starts while the database is
down; a request that cannot get a connection within five seconds returns
`503 DATABASE_UNAVAILABLE`. Server-side prepared statements are off, so the
URL may point at Supabase's session (5432) or transaction (6543) pooler. The
readiness probe still opens its own fresh connection.

With a User Service administrator access token, try:

```sh
curl -i -X POST http://127.0.0.1:8001/api/v1/admin/suppliers \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Cafe","categories":["FOOD"],"building_area":"Central Library","pickup_location_description":"Near the entrance","opening_time":"09:00","closing_time":"18:00"}'
```

The example uses port 8001 so User Service can use port 8000 on the same
machine.
To update the returned supplier ID, use the same access token:

```sh
curl -i -X PATCH http://127.0.0.1:8001/api/v1/admin/suppliers/YOUR_SUPPLIER_UUID \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated Cafe","categories":["COFFEE"]}'
```

Omitted fields stay unchanged. A supplied `categories` array replaces the old
set. Send `null` for optional fields to remove them; clear both coordinates or
both operating times together. `status: INACTIVE` uses User Service's current
`SUPPLIER_DEACTIVATE` authorization decision. A missing ID returns `404`, an
invalid resulting record `422`, and a normalized duplicate `409`.

To deactivate a supplier, send DELETE with the same administrator token:

```sh
curl -i -X DELETE http://127.0.0.1:8001/api/v1/admin/suppliers/YOUR_SUPPLIER_UUID \
  -H "Authorization: Bearer YOUR_ADMIN_ACCESS_TOKEN"
```

The Supplier Service asks User Service for a current `SUPPLIER_DEACTIVATE`
decision. A missing supplier returns `404`. Repeating DELETE on an already
inactive supplier returns `DEACTIVATED` again. The row and its category links
remain in Supplier PostgreSQL. Normal-user listing excludes inactive suppliers,
and Order Service rejects an inactive supplier when an errand is created.
Permanent deletion (backlog M2F1.3.1) is out of scope.

The User Service's published contract is
[`../user-service/docs/supplier-authorization-contract.md`](../user-service/docs/supplier-authorization-contract.md).
The Supplier Service verifies the access JWT using User Service's public JWKS,
then asks its internal endpoint for the current role. It does not read User
Service tables or trust a role supplied in the request.

### Run the API in Docker

Use the [repository-root Compose setup](../README.md#local-setup-overview).
Complete its first-time configuration and start the User and Supplier local
Supabase databases. Stop any local Supplier API using port 8001, then run from
the repository root:

```sh
docker compose --env-file user-service/.env up --build -d
```

Open `http://127.0.0.1:8001/docs` and send the same administrator POST request
shown above, or open the website at `http://localhost:3000`. Root Compose creates
the application networks and starts User, Supplier, the frontend, RabbitMQ,
Mailpit, and User's outbox publisher. It loads `supplier-service/.env` for the
shared secret and supplies `host.docker.internal:55322` for Supplier PostgreSQL
and `http://user-service:8000` for User Service. To override the Docker database
URL, export `SUPPLIER_DATABASE_URL_DOCKER` in the shell running Compose; setting
it only in Supplier's `.env` does not supply root Compose interpolation. Never
put secrets in the image.

Once the stack is running, rebuild or stop only Supplier from the repository
root:

```sh
docker compose --env-file user-service/.env up --build -d --no-deps supplier-service
docker compose --env-file user-service/.env stop supplier-service
```

Stopping Supplier leaves the other services and its database running. Compose
uses `restart: unless-stopped` to restart Supplier after a process crash; an
explicit stop leaves it stopped. Supplier keeps its own Dockerfile and can still
be built independently. The CI workflow also builds and smoke tests the image
after the Supplier Service tests.

### Liveness and database readiness

- `GET /health/live` returns `200 {"status":"live"}` without configuration,
  database access, or User Service authentication.
- `GET /health/ready` opens a fresh database connection and checks that the
  Supplier tables exist and can be selected from, without reading supplier rows.
  It returns `200 {"status":"ready"}` on success or a sanitized
  `503 SERVICE_NOT_READY` for missing configuration, connection failures,
  missing tables, insufficient permissions, or query timeouts. Connection setup
  and SQL execution each have a two-second timeout; the entire probe has a
  five-second limit.
- Readiness checks Supplier PostgreSQL only. User Service authorization remains
  checked by authenticated API operations. Apply migrations before starting the
  application; the readiness probe does not create or migrate tables.
- The Docker image and root Compose health checks call `/health/ready` every
  ten seconds, with a six-second HTTP timeout, seven-second Docker timeout,
  ten-second startup grace period, and six failure retries. The frontend waits
  for Supplier readiness during Compose startup.
- The API can start while its database is unavailable. Liveness stays healthy,
  and later readiness requests recover when the database returns. Docker marks
  failed health checks unhealthy; it does not automatically restart the service
  or stop already-running dependents just because readiness fails.

### Linting and tests

From `supplier-service/`, run linting with `.venv/bin/ruff check app tests scripts`.
Ruff checks application code, tests, and scripts using the same rule groups as
the other Python services.
Run the HTTP tests with `.venv/bin/python -m pytest -q`. The database tests
cover readiness, categories, supplier reads, updates, deactivation, and seed replay.
They run when `SUPPLIER_TEST_DATABASE_URL` points to a migrated local Supplier database on port
55322; tests that create temporary suppliers remove them afterward. Without the
variable, database tests skip for local development. To include them using the
default local Supabase database:

```sh
npx supabase start
SUPPLIER_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55322/postgres' \
  .venv/bin/python -m pytest -q
```

To check the live authenticated path, send POST, PATCH, and DELETE requests with an
administrator token and confirm the changes in the Supplier Service database.
Seed SQL verifies the migration and sample data, but it does not exercise the
API.
The repository CI runs linting, starts an isolated PostgreSQL 17 container, applies
the committed Supplier migrations and seed data, and runs both API and database
tests before building the Docker image. It then starts that image against the
same temporary database and requires successful `/health/ready` and
`/health/live` responses. The test database uses loopback port 55322 and
disposable test credentials; no hosted Supabase credentials or running
User Service are needed. CI fails if any tests skip or the built container fails
its smoke test, shows container logs on failure, and removes both the API and
database containers and their volumes after the job, including on failure.
These checks run for Supplier Service changes on pull requests to `main` and
pushes to `main`.

## Database choice

Supplier Service owns a dedicated PostgreSQL database, hosted in its own
Supabase project. PostgreSQL fits the structured supplier fields, category
relationships, constrained status, atomic uniqueness rules, and the browsing
queries in the D2 backlog. A unique index resolves concurrent attempts to
create the same supplier; transactions keep a rejected write from changing
existing records.
The service accesses PostgreSQL through its backend API. Clients do not access
the database directly.

The D2 backlog expects at least 1,000 supplier records and, in a later
performance milestone, retrieval, search, filtering, and sorting within two
seconds at the 95th percentile. The initial schema indexes duplicate identity
and category assignment. Add listing and search indexes only
after measuring real queries against representative data and concurrent requests.

## Schema

The same migration is applied to local and hosted Supplier Service databases:
[`supabase/migrations/20260923000000_create_suppliers.sql`](supabase/migrations/20260923000000_create_suppliers.sql).
It creates the `supplier_service` schema in this service's database.

### Local database

With Docker Desktop running, start this service's local Supabase stack from
`supplier-service/`:

```sh
npx supabase start
```

The first start applies the migration and `supabase/seed.sql`. The local
database uses port 55322 and its Studio is at `http://127.0.0.1:55323`.
These ports differ from User Service's local Supabase ports so both stacks can
run at once. The ignored `.env` points FastAPI to this local database.

To discard local changes and restore the migrated schema and seed data:

```sh
npx supabase db reset --local
```

This reset affects this local Supplier Service database. Stop its containers
with `npx supabase stop` when you are finished. The hosted Supabase project is
separate and is unaffected by these local commands.

### Hosted database

From `supplier-service/`, link the Supabase CLI to a dedicated hosted Supplier
Service project. For a new development project, preview and apply the migration
with its sample data:

```sh
npx supabase login
npx supabase link --project-ref YOUR_SUPPLIER_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push --include-seed
```

The project ref appears in the Dashboard URL. Later migrations, including the
campus data expansion below, use `npx supabase db push` without `--include-seed`.
In the hosted Dashboard SQL Editor, verify a fresh import with:

```sql
SELECT count(*) FROM supplier_service.suppliers;           -- 131 on a fresh database
SELECT count(*) FROM supplier_service.supplier_categories; -- 150 on a fresh database
```

Keep database credentials out of Git. The Supabase CLI tracks applied
migrations in the hosted project.

The `suppliers` table contains:

| Column | PostgreSQL type | Rule and purpose |
| --- | --- | --- |
| `id` | `uuid` | Primary key generated by the database; immutable. |
| `name` | `text` | Required, nonblank supplier name. |
| `building_area` | `text` | Required, nonblank building or campus area. |
| `pickup_location_description` | `text` | Required, nonblank pickup instructions. |
| `floor` | `text` | Optional; blank values are treated as missing for duplicate detection. |
| `latitude`, `longitude` | `numeric(12,9)` | Optional pair; both must be present or absent and within geographic bounds. |
| `opening_time`, `closing_time` | `time without time zone` | Optional pair in 24-hour Singapore local time (`Asia/Singapore`). |
| `image_url` | `text` | Optional HTTP or HTTPS URL; the API validates complete URL syntax. |
| `status` | `supplier_status` | `ACTIVE` by default or `INACTIVE`. |
| `created_at`, `updated_at` | `timestamptz` | Database-generated timestamps; updates refresh `updated_at`. |

The category relationship uses two additional tables:

| Table | Columns | Relationship |
| --- | --- | --- |
| `categories` | `code` (text primary key), `display_name` (text) | Allowed category codes and UI labels. |
| `supplier_categories` | `supplier_id` (UUID), `category_code` (text) | Composite primary key; foreign keys to `suppliers.id` and `categories.code`. |

`categories` is a lookup table of category codes and display names, initially
seeded with `FOOD`, `COFFEE`, `SHOPPING`, `PRINTING`, `LANDMARK`, and `OTHERS`.
`supplier_categories` joins suppliers to one or more categories. Its foreign
keys reject unknown categories, and its primary key prevents a category being
assigned twice to the same supplier. A deferred database check requires at
least one category when the transaction commits, so the backend must save the
supplier and category assignments in one transaction.
Category assignment changes also refresh the supplier's `updated_at` value.
Adding a category means inserting a lookup row through a versioned data change;
the table structure stays the same. The backend should validate category codes
against the lookup table rather than a hard-coded list.

There are no cross-service foreign keys. Other services can store the immutable
supplier UUID and obtain supplier information through the Supplier Service API.

The unique index covers normalized `(name, building_area, floor)` across both
statuses. Normalization lowercases, trims surrounding whitespace, collapses
repeated whitespace, and maps a missing or blank floor to the same value. This
enforces the backlog's duplicate rule even when concurrent requests race.
The database checks required text, nonempty, known, and non-repeated category
assignments, paired and bounded coordinates, and paired operating times. The
API must validate original operating-time strings as exact 24-hour `HH:mm`
(`^(?:[01][0-9]|2[0-3]):[0-5][0-9]$`), validate complete HTTP(S) URL syntax
and partial-update semantics, and return field-level errors. PostgreSQL's
`time` type stores a value but cannot distinguish input `09:00` from `9:00`.
Creation requests must not accept client-supplied `id`, `created_at`, or
`updated_at` values, so the database generates them as intended.

Opening and closing times are recurring wall-clock times in `Asia/Singapore`.
The API should compare them with the current Singapore local time and allow
overnight ranges such as 11:00 to 02:00. `created_at` and `updated_at` are
absolute `timestamptz` values; display them in Singapore time when needed.

## Query patterns shaped by the schema

| Operation | Predicate and ordering | Index support |
| --- | --- | --- |
| Detail by ID | `id = ?` | Primary key. |
| Normal listing | `status = ACTIVE`, ordered by name and ID | Scan and sort initially; add an index if measurements justify it. |
| Management listing | Both statuses, optionally filtered by status | Sort the small result set; add an index if measurements justify it. |
| Category filter | `EXISTS` on `supplier_categories` for any selected code, so each supplier appears once | Category/supplier index. |
| Search | Case-insensitive partial match on name, building/area, or pickup description | Scan initially; consider `pg_trgm` indexes if measured search latency requires them. |

Search and filters can be combined. Name is the default ascending sort; a
stable ID tie-breaker supports deterministic pagination. The API will apply
page 1 and page size 20 when the client omits them. Normal users see only
`ACTIVE` records; administrator listings may include both statuses.

## Supplier seed data

[`../data/csv/supplier-seed-data.csv`](../data/csv/supplier-seed-data.csv)
contains 131 suppliers and campus pickup locations: the original 21 plus 110
NUS locations, including 13 printing entries in total. The additions cover
Kent Ridge, University Town, and Bukit Timah. See
[`../data/csv/README.md`](../data/csv/README.md) for online sources, per-entry
provenance, and the conventions for missing coordinates and operating hours.
All CSV image URLs are empty.

The committed [`supabase/seed.sql`](supabase/seed.sql) inserts missing entries
after migrations. The generator decodes the Windows-1252 CSV to UTF-8, splits
types such as `Food/Coffee` into two category assignments, and converts
`0900hrs` to `09:00`. It ignores
the CSV's `ImageURL` column, so every seeded supplier has a `NULL`
`image_url`; the app does not handle images. The database generates IDs,
timestamps, and the default `ACTIVE` status. All suppliers and their category assignments are inserted in
one transaction because the category requirement is checked at commit.
Existing normalized name/building/floor identities are skipped together with
their category assignments, preserving IDs, timestamps, status, and admin edits
when the seed runs again.

The frozen data migration
[`20261110000000_expand_nus_campus_suppliers.sql`](supabase/migrations/20261110000000_expand_nus_campus_suppliers.sql)
adds the 110 new locations to existing databases. It also skips identities
that already exist. To add them without resetting data, run from this directory:

```sh
# Existing local Supplier Supabase:
npx supabase migration up --local

# Existing linked hosted Supplier development project:
npx supabase db push --dry-run
npx supabase db push
```

For a new database, migrations load the expansion and the seed adds any remaining
entries. A fresh setup has 131 suppliers and 150 category assignments. Existing
databases can have different totals because administrator-managed data is retained.
Do not regenerate an already-applied migration when the CSV changes later.

After editing the CSV, regenerate and check the seed using Python 3 (no extra
Python packages are required):

```sh
python3 scripts/generate_seed.py
python3 scripts/generate_seed.py --check
```

SQL seeding is a trusted setup operation that bypasses API role checks.
Supplier creation in the application must go through the authenticated backend
and its administrator authorization check. Use API requests, not seeded rows,
to demonstrate that a non-admin cannot create a supplier.

## Reset the hosted development database

From `supplier-service/`, check the linked project and reset it:

```sh
npx supabase projects list
npx supabase db reset --linked
```

This deletes the hosted project's data, then reruns all migrations and
`supabase/seed.sql`. Use it only when that project's data can be discarded.

## Requirement trace

- **Implemented by this migration:** D2 Supplier Service point 1 (database
  choice and concrete schema); the storage and relationships for M2F1.1.1;
  default status (M2F1.1.2); immutable ID (M2F1.1.3); timestamps
  (M2F1.1.4, M2F1.2.4-M2F1.2.5); database-enforceable parts of creation and
  update validation (M2F1.1.5, M2F1.2.2); normalized uniqueness on creation
  and update (M2F1.1.6, M2F1.2.3); and the concurrent duplicate safeguard
  (M2NFR3.1).
- **Requires Supplier Service API work:** exact input `HH:mm` and HTTP(S) URL
  validation, field-level error responses, partial-update and optional-field
  removal semantics (M2F1.1.5, M2F1.1.7, M2F1.2); deactivation that retains
  every supplier (M2F1.3; permanent deletion is out of scope); listing, details, search,
  filters, sorting, and pagination (M2F2-M2F3); and authentication and
  administrator authorization (M2F4). D2 Supplier Service points 2-4 also
  require working APIs and integration. The D2 point 5 UI is separate work.
- **Requires integration and verification:** administrative supplier-action
  auditing (M1F5.4.3-M1F5.4.4) and the applicable reliability, security, and
  performance requirements in M2NFR1-M2NFR4. The database unique index is
  the safeguard for M2NFR3.1, but its concurrent behavior still needs a
  running-database test.

The source documents are `CS3219-Instructions-MilestoneD2.pdf`, page 3, and
`CS3219-Milestone-Backlog-Latest.pdf`, pages 6-10 and 19.
