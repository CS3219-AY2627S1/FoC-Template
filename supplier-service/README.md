<!-- AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28 to 2026-09-30
Scope: Documentation — describe database migration, role setup, and observed verification. Refactoring and documentation improvements — update migration-gated deployment, readiness/liveness behavior, inspection, recovery, and verification guidance (2026-09-29).
Scope: Refactoring and documentation improvements — document future API/import calls to aggregate validation, omission versus null, stored-time PATCH merging, caller-supplied category IDs, safe error responses, test commands, and coverage against the domain-input guide.
Scope: Refactoring and documentation improvements — document the executable seed dry run, JSON diagnostics, exit behavior, daily schedules, identity-preserving review, and future persistence classification.
Scope: Refactoring and documentation improvements — replace source-only dry-run instructions with configuration, bootstrap/migration/grant prerequisites, explicit preview/import commands, JSON outcomes, identity and lock behavior, and isolated verification guidance. (ai-20260930-012)
Scope: Refactoring and documentation improvements — document mounted public reads, protected administrator dependencies, the verified identity contract, lifecycle and error mappings, verification commands, and a test-only live login/logout and simulated-outage smoke harness with prerequisites and observed limits. (ai-20260930-022)
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Refactoring and documentation improvements; Writing implementation code — document implemented administrator POST, canonical examples, validation and atomic persistence, future feature boundaries, verification results, and a mounted-route live smoke procedure with authorized provisioning prerequisites. (ai-20261001-005)
Author review: Keith confirmed review of all affected changes, including the dry-run documentation (ai-20260930-008). Keith confirmed review of the packaging changes (ai-20260930-012). Keith confirmed review of public-read registration changes (ai-20260930-022).
Author review: Keith confirmed review of the retained creation documentation and smoke procedure for ai-20261001-005.
Scope: Refactoring and documentation improvements — replace stale PATCH implementation-status claims using the mounted route, update service, and API/integration tests; document administrator authentication, positive expected versions, editable fields and merged validation, complete saved/conflict examples, atomic rollback and safe errors, test links and prerequisites, and separate historical results from recommended reruns while retaining planned DELETE and administrative-read boundaries. (ai-20261001-009)
Author review: Keith confirmed review of the retained PATCH documentation (ai-20261001-009).
Tool: Codex (model: GPT-6), date: 2026-10-01
Scope: Refactoring and documentation improvements — document mounted DELETE and administrator GET contracts, version and status validation, retained data, repeat deletion, PATCH lock arbitration, seed reimport preservation, order-owned pickup snapshots and separate future service authentication, canonical examples, test links and prerequisites; preserve historical verification and correct the remaining stale retrieval sentence with an administrator-read section link. (ai-20261001-014)
Author review: Keith confirmed review of the retained README work and follow-up correction (ai-20261001-014).
Details: ai/usage-log.md; ai-20260929-001; ai-20260929-004; ai-20260930-003; ai-20260930-008; ai-20260930-012; ai-20260930-022; ai-20261001-005; ai-20261001-009; ai-20261001-014
-->

# Supplier Service

The Supplier Service maintains the campus stores, facilities and locations
from which users can request pickups. It owns supplier information and
exposes an API for browsing and managing that information.

Other services access supplier information through the API. They do not
connect directly to the Supplier Service database.

The service provides validated startup configuration, `GET /health`,
`GET /ready`, interactive API documentation, and SQLAlchemy models for `supplier`,
`category`, and `supplier_category`. Application startup initializes a
database engine and session factory, and shutdown disposes of the engine.
Request-scoped sessions are closed without automatically committing;
the creation and seed-import services own transaction boundaries.

The API and a persistent PostgreSQL/PostGIS database run through Docker
Compose. A separate migration job shares the application image and applies
Alembic revisions before a newly created API starts. Migrations create the schema
and four controlled categories; startup and probes do not create tables.
See [schema operations](docs/migrations.md) for ordered installation, deployment
to an existing volume, role grants, recovery rehearsals, and integration tests.
Public supplier and reference-data reads and administrator-only `POST /suppliers`
and `PATCH /suppliers/{id}`, `DELETE /suppliers/{id}`, and administrator
`GET /admin/suppliers` and `GET /admin/suppliers/{id}` are mounted.

## Local Development

Use Python 3.12 (the `.python-version` file pins 3.12.12). From the repository
root, create the service's virtual environment and install dependencies:

```bash
cd supplier-service
python3.12 -m venv .venv
./.venv/bin/python -m pip install -r requirements-dev.txt
```

The development requirements include the runtime requirements. Keep `.venv/`
untracked; each developer creates their own environment.

Set configuration in the terminal where you will start the server:

```bash
export DATABASE_URL='postgresql+psycopg://test_user:test_password@localhost:5432/test_supplier'
export APP_ENV='development'
export USER_SERVICE_URL='https://localhost:8000'
export AUTH_TIMEOUT_SECONDS='3'
export LOG_LEVEL='INFO'
```

These URLs and credentials are dummy local examples. Startup validates settings
and creates the engine without connecting. `/health` needs neither a database
nor User Service. `/ready` needs a reachable, migrated database and runtime
permission to read its revision state; User Service is not contacted by either probe.

| Variable | Requirement |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection URL using `postgresql+psycopg` |
| `APP_ENV` | `development`, `test`, or `production`; defaults to `production` |
| `USER_SERVICE_URL` | Required HTTPS base URL for User Service in production; HTTP is also allowed in development and test |
| `AUTH_TIMEOUT_SECONDS` | Positive, finite number; defaults to `3.0` |
| `LOG_LEVEL` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`; defaults to `INFO` |

Settings are validated during application startup. Missing required values
or invalid values prevent startup. Production rejects HTTP User Service URLs
before creating the client or forwarding a bearer token. Keep certificate
verification enabled and configure a trusted HTTPS endpoint for production.
The local Compose Supplier Service, migration, and seed containers explicitly
use `APP_ENV=development`; production deployments must use `APP_ENV=production`
(or omit it) and an HTTPS `USER_SERVICE_URL`.
The root `.env.example` documents example
values; copying it to `.env` does not automatically load it into this
application. Export variables explicitly for local runs. Compose reads the
root `.env` and passes settings into the containers explicitly. Keep real
credentials out of committed files.

Start the API using the virtual environment's Python to avoid accidentally
running a globally installed Uvicorn:

```bash
./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8081
```

Open <http://127.0.0.1:8081/health> and expect HTTP 200 with
`{"status":"healthy"}`. Open <http://127.0.0.1:8081/docs> to inspect the API
and execute `GET /health` using **Try it out**. Neither endpoint requires
authentication. The health endpoint indicates application liveness; it does
not establish database readiness. `GET /ready` returns HTTP 200 with
`{"status":"ready"}` only when connectivity succeeds and installed Alembic heads
exactly match the nonempty packaged heads. Otherwise it returns HTTP 503 with
`{"status":"not_ready"}` and a generic diagnostic without connection details.
Stop the server with **Ctrl+C**.

Run the tests from `supplier-service/`:

```bash
./.venv/bin/python -m pytest tests/unit tests/api -q
```

Current unit and API tests use explicit dummy settings or temporary
environment variables and require no running database or User Service.
They cover the health response, configuration defaults and validation,
the required Psycopg driver scheme, rejection of invalid startup
configuration, database engine initialization and disposal, revision matching,
configuration/connection failures, connection release, and readiness recovery.
They also cover standalone domain checks, creation and merged PATCH validation,
the mounted administrator creation and PATCH endpoints, and shared HTTP 422 handlers.
POST and PATCH tests exercise real authentication dependencies with controlled
User Service responses, canonical output, safe errors, and request-session cleanup.
Explicit CSV import is available below.

### Integration-test database configuration

Database integration tests use `TEST_DATABASE_URL`, which must
be configured explicitly. The fixtures never fall back to `DATABASE_URL`.

The test URL must:

- Use `postgresql+psycopg`.
- Specify a database name ending in `_test`.
- Use a different database name from `DATABASE_URL`, when that variable is set.

These checks guard against accidental development-database use. Configure
the URL to point to a separate database reserved for tests.

Fixtures validate configuration and apply Alembic migrations to the explicitly
configured test database. Creation, update, and seed-import tests also create and drop
per-test databases because independent connections commit real transactions; an
outer rollback cannot isolate those writes. The test role must connect to the
`postgres` maintenance database, create/drop databases, install PostGIS, and apply
migrations. Use a dedicated test instance with the PostGIS extension available.
See [schema operations](docs/migrations.md) for disposable database setup and
optional privilege/lifecycle checks.

Current unit and API tests do not require `TEST_DATABASE_URL`.

## Docker Compose

Run these commands from the repository root. Docker must be running with
Linux container support. Stop any local Uvicorn process using port 8081
before starting the API container.

### Configuration

If a root `.env` does not already exist, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set these database initialization values in `.env`:

- `SUPPLIER_POSTGRES_DB`, for example `supplier_db`.
- `SUPPLIER_POSTGRES_USER`, for example `supplier_admin`.
- `SUPPLIER_POSTGRES_PASSWORD`, using a local development password.

Keep real credentials in the ignored `.env` file. Compose constructs the
database URL from these values; use letters and numbers for the local
password to avoid characters requiring URL encoding. The bootstrap database
account is reserved for bootstrap. Configure `SUPPLIER_MIGRATION_PASSWORD` and
`SUPPLIER_RUNTIME_PASSWORD`, then follow [schema operations](docs/migrations.md)
for configuration and deployment details. Compose provisions the roles and
runtime grants automatically before starting the API with its restricted role.

Compose reads `.env` for variable substitution and explicitly passes
settings into the containers. VS Code terminal environment injection is
not required. Existing shell variables take precedence over `.env` values.
`AUTH_TIMEOUT_SECONDS` defaults to `3` and `LOG_LEVEL` defaults to `INFO`
when unset or empty in the Compose environment.

### Fresh installation and later deployments

After configuring `.env`, start Supplier on its own or alongside the other
services. No manual SQL commands or shell exports are needed:

```bash
docker compose up -d --build --wait --wait-timeout 180 supplier-service
# Or start the whole application stack:
docker compose up -d --build --wait --wait-timeout 180
```

Compose orders startup as follows:

1. `supplier-db` becomes healthy.
2. `supplier-bootstrap` runs `database/bootstrap.sql` as the database administrator
   to enable PostGIS and provision the migration/runtime roles.
3. `supplier-migrate` applies Alembic migrations as `supplier_migrator`.
4. `supplier-grants` runs `database/runtime-grants.sql` as `supplier_migrator`.
5. `supplier-service` starts as `supplier_runtime` and becomes ready.

Each job must exit successfully before its dependent starts. The SQL scripts
are repeatable, so the same startup flow works with an existing Supplier volume
created by this setup or the previous documented role-based setup. Expect all
three jobs to exit with code 0 and healthy database/API containers. The API and
migration job share `foc-supplier-service:local` and run as application UID 10001.
The SQL jobs use the PostgreSQL client image and read-only script mounts. All
jobs have no HTTP health check, published ports, or automatic restart.

For each new image, use the [existing-volume deployment sequence](docs/migrations.md#deploying-a-new-image-with-the-existing-volume):
rebuild the shared image, stop the API for maintenance, remove the completed
setup jobs, then let Compose rerun bootstrap, migrations, and grants before
starting the API. A previously completed job does not prove a new
image has been migrated. Compose dependencies do not schedule every deployment
or stop an API that is already running when a dependency fails.

### Probes and inspection

- Readiness: <http://127.0.0.1:8081/ready> — connectivity and exact migration heads;
  returns 200 with `{"status":"ready"}` or safe 503 with `{"status":"not_ready"}`.
- Liveness: <http://127.0.0.1:8081/health> — returns 200 with
  `{"status":"healthy"}` independently of database availability.
- API documentation: <http://127.0.0.1:8081/docs>.

The image health check uses `/ready` with a three-second HTTP timeout. Inspect
packaged versus installed revisions, the migration job, and container health:

```bash
curl -i --max-time 5 http://127.0.0.1:8081/ready
curl -i --max-time 5 http://127.0.0.1:8081/health
docker compose ps -a supplier-db supplier-bootstrap supplier-migrate supplier-grants supplier-service
docker compose logs --tail=80 supplier-bootstrap supplier-migrate supplier-grants supplier-service
docker compose run --rm --no-deps supplier-migrate python -m alembic heads
docker compose run --rm --no-deps supplier-migrate python -m alembic current
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q supplier-service)"
docker compose exec supplier-service id
```

Readiness recovers after database access, schema revisions, or grants are
repaired. See the [isolated recovery rehearsal](docs/migrations.md#isolated-deployment-and-recovery-rehearsal)
for outage, older-schema, and failed-migration checks that preserve persistent
data. A failed migration blocks a new API container; fix the cause and rerun the
job instead of resetting its database.

### Networking and storage

The API joins the shared application network and the private supplier
network. The setup jobs and database join only the private supplier network
and have no published host port. A `5432/tcp` entry in `docker compose ps` is not a host
port mapping. The API publishes only `127.0.0.1:8081`.

Inside the API container, the database address is `supplier-db:5432` and
the User Service address is `https://user-service:8080`. These names refer
to Compose services; `localhost` refers to the current container.

The named volume `supplier-db-data`, mounted at `/var/lib/postgresql/data`,
preserves database files when the database container is recreated. Compose
normally prefixes the volume name with the project name. Removing this
volume deletes the stored database contents.

Database initialization credentials apply when the data directory is
first created. Editing the password in `.env` afterward does not change
the existing PostgreSQL account password; change the account password in
PostgreSQL and update the corresponding configuration together.

To stop the supplier containers while retaining their data:

```bash
docker compose stop supplier-service supplier-db
```

### Implementation status

The database image extends PostgreSQL 16 with PostGIS packages. Its base
image is pinned to a multi-platform index digest supporting AMD64 and
ARM64. Compose builds for the host architecture without forcing AMD64
emulation. PostGIS packages installed through apt are not version-pinned,
so pinning the base image alone does not make the whole build immutable.

Local Apple Silicon checks have confirmed container health, the API
response, non-root API execution, PostGIS availability, and persistence
across database container recreation. The PostgreSQL cluster identifier
remained unchanged after recreation. Native AMD64 execution still needs
verification.

The administrator bootstrap enables PostGIS; migrations create the schema.
The API initializes its database engine and gates readiness on connectivity and
installed migration revisions. Public reads do not authenticate. The mounted
POST, PATCH, DELETE, and administrator GET endpoints use the reusable User
Service administrator dependency.
Compose gates new API startup on database health and successful bootstrap,
migration, and runtime-grant jobs.

Deployment verification on disposable data covered fresh bootstrap and grants,
upgrade from `0001` to packaged head `0002` on the same volume with a surviving
supplier row, database-outage and schema-repair readiness recovery, and a temporary
failed migration blocking new API startup before successful recovery. See the
[verification record](docs/migrations.md#observed-verification) for test results,
limits, and project-scoped cleanup commands.

## Initial Scope

Implemented:

- Administrator creation with one or more categories.
- Version-checked administrator updates and atomic replacement of category assignments.
- Public active-only listing and detail reads, with area/category filters.
- Explicit initial-dataset import and general daily opening schedules.
- Version-checked soft deletion with idempotent repeat deletion.
- Administrator listing and detail reads of active and deleted suppliers.

Restoration and editing deleted records are unsupported. Frontend status controls
are outside the implemented backend contract.

Direct supplier mutations are restricted to administrators. User-submitted
change requests and their approval workflow will be introduced later.

Supplier menus, product inventories, checkout and vendor payments are
outside this service's scope.

## Database

The database is PostgreSQL with PostGIS.

PostgreSQL stores supplier records, categories and their relationships.
PostGIS stores geographic pickup points and supports future distance
filtering and sorting.

The initial schema contains three tables:

| Table | Responsibility |
| --- | --- |
| `supplier` | Supplier details, availability and general daily hours |
| `category` | Controlled category definitions |
| `supplier_category` | Assignments between suppliers and categories |

### Relationships

A supplier must have at least one category. A category may be assigned to
any number of suppliers, including none.

```mermaid
erDiagram
    SUPPLIER ||--|{ SUPPLIER_CATEGORY : "has assignments"
    CATEGORY ||--o{ SUPPLIER_CATEGORY : "is assigned through"

    SUPPLIER {
        uuid id PK
        text name
        text area
        geography location
        text description
        text building
        text floor
        text image_key
        time opening_time
        time closing_time
        smallint closing_day_offset
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
        integer version
    }

    CATEGORY {
        uuid id PK
        text name UK
    }

    SUPPLIER_CATEGORY {
        uuid supplier_id PK, FK
        uuid category_id PK, FK
    }
```

## Supplier Table

Mandatory fields cannot be null. Server-managed fields are populated by
the service rather than accepted as ordinary user-editable inputs.

| Field | PostgreSQL type | Mandatory | Ownership and purpose |
| --- | --- | --- | --- |
| `id` | `UUID` | Yes | Server-generated, immutable random UUID primary key |
| `name` | `TEXT` | Yes | Nonblank supplier name |
| `area` | `TEXT` | Yes | General campus area from a controlled list |
| `location` | `GEOGRAPHY(Point, 4326)` | Yes | Geographic pickup location |
| `description` | `TEXT` | No | Additional pickup directions |
| `building` | `TEXT` | No | Building name or identifier |
| `floor` | `TEXT` | No | Floor label, such as `1` or `B1` |
| `image_key` | `TEXT` | No | Reference to an externally stored image |
| `opening_time` | `TIME WITHOUT TIME ZONE` | No* | General daily opening time |
| `closing_time` | `TIME WITHOUT TIME ZONE` | No* | General daily closing time |
| `closing_day_offset` | `SMALLINT` | No* | Server-derived: `0` for same-day closing or `1` for next-day closing |
| `created_at` | `TIMESTAMPTZ` | Yes | Server sets on creation |
| `updated_at` | `TIMESTAMPTZ` | Yes | Server sets on creation and modification |
| `deleted_at` | `TIMESTAMPTZ` | No | Null while active; server sets on soft deletion |
| `version` | `INTEGER` | Yes | Starts at `1` and increments on modification |

*The three opening-hours fields must either all be populated or all be null.*

### Supplier Identifier

Supplier IDs are immutable, server-generated random UUIDs. This chosen identity
scheme replaces D1's location-and-name hash. Generate the UUID once when
creating a supplier. Store it
using PostgreSQL's native `UUID` type and enforce uniqueness through the
primary key.

The ID is independent of the supplier's name and coordinates and remains
unchanged when the supplier is renamed, edited or soft-deleted.

Duplicate supplier checks are separate from primary-key uniqueness:
creating the same supplier twice would otherwise produce two different IDs.
Only active records participate in duplicate detection. Compare names after
trimming leading/trailing whitespace and lowercasing, and require exactly equal
numeric latitude and longitude. Preserve display capitalization. Area does not
affect duplication: same-name branches at different coordinates are allowed,
and different names may share coordinates.

The existing `uq_supplier_active_name_location` partial unique index enforces
`lower(btrim(name))` and exact stored longitude/latitude equality for rows with
`deleted_at IS NULL`. There is no coordinate rounding or proximity matching.
Creation maps only SQLSTATE `23505` for this index to `409 Conflict`; unrelated
integrity errors are not duplicate conflicts. The database index protects
concurrent requests: after a competing commit one create succeeds and the other
conflicts; after rollback the waiting create can succeed. Deleted records do not
block a new supplier with a new UUID. Their values and category assignments remain
unchanged, and historical references continue to identify the deleted record.
The update service applies the same duplicate rule to renames.

The seed importer must use stable seed identifiers or a persistent mapping
to existing supplier UUIDs. It must not generate fresh UUIDs for the same
seed records on every run or overwrite existing records on an ID conflict.

### Location Details

Location fields serve different purposes:

| Field | Example | Purpose |
| --- | --- | --- |
| `area` | `Science` | Broad campus grouping and filtering |
| `building` | `S16` | Specific building |
| `floor` | `1` | Specific floor |
| `description` | `Near the entrance facing the bus stop` | Additional directions |
| `location` | Latitude and longitude | Geographic pickup point |

`area` uses a controlled list to avoid inconsistent values such as
`Science`, `Sci` and `Faculty of Science`. The initial implementation can
maintain this list in service validation without introducing an area table.

The initial values are `Engineering`, `FASS`, `SoC`, `BIZ`, `PGP`, `Science`,
`USC/UHC`, `UTown`, `YIH`, `YST`, and `KR/NUH`. Each slash-separated label is
one combined area. `GET /areas` exposes the approved choices. Adding a value
requires updating validation and deploying; renaming, merging, or removing
values also requires migrating affected suppliers and updating seed mappings
and clients. Building-to-area mappings still require review.

The geographic point should identify the pickup point or accessible
entrance as accurately as possible.

The API may represent coordinates as named `latitude` and `longitude`
properties. PostGIS point construction uses longitude first, then latitude.

Under the existing D1 requirement, geographic coordinates are supplied
during creation and are immutable during ordinary updates.

### Opening Hours

Initially, a supplier has one general schedule applying equally to every
day from Monday through Sunday.

All opening and closing times are interpreted in `Asia/Singapore`.

| Opens | Closes | Offset | Meaning |
| --- | --- | --- | --- |
| `10:00` | `19:30` | `0` | Opens and closes on the same day |
| `18:00` | `02:00` | `1` | Closes at 02:00 the following day |
| `00:00` | `00:00` | `1` | Open for 24 hours |
| `NULL` | `NULL` | `NULL` | Hours are unknown |

Validation rules:

- Clients supply opening and closing times only; reject client-supplied
  `closing_day_offset` on POST and PATCH.
- Derive offset `0` when closing is later than opening, otherwise `1`. Equal
  times mean open for 24 hours.
- Both times null mean unknown hours and produce a null offset. Reject a
  resulting schedule with only one populated time with `422`.
- Store all three fields populated together, or all three null.
- Accept only `0` or `1` as a populated closing-day offset.
- Require the represented duration to be greater than zero and no more
  than 24 hours.
- Treat unknown hours as unknown, rather than closed or always open.
- Store the closing time and offset separately. The UI may display them
  as `02:00 next day` or `02:00+1`.

For a partial update, validate the resulting record. Updating only the
closing time retains the existing opening time and recalculates the offset.
Changing only the opening time also recalculates the offset. Clearing a known
schedule requires both times to be explicitly null. A validation failure
rejects the entire request, including unrelated field changes.

The initial CSV does not specify weekdays. Treating its hours as applicable
every day is an assumption that must be documented during import.

### Optional Values

Store absent optional values as SQL `NULL` and return them as JSON `null`.

Normalize empty or whitespace-only optional text to null.

Suggested UI behaviour:

| Missing value | UI behaviour |
| --- | --- |
| `description` | Omit additional directions |
| `building` | Show the supplier name and map location |
| `floor` | Omit the floor label |
| `image_key` | Show a standard placeholder image |
| Opening-hours fields | Display "Hours unknown" |

Image files are stored separately from the database. Initially, bundle the
six seed images in `frontend-service/public/images/suppliers/` inside the
frontend container. Supplier Service stores and returns filename keys, such as
`ANNA.jpeg`; the frontend resolves `/images/suppliers/ANNA.jpeg` on its own
origin and displays a placeholder for null. Keep original files in `data/images/`
and copy them during asset integration. Image updates require a frontend
rebuild; runtime uploads are outside the initial implementation.

## Category Table

Categories form a controlled vocabulary, such as `Food`, `Coffee`,
`Shopping` and `Printing`.

| Field | PostgreSQL type | Mandatory | Purpose |
| --- | --- | --- | --- |
| `id` | `UUID` | Yes | Server-generated primary key |
| `name` | `TEXT` | Yes | Unique, nonblank category name |

Trim category names and apply a consistent case-insensitive uniqueness
policy so `Food` and `food` cannot be created as separate categories.

No optional fields are required initially.

## Supplier Category Table

This table implements the many-to-many relationship between suppliers
and categories.

| Field | PostgreSQL type | Mandatory | Purpose |
| --- | --- | --- | --- |
| `supplier_id` | `UUID` | Yes | Foreign key to `supplier.id` |
| `category_id` | `UUID` | Yes | Foreign key to `category.id` |

Constraints:

- Use `(supplier_id, category_id)` as the composite primary key.
- Silently deduplicate repeated valid category IDs on create and update.
  Validate unknown entries using their original request positions before
  deduplication. Store and return each assignment once; the frontend uses
  category IDs as keys and displays each category once.
- Prevent duplicate category assignments at the database level as well.
- Require referenced suppliers and categories to exist.
- Reject category deletion while assignments still reference it.
- Require at least one category when creating a supplier or replacing
  its categories.

The foreign keys do not enforce the minimum of one category per supplier.
The service enforces this rule within the same transaction as the mutation.

For example:

| Supplier | Category |
| --- | --- |
| Campus Café | Food |
| Campus Café | Coffee |
| Library Printer | Printing |

Retain category assignments when a supplier is soft-deleted.

## CRUD Behaviour

### Create

`POST /suppliers` is implemented. Send `Content-Type: application/json` and
`Authorization: Bearer <opaque-session-token>` for an active administrator.
`require_admin` verifies that identity through User Service before creation or
supplier database access. OpenAPI declares HTTP bearer security and the canonical
`SupplierResponse` for HTTP `201 Created`.

| Create input | Contract |
| --- | --- |
| `name`, `area` | Required nonblank strings, trimmed; `area` must be an approved value from `GET /areas`. Display-name capitalization is preserved. |
| `location` | Required object with finite `latitude` and `longitude` in geographic bounds; numeric strings are accepted. Stored as longitude-first SRID 4326 geography. |
| `category_ids` | Required nonempty array of existing UUIDs from `GET /categories`; valid repeated IDs produce one assignment each. |
| `description`, `building`, `floor`, `image_key` | Optional strings or null; whitespace is trimmed and blank values become null. Floor labels remain strings. |
| `opening_time`, `closing_time` | Optional local daily times without a timezone. Supply both or neither/null; one missing/null time is invalid. Later closing derives offset 0; earlier or equal closing derives offset 1. Equal times mean 24 hours. |

The server owns `id`, `created_at`, `updated_at`, `deleted_at`, `version`, and
`closing_day_offset`; supplying any of them is a 422 validation error. Other extra
fields, including role selection or response-only `categories`, are also rejected.
There is no `expected_version` requirement for creation.

The body must be a JSON object. Malformed JSON, non-object input, missing or
empty categories, unknown IDs, invalid coordinates, and invalid schedules return
422. A usable object with a blank name, unknown category IDs, and one populated
schedule time can report all those independent issues together. Category error
positions refer to the original array before valid IDs are deduplicated.

Complete request body (the category UUIDs below are the migrated Food and Coffee
IDs; obtain current choices from `GET /categories`):

```json
{
  "name": " Campus Café ",
  "area": "Science",
  "location": {"latitude": 1.291876, "longitude": 103.781234},
  "category_ids": [
    "90909a88-65cc-4150-8b71-abc339d0c033",
    "92f0136e-5617-4380-9367-b2991ceda339"
  ],
  "description": null,
  "building": "S16",
  "floor": "1",
  "image_key": null,
  "opening_time": "22:30:00",
  "closing_time": "02:15:00"
}
```

Example HTTP 201 response (the supplier UUID and timestamps are illustrative
server-generated values):

```json
{
  "id": "a98f9ffd-1d20-4b9d-88f0-585039d5949a",
  "name": "Campus Café",
  "area": "Science",
  "location": {"latitude": 1.291876, "longitude": 103.781234},
  "categories": [
    {"id": "92f0136e-5617-4380-9367-b2991ceda339", "name": "Coffee"},
    {"id": "90909a88-65cc-4150-8b71-abc339d0c033", "name": "Food"}
  ],
  "description": null,
  "building": "S16",
  "floor": "1",
  "image_key": null,
  "opening_time": "22:30:00",
  "closing_time": "02:15:00",
  "closing_day_offset": 1,
  "created_at": "2026-10-01T02:03:04.123456Z",
  "updated_at": "2026-10-01T02:03:04.123456Z",
  "deleted_at": null,
  "version": 1
}
```

`create_supplier(session, payload)` begins one service-owned transaction on the
fresh request session before looking up categories. It validates the raw JSON
against existing UUIDs, generates one random UUID and one aware UTC timestamp,
and inserts the supplier and all deduplicated assignments together. Creation and
update timestamps are initially equal, version is 1, and deletion state is null.
It flushes and builds a detached `SupplierRead` inside the transaction, commits,
then returns it for `SupplierResponse.from_read`. The result includes all nullable
fields and category objects sorted by name/UUID, and matches the public detail
response after commit.

Invalid input writes nothing. Insert, assignment, or detail-loading failures
before commit roll back the whole transaction. If a commit acknowledgement is
lost, the server may already have committed: a 503 does not prove that no row
exists. The service never automatically retries a write; inspect the resulting
public records before deciding what to do next. See the exact active duplicate
and deleted-record recreation policy under [Supplier Identifier](#supplier-identifier).

### Read

Normal listings include only active suppliers:

```sql
WHERE deleted_at IS NULL
```

Return categories as an array alongside supplier details. The API hides the
linking-table structure from consumers. The [creation example](#create) shows the
complete canonical representation used by both POST and public detail GET.

Lists return `{ "items": [...], "total": 42, "limit": 20, "offset": 0 }`.
`total` counts suppliers matching all filters before pagination. Default limit
is 20, maximum 100, and default offset is 0; require limit 1–100 and nonnegative
offset. Sort by name then ID. Repeated `category_id` filters match any selected
category, without duplicate suppliers; combine categories with an area filter
using AND.

Deleted suppliers return 404 through public detail reads. Verified administrators
can retrieve active and deleted records through the implemented
[administrator reads](#administrative-listings).

### Update

Implemented: `PATCH /suppliers/{id}?expected_version=1` requires a UUID supplier
ID, `Authorization: Bearer <session-token>`, and an active account whose `admin`
role is verified through User Service. The query parameter `expected_version` is
required and must be a positive integer: supply the version on which the edit is
based, obtained from a supplier response. Missing, malformed, zero, or negative
values return the shared 422 envelope with `query.expected_version` paths.
Invalid supplier UUIDs use `path.id`; malformed JSON uses `INVALID_JSON`.

The body must be a JSON object. The editable fields are `name`, `description`,
`area`, `building`, `floor`, `image_key`, `opening_time`, `closing_time`, and
`category_ids`. This expands D1's name-and-description-only updates.

- Omitted fields preserve stored values and category assignments.
- Explicit null clears optional text; blank optional text normalizes to null.
  Required `name`, `area`, and `category_ids` cannot be null.
- Supplied `category_ids` replaces the complete selection. It must be nonempty;
  valid repeated IDs are deduplicated. Unknown IDs retain their original input
  positions in validation issues. Obtain choices from `GET /categories`.
- One supplied schedule time is validated against the other stored time. The
  server derives `closing_day_offset`: 0 for later closing, 1 for earlier or equal
  closing. Clear both times together for unknown hours; clearing only one fails.
- Coordinates are immutable. `location`, `id`, timestamps, `deleted_at`, `version`,
  `closing_day_offset`, and body `expected_version` are forbidden, as are unknown
  fields. The query version is a precondition, not an editable body value.

For example, start from the version-1 supplier in the [creation example](#create).
This request clears the floor, replaces both categories with Coffee, and changes
only the closing time, using stored opening time `22:30:00`:

```http
PATCH /suppliers/a98f9ffd-1d20-4b9d-88f0-585039d5949a?expected_version=1 HTTP/1.1
Authorization: Bearer <session-token>
Content-Type: application/json

{
  "floor": null,
  "category_ids": ["92f0136e-5617-4380-9367-b2991ceda339"],
  "closing_time": "23:30:00"
}
```

Complete HTTP 200 response (the update timestamp is illustrative):

```json
{
  "id": "a98f9ffd-1d20-4b9d-88f0-585039d5949a",
  "name": "Campus Café",
  "area": "Science",
  "location": {"latitude": 1.291876, "longitude": 103.781234},
  "categories": [
    {"id": "92f0136e-5617-4380-9367-b2991ceda339", "name": "Coffee"}
  ],
  "description": null,
  "building": "S16",
  "floor": null,
  "image_key": null,
  "opening_time": "22:30:00",
  "closing_time": "23:30:00",
  "closing_day_offset": 0,
  "created_at": "2026-10-01T02:03:04.123456Z",
  "updated_at": "2026-10-01T02:04:05.123456Z",
  "deleted_at": null,
  "version": 2
}
```

Submitting the same valid edit again with `expected_version=1` returns HTTP 409:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This supplier has changed. Reload it before trying again."
  }
}
```

Reload the supplier and let the administrator review the latest values before
submitting another edit. The conflict response includes neither the current
version nor supplier data. Do not automatically retry. Stale versions conflict
even when editing a different field or asking for values already stored. With a
matching version, category-only edits, unchanged-value edits, and `{}` each
increment `version` exactly once and set a new aware UTC `updated_at`.

`update_supplier` owns one transaction: it loads an active editable snapshot,
validates the merged body against existing categories, then executes a conditional
UPDATE matching ID, expected version, and active state. That statement changes
scalars, derived offset when a time is supplied, version, and update timestamp.
Category replacement runs only after the conditional write succeeds. Scalars and
relationships are refreshed into a detached `SupplierRead`, exposed only after
commit; the canonical response matches a subsequent public detail read.

A missing/deleted target returns 404 `SUPPLIER_NOT_FOUND`. After a failed
conditional write, a fresh database lookup distinguishes an unavailable target
(404) from an active stale target (409 `VERSION_CONFLICT`). Duplicate renames
return 409 `SUPPLIER_DUPLICATE`. Invalid bodies return aggregate 422
`VALIDATION_ERROR`. Known storage failures return 503 `DATABASE_UNAVAILABLE`;
authentication failures use the separate [error contract](#authentication-and-http-contract).
Validation and pre-commit failures roll back all edits, including assignments
removed during replacement, scalar values, schedule offset, version, and timestamp.
Only the active-name/location unique violation is translated to a duplicate;
unrelated integrity/programming errors are not mislabeled as conflicts.
If commit acknowledgement is lost, the database may already have committed:
503 does not prove rollback. Writes are never retried automatically; reload to
inspect the result before deciding on another edit.

### Delete

`DELETE /suppliers/{id}?expected_version=N` requires a verified administrator,
a UUID path ID, and a positive integer version. There is no request body.
Missing, malformed, zero, or negative versions and malformed UUIDs return the
existing `422 VALIDATION_ERROR` envelope, even for already deleted records.

`delete_supplier` owns one transaction and locks the row with `SELECT FOR UPDATE`,
including deleted rows, refreshing stored state after a competing writer completes.
For an active row, a matching version sets `deleted_at` and `updated_at` to one
aware UTC timestamp and increments `version` once. All other fields, coordinates,
creation timestamp, and category assignments survive. The route returns an empty
`204 No Content` only after transaction completion. Ordinary listing excludes the
row and ordinary detail returns `404 SUPPLIER_NOT_FOUND`.

A missing identity returns `404 SUPPLIER_NOT_FOUND`. A stale version on an active
row returns `409 VERSION_CONFLICT` without modifying it. An already deleted row
returns an empty 204 for any valid positive version, including a stale version,
without a write: its original deletion/update timestamps, version, fields, and
assignments stay unchanged. Authentication and parameter validation still apply.

For example, deleting the version-2 row in the [update example](#update):

```http
DELETE /suppliers/a98f9ffd-1d20-4b9d-88f0-585039d5949a?expected_version=2 HTTP/1.1
Authorization: Bearer <session-token>
```

Successful response has no JSON or other body:

```http
HTTP/1.1 204 No Content
```

Repeating that request after deletion also returns 204, though the stored version
is now 3. Missing-record response (HTTP 404):

```json
{"error": {"code": "SUPPLIER_NOT_FOUND", "message": "Supplier not found."}}
```

Stale active-record response (HTTP 409):

```json
{"error": {"code": "VERSION_CONFLICT", "message": "This supplier has changed. Reload it before trying again."}}
```

Row locking and conditional PATCH writes arbitrate concurrent requests:

| First committed mutation | Waiting request using the original version | Result |
| --- | --- | --- |
| PATCH | DELETE | 409; the complete edited active row and assignments remain. |
| DELETE | PATCH | 404; PATCH cannot change any scalar or assignment. |
| DELETE | DELETE | Both return 204; one version increment and one retained deletion timestamp. |

Failures roll back and release locks. Recognized database availability failures
return safe `503 DATABASE_UNAVAILABLE` with message
`Supplier deletion is temporarily unavailable.` Unexpected failures propagate;
writes are never retried automatically. A lost commit acknowledgement can leave
the result uncertain, so inspect administrator detail before deciding what to do.

Reimporting an existing seed UUID preserves its deleted state and all retained
fields, assignments, timestamps, and version; it does not restore or overwrite
that identity. Restoration, hard deletion, and editing deleted records are not
supported by these routes. PATCH remains active-only.

Order history uses the Order Service's own pickup snapshot. The supplier ID may
remain as a historical reference, but cross-service references are not database
foreign keys. Any future service access to deleted supplier records requires a
separate authentication contract; administrator GET routes are not a
service-to-service authorization mechanism.

## Authentication and HTTP Contract

Ordinary browsing is public. `GET /suppliers`, `GET /suppliers/{id}`,
`GET /categories`, and `GET /areas` require no session and never contact User
Service. They ignore Authorization headers, including invalid or expired
credentials. Ordinary supplier reads expose active suppliers only.

Creation, update, deletion, and administrator reads require an authenticated
account with a verified `admin` role. For protected operations,
forward opaque bearer tokens to User Service `GET /users/me`. Do not decode
JWTs or query its database. Use bounded timeouts and no authentication caching
initially. Administrator mode changes only frontend controls. Check the
verified account role on every protected request and never trust a mode/role header.

The contract was verified on `main` at
`f27533c16ad57f8fa9df0fdc72aef8c5cbf34e77`. Extract UUID `id`, `role` (`user`
or `admin`), and `status` (`active`) from the successful profile response and
ignore unrelated fields. User Service checks revocation, expiry, and account
status and refreshes the session inactivity deadline.

Public browsing must remain available independently of User Service
availability, subject to Supplier Service's own database dependencies. Client
construction and application startup must not contact User Service. Neither
`/health` nor `/ready` includes a User Service check. Protected operations
still depend on User Service and fail closed during an authentication outage.
All four public read adapters are mounted in the production application, with
no authentication dependencies or OpenAPI security requirements. The mounted
POST and PATCH routes use `require_admin`; the registered administrator router
applies it at router level to DELETE and both administrator GET routes. All declare
HTTP bearer security in OpenAPI.

Each application lifespan creates one reusable synchronous `UserServiceClient`
from the existing settings and stores it at `app.state.user_service_client`.
Synchronous dependencies run its blocking HTTP work in worker threads. The client
uses bounded timeouts, strips URL credentials, and never follows redirects.
Identity resolution is shared within a protected request through dependency
composition, but every new protected request checks User Service again.
Shutdown closes the client and disposes the database engine; partial startup
failures release resources already created. Client construction makes no network
request. No tokens, profile payloads, or upstream error bodies are logged.

On protected routes, return `401` for missing/invalid sessions and `403` for
insufficient permissions. Across the API, return
`404` for unavailable public records, `409` for active duplicates,
`422` for invalid input, and `503` for unavailable database/authentication
dependencies. Authentication failures apply only to protected routes and do
not interrupt public browsing. An authentication outage does not establish
that the user has logged out. Map upstream 401 to 401. Map every other non-200
response, transport failure, timeout, or malformed success response to 503.
An unknown role or non-active status in a success response violates the
verified contract and also produces 503. Do not follow redirects carrying tokens.
Use the `error.code` and `error.message` envelope with
`AUTHENTICATION_REQUIRED`, `FORBIDDEN`, and `AUTHENTICATION_UNAVAILABLE` for
401, 403, and authentication-related 503 respectively. Include
`WWW-Authenticate: Bearer` on 401.

POST returns `201 Created` with the complete saved supplier shown in the
[creation example](#create). PATCH returns `200 OK` with the complete saved
representation shown in the [update example](#update), after checking the expected
version. DELETE returns an empty `204 No Content` after transaction completion.

Implemented POST and PATCH failures use these envelopes:

| HTTP | `error.code` | Meaning |
| --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | Missing, malformed, expired, revoked, or rejected credentials; includes `WWW-Authenticate: Bearer`. |
| 403 | `FORBIDDEN` | User Service verified a regular user rather than an administrator. |
| 404 | `SUPPLIER_NOT_FOUND` | PATCH target is missing or deleted. |
| 409 | `VERSION_CONFLICT` | PATCH target is active but its version no longer matches; reload before another edit. |
| 409 | `SUPPLIER_DUPLICATE` | An active supplier already has the normalized name and exact stored point, regardless of area. |
| 422 | `VALIDATION_ERROR` | Invalid JSON or request values; includes safe field-level `details`. Independent issues in a usable object are aggregated. |
| 503 | `AUTHENTICATION_UNAVAILABLE` | Identity cannot be verified because User Service failed or returned an untrusted response. |
| 503 | `DATABASE_UNAVAILABLE` | A recognized database availability failure; POST returns `Supplier creation is temporarily unavailable.`; PATCH returns `Supplier update is temporarily unavailable.` |

Authentication/authorization failures never invoke protected supplier services or
issue supplier queries. Service errors expose no SQL, parameters, constraint names, or private
exception details. Unrelated integrity/programming failures are not relabelled as
duplicate conflicts. Example duplicate response:

```json
{
  "error": {
    "code": "SUPPLIER_DUPLICATE",
    "message": "An active supplier with this name and location already exists."
  }
}
```

### Creation, update, public-read, and authentication verification

From `supplier-service/`, with Python 3.12 and `requirements-dev.txt` installed
in `.venv`, run these database-independent checks:

```bash
./.venv/bin/python -m pytest tests/api/test_supplier_updates.py tests/api/test_supplier_creates.py tests/api/test_validation_errors.py tests/api/test_supplier_reads.py tests/api/test_health.py tests/api/test_readiness.py -q
./.venv/bin/python -m pytest tests/unit/test_user_service_client.py tests/api/test_auth.py tests/api/test_startup.py tests/api/test_validation_errors.py -q
./.venv/bin/python -m pytest tests/unit tests/api -q
```

The public-read tests use the real application factory, controlled supplier
services, and a recording User Service mock transport. They assert unchanged
responses for absent, user, administrator, malformed, expired, and revoked
credentials, including an authentication outage, with zero identity-resolution
or transport calls. Probe tests run with an unavailable authentication transport;
readiness still depends only on Supplier database/revision health. `/areas`
remains independent of both database access and session validation.

To verify mounted POST/PATCH/public detail routes, atomic persistence, exact
duplicates, rollback restoration, stale versions, and competing transaction outcomes:

```bash
./.venv/bin/python -m pytest tests/integration/test_supplier_updates.py tests/integration/test_supplier_creates.py -q
# Focus only on explicitly synchronized independent-connection transaction races:
./.venv/bin/python -m pytest tests/integration/test_supplier_creates.py -k post_concurrent -q
./.venv/bin/python -m pytest tests/integration/test_supplier_updates.py -k patch_concurrent -q
# Existing read and seed-import contracts:
./.venv/bin/python -m pytest tests/integration/test_supplier_reads.py tests/integration/test_seed_import.py -q
```

These commands require the [isolated PostGIS prerequisites](#integration-test-database-configuration):
explicit `TEST_DATABASE_URL` with `postgresql+psycopg`, a database ending `_test`
and distinct from `DATABASE_URL`, and permissions to create/drop disposable
migrated databases and install PostGIS. Do not substitute the application runtime
role, which should not have those test-administration privileges. The tests use
controlled administrator authentication, real request-scoped sessions, explicit
barriers, observed PostgreSQL blocking locks, and bounded waits. Fixtures clean up
committed data by dropping their disposable databases.

Implemented PATCH coverage is linked in
[API update tests](tests/api/test_supplier_updates.py) and
[PostGIS update tests](tests/integration/test_supplier_updates.py). API cases cover
administrator authorization, required positive versions, raw aggregate validation,
canonical output, safe errors, cleanup, and OpenAPI. Integration cases prove
same-version contenders have one complete winner, rollback restores deleted
assignments, duplicate renames preserve all stored values, stale/no-op rules hold,
and a competing deletion produces 404 after the conditional write fails. Earlier
cases set deletion state directly; the mounted DELETE/PATCH lifecycle cases now
exercise the implemented deletion service under real database contention.

Observed implementation verification on 1 October 2026 (separate historical runs):

- The PATCH adapter run passed **55 new API cases** and **820 unit/API tests**.
- The update concurrency run passed **57 update integration cases** (including
  13 added mounted-route/service cases) and **174 selected API regression cases**.
- Earlier POST concurrency verification passed **51 creation integration cases**
  and **148 API cases**; an earlier service run passed 878 creation/read/seed/unit/API
  cases before the POST and concurrency additions.

These counts are not cumulative. Runs reported one existing Starlette/AnyIO
warning; syntax and whitespace checks passed. Update integration tests used
controlled administrator authentication and real PostGIS; disposable databases
and the temporary container were removed. Broader suites were not rerun during
the update concurrency increment. The commands above are recommended reruns,
not results from this documentation edit. No new application-suite or live
administrator smoke run is claimed here. Prior creation-documentation checks
validated its example and smoke-script syntax; live account/provisioning
limitations below remain separate from the passing controlled-authentication tests.

For the earlier PATCH documentation edit, the PATCH request passed merged validation against the
creation example, and the complete saved response matched `SupplierResponse.from_read`.
The conflict example, linked test paths, and whitespace checks also passed.
No application tests were rerun for the documentation edit.

### Live administrator creation smoke check

Run this only with an **active administrator provisioned through User Service's
agreed, authorized process**. Public registration creates a regular user, and
profile updates do not accept `role`. Do not add role selection, change User
Service data ad hoc, or bypass the authentication dependency to make this check
pass. The inspected [User Service documentation](../user-service/README.md) and
public routes do not provide an administrator-provisioning command, and no approved
administrator account/credentials were supplied for this work. **The live check
was not run.** Obtain the agreed process and an authorized account from the User
Service owner before attempting it.

Prerequisites: a running Supplier API pointed at a migrated **disposable** Supplier
database with runtime grants and controlled categories; a reachable User Service
for both the API and this script; and the administrator's student number/password.
From `supplier-service/`, export `SUPPLIER_SERVICE_URL` (for example
`http://127.0.0.1:8081`), `USER_SERVICE_URL`, and `ADMIN_STUDENT_NUMBER`. Compose does
not publish User Service's port by default; use an approved reachable development
instance or the configured container network. The script prompts for the password
and never prints it or the bearer token.

This uses the actual mounted HTTP routes and commits one uniquely named supplier.
It verifies 201/public GET equality, a 409 duplicate, validation, logout/revocation,
and anonymous reads. Dispose of the dedicated smoke database afterward using the
[database lifecycle instructions](docs/migrations.md). DELETE is implemented but
retains soft-deleted rows, so it does not replace disposal of the smoke database.
The automated tests above cover controlled authentication outages
and regular-user rejection; this script requires no test-only routes or overrides.

```bash
./.venv/bin/python - <<'PYSMOKE'
import os
from getpass import getpass
from uuid import uuid4

import httpx

with httpx.Client(
    base_url=os.environ["SUPPLIER_SERVICE_URL"], timeout=10,
    follow_redirects=False, trust_env=False,
) as supplier, httpx.Client(
    base_url=os.environ["USER_SERVICE_URL"], timeout=10,
    follow_redirects=False, trust_env=False,
) as users:
    assert supplier.get("/ready").status_code == 200
    categories = supplier.get("/categories")
    assert categories.status_code == 200
    ids = {item["name"]: item["id"] for item in categories.json()}
    payload = {
        "name": "Creation smoke " + uuid4().hex,
        "area": "Science",
        "location": {"latitude": 1.291876, "longitude": 103.781234},
        "category_ids": [ids["Food"], ids["Coffee"]],
        "description": None, "building": "S16", "floor": "1", "image_key": None,
        "opening_time": "22:30:00", "closing_time": "02:15:00",
    }
    assert supplier.post("/suppliers", json=payload).status_code == 401
    login = users.post("/login", json={
        "nus_student_number": os.environ["ADMIN_STUDENT_NUMBER"],
        "password": getpass("Administrator password: "),
    })
    assert login.status_code == 200, "Administrator login failed"
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    try:
        profile = users.get("/users/me", headers=headers)
        assert profile.status_code == 200
        assert profile.json()["role"] == "admin" and profile.json()["status"] == "active"
        created = supplier.post("/suppliers", headers=headers, json=payload)
        assert created.status_code == 201, "Creation did not return 201; inspect state before retrying"
        body = created.json()
        path = "/suppliers/" + body["id"]
        detail = supplier.get(path)
        assert detail.status_code == 200 and detail.json() == body
        assert body["created_at"] == body["updated_at"]
        assert body["version"] == 1 and body["deleted_at"] is None
        assert body["closing_day_offset"] == 1 and len(body["categories"]) == 2
        duplicate = supplier.post("/suppliers", headers=headers, json={
            **payload, "name": " " + payload["name"].upper() + " ", "area": "FASS",
        })
        assert duplicate.status_code == 409
        assert duplicate.json()["error"]["code"] == "SUPPLIER_DUPLICATE"
        invalid = supplier.post("/suppliers", headers=headers, json={
            **payload, "name": " ", "category_ids": [str(uuid4())], "closing_time": None,
        })
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    finally:
        assert users.post("/logout", headers=headers).status_code == 204
    assert supplier.post("/suppliers", headers=headers, json=payload).status_code == 401
    for public_headers in ({}, headers):
        detail = supplier.get(path, headers=public_headers)
        assert detail.status_code == 200 and detail.json() == body
print("Live creation, duplicate, validation, public detail, and revocation checks passed.")
PYSMOKE
```

The script is a documented procedure, not evidence that a live deployment check
has passed. It has not been executed with a real administrator for this update.

### Administrative listings

Both mounted routes require a verified administrator bearer session:

- `GET /admin/suppliers` returns the canonical page envelope
  `{ "items": [...], "total": N, "limit": N, "offset": N }`.
- `GET /admin/suppliers/{id}` returns the canonical complete supplier response
  for either an active or deleted identity. It retains categories, optional fields,
  timestamps, version, and named latitude/longitude coordinates.

Listing accepts exactly `status=active|deleted|all`, defaulting to `active`.
Active selects null `deleted_at`, deleted selects non-null values, and all adds
no deletion predicate. Unsupported values, including empty or differently cased
values, return `422 VALIDATION_ERROR` with safe `query.status` details.

Status, exact `area` matching, and repeated UUID `category_id` filters combine
before both counting and pagination. Categories match **any** requested category;
repeated IDs are deduplicated, and multiple matching categories never duplicate
suppliers or inflate totals. Results sort by supplier name then UUID. `limit`
defaults to 20 and must be 1–100; `offset` defaults to 0 and must be nonnegative.
Unknown category UUIDs can produce an empty result. Empty and out-of-range pages
retain the matching `total`, requested `limit`, and `offset`.

Example combined query (use stored category IDs):

```http
GET /admin/suppliers?status=deleted&area=Science&category_id=92f0136e-5617-4380-9367-b2991ceda339&category_id=92f0136e-5617-4380-9367-b2991ceda339&limit=20&offset=0 HTTP/1.1
Authorization: Bearer <session-token>
```

Detail for the illustrative deleted row above:

```http
GET /admin/suppliers/a98f9ffd-1d20-4b9d-88f0-585039d5949a HTTP/1.1
Authorization: Bearer <session-token>
```

Complete HTTP 200 response (the deletion timestamp is illustrative):

```json
{
  "id": "a98f9ffd-1d20-4b9d-88f0-585039d5949a",
  "name": "Campus Café",
  "area": "Science",
  "location": {"latitude": 1.291876, "longitude": 103.781234},
  "categories": [
    {"id": "92f0136e-5617-4380-9367-b2991ceda339", "name": "Coffee"}
  ],
  "description": null,
  "building": "S16",
  "floor": null,
  "image_key": null,
  "opening_time": "22:30:00",
  "closing_time": "23:30:00",
  "closing_day_offset": 0,
  "created_at": "2026-10-01T02:03:04.123456Z",
  "updated_at": "2026-10-01T02:05:06.123456Z",
  "deleted_at": "2026-10-01T02:05:06.123456Z",
  "version": 3
}
```

A matching listing wraps that same object in `items`; if one row matches but
`offset=20`, the HTTP 200 response is:

```json
{"items": [], "total": 1, "limit": 20, "offset": 20}
```

Missing detail returns the standard `404 SUPPLIER_NOT_FOUND`; malformed path or
category UUIDs and invalid pagination return the existing 422 validation envelope.
Both routes retain safe 401/403 authorization errors and 503 authentication-outage
behavior. Recognized database failures return `503 DATABASE_UNAVAILABLE` with
`Supplier details are temporarily unavailable.` No database diagnostics are exposed.

Ordinary `GET /suppliers` and `GET /suppliers/{id}` remain anonymous and active-only;
there is no public status switch that reveals deleted records. These administrator
views do not enable restoration, deleted-record editing, frontend status controls,
or service-to-service authorization.

### Deletion and administrator-read verification

The implemented contracts are covered by:

- [API update/deletion tests](tests/api/test_supplier_updates.py): DELETE validation,
  authorization before database access, empty success, stale repeat deletion,
  safe errors, completion/cleanup, and OpenAPI bearer security.
- [API read tests](tests/api/test_supplier_reads.py): status/default validation,
  canonical administrator responses, filters, authorization, safe failures,
  OpenAPI security, and public status isolation.
- [Integration update/deletion tests](tests/integration/test_supplier_updates.py):
  `test_mounted_delete_and_patch_contend_without_partial_mutation` exercises both
  PATCH/DELETE commit orders and two deletes using independent sessions, bounded
  synchronization, observed PostgreSQL blocking, exact snapshots, and lock release.
- [Integration read tests](tests/integration/test_supplier_reads.py):
  `test_mounted_create_delete_retains_admin_history` verifies public exclusion,
  complete administrator history/status views, and unchanged stale repeat deletion.
- [Seed-import tests](tests/integration/test_seed_import.py):
  `test_reimport_preserves_identity_deleted_through_mounted_route` verifies that
  reimport preserves edited fields, assignments, timestamps, version, and deletion.

Recommended regression commands, from `supplier-service/`:

```bash
./.venv/bin/python -m pytest tests/api/test_supplier_updates.py tests/api/test_supplier_reads.py -q
./.venv/bin/python -m pytest tests/integration/test_supplier_updates.py tests/integration/test_supplier_reads.py tests/integration/test_seed_import.py -q
```

Use Python 3.12 with `requirements-dev.txt` installed. API tests use controlled
User Service responses and need no live services. Integration tests require an
explicit `TEST_DATABASE_URL` using `postgresql+psycopg`, an isolated PostGIS database
ending `_test`, and a database name distinct from `DATABASE_URL`. The test role
needs access to `postgres`, permission to create/drop disposable databases, and
permission to install PostGIS and apply migrations. Fixtures migrate and clean up
their databases; do not use a production database or runtime-only role.

Historical agent verification on 1 October 2026: the administrator-read increment
passed 883 unit/API tests (including 91 read API cases) and 85 read integration
tests. The subsequent lifecycle increment passed all 240 cases across the three
integration suites above, including five new lifecycle cases. Each run reported
one existing dependency deprecation warning; scoped whitespace checks passed and
disposable resources were removed. Counts describe separate runs, not cumulative
coverage. Authentication used controlled fixtures, not live accounts. These are
prior implementation results, not application tests rerun for this README edit;
no human review or live administrator verification is claimed for this edit.

### Error bodies

Errors contain an `error` object with a stable machine-readable `code` and a
human-readable `message`. Frontend logic branches on the code, not message text.
Implemented POST and PATCH use `SUPPLIER_DUPLICATE` for duplicate conflicts.
PATCH uses `VERSION_CONFLICT` for stale active versions (also `409`), as shown
below. DELETE uses the same conflict envelope for stale active versions. Reload
on a PATCH or DELETE conflict; the response omits the current version and supplier data, and the edit
must not be retried automatically.

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This supplier has changed. Reload it before trying again."
  }
}
```

Validation errors use `422` and `VALIDATION_ERROR`, with a `details` array of
issues. Each issue has `fields` (an array of field paths), `code`, and `message`.
Report all independently detectable issues together. Use paths such as `area`,
`location.latitude`, and `category_ids.1`; array
positions are zero-based and refer to the original request before deduplication.
Identify each unknown category entry separately. Never save part of an invalid
mutation. PATCH uses `query.expected_version` for expected-version query errors
and `path.id` for invalid supplier UUIDs.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": [
      {
        "fields": ["opening_time", "closing_time"],
        "code": "INCOMPLETE_SCHEDULE",
        "message": "Set both opening and closing times, or clear both for unknown hours."
      }
    ]
  }
}
```

A schedule-pair error is one issue associated with both fields; the frontend
highlights the pair and displays the message once. Single-field issues also
use a `fields` array. An optional frontend "Hours unknown" control may clear
both times together; server validation remains mandatory.

### Reusing validation in creation, seeds, and PATCH

`app/schemas.py` defines separate client inputs and cleaned results.
`app/validation/suppliers.py` provides the entry points that collect parsing
errors and all independently detectable domain issues:

```python
from app.validation.suppliers import (
    validate_supplier_create,
    validate_supplier_patch,
)

# Implemented inside create_supplier after category lookup in its transaction.
created_values = validate_supplier_create(raw_create_body, existing_category_ids)
# Implemented inside update_supplier using explicitly selected stored editable values.
updated_values = validate_supplier_patch(
    raw_patch_body, stored_editable_values, existing_category_ids,
)
```

Both callers are implemented in [app/services/suppliers.py](app/services/suppliers.py):
the mounted POST and PATCH routes pass raw JSON, and each service obtains category
UUIDs through repository `list_categories` inside its own transaction. Callers pass
existing category UUIDs as an iterable of `UUID` objects.
Every supplied category is checked at its original zero-based position before
valid duplicates are removed in first-seen order. A supplied PATCH category list
replaces the stored selection. Category definitions remain migration-managed.
Only successful validation returns cleaned values; any issue raises
`DomainValidationError`. Creation and update roll back without saving partial input.

Implemented POST and PATCH accept raw JSON through `Annotated[Any, Body()]`
and delegate to their services for aggregate validation. Do not use
`SupplierCreateInput` or `SupplierPatch` as an automatic route-body parser before
calling the aggregate validator: an early parsing failure would stop category
membership or schedule checks that could still find errors. Likewise, do not
pre-validate individual business fields and return on the first issue. Invalid
JSON cannot reach domain validation because no usable input object exists.

Creation validates complete input. PATCH must merge with a snapshot of stored
editable values first: name, area, category UUIDs, optional text, and both times.
The update service builds that mapping explicitly from the stored active record;
do not pass an ORM object with server-managed fields through the creation schema.
`validate_supplier_patch` copies editable values, applies the raw patch, validates
the merged result, and recalculates the closing-day offset. It does not mutate
the supplied mapping or category list. Persistence, concurrency checks, and
version increments (including for empty patches) belong to `update_supplier`.
The service tracks whether categories were supplied separately from the complete
validated result, so omitted assignments are preserved. It conditionally writes
scalars before replacing supplied categories in the same transaction.

Omitted PATCH fields retain stored values. Explicit null clears nullable fields;
null required text or category lists is invalid. Blank optional text becomes
null; required text must remain nonblank after trimming. Floor values remain
strings, including `01` and `B1`. For callers using the patch model to inspect
presence, `SupplierPatch().model_dump(exclude_unset=True)` is empty, whereas
`SupplierPatch(description=None).model_dump(exclude_unset=True)` includes
`description: None`. Preserve that distinction when passing data onward.

Changing only one time uses the other stored time. Later closing means offset 0;
earlier or equal closing means offset 1 (equal times represent 24 hours). Both
times missing or null on creation mean unknown hours. Clearing a known PATCH
schedule requires both times to be null; clearing just one produces one
`INCOMPLETE_SCHEDULE` issue naming both fields. An invalid time is reported as a
parsing/time issue without also being called an incomplete schedule. Clients
cannot supply the derived offset, supplier ID, or other server-managed fields;
PATCH also forbids coordinates and `expected_version` in its body.

The application factory registers handlers for `DomainValidationError` and
FastAPI `RequestValidationError`. Both return HTTP 422 using
`DomainValidationError.to_dict()` and the envelope above. Request body paths
omit `body.` (for example `location.latitude` and `category_ids.1`), while query
paths retain `query.`. Malformed JSON returns `INVALID_JSON` with an empty
`fields` array. Responses contain only issue `fields`, `code`, and safe `message`
values; raw bodies, rejected values, exception context, and internal messages
are not copied into the response. This handler unifies request-error formatting;
it complements aggregate validation in the implemented creation and update services.

The seed parser applies reviewed source mappings and calls
`validate_supplier_seed_values` for shared scalar rules without category UUIDs.
It translates `DomainValidationError` into contextual source issues. The
implemented seed importer resolves controlled category names to existing UUIDs
during classification. API creation and seed input share scalar/schedule rules
and the repository `insert_supplier`/`insert_category_assignments` helpers. The
supplier helper accepts cleaned `SupplierCreateResult` and `SupplierSeedResult`,
excludes category IDs from scalar inserts, and leaves transactions to each caller.
API creation uses a random UUID; seed imports retain their existing stable identity
and advisory-lock contract. Seed import runs through its explicit command/service
and never calls POST or other HTTP endpoints. Domain validation itself performs
no CSV parsing, seed corrections, HTTP calls, or database access.

### Validation tests and coverage

Run all unit and API checks from `supplier-service/`:

```bash
./.venv/bin/python -m pytest tests/unit tests/api -q
```

Coverage reviewed against [the domain-input guide](reference/08-validate-supplier-input.md):

| Coverage | Tests |
| --- | --- |
| Finite coordinates, inclusive boundaries, precision, approved slash-combined areas, and daily offsets/unknown hours | `tests/unit/test_domain_validation.py` |
| Whitespace, optional nulls, string floor labels, unknown areas, empty/malformed/unknown categories, forbidden fields, and aggregate creation failures | `tests/unit/test_supplier_create_validation.py` |
| Missing versus null, stored-time merging, transitions from either time, category replacement, immutable fields, aggregate failures, and unchanged inputs | `tests/unit/test_supplier_patch_validation.py` |
| Both 422 handlers, body/query paths, invalid JSON, safe messages, original category positions, and multiple issues including a single schedule-pair issue | `tests/api/test_validation_errors.py` |
| Mounted POST authorization, raw JSON, aggregate 422s, canonical 201 output, and safe errors | `tests/api/test_supplier_creates.py` |
| Real PostGIS creation, duplicate policy, rollback, public detail, and independent transaction races | `tests/integration/test_supplier_creates.py` |
| Existing liveness and readiness behavior | `tests/api/test_health.py`, `tests/api/test_readiness.py` |

The original validation-only increment passed 357 unit/API tests without database
integration. Current creation/API and PostGIS results are recorded under
[verification](#creation-update-public-read-and-authentication-verification); do not treat
that earlier validation-only count as the current implementation status.

## Explicit seed import

The `supplier-seed` tools service imports the reviewed CSV explicitly; ordinary
API startup never seeds. It shares `foc-supplier-service:local` with the API and
migrator. The image packages `app/`, Alembic files, and module-relative
`seed/manifest.json` and `seed/area_mapping.json`, readable by UID 10001.
The root CSV is mounted read-only at `/seed/supplier-seed-data.csv`.
The job joins only `supplier-private`, publishes no ports, disables the API
healthcheck, and never automatically restarts. No User Service connection is made.

Run from the repository root with Docker and Compose available. Configure the
root `.env` as described in [fresh installation](docs/migrations.md#fresh-installation):
`POSTGRES_USER` and `POSTGRES_PASSWORD` are needed for full Compose interpolation;
set `SUPPLIER_POSTGRES_DB`, `SUPPLIER_POSTGRES_USER`,
`SUPPLIER_POSTGRES_PASSWORD`, `SUPPLIER_MIGRATION_PASSWORD`, and
`SUPPLIER_RUNTIME_PASSWORD`. Compose provisions PostGIS and the migrator/runtime
roles, applies migrations, and grants runtime access before seeding. Use URL-safe
passwords or correctly encode URL components. Compose supplies required `USER_SERVICE_URL`
and optional timeout/log settings; local Python runs must export those settings
and `DATABASE_URL` explicitly. The command does not load `.env` itself.

```bash
docker compose --profile tools config --quiet
docker compose build supplier-service
docker compose --profile tools run --rm supplier-seed --dry-run
docker compose --profile tools run --rm supplier-seed
```

The empty Compose command lets appended `--dry-run` reach the Python entrypoint.
Both modes wait for healthy `supplier-db` and successful bootstrap, migration,
and runtime-grant jobs. A previous migration job is not a deployment scheduler:
follow the [existing-volume sequence](docs/migrations.md#deploying-a-new-image-with-the-existing-volume)
for a new image. The command independently requires installed Alembic heads to
exactly match the nonempty packaged heads. It never applies migrations itself.

From `supplier-service/`, the equivalent local commands are:

```bash
./.venv/bin/python -m app.commands.seed_suppliers --file ../data/csv/supplier-seed-data.csv --dry-run
./.venv/bin/python -m app.commands.seed_suppliers --file ../data/csv/supplier-seed-data.csv
```

Validation, accepted records, and diagnostics use one loaded input snapshot.
Any invalid input rejects the whole batch; diagnostic valid rows are never a
partial import. Mappings resolve relative to the module, regardless of CSV
location. No mode generates permanent UUIDs or changes the source or mappings.

Dry run classifies in a read-only transaction. Its proposed inserts, existing
identity skips (including deleted identities), and conflicts are a preview that
may change before execution. Real imports acquire PostgreSQL transaction-scoped
advisory lock `3219001`, then reclassify and insert suppliers and all assignments
in one transaction. A waiting importer classifies after acquiring the lock.
API-style writers do not take this lock; `uq_supplier_active_name_location`
remains the final active-duplicate concurrency guard.

An existing manifest UUID is skipped only when immutable longitude and latitude
match exactly at database point precision. All editable values, timestamps,
versions, category assignments, and soft deletion are preserved. Coordinate
mismatches require review, never overwrites or restoration. Missing UUIDs are
checked for active duplicates using `lower(btrim(name))` and exact coordinates,
including candidates within the batch. Deleted matches do not block a new UUID.
Categories must already exist from migrations. See the
[confirmed identity policy](docs/seed-mapping.md#confirmed-database-classification-policy).

The command writes one structured JSON record to stdout. The standard logging
envelope identifies it as the `supplier-seed` service with `component: "seed"`
and an event describing the outcome. The existing report fields remain
top-level fields in that record. It includes:

- `source_count`, `validated_supplier_count`, `category_counts`, and
  `total_category_assignments`: source/diagnostic totals, not committed row counts.
- `reviewed_corrections` and `validated_records`: the reviewed corrections and
  normalized diagnostic values with source context; never an accepted partial batch.
- `decisions` and `issues`: seed key, UUID, source file/row, action and reason,
  with independently detectable validation or classification issues retained.
- `proposed_insert_count`, `inserted_count`, `skipped_count`, `conflict_count`:
  distinguish classified candidates from confirmed committed inserts. A preview
  has zero committed inserts; a rerun normally has 21 skips.
- `valid`, `preview`, `dry_run`, `batch_rejected`, `committed`, `rolled_back`,
  `commit_outcome`, and `message`: batch status. Confirmed rollback reports zero
  inserts. `commit_outcome: "unknown"` means acknowledgement was lost: inserted
  count, committed, rolled-back and rejection flags are null, not proof of no
  writes. Reconcile manifest UUIDs or rerun the idempotent import with the same
  source/mappings once connectivity returns. `not_attempted` / `not_committed`
  do not claim a successful commit; `committed` confirms it.

Exit 0 means a valid conflict-free preview or successful import. Invalid input,
conflicts, configuration/migration/connectivity/write failures, and uncertain
commit outcomes return nonzero; argparse usage errors return 2. Database
errors use safe diagnostics. Review conflicts and source associations while
preserving permanent keys and UUIDs; do not regenerate identities to bypass them.

The real source contains 21 suppliers and 26 assignments across four migrated
categories (Food 16, Coffee 5, Shopping 3, Printing 2). Exactly five reviewed
midnight-to-23:59 pairs become daily 24-hour schedules; Supersnacks remains
11:00–02:00, closing-day offset 1. Schedules use Asia/Singapore wall-clock times.
A first import into an empty migrated database inserts 21; the second inserts
zero and preserves totals of 21 suppliers, four categories, and 26 assignments.

### Isolated verification

Packaging verification on 30 September 2026 passed on retry using Docker
Linux/ARM64 and the actual repository CSV bind mount. Compose configuration and
both image builds passed. The disposable database became healthy; administrator
bootstrap, migrations, and runtime grants completed. UID 10001 could read the
packaged metadata and Alembic configuration. The migration dependency exited 0
before seed execution. A first read-only preview left totals at 0 suppliers,
four categories, and zero assignments; the first import inserted 21 suppliers;
the second inserted zero and skipped 21, retaining totals of 21/4/26. A final
preview skipped 21 and preserved those totals. All command checks exited 0.
The disposable project's containers, network, and volume were removed.
The earlier Docker `Created` stall did not recur. Native AMD64 execution was
not tested in this rehearsal.

Use a unique Compose project name (for example `foc-seed-check`) and disposable
database credentials/name. Prefix **every** installation and test command with
`docker compose -p foc-seed-check`; this isolates the named volume and network.
Configure the disposable credentials as described in fresh installation. The
seed command starts bootstrap, migration, and runtime-grant jobs automatically,
without starting the API:

```bash
docker compose -p foc-seed-check --profile tools config --quiet
docker compose -p foc-seed-check build supplier-service
docker compose -p foc-seed-check --profile tools run --rm supplier-seed --dry-run
docker compose -p foc-seed-check --profile tools run --rm supplier-seed
docker compose -p foc-seed-check --profile tools run --rm supplier-seed
docker compose -p foc-seed-check --profile tools run --rm supplier-seed --dry-run
docker compose -p foc-seed-check ps -a supplier-db supplier-bootstrap supplier-migrate supplier-grants
docker compose -p foc-seed-check exec -T supplier-db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT (SELECT count(*) FROM supplier) AS suppliers, (SELECT count(*) FROM category) AS categories, (SELECT count(*) FROM supplier_category) AS assignments"'
# Only for this disposable project:
docker compose -p foc-seed-check --profile tools down --volumes --remove-orphans
```

Check counts before and after each preview: it must leave them unchanged.
Inspect JSON for first import 21 inserts and second import 0 inserts/21 skips;
check migration exit 0 and database totals 21/4/26. Do not run the cleanup against
a persistent project. For automated rollback, identity and concurrency checks,
from `supplier-service/` run:

```bash
./.venv/bin/python -m pytest tests/unit tests/api -q
./.venv/bin/python -m pytest tests/integration/test_seed_import.py -q
```

The integration command requires `TEST_DATABASE_URL` pointing to isolated
PostgreSQL/PostGIS with a database name ending `_test`, distinct from
`DATABASE_URL`. Its role must create disposable databases and install PostGIS;
see the integration configuration above. Install `requirements-dev.txt` first.

## Deployment and Verification

Run the API and PostgreSQL/PostGIS as separate containers. Persist database
state using a named volume and keep database access private to the service.

Manage schema changes through versioned migrations.

Implemented verification covers required fields and schedules, administrator
creation and PATCH with deduplicated categories, partial updates and null clearing,
exact duplicates, atomic rollback, stale versions, concurrent writes and deletion
state races, public exclusion of stored deleted rows, and repeatable seed imports. Deployment checks additionally cover persistence across
container recreation. See the commands and observed results above.

Mounted DELETE and administrator GET coverage verifies retained deleted history,
public exclusion, repeat deletion, actual DELETE/PATCH contention, and seed
reimport preservation. See [deletion and administrator-read verification](#deletion-and-administrator-read-verification)
for commands and the separately recorded historical results.

## Requirements to Reconcile

The following design choices should be reflected in the project requirements:

- Supplier IDs are immutable random UUIDs, replacing D1's location-and-name
  hash definition.
- Description is optional and specifically represents pickup directions.
- Area and one or more categories are mandatory.
- General daily hours are supported initially.
- The PATCH allowlist above expands D1's name-and-description-only updates.
- Closing-day offset is derived by the server, not supplied by clients.
- Direct administrator CRUD is an intermediate implementation before
  user proposals and administrator approval are introduced.

## Future Enhancements

### Weekly Opening Schedules

Introduce a `supplier_hours` table when weekday-specific schedules are
required.

It can represent each weekday as open, closed or unknown, with opening
time, closing time and closing-day offset for open days.

Migrate existing daily schedules into seven weekday records. Migrate
unknown hours into seven unknown records. Update the API and UI before
removing the original hours columns.

### Supplier Audit History

Introduce `supplier_audit` to record successful changes.

Proposed information includes:

- Audit entry ID.
- Supplier ID.
- Operation.
- Authenticated actor ID.
- Timestamp.
- Before and after values, including categories.
- Optional change-request ID once approval workflows exist.

Write the audit record in the same transaction as the supplier mutation.
An initial baseline can be captured when auditing is introduced, but
earlier changes cannot be reconstructed as historical events.

### Supplier Change Requests

Introduce `supplier_change_request` for user-proposed creations, updates
and removals.

Proposed information includes:

- Request ID and operation.
- Target supplier ID where applicable.
- Proposed values.
- Supplier version on which the proposal is based.
- Request status.
- Requester ID.
- Reviewer ID, decision timestamp and review reason.
- Creation timestamp.

Pending and rejected requests do not modify approved supplier records.

Approval should check for stale versions, apply the supplier mutation,
record the audit entry and finalize the request in one transaction.

The approval workflow should reuse the same validation and mutation logic
as direct administrator CRUD.

## AI Use Summary (Supplier Service)

Codex (GPT-6) provided **Requirements work**, **Learning support**,
**Boilerplate generation**, **Writing implementation code**, **Debugging
assistance**, and **Refactoring and documentation improvements** for database
migrations, role access, service image setup, and integration checks, including
Supplier-related changes to root `.env.example`, `compose.yaml`, and `README.md`. The
coordinate-index expression was aligned after Alembic detected metadata drift.

Observed verification: 54 tests passed against disposable PostGIS, including
runtime-role and isolated downgrade/re-upgrade checks; Alembic found no drift;
the service image built and reported revision `0002` as head. Keith confirmed
review of all affected changes.

See the [canonical Supplier Service usage record](ai/usage-log.md#ai-20260929-001).
Some prompt excerpts are redacted at the user's request; original
per-message timestamps are unavailable. No file header exceptions apply.

For the readiness change, Codex (GPT-6) provided **Writing implementation code**
for `app/routes/health.py`, `tests/api/test_health.py`, and the new
`tests/api/test_readiness.py`, following the specified existing engine and Alembic
architecture. The endpoint and isolated tests were retained. Agent verification:
40 API/unit tests passed with one dependency deprecation warning, and
`git diff --check` passed. PostgreSQL integration was not verified for this change.
Keith confirmed review of all affected readiness changes; no human test rerun
is claimed. The [readiness usage record](ai/usage-log.md#ai-20260929-002)
contains the exact implementation prompt and final response. Original message
timestamps are unavailable; no redactions or header exceptions apply to this entry.

For Compose migration gating, Codex (GPT-6) provided **Boilerplate generation**
for root `compose.yaml` and `supplier-service/Dockerfile`: a shared image,
a dedicated migration job, successful-completion startup gating, and a bounded
`/ready` image probe. These changes were retained and reviewed by Keith.
Agent checks passed for Compose validation, image build, packaged revision
inspection, explicit migration execution, healthy startup, deliberate disposable
migration failure blocking API startup, recovery, and `git diff --check`.
The full multi-service stack and existing development database were not tested;
no human test rerun is claimed. See the [Compose migration-gating record](ai/usage-log.md#ai-20260929-003)
for the exact prompt and verbatim response excerpts. Original message timestamps
are unavailable; no redactions or header exceptions apply to this entry.

For deployment documentation and the follow-up port correction, Codex (GPT-6)
provided **Refactoring and documentation improvements** and **Debugging assistance**
for `docs/migrations.md` and this README. The guide and README changes were
retained and reviewed by Keith. Disposable checks verified fresh installation,
grants, revision upgrade with surviving data, readiness/liveness failure and
recovery, and failed-migration startup blocking. After correcting the test-only
network setup, all 74 tests passed with no skips and one dependency warning.
Shell syntax, links, and `git diff --check` passed. The later wording correction
passed `git diff --check`; Docker checks were not rerun for it. Full-stack,
AMD64, archived-image, and development/production deployments were not verified.
See the [deployment documentation record](ai/usage-log.md#ai-20260929-004) for
both exact prompts, verbatim response excerpts, initial test-setup failures,
and verification limits. Original timestamps are unavailable; no redactions or
header exceptions apply. No human test rerun is claimed.


For creation validation, Codex (GPT-6) provided **Writing implementation code**
for `app/schemas.py`, `app/validation/suppliers.py`, the parsing-error adapter in
`app/validation/errors.py`, and `tests/unit/test_supplier_create_validation.py`.
The work remains in the working tree. Agent verification: 112 creation tests and
97 existing domain tests passed, with one dependency deprecation warning per run;
no requested checks remained unavailable. The initial test-file path error was
corrected. Keith confirmed review of all four affected files; no human test rerun
is claimed. The
[creation validation record](ai/usage-log.md#ai-20260930-001) contains the exact
prompt and verbatim final response. Original timestamps are unavailable; no
redactions or header exceptions apply to this entry.


For PATCH validation, Codex (GPT-6) provided **Writing implementation code** and
**Refactoring and documentation improvements** for `app/schemas.py` and
`app/validation/suppliers.py`, plus **Writing implementation code** for
`tests/unit/test_supplier_patch_validation.py`. The retained work tracks supplied
fields, validates merged editable values without mutating inputs, and documents
future update-service usage. Keith confirmed review of all three affected files.
Agent checks passed 90 PATCH tests and 209 creation/domain regression tests, with
one existing dependency warning per run and no unavailable requested checks.
No human test rerun is claimed. The [PATCH validation record](ai/usage-log.md#ai-20260930-002)
contains the exact prompt and verbatim final response. Original timestamps are
unavailable; no redactions or header exceptions apply to this entry.


For HTTP validation integration, Codex (GPT-6) provided **Writing implementation
code** for `app/main.py`, `app/validation/errors.py`, and
`tests/api/test_validation_errors.py`, plus **Refactoring and documentation
improvements** for error conversion and this README's future API/import guidance.
The handlers, safe error conversion, test-only routes, and documentation were
retained and all four affected files were reviewed by Keith. Agent verification:
357 unit/API tests passed, including health and readiness, with one existing
dependency warning and no unavailable requested checks. Coverage was reviewed
against the domain-input guide; final syntax, whitespace, and documentation
checks passed. No human test rerun is claimed. The
[HTTP validation record](ai/usage-log.md#ai-20260930-003) contains the exact prompt
and verbatim final response. Original timestamps are unavailable; no redactions
or header exceptions apply to this entry.


For permanent seed data, Codex (GPT-6) provided **Requirements work** interpreting
and formatting `seed/manifest.json` and `seed/area_mapping.json`, authored fixed
seed labels and one-time UUIDv4 values, and provided **Writing implementation code**
for `tests/unit/test_seed_mapping.py`. All three files were retained and reviewed
by Keith. Agent verification: 12 focused tests passed with one dependency warning;
the source CSV SHA-256 was unchanged. No human test rerun is claimed. The
[permanent seed mapping record](ai/usage-log.md#ai-20260930-004) contains the exact
prompt and verbatim final response. Original timestamps are unavailable; no
redactions apply. Header exceptions: `supplier-service/seed/manifest.json` and
`supplier-service/seed/area_mapping.json` are strict JSON, which cannot contain
comments.


For CSV source loading, Codex (GPT-6) provided **Writing implementation code** and
**Refactoring and documentation improvements** for `app/commands/seed_parsing.py`,
**Writing implementation code** for `tests/unit/test_seed_source.py`, and
**Boilerplate generation** for `app/commands/__init__.py` and the CP1252 fixture.
The retained implementation validates source and JSON structures, matches permanent
identities, and collects structured issues. Final refinements retain malformed rows
for duplicate detection and correct syntax-error line numbers after blank lines.
Agent verification: 55 focused tests passed with one existing dependency warning;
all 21 real associations survive reordering. The production CSV hash was verified
unchanged during implementation. Keith confirmed review of all four affected files,
including the final refinements. No human test rerun is claimed.
The [CSV source-loading record](ai/usage-log.md#ai-20260930-005) records the original
exact prompt and response excerpts for the combined task. Original timestamps are
unavailable. Header exception: `supplier-service/tests/fixtures/seed_source.csv`
is CP1252 CSV data; comments would alter its contents and parsing.


For shared seed scalar validation, Codex (GPT-6) provided **Writing implementation
code** and **Refactoring and documentation improvements** for `app/schemas.py` and
`app/validation/suppliers.py`, plus **Writing implementation code** for
`tests/unit/test_supplier_seed_validation.py`. The retained work shares text, area,
location, and schedule rules while keeping category names with the importer and
preserving API create/PATCH contracts. Keith confirmed review of all three files.
Agent verification: 473 unit/API tests passed, including 61 new seed tests, with
one existing dependency warning; `git diff --check` passed. No human test rerun is
claimed. The [shared scalar validation record](ai/usage-log.md#ai-20260930-006)
contains the exact prompt and verbatim final response. Original timestamps are
unavailable; no redactions or header exceptions apply to this entry.


For seed normalization, Codex (GPT-6) provided **Writing implementation code** and
**Refactoring and documentation improvements** for `app/commands/seed_parsing.py`,
and **Writing implementation code** for `tests/unit/test_seed_normalization.py`.
The retained implementation returns typed scalar values and controlled category
names, applies identity-based reviewed schedule corrections, maps exact image URLs,
and withholds every parsed record when any issue exists. Keith confirmed review
of both files. Agent verification: 163 focused tests passed with one existing
dependency warning; real-dataset checks covered all 21 records, five corrections,
Supersnacks, category totals, image assignments, and unchanged CSV bytes.
`git diff --check` passed; no human test rerun is claimed. The
[seed normalization record](ai/usage-log.md#ai-20260930-007) contains the exact prompt
and verbatim final response. Original timestamps are unavailable; no redactions
or header exceptions apply to this entry.


For the seed dry-run command, Codex (GPT-6) provided **Writing implementation
code** for `app/commands/seed_suppliers.py` and `tests/unit/test_seed_command.py`,
and **Refactoring and documentation improvements** for this README. The command,
subprocess tests, and usage guidance were retained and reviewed by Keith.
Agent verification: the real CSV produced 21 suppliers, 26 category assignments,
five corrections, and no issues; 528 unit/API tests passed with one existing
dependency warning. Subprocess checks verified absent database configuration,
inert import, no database imports, stable UUIDs/counts, and unchanged source/mapping
bytes. Final source-data, syntax, whitespace, and README checks passed. No requested
checks were unavailable; no human test rerun is claimed. The
[dry-run command record](ai/usage-log.md#ai-20260930-008) contains the exact prompt
and verbatim final response. Original timestamps are unavailable; no redactions
or header exceptions apply to this entry.


For database seed classification, Codex (GPT-6) provided **Boilerplate generation**
for `app/repositories/__init__.py` and `app/services/__init__.py`, **Writing
implementation code** for `app/repositories/suppliers.py`,
`app/services/seed_import.py`, and `tests/integration/test_seed_import.py`, and
**Refactoring and documentation improvements** for `docs/seed-mapping.md`.
All six files were retained and reviewed by Keith. Classification preserves
caller-owned sessions, checks immutable coordinates for existing active/deleted
UUIDs, resolves migrated categories, and collects active and batch duplicates.
Agent verification: 545 tests passed (17 isolated migrated PostgreSQL/PostGIS
integration tests and 528 unit/API tests), with one existing dependency warning.
Database snapshots and pending caller state were unchanged by classification.
The scoped documentation whitespace check passed; the repository-wide check
reported pre-existing whitespace in the usage log. No human test rerun is claimed.
The [database classification record](ai/usage-log.md#ai-20260930-009) contains the
exact prompt and verbatim final response. Original timestamps are unavailable;
no redactions or header exceptions apply to this entry.


For atomic supplier import, Codex (GPT-6) provided **Writing implementation code**
and **Refactoring and documentation improvements** for
`app/services/seed_import.py` and `app/repositories/suppliers.py`, plus **Writing
implementation code** for `tests/integration/test_seed_import.py`. All three files
were retained and reviewed by Keith. The service owns one transaction, acquires
advisory lock 3219001 before classification, preserves skipped identities, inserts
suppliers and assignments atomically, and separates duplicate/UUID conflicts.
Agent verification: 558 tests passed (30 seed integration cases and 528 unit/API
tests), with one existing dependency warning. Coverage includes real CSV reruns,
unchanged administrator edits and deletion state, assignment and pre-commit
rollback, and synchronized independent-connection import/API races for both
commit and rollback. Disposable migrated databases and the test container were
removed. Python syntax and whitespace checks passed for the three changed files.
No human test rerun is claimed. The
[atomic import record](ai/usage-log.md#ai-20260930-010) contains the exact prompt
and verbatim final response. Original timestamps are unavailable; no redactions
or header exceptions apply to this entry.


For the [database-aware seed command](ai/usage-log.md#ai-20260930-011), Codex
(GPT-6) provided **Writing implementation code** and **Refactoring and documentation
improvements** for `app/commands/seed_suppliers.py`, `app/services/seed_import.py`,
`tests/unit/test_seed_command.py`, and `tests/integration/test_seed_import.py`.
Retained changes added database previews/imports, exact migration-head gating,
read-only transactions, safe reporting, resource lifecycle checks, and CLI tests.
Agent verification passed 591 tests with one existing dependency warning.

For the [snapshot and passwordless fixes](ai/usage-log.md#ai-20260930-011), Codex
(GPT-6) provided **Writing implementation code** and **Refactoring and documentation
improvements** for `app/commands/seed_parsing.py`, `app/commands/seed_suppliers.py`,
and the two seed command/import test files. The retained fixes use one loaded
snapshot for accepted records and diagnostics and guard optional password checks.
Agent verification passed 596 tests, including the seed integration suite against
passwordless PostGIS, with one existing dependency warning.

For [uncertain commit outcomes](ai/usage-log.md#ai-20260930-011), Codex (GPT-6)
provided **Writing implementation code**, **Refactoring and documentation
improvements**, and **Debugging assistance** for `app/services/seed_import.py`,
`app/commands/seed_suppliers.py`, and `tests/integration/test_seed_import.py`.
The retained fix distinguishes confirmed rollback from unknown commit outcomes,
uses null committed counts when acknowledgement is lost, preserves safe guidance,
and discards uncertain connections without masking the original failure. Tests
confirmed persisted rows after simulated lost acknowledgement and an unchanged
idempotent rerun. Final agent verification passed 599 tests with one existing
dependency warning; syntax and whitespace checks passed. Temporary database
resources were removed after each task.

Keith confirmed review of all five affected files and all retained changes across
these three exchanges. No human test rerun is claimed. The consolidated record contains Prompts 1–3 and their verbatim final responses.
Original message timestamps are unavailable; no redactions or header exceptions
apply to these entries.


For [explicit seed command packaging](ai/usage-log.md#ai-20260930-012), Codex
(GPT-6) provided **Boilerplate generation** for `Dockerfile` and root
`compose.yaml`, and **Refactoring and documentation improvements** for this
README and `docs/seed-mapping.md`. Retained changes package metadata, configure
the explicit tools service, and document setup, preview/import outcomes,
identity preservation, locking, and isolated checks. Within this exchange,
Compose validation, both image builds, isolated bootstrap, migrations, and
grants passed on Linux/ARM64. Docker then stalled container startup; seed runs,
non-root metadata access, dependency-order execution, and rerun totals were
unverified, and cleanup timed out. These are the historical results for this
entry, not a claim about subsequent operational checks. Keith confirmed review
of all four affected files; no human test rerun is claimed. The exact prompt and
verbatim final response are recorded. Original message timestamp unavailable;
no redactions or header exceptions apply.


For [active supplier detail reads](ai/usage-log.md#ai-20260930-013), Codex
(GPT-6) provided **Writing implementation code** and **Refactoring and
documentation improvements** for `app/repositories/suppliers.py` and
`app/services/suppliers.py`, and **Writing implementation code** for
`tests/integration/test_supplier_reads.py`. Retained work provides immutable
active-only details, eager categories, named PostGIS coordinates, and safe
availability failures while preserving seed identity behavior. Agent checks
passed 612 tests across the new reads, seed integration, unit, and API suites,
with one existing dependency warning; syntax and scoped whitespace checks passed.
The disposable PostGIS container was removed. The full schema/runtime-role
integration suite was not run. Keith confirmed review of all three files;
no human test rerun is claimed. The exact prompt and final response are recorded;
original message timestamp unavailable. No redactions or header exceptions apply.


For [active supplier listing and pagination](ai/usage-log.md#ai-20260930-014),
Codex (GPT-6) provided **Writing implementation code** and **Refactoring and
documentation improvements** for `app/repositories/suppliers.py` and
`app/services/suppliers.py`, and **Writing implementation code** for
`tests/integration/test_supplier_reads.py`. Retained changes add active filtered
pages with matching totals, deterministic ordering, pagination validation, and
shared detail/list loading and failure handling. Agent checks passed 639 tests
across reads, seed integration, unit, and API suites, with one existing dependency
warning; syntax and scoped whitespace checks passed. Fresh-session tests verified
three queries per nonempty page at multiple limits and unchanged stored data.
The disposable PostGIS container was removed. The full schema/runtime-role
integration suite was not run. Keith confirmed review of all three files;
no human test rerun is claimed. The exact prompt and final response are recorded;
original message timestamp unavailable. No redactions or header exceptions apply.


For [controlled category and area readers](ai/usage-log.md#ai-20260930-015),
Codex (GPT-6) provided **Writing implementation code** and **Refactoring and
documentation improvements** for `app/repositories/suppliers.py` and
`app/services/suppliers.py`, and **Writing implementation code** for
`tests/integration/test_supplier_reads.py`. Retained readers return ordered,
immutable category values independently of supplier assignments and exact
approved area choices without database access. Category failures reuse the safe
service boundary. Agent checks passed 653 read/seed integration and unit/API
tests, plus a separate database-independent area test, with an existing dependency
warning. Syntax and scoped whitespace checks passed; the disposable PostGIS
container was removed. Full schema/runtime-role integration coverage was not run.
Keith confirmed review of all three files; no human test rerun is claimed.
The exact prompt and final response are recorded; original message timestamp
unavailable. No redactions or header exceptions apply.


For [supplier read response models](ai/usage-log.md#ai-20260930-016), Codex
(GPT-6) provided **Writing implementation code** for `app/schemas.py` and
`tests/api/test_supplier_reads.py`. Retained models explicitly convert loaded
read values, preserving nulls, precision, ordering, and pagination metadata.
Agent checks passed 11 new serialization tests and all 552 unit/API tests with
one dependency warning; scoped whitespace checks passed. Database integration
tests were not run. Keith confirmed review of both files; no human test rerun
is claimed. The exact prompt and verbatim final response are recorded; original
message timestamp unavailable. No redactions or header exceptions apply.


For [unregistered supplier GET adapters](ai/usage-log.md#ai-20260930-017),
Codex (GPT-6) provided **Writing implementation code** for
`app/routes/suppliers.py` and `tests/api/test_supplier_reads.py`. Retained handlers
use existing read services, parsed UUIDs/pagination, explicit response conversion,
and safe error envelopes. Tests verify cleanup and production route exclusion.
During this exchange, agent checks passed 37 serialization/read HTTP tests and
all 578 unit/API tests with one dependency warning; scoped whitespace checks
passed. Database integration tests were not run. Keith confirmed review of both affected files;
no human test rerun is claimed. The exact prompt and verbatim
final response are recorded; original timestamp unavailable. No redactions or
header exceptions apply. The router remains unregistered pending authentication.


For [controlled reference-data GET adapters](ai/usage-log.md#ai-20260930-018),
Codex (GPT-6) provided **Writing implementation code** for
`app/routes/reference_data.py` and `tests/api/test_supplier_reads.py`. Retained
handlers preserve controlled choices, safe category errors, and database-free
areas. Tests mount all four read adapters together and verify production exclusion.
Agent checks passed 43 read HTTP/serialization tests and all 584 unit/API tests
with one dependency warning; combined read collection passed with 97 tests and
scoped whitespace checks passed. Database integration tests were not run. Keith confirmed
review of both affected files; no human test rerun is claimed. The exact prompt
and verbatim final response are recorded; original timestamp unavailable. No
redactions or header exceptions apply. Production mounting awaits authentication.


For the [synchronous User Service client](ai/usage-log.md#ai-20260930-019),
Codex (GPT-6) provided **Writing implementation code** for
`app/clients/user_service.py` and `tests/unit/test_user_service_client.py`, and
**Boilerplate generation** for `app/clients/__init__.py`, `requirements.txt`,
and `requirements-dev.txt`. Retained work resolves opaque sessions through the
fixed profile endpoint, validates minimal trusted identities, maps failures to
explicit exceptions, closes the reusable client, and moves HTTPX into runtime
dependencies. During the implementation exchange, agent checks passed 71 focused
tests and all 655 unit/API tests with one existing dependency warning; scoped
whitespace checks passed. Live-service and database integration checks were not
run. Keith approved the original implementation across all five files; no human
test rerun is claimed. The exact prompt and verbatim final response are recorded;
original timestamp unavailable. No redactions or header exceptions apply.


For [User Service client lifecycle management](ai/usage-log.md#ai-20260930-020),
Codex (GPT-6) provided **Writing implementation code** for `app/main.py` and
`tests/api/test_startup.py`. Retained changes construct and share one client per
lifespan using existing settings, and clean up client and database resources on
shutdown or partial startup failure. Agent checks passed 10 startup tests and
all 666 unit/API tests with one existing dependency warning; scoped whitespace
checks passed. Live User Service and database integration checks were not run.
Keith subsequently confirmed review of both affected files; no human test rerun is claimed.
The exact prompt and verbatim final response are recorded; original timestamp
unavailable. No redactions or header exceptions apply.


For [composable authentication and administrator dependencies](ai/usage-log.md#ai-20260930-021),
Codex (GPT-6) provided **Writing implementation code** for `app/auth.py`,
`app/main.py`, and `tests/api/test_auth.py`. Retained changes resolve trusted
identities through the shared client, authorize administrators, and return safe
401/403/503 envelopes through a dedicated handler. Protection remains opt-in.
Agent checks passed 47 combined authentication/validation-error tests and all
695 unit/API tests, including 29 new authentication tests, with one existing
dependency warning; scoped whitespace checks passed. An initial test-file path
error was corrected before successful verification. Live-service and database
integration checks were not run. Keith confirmed review of all three files for
this implementation; no human test rerun is claimed. The exact prompt and
verbatim final response are recorded; original timestamp unavailable.
No redactions or header exceptions apply.


For [public supplier and reference-data reads](ai/usage-log.md#ai-20260930-022),
Codex (GPT-6) provided **Writing implementation code** for `app/main.py`,
`tests/api/test_supplier_reads.py`, `tests/api/test_health.py`,
`tests/api/test_readiness.py`, and the additional stale assertion correction in
`tests/api/test_validation_errors.py`; **Refactoring and documentation improvements**
updated both read-router docstrings and this README. Retained work mounts public
reads, proves authentication-outage independence with recording mock transports,
and documents a test-only login/logout and simulated-outage smoke harness.
Agent checks passed 121 focused tests and all 723 unit/API tests after the stale
exclusion assertion was corrected, with one existing dependency warning.
Python and smoke-harness syntax and scoped whitespace checks passed. No Compose
services were running, so live login/logout checks were not performed; database
integration tests were not run. Keith confirmed review of all eight affected
files; no human test rerun is claimed. The exact prompt and verbatim final
response are recorded; original timestamp unavailable. No redactions or header
exceptions apply.


For the [shared seed/create insertion primitive](ai/usage-log.md#ai-20261001-001),
Codex (GPT-6) provided **Writing implementation code** for
`app/repositories/suppliers.py` and `tests/integration/test_seed_import.py`, plus
**Refactoring and documentation improvements** for the helper docstring.
Retained changes exclude category IDs from supplier inserts and cover both cleaned
result types while preserving separate assignments and caller-owned transactions.
During the implementation exchange, two focused SQL cases, all 62 seed integration
cases, and all 723 unit/API tests passed, with one existing dependency warning;
scoped whitespace checks passed. Current test bodies contain subsequent edits of
unestablished authorship/timing; historical checks do not verify those later edits.
Keith confirmed review of both affected files; Keith also confirmed a test rerun, with commands and results unspecified. The exact prompt and verbatim final response are
recorded; the original timestamp is unavailable. No redactions or header
exceptions apply.


For the [atomic supplier creation service](ai/usage-log.md#ai-20261001-002),
Codex (GPT-6) provided **Writing implementation code** and **Refactoring and
documentation improvements** for `app/services/suppliers.py`, plus **Writing
implementation code** and **Boilerplate generation** for
`tests/integration/test_supplier_creates.py`. Retained changes validate categories
inside one service-owned transaction, insert through shared helpers, return detached
values only after commit, and expose safe duplicate/availability exceptions without
retrying uncertain writes. Agent verification passed 878 creation/read/seed/unit/API
tests, including 39 new creation cases, with one existing dependency warning;
syntax and scoped whitespace checks passed. The initial collection command had a
working-directory error, corrected before successful verification. Keith confirmed
review of both affected files; no human test rerun is claimed for this increment.
The exact prompt and verbatim final response are recorded; the original message
timestamp is unavailable. No redactions or header exceptions apply.


For the [administrator supplier POST adapter](ai/usage-log.md#ai-20261001-003),
Codex (GPT-6) provided **Writing implementation code** for
`app/routes/suppliers.py`, `tests/api/test_supplier_creates.py`,
`tests/api/test_validation_errors.py`, and the additional GET-registration
assertion correction in `tests/api/test_supplier_reads.py`; **Refactoring and
documentation improvements** updated the router docstring. Retained work exposes
raw-JSON creation through verified administrator dependencies, canonical 201 output,
and safe error envelopes while preserving anonymous reads. Agent checks passed
148 focused API tests and all 765 unit/API tests, including 42 new POST cases,
with one existing dependency warning; syntax and scoped whitespace checks passed.
Tests used controlled User Service responses without authentication bypasses.
Live-service and PostGIS checks were not run for this increment. Keith confirmed
review of all four affected files; no human test rerun is claimed. The exact prompt
and verbatim relevant final-response excerpt are recorded; the original message
timestamp is unavailable. No redactions or header exceptions apply.


For [POST duplicate-policy and concurrency verification](ai/usage-log.md#ai-20261001-004),
Codex (GPT-6) provided **Writing implementation code** and **Boilerplate generation**
for `tests/integration/test_supplier_creates.py`. The retained 12 added cases use
mounted POST/public GET routes, real PostGIS storage, and controlled administrator
authentication. Coverage includes normalized duplicates across areas, exact point
distinctions, preserved deleted histories, canonical detail visibility, post-insert
rollback, and independent competing transactions coordinated through explicit
barriers and observed database locks. Agent checks passed 199 tests, including all
51 creation integration cases and 148 API cases, with one existing dependency
warning; syntax and scoped whitespace checks passed. Disposable databases were
migrated and cleaned up. No requested checks were blocked; authentication used
controlled responses rather than a live User Service. Keith confirmed review of
the affected test file; no human test rerun is claimed for this increment. The exact
prompt and verbatim final response are recorded; the original timestamp is
unavailable. No redactions or header exceptions apply.


For the [implemented creation documentation](ai/usage-log.md#ai-20261001-005),
Codex (GPT-6) provided **Refactoring and documentation improvements** for this
README and **Writing implementation code** for its mounted-route live smoke
procedure. Retained changes correct stale mutation status, document canonical
creation examples and error/transaction behavior, explain seed/API reuse, and keep
PATCH, DELETE, and administrative reads marked as planned. The request example
validated against migrated category IDs and its response matched canonical
conversion. Smoke-script Python/shell syntax, test paths, anchors, and scoped
whitespace checks passed. Application suites were not rerun for this edit;
previous test results remain historical. Live smoke was not executed because no
approved administrator credentials or agreed provisioning procedure were supplied.
Keith confirmed review of the README and retained procedure; no human test rerun
is claimed for this increment. The exact prompt and verbatim final response are
recorded; original timestamp unavailable. No redactions or header exceptions apply.


For [atomic versioned supplier updates](ai/usage-log.md#ai-20261001-006),
Codex (GPT-6) provided Writing implementation code and Refactoring and
documentation improvements for `app/services/suppliers.py` and
`app/repositories/suppliers.py`, plus Writing implementation code and Boilerplate
generation for `tests/integration/test_supplier_updates.py`. Retained work adds
merged validation, conditional active/version writes, atomic category replacement,
fresh conflict classification, and refreshed detached results returned after commit.
Agent checks passed 44 update cases, 51 creation integration cases, and 765 unit/API
tests, with one existing dependency warning; syntax and whitespace checks passed.
Temporary PostGIS resources were removed. Broader read/seed/schema integration
suites were not run; no checks remained blocked. Keith confirmed review of all
three files; no human test rerun is claimed. The exact prompt and verbatim final
response are recorded; original message timestamp unavailable. No redactions or
header exceptions apply.


For the [administrator supplier PATCH adapter](ai/usage-log.md#ai-20261001-007),
Codex (GPT-6) provided Writing implementation code and Refactoring and
documentation improvements for `app/routes/suppliers.py`, Writing implementation
code and Boilerplate generation for `tests/api/test_supplier_updates.py`, and
Writing implementation code and Debugging assistance for the stale registration
assertion in `tests/api/test_validation_errors.py`. Retained changes expose
administrator-only PATCH with raw aggregate validation, positive expected versions,
canonical saved output, and safe error mappings through the existing atomic service.
Agent checks passed 55 new PATCH cases and all 820 unit/API tests after correcting
the registration assertion; syntax and whitespace checks passed, with one existing
dependency warning. Tests used controlled dependencies; live-service and PostGIS
checks were not rerun for this adapter change. Keith confirmed review of all three
files; no human test rerun is claimed. The exact prompt and verbatim final response
are recorded; original timestamp unavailable. No redactions or header exceptions apply.


For [PATCH concurrency and rollback verification](ai/usage-log.md#ai-20261001-008),
Codex (GPT-6) provided Writing implementation code and Boilerplate generation for
13 additional cases in `tests/integration/test_supplier_updates.py`. Retained tests
use mounted PATCH/public GET routes, controlled administrator authentication,
independent transactions, bounded barriers, and observed PostgreSQL locks. They
verify a single complete winner, restored scalar/assignment snapshots after
failure, stale/no-op behavior, canonical public reads, and deletion-race 404s.
Agent checks passed all 57 update integration cases and 174 selected API cases,
with one existing dependency warning; syntax and whitespace checks passed.
Disposable databases and the temporary container were removed. No requested checks
were blocked; broader suites and live authentication were not run. Keith confirmed
review of the retained test changes; no human test rerun is claimed. The exact
prompt and verbatim relevant final-response excerpt are recorded; original timestamp
unavailable. No redactions or header exceptions apply.


For the [implemented PATCH documentation](ai/usage-log.md#ai-20261001-009),
Codex (GPT-6) provided Refactoring and documentation improvements for this README.
Retained changes replace stale update-status claims, document administrator
PATCH and version checks, show complete saved/conflict examples, explain atomic
rollback and errors, and link coverage with isolated PostGIS prerequisites.
DELETE and administrative reads remain planned. The PATCH example passed merged
validation and exact canonical response comparison; the conflict body, linked
test paths, final summary placement, and whitespace checks passed. No application
suite or live administrator smoke check was rerun for this documentation edit;
prior suite results remain historical. Keith confirmed review of the retained
README changes; no human test rerun is claimed. The exact prompt and verbatim
final response are recorded; original timestamp unavailable. No redactions or
header exceptions apply.


For [atomic supplier soft deletion](ai/usage-log.md#ai-20261001-010), Codex (GPT-6)
provided Writing implementation code and Refactoring and documentation improvements
for `app/repositories/suppliers.py` and `app/services/suppliers.py`, plus Writing
implementation code and Boilerplate generation for 31 added cases in
`tests/integration/test_supplier_updates.py`. Retained work locks and refreshes
stored state, preserves columns and assignments, supports write-free repeated
deletion, and handles transaction completion and safe failures without retries.
Agent checks passed all 88 update/deletion integration cases and 820 unit/API tests,
with one existing dependency warning per suite; scoped whitespace checks passed.
Disposable PostGIS resources were removed. Broader integration suites were not run.
Keith confirmed review of all three files; no human test rerun is claimed. The exact
prompt and verbatim final response are recorded; original timestamp unavailable.
No redactions or header exceptions apply.


For the [administrator DELETE adapter](ai/usage-log.md#ai-20261001-011), Codex (GPT-6)
provided Writing implementation code and Refactoring and documentation improvements
for `app/routes/admin_suppliers.py`, Writing implementation code for `app/main.py`,
Writing implementation code, Boilerplate generation, and Refactoring and documentation
improvements for `tests/api/test_supplier_updates.py`, and Writing implementation
code and Debugging assistance for `tests/api/test_validation_errors.py`. Retained
work mounts administrator-only deletion, validates UUIDs and positive versions,
returns bodyless 204 after completion, and maps safe errors through the existing
service. The added 31 DELETE cases cover authentication, repeat deletion, transaction
completion/failure, cleanup, no retries, and OpenAPI; the route assertion includes
DELETE. Agent checks passed 86 focused adapter cases and all 851 unit/API tests,
with one existing dependency warning per suite; whitespace checks passed. Tests
used controlled dependencies; PostGIS integration was not rerun for this adapter.
Keith confirmed review of all four files; no human test rerun is claimed. The exact
prompt and verbatim final response are recorded; original timestamp unavailable.
No redactions or header exceptions apply.


For [protected administrator supplier reads](ai/usage-log.md#ai-20261001-012), Codex
(GPT-6) provided Writing implementation code and Refactoring and documentation
improvements for the repository, service, administrator router, and integration
read tests, plus Writing implementation code for API read tests and Debugging
assistance for the initial route collision. Retained changes add separate
administrator entry points, active/deleted/all views with shared filtered paging,
canonical responses, and safe failures under router-level authentication; public
reads remain anonymous and active-only. Agent checks passed 91 focused read API
cases, all 883 unit/API tests, and 85 read integration tests against disposable
PostGIS, with one existing dependency warning per suite; scoped whitespace checks
passed. The route collision and working-directory test errors were corrected.
The test container was removed; broader integration suites and live authentication
were not run. Keith confirmed review of all five affected files; no human test
rerun is claimed. The exact prompt and final response are recorded; the original
message timestamp is unavailable. No redactions or header exceptions apply.


For [deletion lifecycle verification](ai/usage-log.md#ai-20261001-013), Codex (GPT-6)
provided Writing implementation code and Boilerplate generation for five added
cases in `tests/integration/test_supplier_updates.py`,
`tests/integration/test_supplier_reads.py`, and `tests/integration/test_seed_import.py`.
Retained tests cover mounted creation/deletion and administrator history, stable
repeat deletion, real DELETE/PATCH contention with independent sessions and bounded
lock observation, complete snapshots, transaction cleanup, and seed reimport
preservation. All 240 cases across these three integration suites passed against
disposable PostGIS, with one existing dependency warning; collection and scoped
whitespace checks passed. Test resources were removed. No requested verification
remained blocked; authentication was controlled rather than live. Keith confirmed
review of all three files; no human rerun is claimed. Exact prompt and final response
are recorded; original timestamp unavailable. No redactions or header exceptions apply.


For [deletion and administrator-read documentation](ai/usage-log.md#ai-20261001-014),
Codex (GPT-6) provided Refactoring and documentation improvements for this README.
Retained changes document mounted contracts, version/status validation, canonical
examples, repeat deletion, PATCH lock arbitration, data and seed-history retention,
order-owned pickup snapshots, separate future service authentication, unsupported
restoration/editing, and test commands with isolated database prerequisites.
A follow-up corrected the remaining stale retrieval claim with a verified internal
link. Canonical example conversion, deletion transition, OpenAPI declarations,
actual test links, summary placement, and whitespace checks passed. Application
suites and live authentication were not rerun; prior counts remain historical.
Keith confirmed review of the README work and correction; no human test rerun is
claimed. Both exact prompts and verbatim relevant responses are recorded; original
timestamps are unavailable. No redactions or header exceptions apply.

## Collecting an additional NUS supplier dataset

The optional [Python collector and review workflow](tools/nus_collector/README.md)
collects official Kent Ridge and UTown dining/retail listings, supports saved HTML
when direct requests are blocked, and produces a review CSV and HTML report.
Explicitly approved records export to a separate seed bundle with permanent
identities. Validate locally, then use `supplier-seed-nus --dry-run` for database
preview before importing. The original dataset and import defaults remain intact.
