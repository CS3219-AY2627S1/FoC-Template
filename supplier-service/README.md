# supplier-service

Owner: Zheng Jiongjie

The catalogue of campus stores, facilities and landmarks (FoC calls them *suppliers*) that
errands are picked up from and delivered to. Spring Boot 4.1.1 on Java 21 with Firestore.
It follows the repo conventions in [AGENTS.md](../AGENTS.md).

- **API docs (OpenAPI):** `/api/suppliers/docs` (Swagger UI) and `/api/suppliers/v3/api-docs`.
  Staging: https://gateway-staging-374055363871.asia-southeast1.run.app/api/suppliers/docs
- **Health:** `/actuator/health` (with readiness and liveness groups)

## Run

```bash
# Whole system (recommended), from the repo root: UI + gateway at http://localhost:8080
docker compose up --build

# Just this service from source, against the containerised emulators
docker compose up -d firebase-emulator
PORT=8082 FIRESTORE_EMULATOR_HOST=localhost:8090 FIRESTORE_DATABASE_ID=supplier-local \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 MOCK_ADMIN_EMAILS=admin@u.nus.edu \
SUPPLIER_SEED_FILE=../data/csv/supplier-seed-data.csv ./mvnw spring-boot:run
```

### Calling the API without the UI

```bash
# Sign up / sign in against the Auth emulator and keep the ID token
TOKEN=$(curl -s -X POST 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key' \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@u.nus.edu","password":"Passw0rd!","returnSecureToken":true}' | jq -r .idToken)

curl -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/api/suppliers?q=coffee'
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/api/suppliers?lat=1.2942&lng=103.774&radius=300'
```

Roles come from the User Service (`USER_SERVICE_MODE=http`, the compose default for this service).
Signing up in the UI creates the User Service profile with the `requester` and `courier` roles. An
administrator can promote other users from the admin pages, but the first local administrator has to be
granted in MongoDB once:

```bash
docker compose exec mongodb mongosh UserServiceDB --quiet   --eval 'db.users.updateOne({email: "admin@u.nus.edu"}, {$addToSet: {roles: "admin"}})'
```

Admin checks ask the User Service on every request, so the new role applies at once. The UI shows or hides
admin actions from `/permissions`, which reuses roles for up to 30 s (`USER_SERVICE_ROLE_CACHE_TTL`), so the
buttons can take that long to appear. To fall back to
mock roles (everyone is a requester and a courier; `MOCK_ADMIN_EMAILS` are admins), set
`SUPPLIER_USER_SERVICE_MODE=mock` in the root `.env`.

## Test

```bash
./mvnw verify    # unit + integration tests (Testcontainers Firestore emulator) + JaCoCo >= 80% gate
```

You need Docker for the integration tests. The coverage report is written to
`target/site/jacoco/index.html`.

## API

All endpoints need `Authorization: Bearer <Firebase ID token>`. Errors use the shared
envelope (`status`, `error`, `message`, `path`, `timestamp`, `details`).

| Method | Path | Who | Purpose (backlog) |
| --- | --- | --- | --- |
| GET | `/api/suppliers` | any role | Search, filter, sort, paginate (F3.1, F4) |
| GET | `/api/suppliers/{id}` | any role | One supplier, including inactive ones (F3.2, F6.3.3) |
| GET | `/api/suppliers/types` | any role | Types in use, for filters |
| GET | `/api/suppliers/permissions` | any role | Caller's roles from the User Service, so the UI can hide admin actions |
| GET | `/api/suppliers/{id}/status` | any role / services | Does the supplier exist, and is it active? (F5.3) |
| POST | `/api/suppliers/validate` | any role / services | Validate an errand's pickup + delivery pair (F5.1) |
| POST | `/api/suppliers/lookup` | any role / services | Resolve many IDs at once, e.g. for order history (F5.2) |
| POST | `/api/suppliers` | admin | Create (F6.1) |
| PATCH | `/api/suppliers/{id}` | admin | Partial update, including reactivation (F6.2) |
| DELETE | `/api/suppliers/{id}` | admin | Deactivate; records are never hard-deleted (F6.3) |

`GET /api/suppliers` query parameters:

| Parameter | Meaning |
| --- | --- |
| `q` | Partial, case-insensitive match on name, building or location description |
| `type` | Exact type (case-insensitive); repeat it for several types |
| `building` | Partial, case-insensitive building match |
| `openNow` | `true` for suppliers open at request time (Singapore time) |
| `lat`, `lng`, `radius` | Distance from a point, optionally limited to `radius` metres |
| `status` | `active` (default), or `inactive` / `all` (admin only, otherwise 403) |
| `sort`, `order` | `name` (default), `type`, `building`, `distance`, `updatedAt`; `asc` or `desc` |
| `page`, `size` | 1-based page number; `size` is 1–100 (default 12) |

An empty result is `200` with `items: []` and a `message` (F4.4).

## Data model (Firestore, database `supplier-<environment>`)

`suppliers/{id}` holds one document per supplier, keyed by an auto-generated ID that is never reused:

| Field | Type | Notes |
| --- | --- | --- |
| `name`, `type`, `building` | string | required; `type` follows the seed CSV (Food, Food/Coffee, Food/Drinks, Shopping, Printing, Library, Services, Landmark) |
| `floor`, `locationDescription`, `imageUrl` | string / null | optional |
| `latitude`, `longitude` | number | required |
| `openingTime`, `closingTime` | `"HH:mm"` | Singapore time; a closing time before the opening time means it closes after midnight |
| `active` | boolean | only active suppliers can be used for new errands |
| `source` | `SEED` / `ADMIN` | who created it |
| `seedKey` | string / null | natural key of the seed row that created it; the row still finds the record after a rename |
| `adminModified` | boolean | an administrator edited or deactivated it, so the seed loader leaves it alone |
| `createdAt`, `updatedAt` | timestamp | |

`supplierKeys/{sha256(name + building)}` → `{ supplierId }` is a uniqueness index. Firestore
has no unique constraints, so creates and renames claim this document in the same
transaction as the supplier write (F1.1.2). Names are compared ignoring case, extra spaces
and curly quotes.

## Design notes

- **Queries:** the whole catalogue (tens to hundreds of records) is cached in memory for at
  most 60 seconds (NFR5.3.2), and writes clear the cache immediately. Search, filtering,
  distance and sorting run over this cached list, because Firestore cannot do
  case-insensitive substring search or distance sorting. Reads by ID always go to the
  database, so other services see current data (F5.2.2).
- **Seeding (F2):** `SUPPLIER_SEED_FILE` is loaded before the web server starts, so readiness
  means "catalogue loaded".
  - Rows upsert by name + building, or by an optional `Id` column.
  - Reloading the same file changes nothing.
  - Invalid rows are skipped and logged with their row number.
  - A missing or malformed file stops startup.
  - The provided CSV contains Windows-1252 apostrophes, and GitHub page links for images. The
    loader handles both: it decodes the apostrophes and rewrites the links to direct image URLs.
- **Seed data:** [data/csv/supplier-seed-data.csv](../data/csv/supplier-seed-data.csv) has 120
  campus places.
  - It starts with the 21 rows the course provided, unchanged. A copy of the original file is the test fixture in
    `src/test/resources/seed/`.
  - The other 99 are real places at Kent Ridge, UTown and the NUH Medical Centre (above Kent Ridge MRT):
    canteens, cafés, shops, libraries, services, and delivery landmarks such as halls, colleges and faculty
    lobbies.
  - Their names, positions and buildings come from OpenStreetMap (© OpenStreetMap contributors, ODbL). Opening
    hours are taken from OpenStreetMap where it lists them, and are typical hours otherwise.
- **Administrators' changes win:** the loader only changes records it created and no administrator has
  changed since. Cloud Run restarts the service often, and each start reloads the file, so without this
  rule a restart would undo edits. Rows are matched by `seedKey`, so a record an administrator renamed is not
  recreated. Records seeded before `seedKey` existed are adopted by name + building on the next load.
- **Deactivating seed records:** seed records missing from the file are deactivated, never deleted (unless an
  administrator has changed them).
- **Concurrent edits:** a PATCH is applied to the current record inside the write transaction (Firestore
  retries on contention), so two administrators editing different fields don't overwrite each other.
- **Access control:**
  - Spring Security validates the Firebase ID token (issuer, audience, expiry, Google signing keys).
    Every endpoint needs a valid token.
  - Roles are looked up only where they matter (`CallerRoles`): management endpoints
    (`@PreAuthorize("@callerRoles.isAdmin(authentication)")`), `status=inactive|all` listings and
    `/permissions`. Browsing and the Order Service's `/validate`, `/lookup` and `/status` calls need no roles, so
    they keep working while the User Service is slow or down.
  - `USER_SERVICE_MODE=http` calls `GET {USER_SERVICE_URL}/api/users/role-context`, forwarding the caller's
    bearer token and the request ID. A caller with no User Service profile (404) gets no roles. Any other
    failure or a timeout (`USER_SERVICE_TIMEOUT`) answers 503 on the role-dependent endpoints only.
  - Admin checks (management endpoints and the `inactive`/`all` listings) ask the User Service on every request, so
    a demoted or disabled administrator loses access at once.
  - Only `/permissions`, which the UI uses to show or hide admin actions, reuses a user's roles for
    `USER_SERVICE_ROLE_CACHE_TTL` (30 s; `0s` disables it). Failures are never cached.
  - `USER_SERVICE_MODE=mock` gives everyone requester + courier and grants admin to `MOCK_ADMIN_EMAILS`.
- **Request IDs:** the gateway's `X-Request-Id` is put in the logging context (`requestId`, a field in the
  cloud's JSON logs) and forwarded to the User Service, so one request can be traced across both services.
- **Audit logs:** every catalogue change logs one line with `action` (`SUPPLIER_CREATED`, `SUPPLIER_UPDATED`,
  `SUPPLIER_DEACTIVATED`), `supplierId` and the admin's `actorId`. A rejected pickup/delivery pair logs
  `PAIR_REJECTED` with the reasons. In Cloud Logging: `jsonPayload.action:"SUPPLIER_"`.
- **Deployment:** Cloud Run as `supplier-service-<environment>`, running as its own service
  account, which can only access its own Firestore databases. The seed CSV is uploaded to the
  environment's config bucket and mounted read-only (F2.1.1). See [docs/ci-cd.md](../docs/ci-cd.md).

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 8080 | HTTP port |
| `FIRESTORE_PROJECT_ID` / `FIRESTORE_DATABASE_ID` | `demo-foc` / `(default)` | Where suppliers are stored |
| `FIRESTORE_EMULATOR_HOST` | – | Use the Firestore emulator |
| `FIREBASE_AUTH_PROJECT_ID` | `demo-foc` | Firebase project that issues ID tokens |
| `FIREBASE_AUTH_EMULATOR_HOST` | – | Accept Auth emulator tokens (local only) |
| `USER_SERVICE_MODE` / `USER_SERVICE_URL` | `mock` / – | Role lookup: `http` in compose and the cloud |
| `USER_SERVICE_TIMEOUT` | `3s` | Connect/read timeout for role lookups; in the cloud it must cover a User Service cold start (about 20 s) |
| `USER_SERVICE_ROLE_CACHE_TTL` | `30s` | How long `/permissions` reuses a user's roles (admin checks never use the cache); `0s` disables it |
| `MOCK_ADMIN_EMAILS` | – | Admins while in mock mode |
| `SUPPLIER_SEED_FILE` | – | CSV loaded at startup |
| `SUPPLIER_CACHE_TTL` | `60s` | Catalogue cache TTL (capped at 60 s) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:8080` | Allowed browser origins |
