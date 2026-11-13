# Supplier Service

Stores the places on campus that errands can be requested from: **stores**, **facilities**
and **landmarks**. It covers FR 5 (admin management), FR 6 (listing, search, sort, filter)
and NFR 4 to 6.

## Database choice: PostgreSQL

We use one PostgreSQL 18 database per service (`supplier_db`). The supplier service is the
only thing that reads or writes it. Other services go through its API.

| FoC need | Why PostgreSQL fits |
| --- | --- |
| **The data has a fixed structure.** Every supplier has the same six fields from FR 5 (name, type, location, description, opening time, closing time). No supplier needs extra fields that others lack. | A fixed table schema matches this. A document database's flexible schema adds nothing here and would let bad records in. |
| **The rules are relational.** A store or facility sits *at* a landmark. A landmark still referenced by stores cannot be deleted or re-typed (FR 5.10, 5.11). | A foreign key from `locationId` to `supplier.id` makes the database enforce these rules instead of every code path. |
| **Validation belongs in the data layer.** Names must be unique (FR 5.5.1), type must be one of three values (FR 5.5.5), location is required for stores and facilities (FR 5.5.3), times must be valid (FR 5.5.6). | Unique indexes, `CHECK` constraints and the native `time` type reject bad rows even when the API has a bug. |
| **The main queries search, filter, sort and paginate.** | SQL does all four in one indexed query (see *Query patterns*). |
| **The data is small and mostly read.** It starts at 100 suppliers and may grow to 1,000 (NFR 5), with at most 40 req/s at peak (NFR 4). | A single Postgres instance handles this easily, so we don't need to shard or add a cache. If we ever need to scale, read replicas are the next step. |
| **Changes that touch several rows must be atomic.** Soft-deleting a landmark also soft-deletes its stores and writes audit rows. | Transactions make these multi-row changes all-or-nothing. |
| **The team already knows it.** | The user service already uses Postgres with Prisma 8. Reusing the same tools, migrations workflow and Docker setup saves time. |

We considered MongoDB and rejected it. Its strength is flexible, nested documents, and
supplier data has neither. We would also have to rebuild referential integrity and
case-insensitive uniqueness in application code.

## Schema

Source of truth: [src/prisma/contract.prisma](src/prisma/contract.prisma).

```mermaid
erDiagram
    supplier ||--o{ supplier : "locationId (store/facility -> landmark)"
    supplier ||--o{ supplierAuditLog : "supplierId"

    supplier {
        int id PK
        text name "unique, incl. deleted rows"
        text type "store | facility | landmark"
        text description "nullable"
        int locationId FK "landmark id; null only for landmarks"
        time opensAt "nullable"
        time closesAt "nullable"
        int createdBy "user id (user service)"
        int updatedBy "user id (user service)"
        timestamptz createdAt
        timestamptz updatedAt
        timestamptz deletedAt "null = live (soft delete)"
    }
    supplierAuditLog {
        int id PK
        int supplierId FK
        text action "create | update | delete"
        int actorUserId "user id (user service)"
        json snapshot "supplier row at the time"
        timestamptz createdAt
    }
```

### Why a single `supplier` table with a self-reference

In the mockups a landmark (e.g. `COM3`) is both a supplier you can pick and the location
of other suppliers (`Smooy@COM3`, `The Terrace@COM3`). Keeping all three types in one
table means:

- the supplier list, search and filters query one table, with no `UNION`s;
- a store's location is simply its landmark's `id`, and the foreign key guarantees that
  landmark exists;
- changing a landmark's type or deleting it is blocked while stores still point at it
  (FR 5.10). The FK uses `ON DELETE RESTRICT`.

### Supplier metadata

| Field | Stored as | Rules |
| --- | --- | --- |
| Name | `text` | Required, not blank. Unique across all rows, including deleted ones (`UNIQUE (name)`). A second index, `UNIQUE (lower(name)) WHERE "deletedAt" IS NULL`, also stops live suppliers from differing only by case. Because each name is unique and each row has exactly one `locationId`, a name maps to at most one location (FR 5.5.2). |
| Type | `text`, limited by a `CHECK` to `store`, `facility`, `landmark` | Anything else is rejected (FR 5.5.5). |
| Location | `locationId` pointing at `supplier.id` | Required for stores and facilities, forbidden for landmarks. Enforced by a `CHECK` (FR 5.5.3). |
| Description | `text`, nullable | Optional. |
| Opening hours | `opensAt` and `closesAt`, both `time` | Must be both set or both empty. Landmarks can't have hours. `closesAt < opensAt` means the supplier is open past midnight. The `time` type rejects invalid values such as `25:00` (FR 5.5.6). Times are Singapore local time. |
| Who and when | `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | User ids come from the user service's JWT. They are not foreign keys, because the users table lives in another database. |
| Deleted | `deletedAt` | Soft delete, see below. |

### Constraints enforced by the database

These were each tested against a real Postgres 18 instance:

| Constraint | Rejects |
| --- | --- |
| `supplier_name_key` (unique constraint) | Reusing any existing name exactly, even a deleted supplier's |
| `supplier_name_active` (unique index) | Adding `com3` while `COM3` exists |
| `supplier_location_by_type` | A store or facility without a location, or a landmark with one |
| `supplier_hours_paired` | An opening time with no closing time, or the reverse |
| `supplier_landmark_no_hours` | A landmark with opening hours |
| `supplier_name_not_blank` | Empty or whitespace-only names |
| `supplier_type_check` (generated from the enum) | Types other than the three allowed |
| `supplier_locationId_fkey` | Hard-deleting a landmark that stores still reference |

### Enforced in the service layer

A `CHECK` constraint can only see one row, so these rules live in the API:

- **`locationId` must point at a live landmark**, not at a store or a deleted row.
- **Deleting or re-typing a landmark (FR 5.10, 5.11).** Changing the type of a landmark
  that stores point at is rejected. Deleting a landmark soft-deletes its stores and
  facilities in the same transaction, which is how we read "cascade" in FR 5.11.
- **Deleting a supplier with an ongoing errand (FR 5.8).** Before deleting, the service
  asks the order service whether any open errand references the supplier (or, for a
  landmark, any supplier located at it), and rejects the delete with an explanation if
  one does. *The order service doesn't exist yet, so
  [src/util/orderService.ts](src/util/orderService.ts) currently always allows the
  delete. Connecting it is a one-function change once the order service has the
  endpoint.*

Every write runs in one transaction that **locks the rows it depends on**. For example,
creating a store locks its landmark `FOR SHARE`, and deleting a landmark locks it
`FOR UPDATE`. A store can therefore never be created at a landmark that is being deleted
at the same moment.

### Soft delete and preserving history (FR 5.9)

A delete sets `deletedAt` rather than removing the row, so supplier ids stored in old
errands still resolve. Every read filters on `"deletedAt" IS NULL`. Names are unique
among **active** rows only, enforced by partial unique indexes (`supplier_name_active`,
`location_name_active`, both `WHERE "deletedAt" IS NULL`). A deleted supplier's name can
therefore be used again: the new supplier gets a new id, and old errands keep pointing at
the deleted row and the name it had at the time. We chose this over renaming the row on
delete, which would change what old errands show. A location can be deleted once none of
its suppliers are active.

As a second safeguard, the order service should also copy the supplier's name and
location into the errand when it is created. A completed errand then shows the details
as they were at that time, even if the supplier is renamed later.

### Audit log (FR 5.12, NFR 6)

Every create, update or delete appends a row to `supplierAuditLog`, holding who made the
change and a JSON snapshot of the supplier. It is written in the same transaction as the
change, so a supplier can't change without leaving a log entry. The service only ever
inserts into this table.


## Query patterns

All list queries run as **one SQL statement** in
[src/prisma/suppliers.ts](src/prisma/suppliers.ts). Each filter is optional, and leaving
it out turns its condition off, so search, filters, sort and pagination combine freely
(FR 6.7). Deleted suppliers are always excluded.

| Query | Used for | How it runs |
| --- | --- | --- |
| Get one supplier by id | Supplier details (FR 6.1), order service lookups | Primary key |
| Search by name | Search box (FR 6.2) | Case-insensitive substring match: `lower(name) LIKE '%' \|\| $q \|\| '%'`. `%` and `_` in the input are escaped, so they match literally. At 1,000 rows a scan takes well under a millisecond. A `pg_trgm` index is the next step if the data ever grows much larger |
| Filter by type, one or more | Store / Facility / Landmark chips (FR 6.4.1) | `type = ANY($types)`, using the index on `type` |
| Filter to suppliers open now | "Open now" filter (FR 6.4.2) | Compares the current Singapore time, `(now() AT TIME ZONE 'Asia/Singapore')::time`, with `opensAt` and `closesAt`, including hours that run past midnight. Suppliers with no hours listed are left out. Every result also carries an `isOpenNow` flag |
| List suppliers at a landmark | Landmark details, delete and re-type checks (FR 5.10, 5.11) | `locationId = $id`, using the index on `locationId` |
| Sort by name, A–Z or Z–A | Sort control (FR 6.3.1) | `ORDER BY lower(name)`, ties broken by `id` so pages stay stable |
| Paginate | Supplier list | `LIMIT`/`OFFSET`, plus a `count(*)` with the same `WHERE` for the total. Offset paging is fine at 1,000 rows and lets the UI jump straight to any page |
| Location name | Showing "Smooy @ COM3" | A self-join on `supplier`, so no second request is needed |

## API

The gateway serves the service at `/api/public/supplier/…` through the edge
(`localhost:8000`), or `localhost:8080/public/supplier/…` directly. Other services reach
the private routes on the gateway's private listener, `localhost:8081/private/supplier/…`.

| Method and path | Who can call it | What it does |
| --- | --- | --- |
| `GET /public/suppliers` | Any signed-in user | List live suppliers. Query parameters below |
| `GET /public/suppliers/:id` | Any signed-in user | One live supplier. 404 if it doesn't exist or was deleted |
| `POST /public/suppliers` | Admin | Create a supplier. **201** with the supplier and a `Location` header |
| `PATCH /public/suppliers/:id` | Admin | Change some fields. **200** with the updated supplier |
| `DELETE /public/suppliers/:id` | Admin | Soft-delete a supplier, and everything at it if it's a landmark. **200** `{"deletedIds": [...]}` |
| `GET /private/suppliers/:id` | Other services only | One supplier, **including deleted ones**, e.g. the order service showing an old errand. Not reachable through the public gateway |
| `GET /public/health` | Anyone | Liveness check |

**List query parameters.** All are optional. Unknown or invalid parameters return a 400
that names the bad field.

| Parameter | Example | Meaning |
| --- | --- | --- |
| `q` | `q=mart` | Name contains this text, ignoring case (up to 100 characters) |
| `type` | `type=store,facility` | Any of `store`, `facility`, `landmark`, comma-separated |
| `openNow` | `openNow=true` | Only suppliers open right now |
| `locationId` | `locationId=14` | Only suppliers at this landmark |
| `sort` | `sort=-name` | `name` for A–Z (the default), `-name` for Z–A |
| `page`, `pageSize` | `page=2&pageSize=20` | 1-based page number. Page size defaults to 20, maximum 100 |

**List response:**

```json
{
  "items": [{
    "id": 17, "name": "Smooy", "type": "store",
    "description": "Frozen yoghurt within The Terrace",
    "location": { "id": 14, "name": "COM3" },
    "openingHours": { "opensAt": "09:00", "closesAt": "17:00" },
    "isOpenNow": false,
    "createdAt": "2026-09-28T16:25:28.607Z", "updatedAt": "2026-09-28T16:25:28.607Z", "deletedAt": null
  }],
  "page": 1, "pageSize": 20, "total": 6, "totalPages": 1
}
```

### Creating and updating suppliers

`POST` takes the fields below. `PATCH` takes any subset of them, and sending `null`
clears an optional field. Any other field, such as `id` or `createdBy`, is rejected, so
admins can't set server-managed columns.

| Field | Rules |
| --- | --- |
| `name` | Required. Trimmed, 1–100 characters, unique ignoring case |
| `type` | Required. `store`, `facility` or `landmark` |
| `description` | Optional, up to 500 characters. Blank is stored as `null` |
| `locationId` | Required for stores and facilities, and must be a live landmark. Not allowed for landmarks |
| `openingHours` | Optional `{ "opensAt": "HH:MM", "closesAt": "HH:MM" }` in 24-hour time. The two times must differ, and `closesAt` earlier than `opensAt` means open past midnight. Not allowed for landmarks |

On `PATCH`, the rules are checked against **the stored supplier with the patch applied**.
Changing a store to a landmark therefore also requires `"locationId": null` and
`"openingHours": null`.

**Errors name the fields at fault** (FR 5.5.4), so the UI can show each message next to
its input:

```json
{ "error": "invalid supplier", "fields": { "locationId": ["A store must be located at a landmark"] } }
```

| Status | When |
| --- | --- |
| 400 | A field is missing or invalid, or an unknown field was sent. Details are in `fields`, or in `errors` for problems that aren't about one field |
| 404 | No live supplier with that id |
| 409 | The name is taken (by a live or deleted supplier); a landmark that others are located at would change type (FR 5.10); or an ongoing errand blocks a delete (FR 5.8) |

### Access control with identity from the user service

The user service handles login. It signs a short-lived (15 minute) **access token**, a
JWT, that carries the user id (`sub`) and their roles (`role: ["admin", "requestor",
"courier"]`). The frontend sends it on every call as `Authorization: Bearer <token>`.

The supplier service **checks the token itself** in
[src/middleware/auth.ts](src/middleware/auth.ts), without calling the user service:

1. It verifies the signature with the access-token secret shared with the user service,
   and checks that the issuer is `user-service`. A forged or edited token, such as one
   where someone added `admin` to their roles, fails the signature check.
2. It reads the user id and roles from the verified token.
3. Each route declares the roles it needs. Browsing needs none beyond being signed in;
   create, update and delete need `admin`.

| Situation | Response |
| --- | --- |
| No token, expired token, bad signature or wrong issuer | **401** `{"error": "missing bearer token"}` or `"access token expired"` or `"access token is of invalid format"`. The frontend refreshes the token and retries |
| Valid token without the required role, e.g. a courier trying to create a supplier | **403** `{"error": "insufficient permissions to perform action"}` |

Every 401 and 403 is logged with the user id (when known), method and path (FR 4.3.2).

**Why check tokens locally instead of asking the user service on every request:**

- **Speed.** Browsing suppliers is the busiest path (NFR 4). Checking a signature takes
  microseconds and adds no network call.
- **Independence.** The supplier list keeps working even if the user service is
  restarting.
- **The downside is a delay on role changes.** A role change or account suspension
  takes effect only when the user's current access token expires, at most 15 minutes
  later. We accept that for supplier data. If it becomes a problem, the user service
  could keep a list of revoked tokens.

Because the secret is shared, any service that holds it could also *sign* tokens. A
stronger setup has the user service sign with a private key (RS256 or EdDSA) and publish
the matching public key, so other services can verify tokens but never create them.
We've noted this as a later improvement to the user service.

### Example calls

These were run against the stack, using real tokens from the user service's login:

```bash
TOKEN=...   # accessToken from POST /api/public/user/auth/login
API=http://localhost:8080/public/supplier/suppliers

curl -H "Authorization: Bearer $TOKEN" "$API?q=mart"                          # search
curl -H "Authorization: Bearer $TOKEN" "$API?type=store,facility&sort=-name"  # filter + sort
curl -H "Authorization: Bearer $TOKEN" "$API?openNow=true"                    # open right now
curl -H "Authorization: Bearer $TOKEN" "$API?locationId=14"                   # at a landmark
curl -H "Authorization: Bearer $TOKEN" "$API?pageSize=3&page=2"               # page 2
curl -H "Authorization: Bearer $TOKEN" "$API/17"                              # by id

curl "$API"                                              # 401, no token
curl -X POST -H "Authorization: Bearer $TOKEN" "$API"    # 403 for a non-admin

# as an admin
JSON='Content-Type: application/json'
curl -X POST -H "Authorization: Bearer $ADMIN" -H "$JSON" \
  -d '{"name":"COM3","type":"landmark","description":"School of Computing"}' "$API"
curl -X POST -H "Authorization: Bearer $ADMIN" -H "$JSON" \
  -d '{"name":"Smooy","type":"store","locationId":1,"openingHours":{"opensAt":"09:00","closesAt":"17:00"}}' "$API"
curl -X PATCH -H "Authorization: Bearer $ADMIN" -H "$JSON" -d '{"description":"Frozen yoghurt"}' "$API/2"
curl -X DELETE -H "Authorization: Bearer $ADMIN" "$API/1"   # {"deletedIds":[1,2]}, Smooy goes with its landmark
```

## Run locally

With Docker, run `docker compose --profile dev up -d --build` from the repository root
to start everything. The supplier service is also exposed directly on `localhost:8002`.
Docker Compose reads the root `.env` and supplies `DATABASE_URL` from `SUPPLIER_DB_URL`
and `JWT_ACCESS_SECRET` to the supplier container. **You do not need to create
`supplier-service/.env` when running the service or seed task inside Docker.**

### Optional: run outside Docker

The following setup is only for running Deno directly on your machine:

1. Start the database: `docker compose --profile dev up -d supplier_db`. It listens on
   `localhost:5433`.
2. Create `.env` in this folder. `JWT_ACCESS_SECRET` must match the root `.env` so that
   tokens from the user service verify:

   ```bash
   DATABASE_URL=postgresql://postgres:mysecretpassword@localhost:5433/suppliers
   JWT_ACCESS_SECRET=<same value as the root .env>
   ```

3. Apply the schema: `deno task db:init` the first time, and `deno task db:update` after
   changes.
4. Start the service: `deno task dev`.

After editing `src/prisma/contract.prisma`, run `deno task contract:emit` to regenerate
`contract.json` and `contract.d.ts`.

## Import CSV seed data

After applying the current schema (including the `Location` table and array-valued
supplier `type`), run the importer manually. It validates the whole CSV, creates
missing locations, and inserts suppliers plus audit records in one transaction.
Existing supplier names are skipped case-insensitively, including deleted rows;
reruns do not overwrite edits or restore deleted suppliers.

### Seed inside Docker (recommended)

Use the existing root `.env`, with `SUPPLIER_DB_URL`, `SUPPLIER_DB_PW`, and
`JWT_ACCESS_SECRET` configured. The database URL must use the Docker hostname
`supplier_db:5432`. No service `.env` or local Deno installation is needed.

Run all commands below from the **repository root**, the directory containing
`compose.yaml`. They work in PowerShell as well as a Unix shell.

```bash
# Start the database and supplier service
docker compose --profile dev up -d --build supplier_db supplier_dev

# Check that the database schema matches the current contract
docker compose --profile dev exec supplier_dev deno task db:verify
```

Before importing, wait until PostgreSQL is ready and make sure `db:verify` succeeds.
For a fresh database, initialize it with:

```bash
docker compose --profile dev exec supplier_dev deno task db:init
```

For an existing database with schema changes, use `db:update` instead, review its
proposed changes, and rerun `db:verify`. An older schema can cause
`relation "location" does not exist` during seeding. If updating that schema fails
with `function array_position(text, unknown) does not exist`, it needs the old
scalar `type` column migrated before the new array checks can be applied; resolve
that migration before seeding, preserving any existing supplier data.

```bash
# Copy the CSV into the running container (the repository's data folder is not mounted)
docker compose --profile dev cp ./data/csv/supplier-seed-data.csv supplier_dev:/tmp/supplier-seed-data.csv

# Validate and preview without database changes
docker compose --profile dev exec supplier_dev deno task seed /tmp/supplier-seed-data.csv --dry-run

# Import suppliers and record the actor in the audit log
docker compose --profile dev exec supplier_dev deno task seed /tmp/supplier-seed-data.csv --actor-id=1
```

Replace `1` with the intended existing user's ID. The user service owns these IDs;
the importer validates their format but cannot verify that the user exists.
Repeat the copy command after editing the CSV or recreating the container.

### Optional: seed outside Docker

If running Deno directly on your machine, follow the outside-Docker setup above,
including `DATABASE_URL` and `JWT_ACCESS_SECRET` in `supplier-service/.env`.
Then run from `supplier-service`:

```bash
deno task seed ../data/csv/supplier-seed-data.csv --dry-run
deno task seed ../data/csv/supplier-seed-data.csv --actor-id=1
```

`Food/Coffee` becomes `["food", "coffee"]`. Building aliases are normalized before
location lookup. If existing locations normalize to the same name, the import
fails rather than choosing an ambiguous location.
